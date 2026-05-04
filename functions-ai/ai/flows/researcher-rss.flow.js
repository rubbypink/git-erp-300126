import { ai } from '../genkit-init.js';
import { z } from 'genkit';
import AiManager from '../ai.manager.js';
import { crawlforgeScrapeTool } from '../tools/mcp-client.js';
import { searchWeb, searchFacebookGroups } from '../services/web-search.service.js';
import researcherConfig from '../../.9trip-agents/configs/researcher.config.js';
import { log } from '../../.9trip-agents/shared-logic/helpers.js';

const researcher = new AiManager({
    modelName: researcherConfig.model,
    apiKey: process.env[researcherConfig.apiKeyEnv],
});

const RSSScanInputSchema = z.object({
    url: z.string().url('URL RSS hợp lệ').optional().describe('URL RSS cần quét (không bắt buộc — nếu không có, auto search)'),
    maxItems: z.number().min(1).max(50).default(10).describe('Số bài tối đa cần bóc tách'),
    keywords: z.array(z.string()).optional().describe('Từ khóa tìm kiếm (nếu không có url)'),
    hoursBack: z.number().min(1).max(168).default(24).describe('Chỉ lấy bài trong vòng N giờ gần nhất'),
    enableFacebookGroupSearch: z.boolean().default(true).describe('Tìm kiếm trong Facebook groups'),
});

const RSSItemSchema = z.object({
    title: z.string().describe('Tiêu đề bài viết'),
    link: z.string().describe('Link gốc bài viết'),
    pubDate: z.string().describe('Ngày đăng, định dạng ISO hoặc text gốc'),
    summary: z.string().describe('Tóm tắt ngắn gọn nội dung bài (2-3 câu)'),
    category: z.string().describe('Phân loại: ' + researcherConfig.categories.join(', ')),
    sentiment: z.enum(researcherConfig.sentiments).describe('Cảm sắc bài viết'),
    phuQuocRelevance: z.number().min(0).max(10).describe('Mức độ liên quan đến Phú Quốc (0-10)'),
});

const RSSScanResultSchema = z.object({
    sourceName: z.string().describe('Tên nguồn (URL RSS hoặc "auto_search")'),
    sourceUrl: z.string().describe('URL RSS gốc đã quét hoặc "auto_search"'),
    scannedAt: z.string().describe('Thời điểm quét, ISO format'),
    totalItems: z.number().describe('Tổng số bài viết tìm thấy'),
    items: z.array(RSSItemSchema).describe('Danh sách bài viết đã bóc tách'),
    trendingTopics: z.array(z.string()).describe('Các chủ đề đang nổi bật'),
});

