import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../utils/firebase-admin.util.js';
import mediaMasterConfig from '../.9trip-agents/configs/media-master.config.js';

/**
 * @Callable mediaMaster
 * @description Frontend gọi để kích hoạt Media Master phân tích visual
 * từ content Writer, push kết quả vào ai_content_queue để duyệt qua Matrix Input.
 *
 * @param {Object} data - Request data từ frontend
 * @param {string} data.title - Tiêu đề bài viết từ Writer
 * @param {string} data.content - Nội dung bài viết
 * @param {string} [data.cta] - Call-to-action
 * @param {string[]} [data.hashtags] - Mảng hashtag
 * @param {string} [data.format='social_post'] - Định dạng gốc
 * @param {string} [data.sourceTopic] - Chủ đề gốc từ Researcher
 */
export const mediaMaster = onCall(
    {
        region: 'asia-southeast1',
        timeoutSeconds: 120,
        memory: '512MiB',
        cors: ['https://erp.9tripphuquoc.com', 'erp.9tripphuquoc.com', '9tripphuquoc.com'],
        invoker: 'public',
    },
    async (request) => {
        const { title, content, cta, hashtags, format = 'social_post', sourceTopic } = request.data || {};

        if (!content || content.length < (mediaMasterConfig.minContentLength || 50)) {
            throw new HttpsError('invalid-argument', 'Thiếu nội dung bài viết hoặc nội dung quá ngắn.');
        }

        console.log(`[MediaMaster] Frontend gọi phân tích visual — title: ${title?.slice(0, 40)} | format: ${format}`);

        try {
            const { mediaMasterFlow } = await import('../ai/flows/media-master.flow.js');
            const visualResult = await mediaMasterFlow({
                title: title || '',
                content,
                cta: cta || '',
                hashtags: hashtags || [],
                format,
                sourceTopic: sourceTopic || '',
            });

            return {
                success: true,
                contentId: visualResult.contentId,
                data: visualResult,
            };
        } catch (error) {
            console.error(`[MediaMaster ERROR]:`, error);
            throw new HttpsError('internal', error.message || 'Phân tích visual thất bại, vui lòng thử lại.');
        }
    }
);

/**
 * @Callable getContentQueue
 * @description Frontend gọi để lấy danh sách content đang chờ duyệt
 * (Dùng cho Matrix Input UI)
 *
 * @param {Object} data - Request data
 * @param {string} [data.status='pending_review'] - Trạng thái lọc
 * @param {number} [data.limit=20] - Số lượng tối đa
 */
export const getContentQueue = onCall(
    {
        region: 'asia-southeast1',
        timeoutSeconds: 30,
        cors: ['https://erp.9tripphuquoc.com', 'erp.9tripphuquoc.com', '9tripphuquoc.com'],
        invoker: 'public',
    },
    async (request) => {
        const { status = 'pending_review', limit = 20 } = request.data || {};

        try {
            let query = db.collection(mediaMasterConfig.contentQueueCollection).orderBy('created_at', 'desc').limit(limit);

            if (status) {
                query = query.where('status', '==', status);
            }

            const snapshot = await query.get();
            const items = [];
            snapshot.forEach((doc) => {
                items.push({ id: doc.id, ...doc.data() });
            });

            return {
                success: true,
                count: items.length,
                items,
            };
        } catch (error) {
            console.warn(`[getContentQueue] Không thể query Firestore, trả về rỗng: ${error.message}`);
            return { success: true, count: 0, items: [], message: 'Không thể kết nối cơ sở dữ liệu.' };
        }
    }
);

/**
 * @Callable reviewContent
 * @description Frontend gọi để duyệt content qua Matrix Input
 * Cập nhật trạng thái: approved / rejected / revision
 *
 * @param {Object} data - Request data
 * @param {string} data.contentId - ID document trong ai_content_queue
 * @param {string} data.status - 'approved' | 'rejected' | 'revision'
 * @param {Object} [data.reviewData] - Dữ liệu Matrix review (điểm, ghi chú...)
 */
export const reviewContent = onCall(
    {
        region: 'asia-southeast1',
        timeoutSeconds: 30,
        cors: ['https://erp.9tripphuquoc.com', 'erp.9tripphuquoc.com', '9tripphuquoc.com'],
        invoker: 'public',
    },
    async (request) => {
        const { contentId, status, reviewData } = request.data || {};

        if (!contentId) {
            throw new HttpsError('invalid-argument', 'Thiếu contentId.');
        }

        const validStatuses = ['approved', 'rejected', 'revision', 'pending_review'];
        if (!status || !validStatuses.includes(status)) {
            throw new HttpsError('invalid-argument', `Status "${status}" không hợp lệ. Hỗ trợ: ${validStatuses.join(', ')}`);
        }

        try {
            const update = {
                status,
                updated_at: FieldValue.serverTimestamp(),
            };

            if (reviewData) {
                update.review = reviewData;
            }

            await db.collection(mediaMasterConfig.contentQueueCollection).doc(contentId).update(update);

            console.log(`[reviewContent] ✅ Content ${contentId} → ${status}`);

            return {
                success: true,
                contentId,
                status,
            };
        } catch (error) {
            console.warn(`[reviewContent] Không thể cập nhật Firestore: ${error.message}`);
            return { success: false, contentId, status: null, message: error.message || 'Lỗi cập nhật Firestore.' };
        }
    }
);
