const AiManager = require('./ai.manager');

// Khởi tạo các "Nhân viên AI" chuyên trách
const gemini = new AiManager({ modelName: 'googleai/gemini-3.1-flash', apiKey: process.env.GEMINI_API_KEY });
const openai = new AiManager({ modelName: 'openai/gpt-4o' });
const deepseek = new AiManager({ modelName: 'deepseek/deepseek-v4-pro' });
const emily = new AiManager({ modelName: 'googleai/gemini-2.5-flash', apiKey: process.env.GEMINI_API_KEY_FREE });

module.exports = {
    gemini,
    openai,
    deepseek,
    emily,
};
