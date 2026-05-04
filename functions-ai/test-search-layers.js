/**
 * TEST SCRIPT — Kiểm tra từng layer web search độc lập
 * Chạy: node test-search-layers.js
 *
 * TEST REFERENCES (cho các agent liên quan):
 * - Facebook post mẫu: https://www.facebook.com/9tripphuquoc/videos/6947693362001593
 *   Dùng để test Researcher (scrape/analyze), Publisher (post đã publish), MediaMaster (video)
 */
import 'dotenv/config';
import axios from 'axios';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY_FREE || process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta';
const OPENROUTER_API_KEY = process.env.OPENROUTER;
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1';
const FIRECRAWL_API_KEY = process.env.FIRECRAWL;
const FIRECRAWL_API_URL = 'https://api.firecrawl.dev/v1';

const QUERY = 'Phú Quốc du lịch tin tức mới nhất';
const MAX_RESULTS = 3;
const HOURS_BACK = 24;

// ─── Helpers ────────────────────────────────────────────────
function isValidUrl(str) {
    try { const u = new URL(str); return u.protocol === 'http:' || u.protocol === 'https:'; }
    catch { return false; }
}
function isFakeUrl(url) {
    try {
        const hostname = new URL(url).hostname.toLowerCase();
        if (['localhost', '127.0.0.1', '0.0.0.0'].includes(hostname)) return true;
        if (hostname.endsWith('.example.com') || hostname === 'example.com') return true;
        if (hostname.endsWith('.test') || hostname.endsWith('.invalid')) return true;
        return false;
    } catch { return true; }
}

