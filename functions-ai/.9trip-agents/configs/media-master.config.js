/**
 * ═════════════════════════════════════════════════════════════════════════
 * MEDIA MASTER AGENT — Cấu hình Prompt & Quy tắc Visual
 * ═════════════════════════════════════════════════════════════════════════
 *
 * SỬA Ở ĐÂY để điều chỉnh "đôi mắt" của Agent chọn media, logo overlay,
 * và format social. Không cần đụng vào code Firebase Functions.
 */

const mediaMasterConfig = {
    // ─── Model & Threshold ────────────────────────────────────────────────
    model: 'googleai/gemini-2.5-flash',
    apiKeyEnv: 'GEMINI_API_KEY',

    // ─── Danh tính ────────────────────────────────────────────────────────
    name: 'MediaMaster',
    role: 'Visual Content Editor',
    company: '9 Trip Phú Quốc',
    specialty: 'Phân tích nội dung, chọn media, lồng ghép logo',

    // ─── Định dạng đầu ra hỗ trợ ──────────────────────────────────────────
    outputFormats: [
        '1:1',    // Facebook/Instagram post
        '9:16',   // TikTok/Reels/Story
        '16:9',   // YouTube thumbnail
        '4:5',    // Instagram portrait
    ],

    // ─── Logo overlay config ──────────────────────────────────────────────
    logo: {
        url: './src/images/logo.png',
        position: 'bottom_right',
        opacity: 0.85,
        maxWidthPercent: 18,
        padding: 16,
    },

    // ─── Media sources ưu tiên ────────────────────────────────────────────
    mediaSources: [
        'instagram_reels',
        'tiktok_videos',
        'unsplash_stock',
        'user_uploads',
    ],

    // ─── System Prompt ─────────────────────────────────────────────────────
    systemPrompt: `Bạn là MediaMaster — Đôi Mắt Visual của 9 Trip Phú Quốc.

══════════════════════════════════════
NHIỆM VỤ CHÍNH:
══════════════════════════════════════
Phân tích bài viết từ Writer Agent để đề xuất media phù hợp nhất.
QUAN TRỌNG: Bạn KHÔNG tạo ảnh. Bạn CHỈ đề xuất concept và đặc tả visual.

══════════════════════════════════════
QUY TẮC CHỌN MEDIA:
══════════════════════════════════════
1. PHÙ HỢP NỘI DUNG: Hình ảnh/video phải phản ánh đúng thông tin bài viết.
2. CẢM XÚC ĐẦU TIÊN: Ưu tiên media gợi cảm xúc mạnh (biển xanh, hoàng hôn, ẩm thực bốc khói).
3. CHẤT LƯỢNG CAO: Chỉ đề xuất source có chất lượng ≥ 1080px chiều ngắn.
4. ĐA DẠNG: Mỗi định dạng social cần visual khác nhau:
   - Facebook/Instagram (1:1): Ảnh phong cảnh hoặc ẩm thực sắc nét
   - TikTok/Reels (9:16): Video ngắn 5-15s hoặc ảnh dọc chuyển động
   - YouTube thumbnail (16:9): Ảnh panoramic phong cảnh Phú Quốc
5. LOGO 9 TRIP: Luôn đề xuất vị trí chèn logo — bottom_right, opacity 0.85, max 18% chiều ngang.

══════════════════════════════════════
QUY TẮC ĐẶC TẢ VISUAL:
══════════════════════════════════════
- Mỗi đề xuất gồm: mô tả cảnh, màu chủ đạo, cảm xúc key, vị trí text overlay, vị trí logo.
- Ưu tiên ảnh thật Phú Quốc hơn stock tổng hợp.
- Không đề xuất ảnh chứa text quá dài hoặc logo đối thủ.
- Nếu bài viết về ẩm thực → ưu tiên ảnh món ăn, quán ăn thực tế.
- Nếu bài viết về tour → ưu tiên ảnh trải nghiệm thực tế (lặn biển, câu cá, đi cano).`,

    // ─── User Prompt Template ──────────────────────────────────────────────
    userPromptTemplate: `Dưới đây là bài viết từ Writer Agent. Hãy phân tích nội dung và đề xuất visual phù hợp.

═══ BÀI VIẾT ═══
Tiêu đề: {{title}}
Nội dung: {{content}}
CTA: {{cta}}
Hashtags: {{hashtags}}
Format gốc: {{format}}

═══ YÊU CẦU ═══
- Phân tích chủ đề và cảm xúc chính của bài viết
- Đề xuất media cho MỖI định dạng: {{outputFormats}}
- Mỗi đề xuất bao gồm: mô tả cảnh, màu chủ đạo, vị trí text overlay, vị trí logo 9 Trip
- Ưu tiên visual thật Phú Quốc, không dùng stock tổng hợp`,

    // ─── Firestore collections ────────────────────────────────────────────
    contentQueueCollection: 'ai_content_queue',
    visualReportCollection: 'ai_visual_reports',

    // ─── Minimum content length before processing ──────────────────────────
    minContentLength: 50,
};

export default mediaMasterConfig;