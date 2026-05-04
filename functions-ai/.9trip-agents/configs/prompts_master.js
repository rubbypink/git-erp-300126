/**
 * 9 TRIP AI AGENT - MASTER CONFIGS
 * Kim chỉ nam cho mọi Agent — ĐỌC TRƯỚC khi viết logic mới.
 * Mọi thay đổi hành vi Agent → sửa config, KHÔNG sửa code flow.
 *
 * Quy ước model names: OpenRouter format (vd: googleai/gemini-2.5-flash)
 * null = agent không dùng AI (pure logic hoặc API calls)
 */

const AGENT_CONFIGS = {
    RESEARCHER: {
        role: 'Expert Travel Researcher — Phu Quoc Specialist',
        instructions: 'Quét dữ liệu Google RSS + Web Search + Facebook Groups. Dùng Matrix Scoring (phuQuocRelevance) để chấm điểm 0-10.',
        model: 'googleai/gemini-2.5-flash',
        gradingThreshold: 8,
        pipelinePosition: 1,
    },
    WRITER: {
        role: 'Content Strategist & Creative Writer',
        instructions: 'Dựa trên dữ liệu Researcher, viết bài Mobile First. CTA nhẹ nhàng, không thúc ép bán tour.',
        model: 'deepseek/deepseek-v4-pro',
        fallbackModel: 'googleai/gemini-flash-latest',
        style: 'Sống động, tin cậy',
        pipelinePosition: 5,
    },
    MEDIA_MASTER: {
        role: 'Visual Content Editor',
        instructions: 'Phân tích nội dung Writer, chọn/edit media phù hợp. Chèn Logo 9 Trip, tối ưu định dạng social.',
        model: 'googleai/gemini-2.5-flash',
        outputFormats: ['1:1', '9:16', '16:9', '4:5'],
        pipelinePosition: 6,
    },
    PUBLISHER: {
        role: 'Social Content Publisher',
        instructions: 'Đăng bài đã duyệt lên Facebook Page (text + ảnh) và TikTok (video ngắn via URL). Xử lý refresh token an toàn.',
        model: 'googleai/gemini-flash-latest',
        platforms: ['facebook', 'tiktok'],
        pipelinePosition: 7,
    },
    SCORING: {
        role: 'Content Scoring Engine',
        instructions: 'Chấm điểm items từ Researcher theo 4 dimensions: freshness, trend, businessRelevance, seasonFit. Threshold 6.5 để xử lý.',
        model: 'googleai/gemini-flash-latest',
        pipelinePosition: 2,
    },
    FILTER_DEDUP: {
        role: 'Content Filter & Deduplicator',
        instructions: 'Lọc spam, nội dung tiêu cực, relevance thấp. Loại bỏ trùng lặp bằng Jaccard similarity (> 0.75).',
        model: 'googleai/gemini-flash-latest',
        pipelinePosition: 3,
    },
    ENRICHMENT: {
        role: 'Content Enricher',
        instructions: 'Match items với sản phẩm trong Firestore (tours, hotels, services). Xây dựng enrichment context cho Writer.',
        model: 'googleai/gemini-flash-latest',
        pipelinePosition: 4,
    },
    PLANNER: {
        role: 'Content Planner',
        instructions: 'Xác định angle, target, mediaType, format cho từng item dựa trên category mapping từ planner.config.js.',
        model: 'googleai/gemini-flash-latest',
        pipelinePosition: 5,
    },
    ORCHESTRATOR: {
        role: 'Pipeline Orchestrator',
        instructions: 'Điều phối toàn bộ pipeline: Researcher → Scoring → FilterDedup → Enrichment → Planner → Writer → MediaMaster. Ghi log vào agent_reports.',
        model: 'googleai/gemini-flash-latest',
        pipelinePosition: 0,
    },
    ANALYTICS: {
        role: 'Engagement Analytics',
        instructions: 'Thu thập engagement data từ Facebook API sau publish. Cập nhật điểm trong training-data-vault.',
        model: 'googleai/gemini-flash-latest',
        runAfterPublish: true,
    },
    EMILY: {
        role: 'Travel Consultant Chatbot',
        instructions: 'Tư vấn du lịch Phú Quốc qua chat. Dùng tool search_tours_db và search_phuquoc để tra cứu.',
        model: 'googleai/gemini-2.5-flash',
        fallbackModel: 'googleai/gemini-flash-latest',
        standaloneService: true,
    },
    HOTEL_CRAWLER: {
        role: 'Multi-Page Hotel Data Crawler',
        instructions: 'Cào dữ liệu khách sạn đa trang: trang chính → tìm link phòng → cào chi tiết → bóc tách JSON.',
        model: 'deepseek/deepseek-v4-flash',
        fallbackModel: 'googleai/gemini-flash-latest',
        standaloneService: true,
    },
};

