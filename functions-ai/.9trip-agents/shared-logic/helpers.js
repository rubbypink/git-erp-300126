/**
 * ═════════════════════════════════════════════════════════════════════════
 * 9 TRIP AI AGENTS — Shared Helpers
 * Quy tắc: Helper First — TUYỆT ĐỐI không reinvent wheel
 * ═════════════════════════════════════════════════════════════════════════
 */

import { db, rtdb } from '../../utils/firebase-admin.util.js';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * Đệ quy loại bỏ giá trị undefined khỏi object/array
 * Firebase RTDB & Firestore đều reject undefined — hàm này đảm bảo data sạch
 * @param {*} obj - Object, array, hoặc giá trị primitive
 * @returns {*} - Bản sao đã loại bỏ undefined
 */
function stripUndefined(obj) {
    if (obj === undefined) return null;
    if (obj === null) return null;
    if (Array.isArray(obj)) return obj.map(stripUndefined);
    if (typeof obj === 'object' && obj.constructor === Object) {
        const result = {};
        for (const [key, val] of Object.entries(obj)) {
            const cleaned = stripUndefined(val);
            if (cleaned !== undefined) result[key] = cleaned;
        }
        return result;
    }
    if (obj instanceof Date) return obj;
    return obj;
}

/**
 * Ghi RTDB .set() an toàn — tự động stripUndefined, không throw
 * @param {admin.database.Reference} ref - RTDB Reference
 * @param {Object} data - Dữ liệu cần ghi
 */
async function safeRtdbSet(ref, data) {
    try {
        await ref.set(stripUndefined(data));
    } catch (error) {
        console.error(`[safeRtdbSet] Ghi RTDB thất bại (${ref.key || ref.path}): ${error.message}`);
    }
}

/**
 * Ghi RTDB .push() an toàn — tự động stripUndefined, không throw
 * @param {admin.database.Reference} ref - RTDB Reference
 * @param {Object} data - Dữ liệu cần ghi
 */
async function safeRtdbPush(ref, data) {
    try {
        await ref.push(stripUndefined(data));
    } catch (error) {
        console.error(`[safeRtdbPush] Ghi RTDB thất bại (${ref.key || ref.path}): ${error.message}`);
    }
}

/**
 * Ghi log Agent vào Firebase Realtime Database
 * Cấu trúc: agent_reports/{yyyy-mm-dd}/{agentName}/{pushId}
 * @param {string} agentName - Tên agent (vd: 'writer_agent', 'researcher_agent')
 * @param {string} level - LogLevel: 'info' | 'warn' | 'error' | 'success'
 * @param {string} message - Nội dung log
 * @param {Object} [metadata] - Metadata bổ sung (tuỳ chọn)
 */
async function log(agentName, level, message, metadata = null) {
    try {
        const today = new Date().toISOString().slice(0, 10);
        const logPath = rtdb.ref(`agent_reports/${today}/${agentName}`);

        const entry = {
            level,
            message,
            timestamp: Date.now(),
        };
        if (metadata) {
            entry.metadata = metadata;
        }

        await logPath.push(stripUndefined(entry));

        const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : level === 'success' ? '✅' : 'ℹ️';
        console.log(`[${agentName}] ${prefix} ${message}`);
    } catch (error) {
        console.error(`[helpers.log] Lỗi ghi RTDB: ${error.message}`);
    }
}

/**
 * Validate dữ liệu Researcher — lọc item đạt điểm tối thiểu
 * @param {Object|Array} data - Dữ liệu từ Researcher (object có items[] hoặc mảng)
 * @param {number} minScore - Điểm tối thiểu phuQuocRelevance (mặc định 8)
 * @returns {Array|null} - Mảng item đạt điểm, hoặc null nếu không hợp lệ
 */
