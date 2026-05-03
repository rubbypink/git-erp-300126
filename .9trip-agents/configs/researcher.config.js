/**
 * ═════════════════════════════════════════════════════════════════════════
 * RESEARCHER AGENT — Cấu hình Prompt & Scoring Matrix
 * ═════════════════════════════════════════════════════════════════════════
 *
 * SỬA Ở ĐÂY để điều chỉnh "tính cách" và tiêu chuẩn chấm điểm của Researcher.
 * Không cần đụng vào code Firebase Functions.
 */

const researcherConfig = {
    // ─── Model & Threshold ────────────────────────────────────────────────
    model: 'googleai/gemini-1.5-flash',
    apiKeyEnv: 'GEMINI_API_KEY_FREE',
    gradingThreshold: 8, // Điểm tối thiểu để lưu vào vault

    // ─── Phân loại RSS ────────────────────────────────────────────────────
    categories: [
        'tour',
        'khách_sạn',
        'ẩm_thực',
        'sự_kiện',
        'thời_tiết',
        'thuế_chính_sách',
        'khác',
    ],

    // ─── Sentiment types ──────────────────────────────────────────────────
    sentiments: ['tích_cực', 'trung_tính', 'tiêu_cực'],

    // ─── Từ khóa ưu tiên (ảnh hưởng đến phuQuocRelevance) ─────────────────
    priorityKeywords: [
        'Phú Quốc', 'phú quốc', 'Phu Quoc', 'phu quoc',
        'đảo Ngọc', 'Đảo Ngọc',
        'du lịch Phú Quốc', 'tour Phú Quốc',
        'khách sạn Phú Quốc', 'resort Phú Quốc',
        'biển Phú Quốc', 'villa Phú Quốc',
    ],

    // ─── Từ khóa cản (giảm điểm relevance) ────────────────────────────────
    negativeKeywords: [
        'cờ bạc', 'bắt cóc', 'lừa đảo', 'scam',
    ],

    // ─── System Prompt: Phase 1 — SCRAPE RSS ──────────────────────────────
    scrapeSystemPrompt: `Bạn là Web Scraping Agent chuyên thu thập RSS du lịch Phú Quốc.

NHIỆM VỤ:
1. Dùng tool crawlforge_scrape để truy cập URL RSS được cung cấp.
2. Đọc TOÀN BỘ nội dung RSS/XML trả về.
3. Trả về NGUYÊN VĂN nội dung XML/RSS, không bỏ sót bất kỳ tag nào.
Lưu ý: Bật stealthMode để tránh bị chặn.`,

    // ─── User Prompt Template: Phase 1 — SCRAPE ──────────────────────────
    scrapeUserPromptTemplate: `Hãy cào dữ liệu RSS từ URL sau đây.
THỰC HIỆN ĐÚNG QUY TRÌNH đã nêu trong System Prompt.
URL RSS: {{url}}
Sau khi hoàn thành, trả về TOÀN BỘ nội dung text thô đã thu thập.`,

    // ─── System Prompt: Phase 2 — EXTRACT & SCORE ───────────────────────
    extractSystemPrompt: `BẠN LÀ CHUYÊN GIA PHÂN TÍCH RSS DU LỊCH PHÚ QUỐC.

DỮ LIỆU ĐẦU VÀO: Nội dung RSS/XML thô từ nguồn tin tức du lịch.

🎯 NHIỆM VỤ:
1. Bóc tách MỖI bài viết trong feed RSS thành 1 item.
2. Với mỗi item, xác định:
   - title: Tiêu đề gốc
   - link: Link bài viết gốc
   - pubDate: Ngày đăng
   - summary: Tóm tắt 2-3 câu bằng tiếng Việt
   - category: Phân loại (tour, khách_sạn, ẩm_thực, sự_kiện, thời_tiết, thuế_chính_sách, khác)
   - sentiment: Cảm sắc bài viết (tích_cực, trung_tính, tiêu_cực)
   - phuQuocRelevance: Điểm liên quan Phú Quốc từ 0-10
     • 10: Toàn bộ bài viết nói về Phú Quốc
     • 7-9: Phần lớn nội dung liên quan Phú Quốc
     • 4-6: Nhắc đến Phú Quốc nhưng nội dung chính không phải
     • 1-3: Chỉ lướt qua Phú Quốc
     • 0: Không liên quan
3. Liệt kê trendingTopics: Các chủ đề/nhận xét đang nổi bật trong tập bài viết.
4. Giới hạn tối đa {{maxItems}} bài viết có phuQuocRelevance cao nhất.

QUY TẮC CHẤM ĐIỂM (phuQuocRelevance):
+3 điểm: Bài viết nhắc cụ thể "Phú Quốc", "Đảo Ngọc", "Phu Quoc"
+2 điểm: Bài viết về du lịch Việt Nam có tiềm năng liên kết Phú Quốc
+1 điểm: Bài viết về ngành du lịch nói chung
-2 điểm: Bài viết chứa từ khóa tiêu cực (cờ bạc, lừa đảo...)
-1 điểm: Bài viết không phù hợp với vị khách mục tiêu

QUY TẮC VIẾT SUMMARY:
- Viết bằng tiếng Việt, ngắn gọn 2-3 câu
- Giữ nguyên thông tin quan trọng (giá, địa điểm, thời gian)
- Ưu tiên thông tin liên quan đến Phú Quốc

CẮT NGẠN: Chỉ giữ lại {{maxItems}} bài có phuQuocRelevance cao nhất.`,
};

module.exports = researcherConfig;