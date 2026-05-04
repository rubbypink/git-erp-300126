import axios from 'axios';
import { log } from '../../.9trip-agents/shared-logic/helpers.js';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY_FREE;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta';
const OPENROUTER_API_KEY = process.env.OPENROUTER;
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1';
const FIRECRAWL_API_KEY = process.env.FIRECRAWL;
const FIRECRAWL_API_URL = 'https://api.firecrawl.dev/v1';

// ─── Utility ─────────────────────────────────────────────────────────

function isValidUrl(str) {
    try {
        const u = new URL(str);
        return u.protocol === 'http:' || u.protocol === 'https:';
    } catch { return false; }
}

function isFakeUrl(url) {
    try {
        const u = new URL(url);
        const hostname = u.hostname.toLowerCase();
        // IP-based URLs, localhost, example domains
        if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') return true;
        if (hostname.endsWith('.example.com') || hostname === 'example.com') return true;
        if (hostname.endsWith('.test') || hostname.endsWith('.invalid')) return true;
        return false;
    } catch { return true; }
}

function isRealUrl(url) {
    return isValidUrl(url) && !isFakeUrl(url);
}

function validateResults(results) {
    return results.filter((r) => isRealUrl(r.url));
}

// ─── Search Prompt Builder ────────────────────────────────────────────

function buildSearchPrompt(query, maxResults, hoursBack) {
    return `Search the web for: ${query}

Requirements:
- Only return results published within the last ${hoursBack} hours
- Return the top ${maxResults} most relevant results
- Focus on Vietnamese-language content if relevant

For EACH result, use this EXACT format:
[TITLE] The exact title of the result
[URL] The full URL
[SNIPPET] A brief summary (2-3 sentences)
[DATE] The publication date if available

Separate results with:
---
If no results are found, return exactly: NO_RESULTS_FOUND`;
}

// ─── Structured text parser ──────────────────────────────────────────

function parseStructuredResults(text, source) {
    if (!text || text.includes('NO_RESULTS_FOUND')) return [];

    const results = [];
    const blocks = text.split('---').filter((b) => b.trim().length > 0);

    for (const block of blocks) {
        const title = extractTag(block, 'TITLE');
        const rawUrl = extractTag(block, 'URL');
        const url = extractUrl(rawUrl);
        const snippet = extractTag(block, 'SNIPPET') || extractTag(block, 'SUMM'); // fallback: tóm tắt / SUMM
        const date = extractTag(block, 'DATE') || extractTag(block, 'TIME') || '';
        if (title && url) {
            results.push({ title: title.trim(), url: url.trim(), snippet: snippet.trim(), date: date.trim(), source });
        }
    }
    return results;
}

function extractTag(text, tag) {
    const match = text.match(new RegExp(`\\[${tag}\\]\\s*(.+?)(?:\\n|$)`));
    return match ? match[1].trim() : '';
}

function extractUrl(raw) {
    if (!raw) return '';
    raw = raw.trim();
    const mdMatch = raw.match(/\[.*?\]\((https?:\/\/[^\s\)]+)\)/);
    if (mdMatch) return mdMatch[1];
    if (isValidUrl(raw)) return raw;
    return '';
}

// ═════════════════════════════════════════════════════════════════════
// LAYER 1: Gemini 2.0 Flash + Google Search Grounding
// ═════════════════════════════════════════════════════════════════════

