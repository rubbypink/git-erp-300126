/**
 * ═════════════════════════════════════════════════════════════════════════
 * SOCIAL PUBLISHER — Callable Cloud Functions
 * Lắng nghe signal 'Duyệt' từ UI, chuyển status → published, gọi publisher_agent
 * ═════════════════════════════════════════════════════════════════════════
 *
 * 3 Callable Functions:
 *   1. publishContent     — Publish bài đã approved lên Social
 *   2. getPublishLogs     — Lấy lịch sử publish
 *   3. getPublishStatus   — Kiểm tra trạng thái publish của 1 bài
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../utils/firebase-admin.util.js';
import publisherConfig from '../.9trip-agents/configs/publisher.config.js';
import { publishContent as publishContentAgent } from '../.9trip-agents/sub-agents/publisher_agent.js';

/**
 * @Callable publishContent
 * @description Frontend gọi sau khi duyệt bài (status = approved).
 * Transitions: approved → published (hoặc publish_failed)
 *
 * @param {Object} data - Request data
 * @param {string} data.contentId - ID document trong ai_content_queue (phải status = approved)
 * @param {string[]} [data.platforms=['facebook']] - Nền tảng đăng: 'facebook', 'tiktok'
 */
export const publishContent = onCall(
    {
        region: 'asia-southeast1',
        timeoutSeconds: 120,
        memory: '512MiB',
        cors: ['https://erp.9tripphuquoc.com', 'erp.9tripphuquoc.com', '9tripphuquoc.com'],
        invoker: 'public',
    },
    async (request) => {
        const { contentId, platforms = ['facebook'] } = request.data || {};

        if (!contentId) {
            throw new HttpsError('invalid-argument', 'Thiếu contentId. Vui lòng truyền ID bài viết cần publish.');
        }

        const validPlatforms = platforms.filter((p) => publisherConfig.platforms[p]?.enabled);
        if (validPlatforms.length === 0) {
            throw new HttpsError('invalid-argument', `Nền tảng không hợp lệ. Hỗ trợ: Facebook, TikTok.`);
        }

        console.log(`[Publisher] Frontend gọi publish — contentId: ${contentId} | platforms: ${validPlatforms.join(', ')}`);

        // ═══ KIỂM TRA STATUS TRONG QUEUE ═══
        try {
            const docRef = db.collection(publisherConfig.contentQueueCollection).doc(contentId);
            const doc = await docRef.get();

            if (!doc.exists) {
                throw new HttpsError('not-found', `Content ${contentId} không tồn tại.`);
            }

            const currentStatus = doc.data()?.status;

            if (currentStatus === 'published') {
                throw new HttpsError('already-exists', `Content ${contentId} đã được publish trước đó.`);
            }

            if (publisherConfig.rules.requireApprovedStatus && currentStatus !== 'approved') {
                throw new HttpsError('failed-precondition', `Content ${contentId} chưa được duyệt (status: ${currentStatus}). Chỉ publish bài đã approved.`);
            }

            // ═══ GỌI PUBLISHER AGENT ═══
            const result = await publishContentAgent(contentId, { platforms: validPlatforms });

            return {
                success: true,
                contentId: result.contentId,
                status: result.status,
                results: result.results,
            };
        } catch (error) {
            if (error instanceof HttpsError) throw error;

            console.error(`[Publisher ERROR] Content ${contentId}:`, error);
            throw new HttpsError('internal', error.message || 'Publish thất bại, vui lòng thử lại.');
        }
    }
);

/**
 * @Callable getPublishLogs
 * @description Lấy lịch sử publish từ ai_publish_logs
 *
 * @param {Object} data - Request data
 * @param {number} [data.limit=20] - Số lượng tối đa
 * @param {string} [data.status] - Lọc theo status: 'published' | 'publish_failed'
 */
export const getPublishLogs = onCall(
    {
        region: 'asia-southeast1',
        timeoutSeconds: 30,
        cors: ['https://erp.9tripphuquoc.com', 'erp.9tripphuquoc.com', '9tripphuquoc.com'],
        invoker: 'public',
    },
    async (request) => {
        const { limit = 20, status } = request.data || {};

        try {
            let query = db.collection(publisherConfig.publishLogCollection).orderBy('published_at', 'desc').limit(limit);

            if (status) {
                query = query.where('status', '==', status);
            }

            const snapshot = await query.get();
            const logs = [];
            snapshot.forEach((doc) => {
                logs.push({ id: doc.id, ...doc.data() });
            });

            return {
                success: true,
                count: logs.length,
                logs,
            };
        } catch (error) {
            console.warn(`[getPublishLogs] Không thể query Firestore, trả về rỗng: ${error.message}`);
            return { success: true, count: 0, logs: [], message: 'Không thể kết nối cơ sở dữ liệu.' };
        }
    }
);

/**
 * @Callable getPublishStatus
 * @description Kiểm tra trạng thái publish của 1 bài viết trong queue
 *
 * @param {Object} data - Request data
 * @param {string} data.contentId - ID document trong ai_content_queue
 */
export const getPublishStatus = onCall(
    {
        region: 'asia-southeast1',
        timeoutSeconds: 15,
        cors: ['https://erp.9tripphuquoc.com', 'erp.9tripphuquoc.com', '9tripphuquoc.com'],
        invoker: 'public',
    },
    async (request) => {
        const { contentId } = request.data || {};

        if (!contentId) {
            throw new HttpsError('invalid-argument', 'Thiếu contentId.');
        }

        try {
            const doc = await db.collection(publisherConfig.contentQueueCollection).doc(contentId).get();

            if (!doc.exists) {
                return { success: true, contentId, status: 'not_found', message: 'Content không tồn tại.' };
            }

            const data = doc.data();
            return {
                success: true,
                contentId,
                status: data.status,
                publishResults: data.publish_results || null,
                publishedAt: data.published_at || null,
                writerContent: {
                    title: data.writerContent?.title || '',
                    format: data.writerContent?.format || '',
                },
            };
        } catch (error) {
            console.warn(`[getPublishStatus] Không thể query Firestore: ${error.message}`);
            return { success: true, contentId, status: 'error', message: error.message || 'Lỗi kết nối cơ sở dữ liệu.' };
        }
    }
);
