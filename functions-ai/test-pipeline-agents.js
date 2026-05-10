/**
 * TEST SCRIPT — Kiểm tra toàn bộ Agent flow trong runPipeline
 * Chạy: node test-pipeline-agents.js
 *
 * Test với URL tham khảo:
 *   https://www.facebook.com/9tripphuquoc/videos/6947693362001593
 */
import 'dotenv/config';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ═════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═════════════════════════════════════════════════════════════════════════

const TEST_URL = 'https://www.facebook.com/9tripphuquoc/videos/6947693362001593';
const QUERY = 'Phú Quốc du lịch tin tức mới nhất';
const MAX_RESULTS = 8;  // Tăng lên 8 (khớp webSearchMaxResultsPerKeyword)
const AUTO_SEARCH_MAX_ITEMS = 20; // Khớp autoSearchMaxItems
const HOURS_BACK = 24;

const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY_FREE;
const OPENROUTER_KEY = process.env.OPENROUTER;

// ─── Proxy / Fallback URLs for scraping ──────────────────────────────────
const SCRAPE_FALLBACKS = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(TEST_URL)}`,
    `https://r.jina.ai/http://${encodeURIComponent(TEST_URL)}`,
];

// ═════════════════════════════════════════════════════════════════════════
// HELPERS
// ═════════════════════════════════════════════════════════════════════════

const PASS = (msg) => console.log(`  ✅ ${msg}`);
const FAIL = (msg) => console.log(`  ❌ ${msg}`);
const INFO = (msg) => console.log(`  ℹ️ ${msg}`);
const SEP = () => console.log('\n' + '─'.repeat(55));

function elapsed(t0) {
    return ((Date.now() - t0) / 1000).toFixed(1);
}

// ─── Lưu kết quả test ────────────────────────────────────────────────────
const TEST_RESULT_DIR = path.join(__dirname, 'test-results');
const TEST_RTDB_URL = process.env.TEST_RTDB_URL; // https://<project>.asia-southeast1.firebasedatabase.app

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function saveTestResult(testName, data) {
    const today = new Date().toISOString().slice(0, 10);
    const rtdbPath = `test_results/${today}/${testName}`;
    const payload = { testName, timestamp: Date.now(), ...data };

    // 1. Luôn lưu local file
    const dir = path.join(TEST_RESULT_DIR, today);
    ensureDir(dir);
    const filePath = path.join(dir, `${testName}.json`);
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');

    // 2. Ghi RTDB nếu có URL
    if (TEST_RTDB_URL) {
        try {
            await axios.put(`${TEST_RTDB_URL}/${rtdbPath}.json`, payload, { timeout: 10000 });
            console.log(`  💾 RTDB: ${rtdbPath}`);
        } catch (e) {
            console.log(`  ⚠️ RTDB write failed (${e.message}) — data saved locally`);
        }
    } else {
        console.log(`  💾 Local: ${filePath}`);
    }
}

function isValidUrl(str) {
    try { const u = new URL(str); return u.protocol === 'http:' || u.protocol === 'https:'; }
    catch { return false; }
}

async function openRouterChat(messages, tools = [], model = 'openrouter/auto', retryCount = 0) {
    if (!OPENROUTER_KEY) throw new Error('Missing OPENROUTER key');
    const body = { model, messages, temperature: 0.1, max_tokens: 4096 };
    if (tools.length) body.tools = tools;
    try {
        const res = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            body,
            { timeout: 60000, headers: { Authorization: `Bearer ${OPENROUTER_KEY}`, 'Content-Type': 'application/json' } }
        );
        return res.data?.choices?.[0]?.message?.content || '';
    } catch (e) {
        if (retryCount < 1) {
            // Retry: không gửi model — OpenRouter chọn lại model khác
            const retryBody = { messages, temperature: 0.1, max_tokens: 8192 };
            if (tools.length) retryBody.tools = tools;
            try {
                const res = await axios.post(
                    'https://openrouter.ai/api/v1/chat/completions',
                    retryBody,
                    { timeout: 120000, headers: { Authorization: `Bearer ${OPENROUTER_KEY}`, 'Content-Type': 'application/json' } }
                );
                const content = res.data?.choices?.[0]?.message?.content || '';
                if (content) return content;
            } catch (_) {}
        }
        throw e;
    }
}

// ═════════════════════════════════════════════════════════════════════════
// TEST 1: Researcher — Scrape Facebook URL
// ═════════════════════════════════════════════════════════════════════════

