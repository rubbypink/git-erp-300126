const { genkit } = require('genkit');
const { googleAI } = require('@genkit-ai/google-genai');
const { openAI } = require('@genkit-ai/compat-oai/openai');
const { deepSeek } = require('@genkit-ai/compat-oai/deepseek');

// Khởi tạo lõi Genkit (bọc try-catch để debug lỗi version mismatch)
let ai;
try {
    ai = genkit({
        plugins: [
            // 1. Plugin Google Gemini (Dùng cho model chính)
            googleAI(),

            // 3. Plugin OpenAI
            openAI({ apiKey: process.env.OPENAI_API_KEY }),

            // 5. Plugin Deepseek (Dùng qua engine Anthropic hoặc OpenAI tương thích)
            deepSeek({ apiKey: process.env.DEEPSEEK_API_KEY }),
        ],
        // Thiết lập model mặc định nếu không truyền tham số
        defaultModel: 'googleai/gemini-1.5-pro',
    });
    console.log('[Genkit] ✅ Khởi tạo Genkit thành công.');
} catch (error) {
    console.error('[Genkit] ❌ LỖI KHỞI TẠO GENKIT:', error.message);
    console.error('[Genkit] Stack trace:', error.stack);
    // Kiểm tra version mismatch — nguyên nhân phổ biến nhất
    try {
        const genkitVersion = require('genkit/package.json').version;
        console.error(`[Genkit] Phiên bản: genkit=${genkitVersion}`);
    } catch (_) {
        /* ignore */
    }
    throw error; // Re-throw để Cloud Functions ghi nhận lỗi
}

module.exports = { ai };
