/**
 * ═════════════════════════════════════════════════════════════════════════
 * SUB-AGENT: MEDIA MASTER (The Visual Eye)
 * Vị trí: .9trip-agents/sub-agents/media_master.js
 * Quy tắc: Mobile First, CTA nhẹ nhàng, Helper First
 * ═════════════════════════════════════════════════════════════════════════
 *
 * Pipeline: Researcher → Writer → MEDIA MASTER → Publisher
 *                                          ↑ BẠN ĐANG Ở ĐÂY
 *
 * Logic:
 *   1. Nhận content từ Writer Agent
 *   2. Phân tích nội dung → đề xuất media (Instagram, TikTok, stock)
 *   3. Đặc tả logo 9 Trip overlay (vị trí, opacity, kích thước)
 *   4. Push kết quả vào ai_content_queue (Firestore) — chờ Matrix Input duyệt
 *   5. Ghi Visual Logic Report lên RTDB
 *
 * Model: Gemini 1.5 Flash (nhanh, rẻ, multimodal)
 */

const { mediaMasterFlow } = require('../../functions-ai/ai/flows/media-master.flow');
const mediaMasterConfig = require('../configs/media-master.config');
const { AGENT_CONFIGS } = require('../configs/prompts_master');
const { log } = require('../shared-logic/helpers');

const AGENT_NAME = 'media_master';

/**
 * analyzeAndQueue — Phân tích visual từ content Writer & push vào content queue
 *
 * @param {Object} writerOutput - Kết quả từ Writer Agent
 * @param {string} writerOutput.title - Tiêu đề bài viết
 * @param {string} writerOutput.content - Nội dung bài viết
 * @param {string} writerOutput.cta - Call-to-action
 * @param {string[]} writerOutput.hashtags - Mảng hashtag
 * @param {string} [writerOutput.format] - Format gốc (social_post, blog_post...)
 * @param {string} [sourceTopic] - Chủ đề gốc từ Researcher (hiển thị trong log)
 * @returns {Promise<Object|null>} - Kết quả visual analysis + queue ID, hoặc null nếu lỗi
 */
async function analyzeAndQueue(writerOutput, sourceTopic = '') {
    try {
        // ═══ 1. VALIDATE: Đảm bảo Writer output có nội dung ═══
        if (!writerOutput || !writerOutput.content) {
            throw new Error('Dữ liệu đầu vào từ Writer trống');
        }

        if (writerOutput.content.length < (mediaMasterConfig.minContentLength || 50)) {
            await log(AGENT_NAME, 'warn', `Nội dung Writer quá ngắn (${writerOutput.content.length} ký tự). Bỏ qua.`);
            return null;
        }

        const topic = sourceTopic || writerOutput.title?.slice(0, 40) || 'Không xác định';

        // ═══ 2. BÁO CÁO: Bắt đầu phân tích visual ═══
        await log(AGENT_NAME, 'info', `Đang phân tích visual cho [${topic}] — ${mediaMasterConfig.outputFormats.length} formats...`, {
            title: writerOutput.title,
            format: writerOutput.format || 'social_post',
            contentLength: writerOutput.content.length,
        });

        // ═══ 3. GỌI MEDIA MASTER FLOW ═══
        const result = await mediaMasterFlow({
            title: writerOutput.title || '',
            content: writerOutput.content,
            cta: writerOutput.cta || '',
            hashtags: writerOutput.hashtags || [],
            format: writerOutput.format || 'social_post',
            sourceTopic,
        });

        // ═══ 4. KIỂM TRA KẾT QUẢ ═══
        if (!result || !result.contentId) {
            await log(AGENT_NAME, 'warn', `Phân tích visual thất bại — không có contentId`);
            return null;
        }

        // ═══ 5. GHI BÁO CÁO THÀNH CÔNG ═══
        const suggestionFormats = (result.suggestions || []).map((s) => s.format).join(', ');

        await log(AGENT_NAME, 'success', `Hoàn thành visual analysis — Queue ID: ${result.contentId} | Đề xuất: ${suggestionFormats}`, {
            contentId: result.contentId,
            topic: result.visualAnalysis?.topic || topic,
            mood: result.visualAnalysis?.mood || '',
            suggestionCount: result.suggestions?.length || 0,
            platforms: result.platformOptimized || [],
            status: 'pending_review',
        });

        // ═══ 6. TRẢ KẾT QUẢ — sẵn sàng cho Publisher hoặc Matrix Input duyệt ═══
        return {
            contentId: result.contentId,
            visualAnalysis: result.visualAnalysis,
            suggestions: result.suggestions,
            logoSpec: result.logoSpec,
            platformOptimized: result.platformOptimized,
            status: 'pending_review',
        };
    } catch (error) {
        await log(AGENT_NAME, 'error', `Media Master lỗi: ${error.message}`);
        return null;
    }
}

/**
 * getContentQueue — Lấy danh sách content đang chờ duyệt từ Firestore
 *
 * @param {string} [status='pending_review'] - Trạng thái cần lọc
 * @param {number} [limit=20] - Số lượng tối đa
 * @returns {Promise<Array>} - Danh sách content trong queue
 */
async function getContentQueue(status = 'pending_review', limit = 20) {
    try {
        const { getFirestore } = require('../../functions-ai/utils/firebase-admin.util');
        const db = getFirestore();

        let query = db.collection(mediaMasterConfig.contentQueueCollection)
            .orderBy('created_at', 'desc')
            .limit(limit);

        if (status) {
            query = query.where('status', '==', status);
        }

        const snapshot = await query.get();
        const items = [];
        snapshot.forEach((doc) => {
            items.push({ id: doc.id, ...doc.data() });
        });

        await log(AGENT_NAME, 'info', `Lấy content queue: ${items.length} items (status: ${status})`);
        return items;
    } catch (error) {
        await log(AGENT_NAME, 'error', `Lỗi lấy content queue: ${error.message}`);
        return [];
    }
}

/**
 * updateQueueStatus — Cập nhật trạng thái content trong queue
 * Dùng cho Matrix Input duyệt: approve / reject / revision
 *
 * @param {string} contentId - ID document trong ai_content_queue
 * @param {string} status - Trạng thái mới: 'approved' | 'rejected' | 'revision'
 * @param {Object} [reviewData] - Dữ liệu review (điểm Matrix, ghi chú...)
 * @returns {Promise<boolean>}
 */
async function updateQueueStatus(contentId, status, reviewData = null) {
    try {
        const { getFirestore } = require('../../functions-ai/utils/firebase-admin.util');
        const db = getFirestore();

        const update = {
            status,
            updated_at: db.FieldValue.serverTimestamp(),
        };

        if (reviewData) {
            update.review = reviewData;
        }

        await db.collection(mediaMasterConfig.contentQueueCollection).doc(contentId).update(update);

        await log(AGENT_NAME, 'success', `Content ${contentId} → ${status}`, {
            contentId,
            status,
            review: reviewData || null,
        });

        return true;
    } catch (error) {
        await log(AGENT_NAME, 'error', `Lỗi cập nhật queue ${contentId}: ${error.message}`);
        return false;
    }
}

module.exports = { analyzeAndQueue, getContentQueue, updateQueueStatus };