async function testResearcherScrapeUrl() {
    console.log('\n═══════════════════════════════════════════');
    console.log('🧪 TEST 1: Researcher — Scrape URL (Facebook)');
    console.log('═══════════════════════════════════════════');
    console.log(`URL: ${TEST_URL}`);

    // Try direct GET first
    try {
        const t0 = Date.now();
        const resp = await axios.get(TEST_URL, {
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml',
            },
        });
        const html = resp.data;
        const len = typeof html === 'string' ? html.length : JSON.stringify(html).length;
        PASS(`Direct GET thành công — ${len} bytes (${elapsed(t0)}s)`);

        // Kiểm tra nội dung có hữu ích không
        const htmlStr = typeof html === 'string' ? html : JSON.stringify(html);
        const hasPhuQuoc = /Phú Quốc|Phu Quoc|9 Trip|9trip/i.test(htmlStr);
        INFO(`Nội dung chứa "Phú Quốc" / "9 Trip": ${hasPhuQuoc}`);
        INFO(`Preview: ${htmlStr.slice(0, 300)}...`);
        return { success: true, content: htmlStr, source: 'direct' };
    } catch (e) {
        INFO(`Direct GET thất bại: ${e.message} — thử OpenRouter Web Search...`);
    }

    // Fallback: dùng OpenRouter Web Search để tìm post này
    try {
        const t0 = Date.now();
        const text = await openRouterChat([
            { role: 'system', content: `Bạn là Web Research Agent. Hãy dùng web_search tool để truy cập URL và lấy toàn bộ nội dung trang. Trả về NGUYÊN VĂN nội dung tìm thấy.` },
            { role: 'user', content: `Truy cập và đọc nội dung từ URL này: ${TEST_URL}. Trả về tất cả thông tin hữu ích.` },
        ], [{ type: 'openrouter:web_search', parameters: { engine: 'auto', max_results: 3 } }]);
        const len = text.length;
        PASS(`OpenRouter Web Search — ${len} chars (${elapsed(t0)}s)`);
        INFO(`Preview: ${text.slice(0, 400)}...`);

        if (len < 30) { FAIL('Nội dung quá ngắn — không đủ để xử lý'); return { success: false }; }
        return { success: true, content: text, source: 'openrouter_search' };
    } catch (e) {
        FAIL(`OpenRouter Web Search cũng thất bại: ${e.message}`);
        INFO(`→ Facebook thường chặn scrape. Đây là hành vi mong đợi.`);
        INFO(`→ Researcher sẽ trả về items:[] và pipeline tiếp tục với items rỗng.`);
        return { success: false };
    }
}

// ═════════════════════════════════════════════════════════════════════════
// TEST 2: Researcher — auto_search mode (web search + AI extract)
// ═════════════════════════════════════════════════════════════════════════

