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
    model: 'googleai/gemini-2.5-flash',
    apiKeyEnv: 'GEMINI_API_KEY',
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
        'địa trung hải', 'Đảo Ngọc',
        'du lịch Phú Quốc', 'tour Phú Quốc',
        'khách sạn Phú Quốc', 'resort Phú Quốc',
        'biển Phú Quốc', 'Vinpearl Phú Quốc',
    ],

    // ─── Từ khóa cản (giảm điểm relevance) ────────────────────────────────
    negativeKeywords: [
        'cờ bạc', 'bắt cóc', 'lừa đảo', 'scam',
    ],

    // ─── Auto Search — Khi không có URL RSS ──────────────────────────────
    autoSearchEnabled: true,
    hoursBackDefault: 24,
    webSearchMaxResults: 10,
    webSearchMaxResultsPerKeyword: 5, // Số kết quả tối đa mỗi từ khóa

    autoSearchDefaultKeywords: [
        'tin tức du lịch Phú Quốc mới nhất',
        'Phú Quốc review khách sạn resort',
        'Phú Quốc ẩm thực nhà hàng',
        'Phú Quốc sự kiện lễ hội',
        'Phú Quốc tour combo khuyến mãi',
        'Phú Quốc thời tiết hôm nay',
        'Phú Quốc chính sách visa thuế',
    ],

    // ─── Facebook Group Search ────────────────────────────────────────────
    facebookGroupSearch: {
        enabled: true,
        maxResultsPerKeyword: 5,
        keywords: [
            'review Phú Quốc',
            'review du lịch Phú Quốc',
            'Phú Quốc review',
            'du lịch Phú Quốc group',
            'kinh nghiệm du lịch Phú Quốc',
            'Phú Quốc tự túc',
            'Phú Quốc cảnh báo',
        ],
    },

    // ─── Web Search Fallback Chain ───────────────────────────────────────
    webSearch: {
        maxResults: 10,
        hoursBack: 24,
        layerNames: ['gemini_google_search', 'openrouter', 'firecrawl_search'],
    },

    // ─── System Prompt: Phase 1 — SCRAPE RSS ──────────────────────────────
    scrapeSystemPrompt: `Bạn là Web Scraping Agent chuyên thu thập RSS du lịch Phú Quốc.

NHIỆM VỤ:
1. Dùng tool theo thứ tự ưu tiên để truy cập URL RSS được cung cấp.
2. Đọc TOÀN BỘ nội dung RSS/XML trả về.
3. Trả về NGUYÊN VĂN nội dung XML/RSS, không bỏ sót bất kỳ tag nào.
Lưu ý: Bật stealthMode để tránh bị chặn.`,

    // ─── User Prompt Template: Phase 1 — SCRAPE ──────────────────────────
    scrapeUserPromptTemplate: `Hãy cào dữ liệu RSS từ URL sau đây.
THỰC HIỆN ĐÚNG QUY TRÌNH đã nêu trong System Prompt.
URL RSS: {{url}}
Sau khi hoàn thành, trả về TOÀN BỘ nội dung text thô đã thu thập.`,

    // ─── System Prompt: Phase 1b — WEB SEARCH AUTO (khi không có URL RSS) ──
    autoSearchSystemPrompt: `Bạn là Web Research Agent chuyên thu thập thông tin du lịch Phú Quốc từ Internet.

NHIỆM VỤ:
1. Phân tích dữ liệu tìm kiếm web được cung cấp.
2. Mỗi kết quả tìm kiếm bao gồm: title, url, snippet, date.
3. Lọc các kết quả có nội dung thực sự liên quan đến Phú Quốc.
4. Tổng hợp thành danh sách các bài viết/item có ích.
5. Chỉ giữ lại kết quả trong vòng {{hoursBack}} giờ gần nhất.`,

    // ─── User Prompt Template: Phase 1b — WEB SEARCH AUTO ────────────────
    autoSearchUserPromptTemplate: `Dưới đây là kết quả tìm kiếm web tự động về du lịch Phú Quốc.

═══ DỮ LIỆU WEB SEARCH ═══
{{searchData}}

═══ YÊU CẦU ═══
- Tổng hợp các kết quả tìm kiếm thành danh sách item
- Với mỗi item, ghi rõ: title, link (URL gốc), summary (2-3 câu), category, sentiment, phuQuocRelevance
- Chỉ giữ lại kết quả trong vòng {{hoursBack}} giờ gần nhất
- Ưu tiên các kết quả từ Facebook groups (review, kinh nghiệm)`,
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
3. BỘ LỌC 24H: Chỉ giữ lại bài viết có pubDate trong vòng {{hoursBack}} giờ gần nhất (tính từ thời điểm quét). Nếu không xác định được ngày, loại bỏ bài đó.
4. Liệt kê trendingTopics: Các chủ đề/nhận xét đang nổi bật trong tập bài viết.
5. Giới hạn tối đa {{maxItems}} bài viết có phuQuocRelevance cao nhất.

QUY TẮC CHẤM ĐIỂM (phuQuocRelevance):
+2 điểm: Bài viết nhắc cụ thể "Phú Quốc", "Đảo Ngọc Phú Quốc", "du lịch Phú Quốc"
+2 điểm: Bài viết nhắc cụ thể "Tour Phú Quốc", "Combo Phú Quốc", "Vinpearl Phú Quốc"
+2 điểm: Bài viết về du lịch Việt Nam có tiềm năng liên kết Phú Quốc
+1 điểm: Bài viết về ngành du lịch nói chung
-2 điểm: Bài viết chứa từ khóa tiêu cực (cờ bạc, lừa đảo...)
-1 điểm: Bài viết không phù hợp với vị khách mục tiêu

QUY TẮC VIẾT SUMMARY:
- Viết bằng tiếng Việt, ngắn gọn 2-3 câu
- Giữ nguyên thông tin quan trọng (giá, địa điểm, thời gian)
- Ưu tiên thông tin liên quan đến Phú Quốc

CẮT NGẮN: Chỉ giữ lại {{maxItems}} bài có phuQuocRelevance cao nhất và trong vòng {{hoursBack}} giờ gần nhất.`,
};

export default researcherConfig;