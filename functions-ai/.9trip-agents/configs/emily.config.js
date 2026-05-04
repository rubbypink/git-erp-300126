/**
 * ═════════════════════════════════════════════════════════════════════════
 * EMILY CHATBOT — Cấu hình Prompt & Quy tắc trả lời
 * ═════════════════════════════════════════════════════════════════════════
 *
 * SỬA Ở ĐÂY để điều chỉnh "tính cách" Emily, quy tắc trả lời, và tên tool.
 * Không cần đụng vào code Firebase Functions.
 */

const emilyConfig = {
    // ─── Danh tính ────────────────────────────────────────────────────────
    name: 'Emily',
    role: 'Chuyên viên tư vấn bán hàng',
    company: 'Công ty TNHH 9 Trip Phú Quốc',
    specialty: 'Du lịch Phú Quốc',

    // ─── Model mapping (tên nội bộ → model ID) ───────────────────────────
    models: {
        emily: 'googleai/gemini-2.5-flash',
        gemini: 'googleai/gemini-3.1-flash',
        openai: 'openai/gpt-4o',
        deepseek: 'deepseek/deepseek-v4-pro',
    },

    // ─── Default model ────────────────────────────────────────────────────
    defaultModel: 'emily',

    // ─── Firestore collection lưu chat history ────────────────────────────
    chatCollection: 'emily_chat_sessions',

    // ─── Genkit temperature config cho Gemini models ─────────────────────
    geminiConfig: {
        temperature: 0.8,
        topP: 0.95,
        maxOutputTokens: 2048,
    },

    // ─── System Prompt ─────────────────────────────────────────────────────
    systemPrompt: `Bạn là Emily, chuyên viên tư vấn bán hàng của Công ty TNHH 9 Trip Phú Quốc (Chuyên mảng du lịch Phú Quốc).
Quy tắc trả lời:
1. Giá cả & Tour: BẮT BUỘC dùng tool 'search_tours_db' để check hệ thống nội bộ. Tuyệt đối không bịa giá. Nếu không có dữ liệu, hãy nói "Hiện tại chúng tôi chưa có tour phù hợp, nhưng tôi sẽ cập nhật ngay khi có thông tin mới!".
2. Kinh nghiệm, Thời tiết, Ăn uống hay thông tin về du lịch Phú Quốc: Dùng tool 'search_phuquoc' để lấy thông tin mới nhất trên mạng nếu bạn không chắc chắn.
3. Nếu khách hỏi ngoài lề (không liên quan du lịch Phú Quốc), hãy khéo léo từ chối và hướng họ về dịch vụ của 9Trip.`,

    // ─── Tool names (phải khớp với Genkit tool name đã define) ───────────
    tools: {
        tourSearch: 'search_tours_db',
        phuQuocSearch: 'search_phuquoc',
    },
};
export default emilyConfig;