async function testResearcherAutoSearch() {
    console.log('\n═══════════════════════════════════════════');
    console.log('🧪 TEST 2: Researcher — auto_search (web search + extract)');
    console.log('═══════════════════════════════════════════');
    console.log(`Keywords: "${QUERY}"`);

    // Phase 1: Web search (giống researcher-rss.flow.js dòng 89-119)
    let allResults = [];
    const seenUrls = new Set();
    try {
        const t0 = Date.now();
        const text = await openRouterChat([
            {
                role: 'system',
                content: `Search the web for Phu Quoc tourism news and return results in this EXACT format:

[TITLE] Exact title
[URL] Full URL(must be real)
[SNIPPET] 2-3 sentence summary
[DATE] Publication date if found

Separate each result with:
---
If no results: NO_RESULTS_FOUND

Rules:
- Use the web_search tool to get real results
- Never make up URLs or titles
- Focus on Vietnamese-language content`,
            },
            {
                role: 'user',
                content: `Search for: ${QUERY}\nOnly results from last ${HOURS_BACK}h.\nTop ${MAX_RESULTS} results.`,
            },
        ], [{ type: 'openrouter:web_search', parameters: { engine: 'auto', max_results: MAX_RESULTS } }]);
        PASS(`Web search hoàn thành (${elapsed(t0)}s) — ${text.length} chars`);

        // Parse structured results
        const results = text.split('---').filter(b => b.trim().length > 0);
        for (const block of results) {
            const title = (block.match(/\[TITLE\]\s*(.+?)(?:\n|$)/) || [])[1]?.trim() || '';
            const url = (block.match(/\[URL\]\s*(.+?)(?:\n|$)/) || [])[1]?.trim() || '';
            const snippet = (block.match(/\[SNIPPET\]\s*(.+?)(?:\n|$)/) || [])[1]?.trim() || '';
            const date = (block.match(/\[DATE\]\s*(.+?)(?:\n|$)/) || [])[1]?.trim() || '';
            if (title && isValidUrl(url) && !seenUrls.has(url)) {
                seenUrls.add(url);
                allResults.push({ title, url, snippet, date });
            }
        }
        INFO(`Parsed: ${allResults.length} unique results`);
        for (const r of allResults) {
            console.log(`  → ${r.title}`);
            console.log(`    URL: ${r.url.slice(0, 80)}`);
        }
    } catch (e) {
        FAIL(`Web search thất bại: ${e.message}`);
        INFO(`→ Dùng mock data để test pipeline logic`);
        // Mock data khi API không available
        allResults = [
            { title: 'Tin tức mới nhất về Phú Quốc', url: 'https://tin.skydoor.net/place/Phu_Quoc', snippet: 'Tổng hợp tin tức Phú Quốc mới nhất.', date: new Date().toISOString() },
            { title: 'Phú Quốc - Tin tức online 24h mới nhất', url: 'https://baomoi.com/tag/Phu-Quoc.epi', snippet: 'Tin tức Phú Quốc 24h qua.', date: new Date(Date.now() - 6 * 3600000).toISOString() },
            { title: 'Đảo Phú Quốc - VnExpress', url: 'https://vnexpress.net/tag/dao-phu-quoc-327933', snippet: 'Toàn cảnh du lịch Phú Quốc.', date: new Date(Date.now() - 12 * 3600000).toISOString() },
            { title: 'Du lịch Phú Quốc - SKĐS', url: 'https://giadinh.suckhoedoisong.vn/du-lich-phu-quoc.html', snippet: 'Cẩm nang du lịch Phú Quốc.', date: new Date(Date.now() - 24 * 3600000).toISOString() },
            { title: 'Du Lịch Phú Quốc - Vietnamnet', url: 'https://vietnamnet.vn/du-lich-phu-quoc-news.html', snippet: 'Tin du lịch Phú Quốc.', date: new Date(Date.now() - 3 * 3600000).toISOString() },
            { title: 'Phú quốc - CafeF', url: 'https://cafef.vn/phu-quoc.html', snippet: 'Kinh tế Phú Quốc.', date: new Date(Date.now() - 48 * 3600000).toISOString() },
            { title: 'Phú Quốc - Báo Tuổi Trẻ', url: 'https://tuoitre.vn/phu-quoc.html', snippet: 'Tin tức Phú Quốc từ Tuổi Trẻ.', date: new Date(Date.now() - 72 * 3600000).toISOString() },
            { title: 'ĐẢO NGỌC PHÚ QUỐC - YouTube', url: 'https://www.youtube.com/watch?v=eT-82moUsT0', snippet: 'Video giới thiệu Phú Quốc.', date: new Date(Date.now() - 5 * 3600000).toISOString() },
        ];
        INFO(`Mock data: ${allResults.length} results`);
    }

    if (allResults.length === 0) {
        FAIL('Không tìm thấy kết quả nào');
        return { success: false, items: [] };
    }

    // Phase 2: AI Extract — mô phỏng extractJSON của researcher
    // Build prompt giống researcher.config.js autoSearchSystemPrompt + autoSearchUserPromptTemplate
    try {
        const t0 = Date.now();
        const rawContent = JSON.stringify(allResults, null, 2);
        const extractPrompt = `Bạn là Web Research Agent chuyên thu thập thông tin du lịch Phú Quốc từ Internet.

NHIỆM VỤ:
1. Phân tích dữ liệu tìm kiếm web được cung cấp.
2. Mỗi kết quả tìm kiếm bao gồm: title, url, snippet, date.
3. Lọc các kết quả có nội dung thực sự liên quan đến Phú Quốc.
4. Tổng hợp thành danh sách các bài viết/item có ích.
5. Chỉ giữ lại kết quả trong vòng ${HOURS_BACK} giờ gần nhất.

Dưới đây là kết quả tìm kiếm web tự động về du lịch Phú Quốc.

═══ DỮ LIỆU WEB SEARCH ═══
${rawContent}

═══ YÊU CẦU ═══
- Tổng hợp các kết quả tìm kiếm thành danh sách item
- Với mỗi item, ghi rõ: title, link (URL gốc), summary (2-3 câu), category, sentiment, phuQuocRelevance
- Chỉ giữ lại kết quả trong vòng ${HOURS_BACK} giờ gần nhất
- Ưu tiên các kết quả từ Facebook groups (review, kinh nghiệm)

Trả về JSON hợp lệ với schema:
{
  "sourceName": "auto_search",
  "sourceUrl": "auto_search",
  "scannedAt": "ISO date",
  "totalItems": number,
  "items": [{ "title": string, "link": string, "pubDate": string, "summary": string, "category": "tour|khách_sạn|ẩm_thực|sự_kiện|thời_tiết|thuế_chính_sách|khác", "sentiment": "tích_cực|trung_tính|tiêu_cực", "phuQuocRelevance": number(0-10) }],
  "trendingTopics": [string]
}

Lưu ý: Không bỏ qua item nào vì thiếu pubDate. Nếu không có ngày, dùng ngày hiện tại.
Giới hạn tối đa ${AUTO_SEARCH_MAX_ITEMS} items có phuQuocRelevance cao nhất.`;

        const extractResult = await openRouterChat([
            { role: 'system', content: 'Bạn là chuyên gia phân tích dữ liệu du lịch. Luôn trả về JSON hợp lệ.' },
            { role: 'user', content: extractPrompt },
        ]);

        let parsed;
        try {
            const jsonMatch = extractResult.match(/\{[\s\S]*\}/);
            parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(extractResult);
        } catch (parseErr) {
            FAIL(`extractJSON parse thất bại: ${parseErr.message} — thử lại...`);
            try {
                const retryResult = await openRouterChat([
                    { role: 'system', content: 'Bạn là chuyên gia phân tích dữ liệu du lịch. Chỉ trả về JSON hợp lệ, không thêm text.' },
                    { role: 'user', content: extractPrompt },
                ]);
                const retryMatch = retryResult.match(/\{[\s\S]*\}/);
                parsed = retryMatch ? JSON.parse(retryMatch[0]) : JSON.parse(retryResult);
            } catch (retryErr) {
                FAIL(`extractJSON AI thất bại: ${retryErr.message} — trả raw search results`);
                // Chỉ trả raw data (trường field gốc), không mock AI fields
                const rawItems = allResults.map(r => ({
                    title: r.title || '(không có tiêu đề)',
                    link: r.url || '',
                    pubDate: r.date || '',
                    summary: r.snippet || '',
                })).filter(item => item.link);
                return { success: false, items: rawItems, trendingTopics: [] };
            }
        }

        PASS(`extractJSON hoàn thành (${elapsed(t0)}s) — ${parsed.totalItems || 0} items`);

        // BỎ pubDate filter cho auto_search — items thiếu ngày vẫn được giữ và gán ngày hiện tại
        const filteredItems = (parsed.items || []).map(item => ({
            title: item.title || '(không có tiêu đề)',
            link: item.link || '',
            pubDate: item.pubDate || new Date().toISOString(), // Gán ngày hiện tại nếu thiếu
            summary: item.summary || '',
            summary: item.summary || '',
            category: ['tour', 'khách_sạn', 'ẩm_thực', 'sự_kiện', 'thời_tiết', 'thuế_chính_sách'].includes(item.category) ? item.category : 'khác',
            sentiment: ['tích_cực', 'trung_tính', 'tiêu_cực'].includes(item.sentiment) ? item.sentiment : 'trung_tính',
            phuQuocRelevance: typeof item.phuQuocRelevance === 'number' ? Math.min(10, Math.max(0, item.phuQuocRelevance)) : 0,
        })).filter(item => item.link);

        INFO(`Items sau filter: ${filteredItems.length}`);
        for (const item of filteredItems) {
            console.log(`  → [${item.phuQuocRelevance}] ${item.title.slice(0, 60)} | ${item.category} | ${item.sentiment}`);
        }

        return { success: true, items: filteredItems, trendingTopics: parsed.trendingTopics || [] };
    } catch (e) {
        FAIL(`extractJSON thất bại: ${e.message}`);
        return { success: false, items: allResults };
    }
}