// ─── TEST 1: GEMINI GOOGLE SEARCH ────────────────────────────
async function testGemini() {
    console.log('\n═══════════════════════════════════════════');
    console.log('🧪 TEST 1: Gemini Google Search Grounding');
    console.log('═══════════════════════════════════════════');
    console.log(`API Key: ${GEMINI_API_KEY ? GEMINI_API_KEY.slice(0, 8) + '...' : 'MISSING!'}`);
    console.log(`Query: "${QUERY}"`);

    try {
        const prompt = `Search the web for: ${QUERY}\n\nReturn the top ${MAX_RESULTS} results with [TITLE], [URL], [SNIPPET], [DATE]. Separate with ---.`;

        const t0 = Date.now();
        const response = await axios.post(
            `${GEMINI_API_URL}/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                tools: [{ googleSearch: {} }],
                generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
            },
            { timeout: 45000 }
        );
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

        const candidate = response.data?.candidates?.[0];
        console.log(`  Thời gian: ${elapsed}s`);
        console.log(`  Có candidate: ${!!candidate}`);

        const text = candidate?.content?.parts?.map(p => p.text).filter(Boolean).join('') || '';
        console.log(`  Text length: ${text.length} chars`);
        console.log(`  Text preview: ${text.slice(0, 200)}...`);

        const grounding = candidate?.groundingMetadata;
        console.log(`  Grounding chunks: ${grounding?.groundingChunks?.length || 0}`);
        if (grounding?.groundingChunks) {
            for (const chunk of grounding.groundingChunks) {
                console.log(`    → ${chunk.web?.title || '???'} | ${chunk.web?.uri || '???'}`);
            }
        }

        console.log('✅ TEST 1: SUCCESS');
        return true;
    } catch (e) {
        const status = e.response?.status;
        const data = e.response?.data;
        console.log(`❌ TEST 1: FAILED — HTTP ${status || '???'} — ${data?.error?.message || e.message}`);
        return false;
    }
}

// ─── TEST 2: OPENROUTER WEB SEARCH TOOL ──────────────────────
async function testOpenRouter() {
    console.log('\n═══════════════════════════════════════════');
    console.log('🧪 TEST 2: OpenRouter Web Search Server Tool (engine: firecrawl)');
    console.log('═══════════════════════════════════════════');
    console.log(`API Key: ${OPENROUTER_API_KEY ? OPENROUTER_API_KEY.slice(0, 10) + '...' : 'MISSING!'}`);

    try {
        const t0 = Date.now();
        const response = await axios.post(
            `${OPENROUTER_API_URL}/chat/completions`,
            {
                model: 'openai/gpt-4o',
                messages: [
                    { role: 'system', content: `Search the web and return results in this format:\n[TITLE] title\n[URL] url\n[SNIPPET] summary\n[DATE] date\nSeparate with: ---` },
                    { role: 'user', content: `Search for: ${QUERY}\nOnly last ${HOURS_BACK}h. Top ${MAX_RESULTS} results.` },
                ],
                tools: [{ type: 'openrouter:web_search', parameters: { engine: 'firecrawl', max_results: MAX_RESULTS } }],
                temperature: 0.1,
                max_tokens: 4096,
            },
            {
                timeout: 45000,
                headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
            }
        );
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

        const choice = response.data?.choices?.[0];
        const text = choice?.message?.content || '';
        console.log(`  Thời gian: ${elapsed}s`);
        console.log(`  Model: ${response.data?.model || 'N/A'}`);
        console.log(`  Text length: ${text.length} chars`);
        console.log(`  Text:\n${text.slice(0, 800)}`);
        console.log(`  Usage:`, JSON.stringify(response.data?.usage || {}));

        console.log('✅ TEST 2: SUCCESS');
        return true;
    } catch (e) {
        const status = e.response?.status;
        const data = e.response?.data;
        console.log(`❌ TEST 2: FAILED — HTTP ${status || '???'}`);
        console.log(`  Error: ${JSON.stringify(data?.error || e.message).slice(0, 500)}`);
        return false;
    }
}

// ─── TEST 3: FIRECRAWL SEARCH ─────────────────────────────────
async function testFirecrawl() {
    console.log('\n═══════════════════════════════════════════');
    console.log('🧪 TEST 3: Firecrawl Search API');
    console.log('═══════════════════════════════════════════');
    console.log(`API Key: ${FIRECRAWL_API_KEY ? FIRECRAWL_API_KEY.slice(0, 8) + '...' : 'MISSING!'}`);

    try {
        const t0 = Date.now();
        const response = await axios.post(
            `${FIRECRAWL_API_URL}/search`,
            {
                query: QUERY,
                limit: MAX_RESULTS,
                scrapeOptions: { formats: ['markdown'] },
            },
            {
                timeout: 45000,
                headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, 'Content-Type': 'application/json' },
            }
        );
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

        const data = response.data?.data || [];
        console.log(`  Thời gian: ${elapsed}s`);
        console.log(`  Results: ${data.length}`);
        for (const item of data) {
            const url = item.url || item.link || '';
            console.log(`  → ${item.title || '???'}`);
            console.log(`    URL: ${url} | valid: ${isValidUrl(url)} | fake: ${isFakeUrl(url)}`);
            console.log(`    Date: ${item.date || item.metadata?.date || 'N/A'}`);
        }

        console.log('✅ TEST 3: SUCCESS');
        return true;
    } catch (e) {
        const status = e.response?.status;
        const data = e.response?.data;
        console.log(`❌ TEST 3: FAILED — HTTP ${status || '???'}`);
        console.log(`  Error: ${JSON.stringify(data || e.message).slice(0, 500)}`);
        return false;
    }
}

// ─── TEST 4: Duplicate previous data in extractJSON prompt ───
async function testDuplicateData() {
    console.log('\n═══════════════════════════════════════════');
    console.log('🧪 TEST 4: Kiểm tra trùng lặp data trong extractJSON');
    console.log('═══════════════════════════════════════════');
    console.log('  Trong researcher-rss.flow.js line 137-144:');
    console.log('  extractJSON(rawContent, schema, extractPrompt)');
    console.log('  → rawContent = JSON.stringify(allSearchResults)');
    console.log('  → extractPrompt = autoSearchSystemPrompt + template.replace({{searchData}}, rawContent)');
    console.log('  → AiManager.extractJSON truyền: system=extractPrompt, prompt=rawContent');
    console.log('  ⚠️  DATA BỊ TRUYỀN 2 LẦN (1 lần trong system prompt, 1 lần là prompt)');
    console.log('  → Có thể gây token limit với dataset lớn');
    console.log('  → KHÔNG phải nguyên nhân chính gây lỗi rỗng, nhưng lãng phí token');
    console.log('✅ TEST 4: INFO ONLY');
}

// ─── Main ─────────────────────────────────────────────────────
async function main() {
    console.log('═══════════════════════════════════════════════');
    console.log('🔍 WEB SEARCH LAYER TESTS');
    console.log('═══════════════════════════════════════════════');
    console.log(`Query: "${QUERY}"`);
    console.log(`Max Results: ${MAX_RESULTS}`);
    console.log(`Hours Back: ${HOURS_BACK}`);

    const results = {};

    results.gemini = await testGemini();
    results.openrouter = await testOpenRouter();
    results.firecrawl = await testFirecrawl();
    await testDuplicateData();

    // ─── Summary ──────────────────────────────────────────────────
    console.log('\n═══════════════════════════════════════════');
    console.log('📊 TỔNG KẾT');
    console.log('═══════════════════════════════════════════');
    for (const [name, ok] of Object.entries(results)) {
        console.log(`  ${ok ? '✅' : '❌'} ${name}`);
    }

    const allPass = Object.values(results).every(Boolean);
    if (allPass) {
        console.log('\n✅ Tất cả layers OK — Lỗi rỗng có thể nằm ở extractJSON hoặc AiManager');
    } else {
        console.log('\n❌ Có layer FAIL — Đây là nguyên nhân gây lỗi rỗng');
        if (!results.gemini && !results.openrouter && !results.firecrawl) {
            console.log('  → Cả 3 layers đều fail → researcher trả về 0 results');
            console.log('  → Pipeline báo "Không tìm thấy dữ liệu đầu vào"');
        }
    }
}

main().catch(e => console.error('FATAL:', e));
