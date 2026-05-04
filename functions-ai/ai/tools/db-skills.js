import { ai } from '../genkit-init.js';
import { z } from 'genkit';
import { db } from '../../utils/firebase-admin.util.js';

/**
 * @Skill Lấy thông tin và giá Tour từ Firestore
 */
const getTourInfoSkill = ai.defineTool(
    {
        name: 'search_tours_db',
        description: 'Sử dụng kỹ năng này khi khách hàng hỏi về thông tin, lịch trình hoặc giá của một Tour. Trả về dữ liệu gốc để bạn tự tổng hợp và trả lời khách.',
        schema: z.object({
            keyword: z.string().describe('Từ khóa tên tour cần tìm (ví dụ: "Phú Quốc", "3 đảo")'),
        }),
    },
    async (input) => {
        try {
            console.log(`[Chatbot Skill] Đang lục DB tìm tour: ${input.keyword}`);

            // Logic Search cơ bản trong Firestore (Có thể đổi sang Vector Search sau)
            const snapshot = await db
                .collection('tour_prices')
                .where('status', '!=', 'false') // Chỉ lấy tour đã duyệt
                .limit(3)
                .get();

            if (snapshot.empty) return 'Không tìm thấy tour nào phù hợp trong hệ thống.';

            const results = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                // Lọc bớt data không cần thiết cho AI
                results.push({
                    name: data.name,
                    base_price: data.base_price,
                    duration: data.duration_text,
                    itinerary: data.itinerary, // Lịch trình
                });
            });

            return JSON.stringify(results); // Trả cục Text về cho AI đọc và trả lời khách
        } catch (error) {
            console.error('[DB Skill Error]', error);
            return 'Lỗi khi truy xuất dữ liệu nội bộ.';
        }
    }
);

export { getTourInfoSkill };