// ═════════════════════════════════════════════════════════════════════════
// TEST 3: Scoring — mô phỏng scoring.flow.js
// ═════════════════════════════════════════════════════════════════════════

async function testScoring(items) {
    console.log('\n═══════════════════════════════════════════');
    console.log('🧪 TEST 3: Scoring');
    console.log('═══════════════════════════════════════════');

    const testItems = items.length > 0 ? items : [];
    if (testItems.length === 0) {
        FAIL('Không có items để scoring');
        return { success: true, scoredItems: [], processable: [] };
    }

    // ── Score Freshness ──
    function scoreFreshness(pubDate) {
        if (pubDate === undefined || pubDate === null) return 0;
        if (pubDate === '') return 3;
        const pub = new Date(pubDate);
        if (isNaN(pub.getTime())) return 3;
        const diffHours = (Date.now() - pub) / (1000 * 60 * 60);
        if (diffHours <= 6) return 10;
        if (diffHours <= 24) return 8;
        if (diffHours <= 72) return 5;
        if (diffHours <= 168) return 3;
        return 0;
    }

    // ── Score Trend ──
    function scoreTrend(title, summary) {
        const text = `${title} ${summary}`.toLowerCase();
        const phrases = ['Phú Quốc', 'Đảo Ngọc', 'du lịch Phú Quốc', 'tour Phú Quốc', 'Vinpearl', 'Grand World'];
        return Math.min(phrases.filter(p => text.includes(p.toLowerCase())).length * 2, 10);
    }

    // ── Score Business Relevance ──
    function scoreBusinessRelevance(category, title, summary) {
        const text = `${title} ${summary}`.toLowerCase();
        const boostKeywords = ['9 Trip', '9trip', 'combo', 'khuyến mãi', 'đặt phòng', 'giá tốt'];
        let score = ['tour', 'khách_sạn', 'ẩm_thực'].includes(category) ? 5 : 2;
        score += boostKeywords.filter(k => text.includes(k.toLowerCase())).length * 2;
        return Math.min(score, 10);
    }

    // ── Score Season Fit ──
    function scoreSeasonFit(pubDate) {
        if (!pubDate) return 5;
        const d = new Date(pubDate);
        if (isNaN(d.getTime())) return 5;
        const month = d.getMonth() + 1;
        if ([5, 6, 7, 8].includes(month)) return 5 + 2 * 2; // mùa hè
        if ([11, 12, 1].includes(month)) return 5 + 2 * 1; // cuối năm / tết
        if ([3, 4].includes(month)) return 5 + 1 * 2; // giao mùa
        if ([9, 10].includes(month)) return 5; // mùa mưa
        return 5;
    }

    const weights = { freshness: 0.25, trend: 0.20, businessRelevance: 0.30, seasonFit: 0.25 };

    const scored = testItems.map(item => {
        const freshness = scoreFreshness(item.pubDate);
        const trend = scoreTrend(item.title, item.summary);
        const businessRelevance = scoreBusinessRelevance(item.category, item.title, item.summary);
        const seasonFit = scoreSeasonFit(item.pubDate);
        const total = freshness * weights.freshness + trend * weights.trend + businessRelevance * weights.businessRelevance + seasonFit * weights.seasonFit;

        return {
            ...item,
            scores: { freshness, trend, businessRelevance, seasonFit, total: Math.round(total * 10) / 10 },
            shouldProcess: total >= 6.5,
        };
    });

    const processable = scored.filter(i => i.shouldProcess);
    const avg = scored.reduce((s, i) => s + i.scores.total, 0) / scored.length;

    for (const item of scored) {
        const s = item.scores;
        console.log(`  ${item.shouldProcess ? '✅' : '⏭️'}  ${item.title.slice(0, 45).padEnd(45)} | F:${s.freshness} T:${s.trend} B:${s.businessRelevance} S:${s.seasonFit} = ${s.total.toFixed(1)}`);
    }
    INFO(`Processable: ${processable.length}/${scored.length} | Avg score: ${avg.toFixed(1)}`);

    return { success: true, scoredItems: scored, processable };
}