const researcherScanRSSFlow = ai.defineFlow(
    {
        name: 'researcherScanRSS',
        inputSchema: RSSScanInputSchema,
        outputSchema: RSSScanResultSchema,
    },
    async (input) => {
        const { url, maxItems, keywords, hoursBack, enableFacebookGroupSearch } = input;
        let rawContent = '';
        let sourceType = '';

        if (url) {
            console.log(`[Researcher] 🔍 Bắt đầu quét RSS: ${url}`);

            const scrapePrompt = `${researcherConfig.scrapeSystemPrompt}\n\n${researcherConfig.scrapeUserPromptTemplate.replace('{{url}}', url)}`;

            const scrapeResult = await researcher.generateWithTools(scrapePrompt, [crawlforgeScrapeTool]);

            if (!scrapeResult.success) {
                console.error(`[Researcher] Quét RSS thất bại: ${scrapeResult.error}`);
                await log('researcher_flow', 'error', 'RSS scrape tool failed', { url, error: scrapeResult.error });
                return { sourceName: url || 'rss', sourceUrl: url || 'rss', scannedAt: new Date().toISOString(), totalItems: 0, items: [], trendingTopics: [] };
            }

            rawContent = scrapeResult.text || '';
            console.log(`[Researcher] Phase 1 (RSS) xong — Độ dài: ${rawContent.length} ký tự`);

            if (!rawContent || rawContent.length < 30) {
                console.warn(`[Researcher] Nội dung RSS quá ngắn, trả về rỗng`);
                await log('researcher_flow', 'warn', 'RSS content too short', { url, length: rawContent.length });
                return { sourceName: url || 'rss', sourceUrl: url || 'rss', scannedAt: new Date().toISOString(), totalItems: 0, items: [], trendingTopics: [] };
            }
            sourceType = 'rss';
        } else {
            sourceType = 'web_search';
            const searchKw = (Array.isArray(keywords) && keywords.length > 0) ? keywords : researcherConfig.autoSearchDefaultKeywords;
            console.log(`[Researcher] 🔍 Bắt đầu auto search — keywords: ${searchKw.length} từ khóa`);
            await log('researcher_flow', 'info', 'Auto search started', {
                keywordsCount: searchKw.length,
                facebookEnabled: enableFacebookGroupSearch,
                maxItems, hoursBack,
            });

            const allSearchResults = [];
            const seenUrls = new Set();
            let totalKeywordsAttempted = 0;

            for (const kw of searchKw) {
                try {
                    console.log(`[Researcher] Web search keyword: "${kw}"`);
                    const results = await searchWeb(kw, { maxResults: researcherConfig.webSearchMaxResultsPerKeyword, hoursBack });
                    console.log(`[Researcher] Keyword "${kw}" → ${results.length} results`);
                    await log('researcher_flow', 'info', 'Keyword search done', { keyword: kw, resultsCount: results.length });
                    totalKeywordsAttempted++;
                    for (const r of results) {
                        if (!seenUrls.has(r.url)) {
                            seenUrls.add(r.url);
                            allSearchResults.push(r);
                        }
                    }
                } catch (e) {
                    console.warn(`[Researcher] Web search keyword "${kw}" failed: ${e.message}`);
                    await log('researcher_flow', 'warn', 'Keyword search failed', { keyword: kw, error: e.message });
                    if (!totalKeywordsAttempted && allSearchResults.length === 0) {
                        await log('researcher_flow', 'error', 'All web search layers crashed on first keyword. Aborting pipeline.', { keyword: kw, error: e.message });
                        console.error(`[Researcher] ❌ All web search layers crashed on first keyword — dừng pipeline. Error: ${e.message}`);
                        return {
                            sourceName: 'web_search',
                            sourceUrl: 'web_search',
                            scannedAt: new Date().toISOString(),
                            totalItems: 0,
                            items: [],
                            trendingTopics: [],
                            queryKeywords: searchKw,
                            error: e.message,
                        };
                    }
                }
            }

            if (enableFacebookGroupSearch && researcherConfig.facebookGroupSearch.enabled) {
                console.log(`[Researcher] 🔍 Facebook group search...`);
                await log('researcher_flow', 'info', 'Facebook group search started');
                try {
                    const fbKeywords = researcherConfig.facebookGroupSearch.keywords;
                    const fbResults = await searchFacebookGroups(fbKeywords, {
                        maxResults: researcherConfig.facebookGroupSearch.maxResultsPerKeyword,
                        hoursBack,
                    });
                    console.log(`[Researcher] Facebook search → ${fbResults.length} results`);
                    await log('researcher_flow', 'info', 'Facebook search done', { resultsCount: fbResults.length });
                    for (const r of fbResults) {
                        if (!seenUrls.has(r.url)) {
                            seenUrls.add(r.url);
                            allSearchResults.push({
                                ...r,
                                source: r.source + '_facebook_group',
                            });
                        }
                    }
                } catch (e) {
                    console.warn(`[Researcher] Facebook search failed: ${e.message}`);
                    await log('researcher_flow', 'warn', 'Facebook search failed', { error: e.message });
                }
            }

            console.log(`[Researcher] Phase 1 (Web Search) xong — ${allSearchResults.length} kết quả tìm thấy`);
            await log('researcher_flow', 'info', 'Web search phase complete', {
                totalResults: allSearchResults.length,
                keywordsAttempted: totalKeywordsAttempted,
                keywordsTotal: searchKw.length,
                uniqueUrls: seenUrls.size,
            });

            if (allSearchResults.length === 0) {
                console.warn(`[Researcher] Web search không có kết quả, trả về rỗng`);
                await log('researcher_flow', 'warn', 'Web search zero results', {
                    keywords: searchKw,
                    enableFacebookGroupSearch,
                });
                return { sourceName: 'auto_search', sourceUrl: 'auto_search', scannedAt: new Date().toISOString(), totalItems: 0, items: [], trendingTopics: [] };
            }

            rawContent = JSON.stringify(allSearchResults, null, 2);
        }

        let extractPrompt;
        if (sourceType === 'rss') {
            extractPrompt = researcherConfig.extractSystemPrompt.replace(/\{\{maxItems\}\}/g, String(maxItems)).replace(/\{\{hoursBack\}\}/g, String(hoursBack));
        } else {
            extractPrompt = `${researcherConfig.autoSearchSystemPrompt}\n\n${researcherConfig.autoSearchUserPromptTemplate}`
                .replace(/\{\{searchData\}\}/g, '<<DATA IN PROMPT BELOW>>')
                .replace(/\{\{hoursBack\}\}/g, String(hoursBack))
                .replace(/\{\{maxItems\}\}/g, String(maxItems));
        }

        console.log(`[Researcher] Phase 2 — extractJSON với ${rawContent.length} ký tự dữ liệu, sourceType=${sourceType}`);
        const extractResult = await researcher.extractJSON(rawContent, RSSScanResultSchema, extractPrompt);

        if (!extractResult.success) {
            console.warn(`[Researcher] Bóc tách dữ liệu thất bại: ${extractResult.error}`);
            await log('researcher_flow', 'error', 'extractJSON failed', {
                sourceType,
                rawContentLength: rawContent.length,
                error: extractResult.error,
                url: url || null,
            });
            return { sourceName: url || 'auto_search', sourceUrl: url || 'auto_search', scannedAt: new Date().toISOString(), totalItems: 0, items: [], trendingTopics: [] };
        }

        const resultData = extractResult.data;
        console.log(`[Researcher] extractJSON OK — ${resultData.totalItems || 0} items, source=${resultData.sourceName || 'N/A'}`);
        await log('researcher_flow', 'success', 'extractJSON succeeded', {
            sourceType,
            totalItems: resultData.totalItems,
            sourceName: resultData.sourceName,
        });
        resultData.sourceName = resultData.sourceName || url || 'auto_search';
        resultData.sourceUrl = resultData.sourceUrl || url || 'auto_search';
        resultData.scannedAt = resultData.scannedAt || new Date().toISOString();
        resultData.trendingTopics = resultData.trendingTopics || [];

        const itemsBeforeFilter = (resultData.items || []).length;
        const filteredItems = (resultData.items || []).filter((item) => {
            if (!item.pubDate) return false;
            return true;
        });
        const itemsAfterFilter = filteredItems.length;

        if (itemsBeforeFilter !== itemsAfterFilter) {
            console.warn(`[Researcher] ⚠️ pubDate filter: ${itemsBeforeFilter} → ${itemsAfterFilter} (dropped ${itemsBeforeFilter - itemsAfterFilter} items without pubDate)`);
            await log('researcher_flow', 'warn', 'pubDate filter dropped items', {
                before: itemsBeforeFilter,
                after: itemsAfterFilter,
                dropped: itemsBeforeFilter - itemsAfterFilter,
            });
        }

        resultData.items = filteredItems.map((item) => ({
            title: item.title || '(không có tiêu đề)',
            link: item.link || '',
            pubDate: item.pubDate || new Date().toISOString(),
            summary: item.summary || '',
            category: researcherConfig.categories.includes(item.category) ? item.category : 'khác',
            sentiment: researcherConfig.sentiments.includes(item.sentiment) ? item.sentiment : 'trung_tính',
            phuQuocRelevance: typeof item.phuQuocRelevance === 'number' ? Math.min(10, Math.max(0, item.phuQuocRelevance)) : 0,
        })).filter((item) => item.link);
        resultData.totalItems = resultData.items.length;

        console.log(`[Researcher] ✅ Hoàn thành — ${resultData.totalItems || 0} bài viết từ ${resultData.sourceName || 'N/A'}`);
        await log('researcher_flow', 'success', 'Research complete', {
            totalItems: resultData.totalItems,
            sourceName: resultData.sourceName,
            sourceType,
        });

        return resultData;
    }
);

export { researcher, researcherScanRSSFlow, RSSScanResultSchema, RSSItemSchema };
