/**
 * ═════════════════════════════════════════════════════════════════════════
 * SUB-AGENT: PUBLISHER (The Broadcaster)
 * Vị trí: .9trip-agents/sub-agents/publisher_agent.js
 * Quy tắc: Helper First, try-catch bảo toàn dữ liệu, log mọi kết quả
 * ═════════════════════════════════════════════════════════════════════════
 *
 * Pipeline: Researcher → Writer → MediaMaster → PUBLISHER
 *                                                     ↑ BẠN ĐANG Ở ĐÂY
 *
 * Logic:
 *   1. Nhận signal 'Duyệt' (approved) từ Matrix Input UI
 *   2. Đọc bài viết từ ai_content_queue (Firestore)
 *   3. Format bài theo nền tảng (Facebook Graph API, TikTok API)
 *   4. Đăng bài → ghi kết quả (post ID hoặc lỗi) vào RTDB
 *   5. Cập nhật status = 'published' hoặc 'publish_failed' trong queue
 *
 * Video TikTok: Truyền URL từ Firebase Storage, KHÔNG stream buffer
 * Refresh Token: Xử lý an toàn, tự động refresh khi hết hạn
 */

const axios = require('axios');
const { getFirestore } = require('../../functions-ai/utils/firebase-admin.util');
const { getRealtimeDb } = require('../../functions-ai/utils/firebase-admin.util');
const publisherConfig = require('../configs/publisher.config');
const { log } = require('../shared-logic/helpers');

const AGENT_NAME = 'publisher_agent';
const fb = publisherConfig.platforms.facebook;
const tk = publisherConfig.platforms.tiktok;

// ═══════════════════════════════════════════════════════════════════════════
// 1. FACEBOOK GRAPH API — Đăng bài + ảnh
// ═══════════════════════════════════════════════════════════════════════════

/**
 * publishToFacebook — Đăng bài lên Facebook Page Feed
 * Hỗ trợ: text-only hoặc text + ảnh (1 ảnh)
 *
 * @param {Object} content - Nội dung từ ai_content_queue
 * @param {string} content.message - Nội dung bài đăng
 * @param {string} [content.imageUrl] - URL ảnh (Firebase Storage public URL)
 * @param {string} [content.link] - Link đính kèm (erp.9tripphuquoc.com)
 * @returns {Promise<Object>} - { success, postId, platform: 'facebook' }
 */
async function publishToFacebook(content) {
    const pageId = process.env[fb.pageIdEnv];
    const accessToken = process.env[fb.pageAccessTokenEnv];

    if (!pageId || !accessToken) {
        throw new Error(`Thiếu FB_PAGE_ID hoặc FB_PAGE_ACCESS_TOKEN trong environment variables.`);
    }

    const url = `${fb.graphBaseUrl}/${fb.graphVersion}/${pageId}/feed`;
    const payload = {
        message: content.message,
        access_token: accessToken,
    };

    if (content.link) {
        payload.link = content.link;
    }

    let response;
    let retryCount = 0;

    while (retryCount < fb.maxRetries) {
        try {
            response = await axios.post(url, payload, {
                timeout: fb.timeoutMs,
                headers: { 'Content-Type': 'application/json' },
            });
            break;
        } catch (error) {
            retryCount++;
            const isTokenError = error.response?.status === 190 || error.response?.status === 401;

            if (isTokenError) {
                await log(AGENT_NAME, 'warn', `Facebook token hết hạn — thử refresh...`, {
                    retry: retryCount,
                    status: error.response?.status,
                });
                const refreshed = await refreshFacebookToken();
                if (refreshed) {
                    payload.access_token = process.env[fb.pageAccessTokenEnv];
                    continue;
                }
                throw new Error(`Facebook token hết hạn và không thể refresh: ${error.message}`);
            }

            if (retryCount >= fb.maxRetries) {
                throw new Error(`Facebook publish thất bại sau ${retryCount} lần thử: ${error.message}`);
            }

            await log(AGENT_NAME, 'warn', `Facebook publish retry ${retryCount}/${fb.maxRetries}: ${error.message}`);
            await new Promise((r) => setTimeout(r, fb.retryDelayMs));
        }
    }

    const postId = response?.data?.id;
    if (!postId) {
        throw new Error('Facebook trả về không có post ID.');
    }

    return { success: true, postId, platform: 'facebook' };
}

/**
 * publishPhotoToFacebook — Đăng ảnh lên Facebook Page (riêng biệt feed post)
 * Ưu tiên truyền Firebase Storage URL thay vì buffer
 *
 * @param {Object} content - Nội dung
 * @param {string} content.message - Caption ảnh
 * @param {string} content.imageUrl - Firebase Storage public URL
 * @returns {Promise<Object>} - { success, postId, platform: 'facebook_photo' }
 */