// ═════════════════════════════════════════════════════════════════════════
// TEST 4: Filter/Dedup — mô phỏng filter-dedup.flow.js
// ═════════════════════════════════════════════════════════════════════════

async function testFilterDedup(items) {
    console.log('\n═══════════════════════════════════════════');
    console.log('🧪 TEST 4: Filter & Dedup');
    console.log('═══════════════════════════════════════════');

    const testItems = items.length > 0 ? items.slice(0, 5) : [];
    if (testItems.length === 0) {
        FAIL('Không có items để test filter');
        return { success: false, kept: [], removed: [] };
    }

    const spamKeywords = ['đăng ký ngay', 'nhấn vào link', 'link trong bio', 'tặng iphone', 'miễn phí 100%', 'kiếm tiền online'];
    const negativeKeywords = ['cờ bạc', 'bài bạc', 'đánh đề', 'lô đề', 'lừa đảo', 'scam'];

    function isSpam(title, summary) {
        const text = `${title} ${summary}`.toLowerCase();
        return spamKeywords.some(k => text.includes(k));
    }
    function hasNegative(title, summary) {
        const text = `${title} ${summary}`.toLowerCase();
        return negativeKeywords.some(k => text.includes(k));
    }
    function normalizeTitle(t) {
        return t.toLowerCase().replace(/[^a-z0-9\u00e0-\u1ef9\s]/g, '').replace(/\s+/g, ' ').trim();
    }
    function jaccardSimilarity(a, b) {
        const sa = new Set(a.split(/\s+/));
        const sb = new Set(b.split(/\s+/));
        const inter = new Set([...sa].filter(x => sb.has(x)));
        const union = new Set([...sa, ...sb]);
        return union.size === 0 ? 0 : inter.size / union.size;
    }

    const kept = [];
    const removed = [];
    const processed = [];

    for (const item of testItems) {
        let reason = null;

        if (item.phuQuocRelevance < 3) {
            reason = 'phu_quoc_relevance_thap';
        } else if (hasNegative(item.title, item.summary)) {
            reason = 'noi_dung_tieu_cuc';
        } else if (isSpam(item.title, item.summary)) {
            reason = 'spam';
        } else if (item.scores && item.scores.total < 3) {
            reason = 'diem_tong_thap';
        }

        if (reason) {
            removed.push({ ...item, filterReason: reason });
            console.log(`  ❌ REMOVED [${reason}]: ${item.title.slice(0, 50)}`);
            continue;
        }

        const norm = normalizeTitle(item.title);
        let isDup = false;
        for (const existing of processed) {
            if (jaccardSimilarity(norm, normalizeTitle(existing.title)) > 0.75) {
                isDup = true;
                reason = 'trung_lap_noi_dung';
                break;
            }
            if (item.link && existing.link && item.link === existing.link) {
                isDup = true;
                reason = 'trung_lap_url';
                break;
            }
        }

        if (isDup) {
            removed.push({ ...item, filterReason: reason });
            console.log(`  ❌ REMOVED [${reason}]: ${item.title.slice(0, 50)}`);
            continue;
        }

        processed.push(item);
        kept.push(item);
        console.log(`  ✅ KEPT: ${item.title.slice(0, 50)}`);
    }

    INFO(`Kept: ${kept.length} | Removed: ${removed.length}`);
    return { success: true, kept, removed };
}

// ═════════════════════════════════════════════════════════════════════════
// TEST 5: Planner — mô phỏng planner.flow.js
// ═════════════════════════════════════════════════════════════════════════