async function layer1_geminiSearch(query, maxResults, hoursBack) {
    if (!GEMINI_API_KEY) throw new Error('Missing GEMINI_API_KEY');

    const prompt = buildSearchPrompt(query, maxResults, hoursBack);

    const response = await axios.post(
        `${GEMINI_API_URL}/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            tools: [{ googleSearch: {} }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
        },
        { timeout: 45000 }
    );

    const candidate = response.data?.candidates?.[0];
    if (!candidate) throw new Error('Empty Gemini response — no candidates');

    const text = candidate.content?.parts?.map((p) => p.text).filter(Boolean).join('') || '';
    const grounding = candidate.groundingMetadata;

    // Parse structured results from model text
    let results = parseStructuredResults(text, 'gemini_google_search');

    // Extract URLs from grounding chunks (always more reliable)
    if (grounding?.groundingChunks) {
        for (const chunk of grounding.groundingChunks) {
            const url = chunk.web?.uri;
            const title = chunk.web?.title;
            if (url && !results.some((r) => r.url === url)) {
                // Try to get snippet from grounding supports
                let snippet = '';
                if (grounding.groundingSupports) {
                    for (const support of grounding.groundingSupports) {
                        if (support.groundingChunkIndices?.some((i) => grounding.groundingChunks[i]?.web?.uri === url)) {
                            snippet = support.segment?.text || '';
                            break;
                        }
                    }
                }
                results.push({ title: title || '', url, snippet, date: '', source: 'gemini_google_search_grounding' });
            }
        }
    }

    // If text parsing failed entirely but we have grounding data, text is enough
    // If neither, this is a failure
    if (results.length === 0) {
        if (text) throw new Error('No structured results from Gemini search');
        throw new Error('Gemini returned no text and no grounding data');
    }

    return validateResults(results).slice(0, maxResults);
}

// ═════════════════════════════════════════════════════════════════════
// LAYER 2: OpenRouter Web Search Server Tool (engine: firecrawl)
// Dùng bất kỳ model nào — OpenRouter xử lý search server-side
// Tài liệu: https://openrouter.ai/docs/guides/features/server-tools/web-search
// ═════════════════════════════════════════════════════════════════════

async function layer2_openrouterSearch(query, maxResults, hoursBack) {
    if (!OPENROUTER_API_KEY) throw new Error('Missing OPENROUTER');

    const response = await axios.post(
        `${OPENROUTER_API_URL}/chat/completions`,
        {
            model: 'openrouter/free',
            messages: [
                {
                    role: 'system',
                    content: `You are a web search assistant with live internet access.

Search for the user's query and return results in this EXACT format:

[TITLE] Exact title of the result
[URL] Full URL (must be real)
[SNIPPET] 2-3 sentence summary
[DATE] Publication date if found

Separate each result with:
---
If no results: NO_RESULTS_FOUND

Rules:
- Use the web_search tool to get real results from the web
- Never make up URLs or titles
- Focus on Vietnamese-language content if relevant`,
                },
                {
                    role: 'user',
                    content: `Search for: ${query}\nOnly results from the last ${hoursBack} hours.\nTop ${maxResults} most relevant results.`,
                },
            ],
            tools: [
                {
                    type: 'openrouter:web_search',
                    parameters: {
                        engine: 'firecrawl',
                        max_results: maxResults,
                    },
                },
            ],
            temperature: 0.8,
            max_tokens: 4096,
        },
        {
            timeout: 45000,
            headers: {
                Authorization: `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
            },
        }
    );

    const text = response.data?.choices?.[0]?.message?.content || '';
    if (!text) throw new Error('Empty OpenRouter response');

    // Parse structured results from model text
    let results = parseStructuredResults(text, 'openrouter_web_search');

    // Fallback: extract URLs from plain text if structured format not followed
    if (results.length === 0 && text.includes('http')) {
        const urlMatches = text.match(/https?:\/\/[^\s\]\)<>"']+/g) || [];
        const seen = new Set();
        for (const url of urlMatches) {
            const clean = url.replace(/[.,;:!?]+$/, '');
            if (isRealUrl(clean) && !seen.has(clean)) {
                seen.add(clean);
                results.push({ title: '', url: clean, snippet: '', date: '', source: 'openrouter_web_search' });
            }
        }
    }

    if (results.length === 0) throw new Error('No results from OpenRouter web search');
    return validateResults(results).slice(0, maxResults);
}

// ═════════════════════════════════════════════════════════════════════
// LAYER 3: Firecrawl Search
// ═════════════════════════════════════════════════════════════════════

async function layer3_firecrawlSearch(query, maxResults, hoursBack) {
    if (!FIRECRAWL_API_KEY) throw new Error('Missing FIRECRAWL');

    const response = await axios.post(
        `${FIRECRAWL_API_URL}/search`,
        {
            query,
            limit: Math.min(maxResults, 20),
            scrapeOptions: { formats: ['markdown'] },
        },
        {
            timeout: 45000,
            headers: {
                Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
                'Content-Type': 'application/json',
            },
        }
    );

    const data = response.data?.data || [];
    if (data.length === 0) throw new Error('No results from Firecrawl Search');

    return data
        .map((item) => ({
            title: item.title || item.name || '',
            url: item.url || item.link || '',
            snippet: item.description || item.snippet || (item.markdown || '').slice(0, 300),
            date: item.date || item.metadata?.date || '',
            source: 'firecrawl_search',
        }))
        .filter((r) => isRealUrl(r.url))
        .slice(0, maxResults);
}

