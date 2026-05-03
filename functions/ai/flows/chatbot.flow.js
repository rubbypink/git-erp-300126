const { ai } = require('../genkit-init');
const { z } = require('genkit');
const path = require('path');
const { gemini, openai, deepseek, emily } = require('../index');
const { getTourInfoSkill } = require('../tools/db-skills');
const { searchPhuQuocTourismSkill } = require('../tools/phuquoc-search');
const { getFirestore } = require('../../utils/firebase-admin.util');
const emilyConfig = require(path.resolve(__dirname, '../../../.9trip-agents/configs/emily.config'));

// Bảng ánh xạ tên model → instance AiManager (lấy từ config)
const MODEL_MAP = {
    emily,
    gemini,
    openai,
    deepseek,
};

const chatbotFlow = ai.defineFlow(
    {
        name: 'emilyBot',
        inputSchema: z.object({
            sessionId: z.string().describe('ID của phiên chat để lưu lịch sử'),
            message: z.string().describe('Câu hỏi của khách hàng / nhân viên ERP'),
            model: z.string().optional().describe('Model AI muốn dùng: "emily" (mặc định), "gemini", "openai", "deepseek"'),
        }),
        outputSchema: z.string(),
    },
    async (input) => {
        // Đọc systemPrompt từ config
        const systemPrompt = emilyConfig.systemPrompt;

        // Chọn agent: theo model người dùng yêu cầu, mặc định lấy từ config
        const agentKey = input.model || emilyConfig.defaultModel;
        const agent = MODEL_MAP[agentKey] || emily;
        // Nếu dùng model khác emily, set emily làm fallback phòng khi lỗi quota/token
        const fallback = agent !== emily ? emily : null;

        console.log(`[Emily] 💬 [${input.sessionId}] model=${agent.modelName}: ${input.message}`);

        const result = await agent.chatWithMemory({
            sessionId: input.sessionId,
            message: input.message,
            system: systemPrompt,
            tools: [getTourInfoSkill, searchPhuQuocTourismSkill],
            db: getFirestore(),
            collection: emilyConfig.chatCollection,
            fallbackAgent: fallback,
        });

        if (!result.success) {
            throw new Error(result.error || 'Emily đang bận, vui lòng thử lại sau.');
        }

        return result.text;
    }
);

module.exports = { chatbotFlow };