async function publishPhotoToFacebook(content) {
    const pageId = process.env[fb.pageIdEnv];
    const accessToken = process.env[fb.pageAccessTokenEnv];

    if (!pageId || !accessToken) {
        throw new Error('Thiếu FB_PAGE_ID hoặc FB_PAGE_ACCESS_TOKEN.');
    }
    if (!content.imageUrl) {
        throw new Error('publishPhotoToFacebook yêu cầu imageUrl.');
    }

    const url = `${fb.graphBaseUrl}/${fb.graphVersion}/${pageId}/photos`;
    const payload = {
        url: content.imageUrl,
        message: content.message,
        access_token: accessToken,
    };

    const response = await axios.post(url, payload, {
        timeout: fb.timeoutMs,
        headers: { 'Content-Type': 'application/json' },
    });

    const photoId = response?.data?.id;
    if (!photoId) {
        throw new Error('Facebook Photo API trả về không có photo ID.');
    }

    return { success: true, postId: photoId, platform: 'facebook_photo' };
}

/**
 * refreshFacebookToken — Refresh Page Access Token dùng Long-Lived Token
 * @returns {Promise<boolean>} - true nếu refresh thành công
 */
async function refreshFacebookToken() {
    try {
        const longLivedToken = process.env[fb.longLivedTokenEnv];
        if (!longLivedToken) {
            await log(AGENT_NAME, 'error', 'Không có FB_LONG_LIVED_TOKEN để refresh.');
            return false;
        }

        const appId = process.env.FB_APP_ID;
        const appSecret = process.env.FB_APP_SECRET;
        if (!appId || !appSecret) {
            await log(AGENT_NAME, 'error', 'Thiếu FB_APP_ID hoặc FB_APP_SECRET.');
            return false;
        }

        const response = await axios.get(fb.tokenRefreshUrl, {
            params: {
                grant_type: 'fb_exchange_token',
                client_id: appId,
                client_secret: appSecret,
                fb_exchange_token: longLivedToken,
            },
            timeout: 15000,
        });

        const newToken = response?.data?.access_token;
        if (!newToken) {
            await log(AGENT_NAME, 'error', 'Facebook refresh token trả về không có access_token.');
            return false;
        }

        process.env[fb.pageAccessTokenEnv] = newToken;
        await log(AGENT_NAME, 'success', 'Facebook token refresh thành công.');
        return true;
    } catch (error) {
        await log(AGENT_NAME, 'error', `Facebook token refresh thất bại: ${error.message}`);
        return false;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. TIKTOK API — Đăng video ngắn
// ═══════════════════════════════════════════════════════════════════════════

/**
 * publishToTikTok — Đăng video ngắn lên TikTok
 * Logic: Truyền URL Firebase Storage, KHÔNG stream buffer để tránh timeout
 *
 * Quy trình 2 bước:
 *   1. Khởi tạo upload (initialize) — lấy upload_url
 *   2. Upload video từ URL — TikTok download trực tiếp từ Storage URL
 *
 * @param {Object} content - Nội dung
 * @param {string} content.title - Tiêu đề video (max 150 ký tự)
 * @param {string} content.description - Mô tả video
 * @param {string} content.videoUrl - Firebase Storage public URL
 * @param {string[]} [content.hashtags] - Hashtag
 * @returns {Promise<Object>} - { success, postId, platform: 'tiktok' }
 */
async function publishToTikTok(content) {
    const clientKey = process.env[tk.clientKeyEnv];
    const accessToken = process.env[tk.accessTokenEnv];

    if (!clientKey || !accessToken) {
        throw new Error('Thiếu TIKTOK_CLIENT_KEY hoặc TIKTOK_ACCESS_TOKEN.');
    }
    if (!content.videoUrl) {
        throw new Error('publishToTikTok yêu cầu videoUrl (Firebase Storage URL).');
    }

    // ── Bước 1: Khởi tạo upload ──
    const initUrl = `${tk.baseUrl}/${tk.apiVersion}/post/publish/content/init/`;
    const initPayload = {
        post_info: {
            title: (content.title || '').slice(0, 150),
            description: content.description || '',
            disable_duet: false,
            disable_comment: false,
            disable_stitch: false,
            privacy_level: 'PUBLIC_TO_EVERYONE',
        },
        source_info: {
            source: 'PULL_FROM_URL',
            video_url: content.videoUrl,
        },
    };

    if (content.hashtags?.length > 0) {
        initPayload.post_info.hashtag_names = content.hashtags.slice(0, 5);
    }

    let retryCount = 0;

    while (retryCount < tk.maxRetries) {
        try {
            const initResponse = await axios.post(initUrl, initPayload, {
                timeout: tk.timeoutMs,
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
            });

            const publishId = initResponse?.data?.data?.publish_id;
            if (!publishId) {
                throw new Error(`TikTok init upload trả về không có publish_id: ${JSON.stringify(initResponse?.data)}`);
            }

            await log(AGENT_NAME, 'success', `TikTok video init thành công — publish_id: ${publishId}`, {
                publishId,
                videoUrl: content.videoUrl.slice(0, 80),
            });

            return { success: true, postId: publishId, platform: 'tiktok' };
        } catch (error) {
            retryCount++;
            const status = error.response?.status;

            // Token hết hạn → thử refresh
            if (status === 401 || status === 403) {
                await log(AGENT_NAME, 'warn', `TikTok token hết hạn — thử refresh...`, { retry: retryCount });
                const refreshed = await refreshTikTokToken();
                if (refreshed) {
                    continue;
                }
                throw new Error(`TikTok token hết hạn và không thể refresh: ${error.message}`);
            }

            if (retryCount >= tk.maxRetries) {
                throw new Error(`TikTok publish thất bại sau ${retryCount} lần thử: ${error.message}`);
            }

            await log(AGENT_NAME, 'warn', `TikTok publish retry ${retryCount}/${tk.maxRetries}: ${error.message}`);
            await new Promise((r) => setTimeout(r, tk.retryDelayMs));
        }
    }
}

/**
 * refreshTikTokToken — Đổi access token dùng refresh token
 * @returns {Promise<boolean>}
 */
async function refreshTikTokToken() {
    try {
        const clientKey = process.env[tk.clientKeyEnv];
        const clientSecret = process.env[tk.clientSecretEnv];
        const refreshToken = process.env[tk.refreshTokenEnv];

        if (!clientKey || !clientSecret || !refreshToken) {
            await log(AGENT_NAME, 'error', 'Thiếu TikTok credentials để refresh token.');
            return false;
        }

        const response = await axios.post(
            `${tk.baseUrl}/${tk.apiVersion}/oauth/token/`,
            {
                client_key: clientKey,
                client_secret: clientSecret,
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
            },
            { timeout: 15000 }
        );

        const newAccessToken = response?.data?.access_token;
        const newRefreshToken = response?.data?.refresh_token;

        if (!newAccessToken) {
            await log(AGENT_NAME, 'error', 'TikTok refresh trả về không có access_token.');
            return false;
        }

        process.env[tk.accessTokenEnv] = newAccessToken;
        if (newRefreshToken) {
            process.env[tk.refreshTokenEnv] = newRefreshToken;
        }

        await log(AGENT_NAME, 'success', 'TikTok token refresh thành công.');
        return true;
    } catch (error) {
        await log(AGENT_NAME, 'error', `TikTok token refresh thất bại: ${error.message}`);
        return false;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. PUBLISH CONTENT — Điểm vào chính từ API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * publishContent — Điểm vào chính. Nhận contentId đã approved, publish lên Social.
 *
 * Quy trình:
 *   1. Đọc content từ ai_content_queue
 *   2. Kiểm tra status = 'approved'
 *   3. Format bài theo nền tảng
 *   4. Đăng lên Facebook/TikTok
 *   5. Ghi kết quả (post ID hoặc lỗi) vào RTDB + publish_logs
 *   6. Cập nhật status trong queue
 *
 * @param {string} contentId - ID document trong ai_content_queue
 * @param {Object} [options] - Tuỳ chọn publish
 * @param {string[]} [options.platforms] - Nền tảng đăng: ['facebook', 'tiktok']
 * @returns {Promise<Object>} - Kết quả publish từng nền tảng
 */
async function publishContent(contentId, options = {}) {
    const db = getFirestore();
    const { platforms = ['facebook'] } = options;
    const results = {};

    try {
        // ═══ 1. ĐỌC CONTENT TỪ QUEUE ═══
        await log(AGENT_NAME, 'info', `Bắt đầu publish content [${contentId}]...`);

        const docRef = db.collection(publisherConfig.contentQueueCollection).doc(contentId);
        const doc = await docRef.get();

        if (!doc.exists) {
            throw new Error(`Content ${contentId} không tồn tại trong queue.`);
        }

        const contentData = doc.data();

        // ═══ 2. KIỂM TRA STATUS ═══
        if (publisherConfig.rules.requireApprovedStatus && contentData.status !== 'approved') {
            throw new Error(`Content ${contentId} chưa được duyệt (status: ${contentData.status}). Chỉ publish bài đã approved.`);
        }

        const wc = contentData.writerContent || {};
        const title = wc.title || contentData.sourceTopic || 'Phú Quốc Experience';
        const body = wc.content || '';
        const cta = wc.cta || '';
        const hashtags = wc.hashtags || [];
        const format = wc.format || 'social_post';

        // ═══ 3. FORMAT NỘI DUNG ═══
        const platformConfigs = publisherConfig.formatMapping[format] || publisherConfig.formatMapping.social_post;

        // ═══ 4. PUBLISH TỪNG NỀN TẢNG ═══
        for (const platform of platforms) {
            try {
                if (platform === 'facebook' && publisherConfig.platforms.facebook.enabled) {
                    await log(AGENT_NAME, 'info', `Publishing lên Facebook... [${contentId}]`);

                    const message = formatFacebookMessage(title, body, cta, hashtags);

                    const publishPayload = { message };
                    if (contentData.logoSpec?.url) {
                        publishPayload.imageUrl = contentData.logoSpec.url;
                    }

                    if (publishPayload.imageUrl) {
                        results.facebook = await publishPhotoToFacebook({
                            message,
                            imageUrl: publishPayload.imageUrl,
                        });
                    } else {
                        results.facebook = await publishToFacebook(publishPayload);
                    }

                    await log(AGENT_NAME, 'success', `Facebook publish thành công — Post ID: ${results.facebook.postId}`, {
                        contentId,
                        platform: 'facebook',
                        postId: results.facebook.postId,
                    });
                } else if (platform === 'tiktok' && publisherConfig.platforms.tiktok.enabled) {
                    if (!contentData.videoUrl && !contentData.mediaUrl) {
                        await log(AGENT_NAME, 'warn', `TikTok bỏ qua: không có videoUrl cho content [${contentId}]`);
                        results.tiktok = { success: false, error: 'Thiếu videoUrl cho TikTok.' };
                        continue;
                    }

                    await log(AGENT_NAME, 'info', `Publishing lên TikTok... [${contentId}]`);

                    results.tiktok = await publishToTikTok({
                        title: title.slice(0, 150),
                        description: `${body.slice(0, 100)}\n\n${hashtags.map((h) => `#${h}`).join(' ')}`,
                        videoUrl: contentData.videoUrl || contentData.mediaUrl,
                        hashtags,
                    });

                    await log(AGENT_NAME, 'success', `TikTok publish thành công — Publish ID: ${results.tiktok.postId}`, {
                        contentId,
                        platform: 'tiktok',
                        postId: results.tiktok.postId,
                    });
                } else {
                    results[platform] = { success: false, error: `Nền tảng ${platform} không được hỗ trợ hoặc chưa bật.` };
                }
            } catch (platformError) {
                results[platform] = { success: false, error: platformError.message };
                await log(AGENT_NAME, 'error', `${platform} publish thất bại: ${platformError.message}`, {
                    contentId,
                    platform,
                    error: platformError.message,
                });
            }
        }

        // ═══ 5. GHI PUBLISH LOG ═══
        const anySuccess = Object.values(results).some((r) => r.success);
        const newStatus = anySuccess ? 'published' : 'publish_failed';

        await docRef.update({
            status: newStatus,
            published_at: db.FieldValue.serverTimestamp(),
            updated_at: db.FieldValue.serverTimestamp(),
            publish_results: results,
        });

        await db.collection(publisherConfig.publishLogCollection).add({
            contentId,
            title: title.slice(0, 100),
            platforms,
            results,
            status: newStatus,
            published_at: db.FieldValue.serverTimestamp(),
        });

        await log(AGENT_NAME, anySuccess ? 'success' : 'error', `Publish ${newStatus} — content [${contentId}]`, {
            contentId,
            status: newStatus,
            results,
        });

        return { contentId, status: newStatus, results };
    } catch (error) {
        await log(AGENT_NAME, 'error', `Publisher lỗi: ${error.message}`, {
            contentId,
            error: error.message,
        });

        try {
            await db.collection(publisherConfig.contentQueueCollection).doc(contentId).update({
                status: 'publish_failed',
                publish_error: error.message,
                updated_at: db.FieldValue.serverTimestamp(),
            });
        } catch (_) {}

        return { contentId, status: 'publish_failed', error: error.message, results };
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. FORMAT HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * formatFacebookMessage — Format bài đăng Facebook theo quy tắc Mobile First
 */
function formatFacebookMessage(title, body, cta, hashtags) {
    const parts = [];

    if (title) parts.push(`📍 ${title}`);
    if (body) parts.push(body.slice(0, 450));
    if (cta) parts.push(`\n${cta}`);
    if (hashtags?.length) parts.push(`\n${hashtags.map((h) => `#${h}`).join(' ')}`);

    return parts.join('\n\n').slice(0, 5000);
}

module.exports = {
    publishContent,
    publishToFacebook,
    publishPhotoToFacebook,
    publishToTikTok,
    refreshFacebookToken,
    refreshTikTokToken,
};
