const { genkit } = require('genkit');
const { googleAI } = require('@genkit-ai/google-genai');
const { openAI } = require('@genkit-ai/compat-oai/openai');
const { anthropic } = require('@genkit-ai/anthropic');
const { deepSeek } = require('@genkit-ai/compat-oai/deepseek');

// Khởi tạo lõi Genkit
const ai = genkit({
    plugins: [
        // 1. Plugin Google Gemini (Dùng cho model chính)
        googleAI(),

        // 3. Plugin OpenAI
        openAI({ apiKey: process.env.OPENAI_API_KEY }),

        // 4. Plugin Claude (Anthropic)
        anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }),

        // 5. Plugin Deepseek (Dùng qua engine Anthropic hoặc OpenAI tương thích)
        deepSeek({ apiKey: process.env.DEEPSEEK_API_KEY }),
    ],
    // Thiết lập model mặc định nếu không truyền tham số
    defaultModel: 'googleai/gemini-1.5-pro',
});

module.exports = { ai };
