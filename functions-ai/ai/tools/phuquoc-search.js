import { ai } from '../genkit-init.js';
import { z } from 'genkit';
import axios from 'axios';

/**
 * @Skill Tìm kiếm thông tin du lịch Phú Quốc trên Internet
 * Trong ví dụ này, tôi dùng Tavily API (chuyên dùng cho AI Agent, rất nhanh và xịn).
 */
const searchPhuQuocTourismSkill = ai.defineTool(
    {
        name: 'search_phuquoc',
        description: 'Sử dụng khi khách hỏi về kinh nghiệm du lịch, thời tiết, địa điểm ăn uống, review tại Phú Quốc mà trong Database không có.',
        schema: z.object({
            query: z.string().describe('Câu hỏi hoặc từ khóa cần tìm (ví dụ: "quán bún quậy ngon")'),
        }),
    },
    async (input) => {
        try {
            // KHÓA MÕM: Luôn ép từ khóa về Phú Quốc để tránh AI đi lạc
            const restrictedQuery = `${input.query} Phú Quốc du lịch`;
            console.log(`[Web Search] Đang tra cứu internet: ${restrictedQuery}`);

            // Nếu chưa có API Key, tạm thời trả về text giả lập để test Flow trước
            if (!process.env.TAVILY_API_KEY) {
                console.warn('[Web Search] Chưa có TAVILY_API_KEY. Đang trả về dữ liệu mẫu.');
                return `Kết quả giả lập: Có nhiều quán bún quậy ngon ở Phú Quốc như Kiến Xây, Thanh Hùng. Phù hợp để đi ăn vào buổi sáng.`;
            }

            // Gọi API Search thực tế (Ví dụ dùng Tavily)
            const response = await axios.post('https://api.tavily.com/search', {
                api_key: process.env.TAVILY_API_KEY,
                query: restrictedQuery,
                search_depth: 'basic',
                include_answer: true,
                max_results: 3,
            });

            // Trả về câu trả lời tổng hợp từ Web cho AI đọc
            return response.data.answer || JSON.stringify(response.data.results);
        } catch (error) {
            console.error('[Web Search Error]', error.message);
            return 'Xin lỗi, không thể tra cứu thông tin trên internet lúc này.';
        }
    }
);

export { searchPhuQuocTourismSkill };
