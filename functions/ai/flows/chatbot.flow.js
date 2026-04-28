const { ai } = require('../genkit-init');
const { z } = require('genkit');
const { gemini, openai, deepseek, emily } = require('../index');
const { getTourInfoSkill } = require('../tools/db-skills');
const { searchPhuQuocTourismSkill } = require('../tools/phuquoc-search');
const { getFirestore } = require('../../utils/firebase-admin.util');

// Bảng ánh xạ tên model → instance AiManager
const MODEL_MAP = {
    emily, // googleai/gemini-1.5-flash (mặc định)
    gemini, // googleai/gemini-3.1-flash
    openai, // openai/gpt-4o
    deepseek, // deepseek/deepseek-v4-pro
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
        const systemPrompt = `
Bạn là Emily, chuyên viên tư vấn bán hàng của Công ty TNHH 9 Trip Phú Quốc (Chuyên mảng du lịch Phú Quốc).
Quy tắc trả lời:
1. Giá cả & Tour: BẮT BUỘC dùng tool 'search_tours_db' để check hệ thống nội bộ. Tuyệt đối không bịa giá. Nếu không có dữ liệu, hãy nói "Hiện tại chúng tôi chưa có tour phù hợp, nhưng tôi sẽ cập nhật ngay khi có thông tin mới!".
2. Kinh nghiệm, Thời tiết, Ăn uống hay thông tin về du lịch Phú Quốc: Dùng tool 'search_phuquoc' để lấy thông tin mới nhất trên mạng nếu bạn không chắc chắn.
3. Nếu khách hỏi ngoài lề (không liên quan du lịch Phú Quốc), hãy khéo léo từ chối và hướng họ về dịch vụ của 9Trip.
        `;

        // Chọn agent: theo model người dùng yêu cầu, mặc định là emily
        const agent = MODEL_MAP[input.model] || emily;
        // Nếu dùng model khác emily, set emily làm fallback phòng khi lỗi quota/token
        const fallback = agent !== emily ? emily : null;

        console.log(`[Emily] 💬 [${input.sessionId}] model=${agent.modelName}: ${input.message}`);

        const result = await agent.chatWithMemory({
            sessionId: input.sessionId,
            message: input.message,
            system: systemPrompt,
            tools: [getTourInfoSkill, searchPhuQuocTourismSkill],
            db: getFirestore(),
            collection: 'emily_chat_sessions',
            fallbackAgent: fallback,
        });

        if (!result.success) {
            throw new Error(result.error || 'Emily đang bận, vui lòng thử lại sau.');
        }

        return result.text;
    }
);

module.exports = { chatbotFlow };