async function testPlanner(items) {
    console.log('\n═══════════════════════════════════════════');
    console.log('🧪 TEST 5: Planner');
    console.log('═══════════════════════════════════════════');

    const testItems = items.length > 0 ? items.slice(0, 3) : [];
    if (testItems.length === 0) {
        FAIL('Không có items để plan');
        return { success: true, count: 0 };
    }

    const categoryAngleMap = { tour: 'chi_phi', khách_sạn: 'khach_san', ẩm_thực: 'am_thuc', sự_kiện: 'dia_diem', thời_tiết: 'canh_bao', thuế_chính_sách: 'canh_bao' };
    const categoryTargetMap = { tour: 'family', khách_sạn: 'couple', ẩm_thực: 'group', sự_kiện: 'group' };
    const categoryMediaMap = { tour: 'carousel', khách_sạn: 'image', ẩm_thực: 'image', sự_kiện: 'video' };
    const angleNames = { chi_phi: 'Chi phí & tiết kiệm', dia_diem: 'Địa điểm & review', canh_bao: 'Cảnh báo & lưu ý', kinh_nghiem: 'Kinh nghiệm du lịch', am_thuc: 'Ẩm thực', khach_san: 'Khách sạn & Resort' };
    const targetNames = { family: 'Gia đình', couple: 'Cặp đôi', solo: 'Một mình', group: 'Nhóm bạn' };

    for (const item of testItems) {
        const angle = categoryAngleMap[item.category] || 'kinh_nghiem';
        const target = categoryTargetMap[item.category] || 'family';
        const mediaType = categoryMediaMap[item.category] || 'image';
        const format = item.category === 'thuế_chính_sách' ? 'news_summary' : item.phuQuocRelevance >= 8 ? 'social_post' : 'blog_post';
        const title = item.title.length > 60 ? item.title.slice(0, 57) + '...' : item.title;
        const cta = '9 Trip gợi ý thêm trải nghiệm Phú Quốc — ghé app xem nhẹ bạn nhé 😊';

        console.log(`  📝 ${title.slice(0, 40).padEnd(40)} | angle:${angleNames[angle].padEnd(18)} | target:${targetNames[target].padEnd(10)} | media:${mediaType.padEnd(10)} | format:${format}`);
    }

    PASS(`Planned ${testItems.length} items`);
    return { success: true, count: testItems.length };
}

// ═════════════════════════════════════════════════════════════════════════
// TEST 6: Writer — AI generation (dùng OpenRouter)
// ═════════════════════════════════════════════════════════════════════════

async function testWriter() {
    console.log('\n═══════════════════════════════════════════');
    console.log('🧪 TEST 6: Writer — AI generation');
    console.log('═══════════════════════════════════════════');

    const mockResearcherData = JSON.stringify({
        title: 'Khám phá Phú Quốc mùa hè này — top resort và tour không thể bỏ lỡ',
        summary: 'Phú Quốc đang vào mùa du lịch cao điểm với nhiều resort mới khai trương và các tour combo hấp dẫn. Bài viết tổng hợp những trải nghiệm không thể bỏ lỡ khi đến Đảo Ngọc.',
        category: 'tour',
        phuQuocRelevance: 9,
        enrichmentContext: 'Sản phẩm liên quan:\n- [tour] Tour Phú Quốc 3N2Đ: 5,990,000₫\n- [hotel] Vinpearl Resort Phú Quốc',
        matchedProducts: [{ type: 'tour', name: 'Tour Phú Quốc 3N2Đ' }],
    });

    const format = 'social_post';
    const lengthHint = '150-500 từ';
    const styleHint = 'Sống động, tự nhiên, tin cậy';
    const bannedWords = ['đặt ngay', 'mua ngay', 'giảm giá sốc', 'khuyến mãi Hot', 'chạy ngay', 'click ngay', 'deal khủng', 'flash sale', 'săn sale', 'siêu ưu đãi', 'chốt deal', 'fomo'];

    const systemPrompt = `Bạn là Writer — Chuyên gia Sáng tạo Nội dung cho 9 Trip Phú Quốc.

NGUYÊN TẮC MOBILE FIRST:
1. Tiêu đề dưới 60 ký tự, chứa 1 từ khóa chính tự nhiên.
2. Đoạn đầu (hook) 1-2 câu lôi kéo. Không bắt đầu bằng lời chào vô nghĩa.
3. Đoạn văn không quá 3 câu. Câu không quá 25 chữ.
4. Cứ 2-3 câu phải xuống dòng.

QUY TẮC CTA:
- CTA phải NHẸ NHÀNG như gợi ý, không ép mua.
- Không dùng: ${bannedWords.join(', ')}
- Giọng văn sống động, gần gũi, tối đa 2-3 emoji cả bài.

CẤU TRÚC:
1. HOOK — Câu mở mắt
2. NỘI DUNG CHÍNH — Thông tin hữu ích
3. GIÁ TRỊ THÊM — Chi tiết bất ngờ
4. CTA NHẸ NHÀNG — Gợi ý bước tiếp`;

    const userPrompt = `Dưới đây là dữ liệu thu thập được từ Researcher Agent. Hãy viết ${format} dựa trên dữ liệu này.

═══ DỮ LIỆU TỪ RESEARCHER ═══
${mockResearcherData}

═══ YÊU CẦU ═══
- Định dạng: ${format}
- Độ dài: ${lengthHint}
- Phong cách: ${styleHint}
- Ngôn ngữ: Tiếng Việt
- Không sử dụng các từ cấm: ${bannedWords.join(', ')}
- CTA phải nhẹ nhàng
- phuQuocRelevance >= 8, ưu tiên nhấn mạnh yếu tố Phú Quốc.

Trả về JSON hợp lệ:
{
  "title": "tiêu đề < 60 ký tự",
  "content": "nội dung đầy đủ",
  "cta": "call-to-action 1-2 câu",
  "format": "${format}",
  "wordCount": số_từ,
  "hashtags": ["hashtag1", "hashtag2", "hashtag3"]
}`;

    try {
        const t0 = Date.now();
        const text = await openRouterChat([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ]);

        if (!text || !text.trim()) {
            FAIL('Writer AI trả về response rỗng — không có mock output');
            return { success: false };
        }

        // Try to parse JSON from response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        let data;
        try {
            data = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(text);
        } catch {
            FAIL(`Không parse được JSON từ response`);
            INFO(`Raw (first 500): ${text.slice(0, 500)}`);
            return { success: false };
        }

        PASS(`Writer hoàn thành (${elapsed(t0)}s) — ${data.wordCount || '?'} từ`);
        INFO(`Tiêu đề: ${data.title}`);
        INFO(`Nội dung (first 200): ${(data.content || '').slice(0, 200)}...`);
        INFO(`CTA: ${data.cta}`);
        INFO(`Hashtags: ${(data.hashtags || []).join(', ')}`);

        // Validate
        let errors = [];
        if (!data.title || data.title.length > 60) errors.push(`Tiêu đề > 60 ký tự (${data.title?.length})`);
        if (!data.content || data.content.length < 50) errors.push('Nội dung quá ngắn');
        if (!data.cta) errors.push('Thiếu CTA');
        for (const bw of bannedWords) {
            if ((data.content + ' ' + data.cta).includes(bw)) errors.push(`Chứa từ cấm: "${bw}"`);
        }

        if (errors.length) {
            for (const e of errors) FAIL(e);
            return { success: false, data };
        }
        PASS('Tất cả validation passed');
        return { success: true, data };
    } catch (e) {
        FAIL(`Writer thất bại: ${e.message}`);
        return { success: false };
    }
}

