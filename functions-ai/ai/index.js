import AiManager from './ai.manager.js';

// ─── Khởi tạo các "Nhân viên AI" chuyên trách cho AI Agent codebase ───
const gemini = new AiManager({ modelName: 'googleai/gemini-3.1-flash', apiKey: process.env.GEMINI_API_KEY_FREE });
const openai = new AiManager({ modelName: 'openai/gpt-4o' });
const deepseek = new AiManager({ modelName: 'deepseek/deepseek-v4-pro' });
const emily = new AiManager({ modelName: 'googleai/gemini-2.5-flash', apiKey: process.env.GEMINI_API_KEY });

export { gemini, openai, deepseek, emily };