// ═════════════════════════════════════════════════════════════════════
// Layer-based fallback search
// ═════════════════════════════════════════════════════════════════════

async function searchWeb(query, options = {}) {
    const { maxResults = 10, hoursBack = 24 } = options;
    const errors = [];

    // Layer 1: OpenRouter Web Search Server Tool (engine: firecrawl)
    try {
        console.log(`[WebSearch] Layer 1 — OpenRouter Web Search: "${query.slice(0, 80)}..."`);
        const results = await layer2_openrouterSearch(query, maxResults, hoursBack);
        console.log(`[WebSearch] Layer 1 ✅ — ${results.length} results`);
        await log('web_search', 'success', `Layer 1 OpenRouter OK`, { query: query.slice(0, 60), resultsCount: results.length });
        return results;
    } catch (e) {
        console.warn(`[WebSearch] Layer 1 ❌: ${e.message}`);
        await log('web_search', 'warn', `Layer 1 OpenRouter fail`, { query: query.slice(0, 60), error: e.message });
        errors.push({ layer: 1, name: 'openrouter_web_search', error: e.message });
    }

    // Layer 2: Firecrawl Search (backup)
    try {
        console.log(`[WebSearch] Layer 2 — Firecrawl Search: "${query.slice(0, 80)}..."`);
        const results = await layer3_firecrawlSearch(query, maxResults, hoursBack);
        console.log(`[WebSearch] Layer 2 ✅ — ${results.length} results`);
        await log('web_search', 'success', `Layer 2 Firecrawl OK`, { query: query.slice(0, 60), resultsCount: results.length });
        return results;
    } catch (e) {
        console.warn(`[WebSearch] Layer 2 ❌: ${e.message}`);
        await log('web_search', 'warn', `Layer 2 Firecrawl fail`, { query: query.slice(0, 60), error: e.message });
        errors.push({ layer: 2, name: 'firecrawl_search', error: e.message });
    }

    // Layer 3: Gemini Google Search Grounding (last resort)
    try {
        console.log(`[WebSearch] Layer 3 — Gemini Google Search: "${query.slice(0, 80)}..."`);
        const results = await layer1_geminiSearch(query, maxResults, hoursBack);
        console.log(`[WebSearch] Layer 3 ✅ — ${results.length} results`);
        await log('web_search', 'success', `Layer 3 Gemini OK`, { query: query.slice(0, 60), resultsCount: results.length });
        return results;
    } catch (e) {
        console.warn(`[WebSearch] Layer 3 ❌: ${e.message}`);
        await log('web_search', 'warn', `Layer 3 Gemini fail`, { query: query.slice(0, 60), error: e.message });
        errors.push({ layer: 3, name: 'gemini_google_search', error: e.message });
    }

    await log('web_search', 'error', `All 3 layers crashed (tool error)`, { query: query.slice(0, 60), errors });
    throw new Error(`All 3 web search layers crashed (tool error, not empty data): ${JSON.stringify(errors)}`);
}

// ═════════════════════════════════════════════════════════════════════
// Facebook Groups Search (delegates to searchWeb with site: prefix)
// ═════════════════════════════════════════════════════════════════════

async function searchFacebookGroups(customKeywords, options = {}) {
    const { maxResults = 5, hoursBack = 24 } = options;

    const defaultGroupKeywords = ['review Phú Quốc', 'review du lịch Phú Quốc', 'Phú Quốc review', 'du lịch Phú Quốc group'];
    const keywords = customKeywords && customKeywords.length > 0 ? customKeywords : defaultGroupKeywords;

    const allResults = [];
    const seen = new Set();

    for (const keyword of keywords) {
        try {
            const siteQuery = `site:facebook.com/groups "${keyword}"`;
            console.log(`[FB Search] Querying: ${siteQuery}`);
            const results = await searchWeb(siteQuery, { ...options, maxResults });
            console.log(`[FB Search] Keyword "${keyword}" → ${results.length} results`);

            for (const r of results) {
                if (!seen.has(r.url)) {
                    seen.add(r.url);
                    allResults.push(r);
                }
            }
        } catch (e) {
            console.warn(`[FB Search] Keyword "${keyword}" failed: ${e.message}`);
            await log('web_search', 'warn', `FB search keyword failed`, { keyword, error: e.message });
        }
    }

    await log('web_search', 'info', `FB search complete`, { totalResults: allResults.length, keywordsCount: keywords.length });
    return allResults.slice(0, maxResults * keywords.length);
}

export { searchWeb, searchFacebookGroups };
