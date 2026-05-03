/**
 * 9 TRIP AI AGENT - MASTER CONFIGS
 * Tuân thủ quy tắc: Chuyên nghiệp, Thấu đáo, Mobile First
 */

/**
 * 9 TRIP AI AGENT - MASTER CONFIGS
 * Mục tiêu: Content Social sống động, CTA nhẹ nhàng, cung cấp giá trị
 */

const AGENT_CONFIGS = {
    RESEARCHER: {
        role: 'Expert Travel Researcher - Phu Quoc Specialist',
        instructions: 'Quét dữ liệu Google RSS, Hội nhóm Review về thuế, chính sách Phú Quốc và xu hướng du lịch. Sử dụng Matrix Scoring để chấm điểm.',
        model: 'gemini-1.5-flash', // Ưu tiên xử lý Multimodal
        grading_threshold: 8,
    },
    WRITER: {
        role: 'Content Strategist & Creative Writer',
        instructions: 'Dựa trên dữ liệu hữu ích, viết bài theo quy tắc Mobile First. CTA nhẹ nhàng, không thúc ép bán tour.',
        model: 'gemini-1.5-pro', // Cần tư duy ngôn ngữ sâu
        style: 'Sống động, tin cậy',
    },
    MEDIA_MASTER: {
        role: 'Visual Content Editor',
        instructions: 'Phân tích nội dung để chọn/edit media phù hợp. Đảm bảo chèn Logo 9 Trip và tối ưu định dạng social.',
        model: 'gemini-1.5-flash',
        output_formats: ['1:1', '9:16'],
    },
    PUBLISHER: {
        role: 'Social Content Publisher',
        instructions: 'Đăng bài đã duyệt lên Facebook Page (text + ảnh) và TikTok (video ngắn via URL). Xử lý refresh token an toàn.',
        model: null, // Không dùng AI — gọi API trực tiếp
        platforms: ['facebook', 'tiktok'],
    },
};

/**
 * MASTER INSTRUCTIONS FOR 9 TRIP AI AGENTS
 * Ưu tiên: Thông tin hữu ích > Trải nghiệm ẩn > Xu hướng Social
 */
const MASTER_PROMPTS = {
    RESEARCHER: {
        model: 'gemini-1.5-flash', // Tối ưu Multimodal để xem TikTok/Insta
        instructions: 'Quét dữ liệu từ Google RSS và Hội nhóm Review. Tìm thông tin về thuế, chính sách Phú Quốc và các bài đăng xu hướng.',
        grading_rule: 'Điểm > 8/10: Lưu vào training-data-vault. Report chi tiết vào Realtime Database.',
    },
    WRITER: {
        model: 'deepseek-v4', // Tối ưu viết lách sống động và tiết kiệm
        instructions: 'Dựa vào data từ Researcher, viết content Mobile First. CTA nhẹ nhàng, cung cấp giá trị là chính.',
        style: 'Sống động, tin cậy, không thúc ép bán tour.',
    },
    MEDIA_MASTER: {
        model: 'gemini-1.5-flash', // Tối ưu Multimodal, nhanh, rẻ
        instructions: 'Phân tích nội dung từ Writer để đề xuất visual phù hợp. Chọn media từ Instagram/TikTok, lồng ghép Logo 9 Trip, tối ưu định dạng social.',
        output_formats: ['1:1', '9:16', '16:9', '4:5'],
        pipeline_position: 'Nhận output từ Writer, push kết quả vào ai_content_queue để duyệt qua Matrix Input.',
    },
    PUBLISHER: {
        model: null, // Không dùng AI — gọi Social API trực tiếp
        instructions: 'Đăng bài đã approved lên Facebook Page và TikTok. Truyền URL từ Firebase Storage (không stream buffer). Xử lý refresh token an toàn.',
        platforms: ['facebook', 'tiktok'],
        pipeline_position: 'Nhận signal approved từ Matrix Input UI, gọi Social API, ghi log vào RTDB.',
    },
};

// Xuất cấu hình để các Sub-agent sử dụng chung
module.exports = { AGENT_CONFIGS, MASTER_PROMPTS };