const MASTER_PROMPTS = {
    RESEARCHER: {
        model: 'googleai/gemini-2.5-flash',
        fallbackModel: 'googleai/gemini-flash-latest',
        instructions: 'Quét dữ liệu từ Google RSS và Hội nhóm Review. Tìm thông tin về thuế, chính sách Phú Quốc và các bài đăng xu hướng.',
        gradingRule: 'Điểm > 8/10: Lưu vào training-data-vault. Report chi tiết vào Realtime Database.',
        pipelinePosition: 'Bước 1 — Đầu vào: URL RSS hoặc auto search keywords. Đầu ra: RSSScanResultSchema.',
    },
    SCORING: {
        model: null,
        instructions: 'Chấm điểm items từ Researcher theo 4 dimensions với trọng số từ scoring.config.js.',
        dimensions: 'freshness(0.25), trend(0.20), businessRelevance(0.30), seasonFit(0.25)',
        pipelinePosition: 'Bước 2 — Đầu vào: items từ Researcher. Đầu ra: scoredItems với tổng điểm.',
    },
    FILTER_DEDUP: {
        model: null,
        instructions: 'Lọc spam, nội dung tiêu cực. Khử trùng lặp bằng Jaccard similarity.',
        rules: 'Loại bỏ spam keywords, negative keywords. Ngưỡng trùng: Jaccard > 0.75.',
        pipelinePosition: 'Bước 3 — Đầu vào: scoredItems. Đầu ra: kept + removed items.',
    },
    ENRICHMENT: {
        model: null,
        instructions: 'Match items với sản phẩm trong DB (tours, hotels, services). Xây dựng context cho Writer.',
        pipelinePosition: 'Bước 4 — Đầu vào: filteredItems. Đầu ra: enrichedItems với matchedProducts.',
    },
    PLANNER: {
        model: null,
        instructions: 'Xác định angle, target, mediaType, format dựa trên category của item.',
        mappingSource: 'planner.config.js — categoryAngleMap, categoryTargetMap, categoryMediaMap.',
        pipelinePosition: 'Bước 5 — Đầu vào: enrichedItems. Đầu ra: plan (angle, target, format, mediaType).',
    },
    WRITER: {
        model: 'deepseek/deepseek-v4-pro',
        fallbackModel: 'googleai/gemini-flash-latest',
        instructions: 'Dựa vào data từ Researcher + Enrichment context, viết content Mobile First. CTA nhẹ nhàng, cung cấp giá trị là chính.',
        style: 'Sống động, tin cậy, không thúc ép bán tour.',
        bannedWords: 'đặt ngay, mua ngay, giảm giá sốc, khuyến mãi Hot, chạy ngay, click ngay, deal khủng, flash sale, săn sale, siêu ưu đãi, chốt deal, fomo',
        pipelinePosition: 'Bước 6 — Đầu vào: enrichedData + plan. Đầu ra: WriterOutputSchema (title, content, cta, hashtags).',
    },
    MEDIA_MASTER: {
        model: 'googleai/gemini-2.5-flash',
        fallbackModel: 'googleai/gemini-flash-latest',
        instructions: 'Phân tích nội dung từ Writer để đề xuất visual phù hợp. Chọn media, lồng ghép Logo 9 Trip, tối ưu định dạng social.',
        outputFormats: ['1:1', '9:16', '16:9', '4:5'],
        logoSpec: 'bottom_right, opacity 0.85, max 18% width',
        pipelinePosition: 'Bước 7 — Đầu vào: writerOutput. Đầu ra: Push vào ai_content_queue (status: pending_review).',
    },
    PUBLISHER: {
        model: null,
        instructions: 'Đăng bài đã approved lên Facebook Page và TikTok. Truyền URL từ Firebase Storage (không stream buffer). Xử lý refresh token an toàn.',
        platforms: ['facebook', 'tiktok'],
        pipelinePosition: 'Bước 8 (cuối) — Nhận signal approved từ Matrix Input UI, gọi Social API, ghi log vào RTDB.',
    },
    ORCHESTRATOR: {
        model: null,
        instructions: 'Điều phối toàn bộ pipeline. Nhận input từ frontend (source, url, keywords). Gọi tuần tự các sub-flows. Ghi report vào agent_reports.',
        pipelinePosition: 'Điều phối — Gọi Researcher → Scoring → FilterDedup → Enrichment → Planner → Writer → MediaMaster.',
    },
    ANALYTICS: {
        model: null,
        instructions: 'Chạy sau publish. Thu thập Facebook engagement. Cập nhật điểm trong training-data-vault.',
        schedule: 'Chạy định kỳ hoặc sau mỗi lượt publish.',
        pipelinePosition: 'Chạy độc lập — không thuộc pipeline chính.',
    },
    EMILY: {
        model: 'googleai/gemini-2.5-flash',
        fallbackModel: 'googleai/gemini-flash-latest',
        instructions: 'Chatbot tư vấn du lịch. Dùng search_tours_db để tra tour, search_phuquoc để tra thông tin du lịch.',
        tools: ['search_tours_db', 'search_phuquoc'],
        pipelinePosition: 'Service độc lập — chạy qua chat.api.js.',
    },
    HOTEL_CRAWLER: {
        model: 'deepseek/deepseek-v4-flash',
        fallbackModel: 'googleai/gemini-flash-latest',
        instructions: 'Cào dữ liệu khách sạn 2 phase: (1) crawlforge_scrape đa trang, (2) extractJSON theo HotelSchema.',
        pipelinePosition: 'Service độc lập — chạy qua crawler-trigger.api.js.',
    },
};

export { AGENT_CONFIGS, MASTER_PROMPTS };