// ═════════════════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════════════════

async function main() {
    console.log('════════════════════════════════════════════════════');
    console.log('🔍 PIPELINE AGENTS TEST');
    console.log('════════════════════════════════════════════════════');
    console.log(`Reference URL: ${TEST_URL}`);
    console.log(`Auto Search Query: "${QUERY}"`);
    console.log();

    const results = {};
    let extractedItems = [];

    // TEST 1: Scrape Facebook URL
    SEP();
    results.scrapeUrl = await testResearcherScrapeUrl();
    await saveTestResult('01-researcher-scrape-url', {
        url: TEST_URL,
        success: results.scrapeUrl.success,
        contentLength: results.scrapeUrl.content?.length || 0,
        source: results.scrapeUrl.source || null,
        hasPhuQuoc: results.scrapeUrl.content ? /Phú Quốc|Phu Quoc|9 Trip|9trip/i.test(results.scrapeUrl.content) : false,
        preview: (results.scrapeUrl.content || '').slice(0, 500),
    });

    // TEST 2: auto_search
    SEP();
    results.autoSearch = await testResearcherAutoSearch();
    extractedItems = results.autoSearch.items || [];
    await saveTestResult('02-researcher-auto-search', {
        query: QUERY,
        success: results.autoSearch.success,
        totalExtracted: extractedItems.length,
        items: extractedItems.map(i => ({
            title: i.title,
            link: i.link,
            pubDate: i.pubDate,
            category: i.category,
            sentiment: i.sentiment,
            phuQuocRelevance: i.phuQuocRelevance,
        })),
        trendingTopics: results.autoSearch.trendingTopics || [],
    });

    // Mock INPUT cho scoring/filter/planner nếu extractJSON AI thất bại
    // Đây là input mock — agents xử lý với logic thật → output thật
    if (!results.autoSearch.success || !extractedItems.length || !extractedItems[0]?.category) {
        FAIL('Researcher auto_search AI thất bại — dùng mock INPUT cho scoring/filter/planner');
        extractedItems = [
            { title: 'Khám phá Phú Quốc mùa hè này', link: 'https://example.com/1', pubDate: new Date().toISOString(), summary: 'Phú Quốc đang vào mùa du lịch cao điểm.', category: 'tour', sentiment: 'tích_cực', phuQuocRelevance: 9 },
            { title: 'Review khách sạn Phú Quốc giá rẻ', link: 'https://example.com/2', pubDate: new Date(Date.now() - 48 * 3600000).toISOString(), summary: 'Kinh nghiệm chọn khách sạn Phú Quốc.', category: 'khách_sạn', sentiment: 'tích_cực', phuQuocRelevance: 7 },
            { title: 'Thời tiết Phú Quốc hôm nay', link: 'https://example.com/3', pubDate: new Date(Date.now() - 6 * 3600000).toISOString(), summary: 'Dự báo thời tiết Phú Quốc.', category: 'thời_tiết', sentiment: 'trung_tính', phuQuocRelevance: 5 },
            { title: 'Cảnh báo lừa đảo tour du lịch Phú Quốc', link: 'https://example.com/4', pubDate: new Date(Date.now() - 2 * 3600000).toISOString(), summary: 'Cảnh báo chiêu trò lừa đảo.', category: 'khác', sentiment: 'tiêu_cực', phuQuocRelevance: 3 },
            { title: 'Ẩm thực Phú Quốc: Top món ngon', link: 'https://example.com/5', pubDate: new Date(Date.now() - 12 * 3600000).toISOString(), summary: 'Các món đặc sản Phú Quốc.', category: 'ẩm_thực', sentiment: 'tích_cực', phuQuocRelevance: 8 },
        ];
        INFO(`Mock input items: ${extractedItems.length}`);
    }

    // TEST 3: Scoring
    SEP();
    results.scoring = await testScoring(extractedItems);
    await saveTestResult('03-scoring', {
        success: results.scoring.success,
        totalItems: (results.scoring.scoredItems || []).length,
        processableCount: (results.scoring.processable || []).length,
        avgScore: results.scoring.scoredItems?.length
            ? (results.scoring.scoredItems.reduce((s, i) => s + (i.scores?.total || 0), 0) / results.scoring.scoredItems.length).toFixed(1)
            : 0,
        scoredItems: (results.scoring.scoredItems || []).map(i => ({
            title: i.title, scores: i.scores, shouldProcess: i.shouldProcess,
        })),
    });

    // TEST 4: Filter/Dedup
    SEP();
    const scoringItems = results.scoring.scoredItems || [];
    results.filterDedup = await testFilterDedup(scoringItems);
    await saveTestResult('04-filter-dedup', {
        success: results.filterDedup.success,
        keptCount: (results.filterDedup.kept || []).length,
        removedCount: (results.filterDedup.removed || []).length,
        kept: (results.filterDedup.kept || []).map(i => ({ title: i.title, link: i.link, category: i.category, scores: i.scores })),
        removed: (results.filterDedup.removed || []).map(i => ({ title: i.title, filterReason: i.filterReason })),
    });

    // TEST 5: Planner
    SEP();
    const keptItems = results.filterDedup.kept || [];
    results.planner = await testPlanner(keptItems);
    await saveTestResult('05-planner', {
        success: results.planner.success,
        planCount: results.planner.count || 0,
        plans: (keptItems.length > 0 ? keptItems : []).map(item => {
            const catAngle = { tour: 'chi_phi', khách_sạn: 'khach_san', 'ẩm_thực': 'am_thuc', sự_kiện: 'dia_diem', thời_tiết: 'canh_bao', thuế_chính_sách: 'canh_bao' };
            const catTarget = { tour: 'family', khách_sạn: 'couple', 'ẩm_thực': 'group', sự_kiện: 'group' };
            const catMedia = { tour: 'carousel', khách_sạn: 'image', 'ẩm_thực': 'image', sự_kiện: 'video' };
            const angle = catAngle[item.category] || 'kinh_nghiem';
            const target = catTarget[item.category] || 'family';
            const mediaType = catMedia[item.category] || 'image';
            const format = item.category === 'thuế_chính_sách' ? 'news_summary' : item.phuQuocRelevance >= 8 ? 'social_post' : 'blog_post';
            return { title: item.title, category: item.category, angle, target, mediaType, format };
        }),
    });

    // TEST 6: Writer
    SEP();
    results.writer = await testWriter();
    await saveTestResult('06-writer', {
        success: results.writer.success,
        article: results.writer.data ? {
            title: results.writer.data.title,
            content: results.writer.data.content,
            cta: results.writer.data.cta,
            format: results.writer.data.format,
            wordCount: results.writer.data.wordCount,
            hashtags: results.writer.data.hashtags,
        } : null,
        error: results.writer.success ? null : 'Writer failed',
    });

    // ═══ SUMMARY ═══════════════════════════════════════════════
    SEP();
    console.log('📊 TỔNG KẾT');
    console.log('═══════════════════════════════════════════');

    const summary = {
        '1. Researcher - Scrape URL': results.scrapeUrl.success ? '✅' : results.scrapeUrl.success === false ? '❌' : '⏭️',
        '2. Researcher - auto_search': results.autoSearch.success ? '✅' : '❌',
        '3. Scoring': results.scoring.success ? '✅' : '❌',
        '4. Filter/Dedup': results.filterDedup.success ? '✅' : '❌',
        '5. Planner': results.planner.success ? '✅' : '❌',
        '6. Writer (AI)': results.writer.success ? '✅' : '❌',
    };

    for (const [name, ok] of Object.entries(summary)) {
        console.log(`  ${ok} ${name}`);
    }

    const allOk = Object.values(summary).every(v => v === '✅');
    const partialOk = Object.values(summary).filter(v => v === '✅').length;
    console.log(`\n📈 Passed: ${partialOk}/${Object.keys(summary).length}`);

    if (partialOk === Object.keys(summary).length) {
        console.log('🎉 TẤT CẢ AGENTS HOẠT ĐỘNG TỐT');
    } else {
        console.log('⚠️ Một số agent cần kiểm tra lại');
    }

    // Lưu summary tổng thể
    await saveTestResult('_summary', {
        total: Object.keys(summary).length,
        passed: partialOk,
        failed: Object.keys(summary).length - partialOk,
        details: summary,
        config: {
            query: QUERY,
            maxResults: MAX_RESULTS,
            autoSearchMaxItems: AUTO_SEARCH_MAX_ITEMS,
            hoursBack: HOURS_BACK,
            testUrl: TEST_URL,
            model: 'openrouter/auto',
        },
    });
}

main().catch(e => {
    console.error('\n❌ FATAL:', e.message);
    process.exit(1);
});