function validateResearchData(data, minScore = 8) {
    if (!data) return null;

    const items = Array.isArray(data) ? data : data.items || data.rssItems || null;
    if (!items || !Array.isArray(items)) return null;

    const qualified = items.filter((item) => {
        const score = item.phuQuocRelevance ?? item.relevance ?? item.score ?? 0;
        return score >= minScore;
    });

    return qualified.length > 0 ? qualified : null;
}

/**
 * Trích xuất chủ đề chính từ danh sách item Researcher
 * @param {Array} items - Mảng item已达 điểm từ validateResearchData
 * @returns {string} - Chủ đề chính (dùng cho log)
 */
function extractTopic(items) {
    if (!items || items.length === 0) return 'Không xác định';
    const first = items[0];
    return first.category || first.title?.split(' ').slice(0, 4).join(' ') || 'Không xác định';
}

/**
 * Lấy bài viết thành công từ training-data-vault (Firestore)
 * Dùng để Writer học phong cách từ những bài đã duyệt
 * @param {number} [limit=5] - Số bài tối đa
 * @returns {Promise<Array>} - Mảng bài viết mẫu
 */
async function getTrainingSamples(limit = 5) {
    try {
        const snapshot = await db
            .collection('training-data-vault')
            .where('status', '==', 'approved')
            .orderBy('phuQuocRelevance', 'desc')
            .limit(limit)
            .get();

        if (snapshot.empty) return [];

        const samples = [];
        snapshot.forEach((doc) => {
            samples.push({ id: doc.id, ...doc.data() });
        });
        return samples;
    } catch (error) {
        console.error(`[helpers.getTrainingSamples] Lỗi: ${error.message}`);
        return [];
    }
}

/**
 * Kiểm tra Research data đạt chuẩn (score >= thresholds)
 * @param {Object|Array} data - Dữ liệu Researcher
 * @param {number} [minScore=8] - Ngưỡng điểm tối thiểu
 * @returns {boolean}
 */
function isQualifiedResearchData(data, minScore = 8) {
    return validateResearchData(data, minScore) !== null;
}

/**
 * Push content vào ai_content_queue (Firestore) — chờ Matrix Input duyệt
 * Dùng bởi Media Master để xuất kết quả cuối cùng
 * @param {Object} contentData - Dữ liệu content cần queue
 * @param {string} contentData.title - Tiêu đề
 * @param {string} contentData.content - Nội dung bài viết
 * @param {string} [contentData.cta] - Call-to-action
 * @param {string[]} [contentData.hashtags] - Hashtags
 * @param {Object} [contentData.visualAnalysis] - Visual analysis từ MediaMaster
 * @param {Object} [contentData.suggestions] - Visual suggestions
 * @param {Object} [contentData.logoSpec] - Logo overlay spec
 * @param {string} [contentData.status='pending_review'] - Trạng thái ban đầu
 * @returns {Promise<string|null>} - Document ID trong ai_content_queue, hoặc null nếu lỗi
 */
async function pushToContentQueue(contentData) {
    try {
        const queueCollection = 'ai_content_queue';

        const docData = {
            ...contentData,
            status: contentData.status || 'pending_review',
            created_at: FieldValue.serverTimestamp(),
            updated_at: FieldValue.serverTimestamp(),
        };

        const docRef = await db.collection(queueCollection).add(docData);

        console.log(`[helpers.pushToContentQueue] ✅ Queued: ${docRef.id}`);
        await log('content_queue', 'success', `Content queued — ${docRef.id}`, {
            contentId: docRef.id,
            title: contentData.title?.slice(0, 50) || '',
            status: docData.status,
        });

        return docRef.id;
    } catch (error) {
        console.error(`[helpers.pushToContentQueue] Lỗi: ${error.message}`);
        await log('content_queue', 'error', `Queue thất bại: ${error.message}`);
        return null;
    }
}

export {
    log,
    stripUndefined,
    safeRtdbSet,
    safeRtdbPush,
    validateResearchData,
    extractTopic,
    getTrainingSamples,
    isQualifiedResearchData,
    pushToContentQueue,
};