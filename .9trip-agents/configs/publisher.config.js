/**
 * ═════════════════════════════════════════════════════════════════════════
 * PUBLISHER AGENT — Cấu hình Social Publishing
 * ═════════════════════════════════════════════════════════════════════════
 *
 * SỬA Ở ĐÂY để điều chỉnh nền tảng publish, token, và quy tắc đăng bài.
 * Không cần đụng vào code Firebase Functions.
 */

const publisherConfig = {
    // ─── Danh tính ────────────────────────────────────────────────────────
    name: 'Publisher',
    role: 'Social Content Publisher',
    company: '9 Trip Phú Quốc',

    // ─── Nền tảng hỗ trợ ──────────────────────────────────────────────────
    platforms: {
        facebook: {
            enabled: true,
            graphVersion: 'v19.0',
            graphBaseUrl: 'https://graph.facebook.com',
            timeoutMs: 30000,
            maxRetries: 3,
            retryDelayMs: 2000,
            // Page ID và Token lấy từ env
            pageIdEnv: 'FB_PAGE_ID',
            pageAccessTokenEnv: 'FB_PAGE_ACCESS_TOKEN',
            longLivedTokenEnv: 'FB_LONG_LIVED_TOKEN',
            // Refresh token endpoint
            tokenRefreshUrl: 'https://graph.facebook.com/v19.0/oauth/access_token',
        },
        tiktok: {
            enabled: true,
            apiVersion: 'v2',
            baseUrl: 'https://open.tiktokapis.com',
            timeoutMs: 60000,
            maxRetries: 2,
            retryDelayMs: 3000,
            // Client credentials từ env
            clientKeyEnv: 'TIKTOK_CLIENT_KEY',
            clientSecretEnv: 'TIKTOK_CLIENT_SECRET',
            accessTokenEnv: 'TIKTOK_ACCESS_TOKEN',
            refreshTokenEnv: 'TIKTOK_REFRESH_TOKEN',
            // Redirect URI cho OAuth
            redirectUri: 'https://erp.9tripphuquoc.com/admin/tiktok-callback',
        },
    },

    // ─── Firebase Storage ──────────────────────────────────────────────────
    storage: {
        bucket: 'gs://9-trip-erp.firebasestorage.app',
        contentPrefix: 'ai_published_content',
        publicUrlBase: 'https://firebasestorage.googleapis.com/v0/b/9-trip-erp.o.appspot.com/o/',
    },

    // ─── Quy tắc đăng bài ──────────────────────────────────────────────────
    rules: {
        // Chỉ đăng khi status = 'approved' từ Matrix Input
        requireApprovedStatus: true,
        // Kiểm tra duplicate: không đăng lại bài đã published trong 24h
        preventDuplicateWithinHours: 24,
        // Tối đa bài đăng/ngày/nền tảng
        maxPostsPerDayPerPlatform: 10,
        // Thời gian chờ giữa 2 bài đăng (ms)
        minIntervalBetweenPostsMs: 300000, // 5 phút
    },

    // ─── Firestore collections ────────────────────────────────────────────
    contentQueueCollection: 'ai_content_queue',
    publishLogCollection: 'ai_publish_logs',

    // ─── Định dạng bài đăng theo nền tảng ──────────────────────────────────
    formatMapping: {
        social_post: {
            facebook: 'feed',
            tiktok: null,
            description: 'Bài đăng Facebook Feed',
        },
        blog_post: {
            facebook: 'feed',
            tiktok: null,
            description: 'Bài blog dài — chỉ đăng Facebook',
        },
        short_caption: {
            facebook: 'feed',
            tiktok: null,
            description: 'Caption ngắn',
        },
        news_summary: {
            facebook: 'feed',
            tiktok: null,
            description: 'Tóm tắt tin tức',
        },
    },

    // ─── System Prompt cho AI format bài đăng ──────────────────────────────
    systemPrompt: `Bạn là Publisher Agent của 9 Trip Phú Quốc.

NHIỆM VỤ: Định dạng lại bài viết cho từng nền tảng social, đảm bảo tối ưu hiển thị.

QUY TẮC:
1. FACEBOOK: Tối đa 500 ký tự nội dung chính. Hashtag cuối bài, mỗi hashtag cách nhau 1 dấu cách. Không xuống dòng liên tục.
2. TIKTOK: Caption ngắn gọn dưới 150 ký tự. 3-5 hashtag ở cuối.
3. LOGO: Mọi ảnh đăng phải có logo 9 Trip ở góc dưới phải, opacity 85%, max 18% chiều ngang.
4. KHÔNG sử dụng từ cấm (đặt ngay, mua ngay, giảm giá sốc...).
5. CTA phải nhẹ nhàng, gợi mở trải nghiệm.`,
};

module.exports = publisherConfig;
