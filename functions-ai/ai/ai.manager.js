import { ai } from './genkit-init.js';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * @class AiManager
 * @description Base Class quản lý tương tác với tất cả các Model AI qua Genkit.
 * Đảm bảo tính linh hoạt, tái sử dụng cao cho Crawler và Chatbot.
 */
class AiManager {
    /**
     * @param {Object} config - Cấu hình instance
     * @param {string} config.modelName - Tên model (vd: 'googleai/gemini-2.5-pro', 'anthropic/claude-3-5-sonnet', 'openai/gpt-4o')
     */
    constructor(config = {}) {
        this.modelName = config.modelName || 'googleai/gemini-2.5-flash';
        this.apiKey = config.apiKey || process.env.GEMINI_API_KEY;
    }

    /**
     * @method extractJSON
     * @description Ép AI đọc dữ liệu thô (HTML, Text) và trả về chuẩn JSON theo Schema
     * @param {string} rawData - Dữ liệu thô cần bóc tách
     * @param {Object} targetSchema - Zod schema (Genkit hỗ trợ Zod rất mạnh)
     */
    async extractJSON(rawData, targetSchema, systemPrompt = 'Bóc tách dữ liệu theo schema.') {
        try {
            console.log(`[AiManager] Extracting data using ${this.modelName}...`);
            const response = await ai.generate({
                model: this.modelName,
                system: systemPrompt,
                prompt: rawData,
                output: {
                    format: 'json',
                    schema: targetSchema,
                },
            });
            return { success: true, data: response.output };
        } catch (error) {
            console.error(`[AiManager - extractJSON ERROR]`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * @method generateWithTools
     * @description Cho AI khả năng tự quyết định dùng Tool (ví dụ gọi MCP CrawlForge)
     * @param {string} prompt - Yêu cầu của người dùng
     * @param {Array} tools - Mảng các Genkit Tools truyền vào
     * @param {string} [systemPrompt] - System prompt tùy chỉnh (thay thế mặc định nếu có)
     */
    async generateWithTools(prompt, tools = [], systemPrompt) {
        try {
            console.log(`[AiManager] Bắt đầu Agentic Loop với ${this.modelName}...`);
            const response = await ai.generate({
                model: this.modelName,
                prompt: prompt,
                tools: tools,
                maxTurns: 5,
                system: systemPrompt || 'Bạn là một Web Scraping Agent. Hãy sử dụng các tool được cung cấp để truy cập web và lấy dữ liệu. Hãy phân tích kỹ DOM trả về.',
            });
            return { success: true, text: response.text, data: response };
        } catch (error) {
            console.error(`[AiManager - generateWithTools ERROR]`, error);
            return { success: false, error: error.message };
        }
    }

    async chatWithMemory({ sessionId, message, system = '', tools = [], db, collection = 'chat_sessions', fallbackAgent = null }) {
        if (!sessionId) throw new Error('[chatWithMemory] Thiếu sessionId.');
        if (!message) throw new Error('[chatWithMemory] Thiếu message.');
        if (!db) throw new Error('[chatWithMemory] Thiếu Firestore db instance.');

        console.log(`[AiManager:${this.modelName}] 💬 Chat session [${sessionId}]: "${message.slice(0, 80)}..."`);

        // ─── 1. LOAD LỊCH SỬ TỪ FIRESTORE ───
        const sessionRef = db.collection(collection).doc(sessionId);
        const sessionDoc = await sessionRef.get();

        let history = [];
        if (sessionDoc.exists) {
            history = sessionDoc.data().history || [];
            console.log(`[AiManager:${this.modelName}] 📂 Loaded ${history.length} messages history.`);
        }

        // ─── 2. BUILD MESSAGES — system prompt inject vào đầu (chỉ turn đầu) ───
        // KHÔNG dùng param `system` của ai.generate() → tránh xung đột model-specific
        const userMessage = { role: 'user', content: [{ text: message }] };
        const allMessages = [];
        if (history.length === 0 && system) {
            allMessages.push({ role: 'system', content: [{ text: system }] });
        }
        allMessages.push(...history, userMessage);

        // ─── 3. GỌI MODEL CHÍNH ───
        let response;
        let agentUsed = this.modelName;

        const callGenerate = async (modelName, msgOverride) => {
            const opts = {
                model: modelName,
                messages: msgOverride || allMessages,
                tools: tools,
            };
            // Cấu hình tối ưu cho Gemini
            if (modelName.includes('gemini')) {
                opts.config = { temperature: 0.8, topP: 0.95, maxOutputTokens: 2048 };
            }
            return ai.generate(opts);
        };

        try {
            response = await callGenerate(this.modelName);
        } catch (error) {
            const errorMsg = error.message?.toLowerCase() || '';
            const isRecoverable = errorMsg.includes('token') || errorMsg.includes('limit') || errorMsg.includes('quota') || errorMsg.includes('500') || errorMsg.includes('503') || errorMsg.includes('unavailable');

            if (isRecoverable && fallbackAgent && fallbackAgent.modelName !== this.modelName) {
                console.warn(`[AiManager:${this.modelName}] ⚠️ Chuyển fallback: ${fallbackAgent.modelName}`);
                try {
                    response = await callGenerate(fallbackAgent.modelName);
                    agentUsed = fallbackAgent.modelName;
                } catch (fallbackError) {
                    console.error(`[AiManager:${fallbackAgent.modelName}] ❌ Fallback lỗi:`, fallbackError.message);
                    return { success: false, text: '', agentUsed: this.modelName, error: fallbackError.message };
                }
            } else {
                console.error(`[AiManager:${this.modelName}] ❌ Chat error:`, error.message);
                return { success: false, text: '', agentUsed: this.modelName, error: error.message };
            }
        }

        // ─── 4. LƯU HISTORY (không lưu system message) ───
        const modelMessage = response.message?.toJSON ? response.message.toJSON() : response.message;

        // Lọc reasoning parts (tránh lỗi reasoning_content với DeepSeek)
        if (modelMessage?.content && Array.isArray(modelMessage.content)) {
            modelMessage.content = modelMessage.content.filter((p) => !p.reasoning && !p.reasoning_content);
        }

        const newHistory = [...history, userMessage, modelMessage];

        await sessionRef.set(
            {
                history: newHistory,
                last_active: FieldValue.serverTimestamp(),
                last_agent: agentUsed,
            },
            { merge: true }
        );

        console.log(`[AiManager:${this.modelName}] ✅ Chat xong (${agentUsed}), ${newHistory.length} msgs.`);
        return { success: true, text: response.text, agentUsed };
    }
}
export default AiManager;
