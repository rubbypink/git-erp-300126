import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../utils/firebase-admin.util.js';
import writerConfig from '../.9trip-agents/configs/writer.config.js';
import { writerGenerateFlow } from '../ai/flows/writer.flow.js';

/**
 * @Callable writerGenerate
 * @description Frontend gọi để kích hoạt Sub-agent Writer viết nội dung từ dữ liệu Researcher.
 * Trả kết quả qua HTTP response, đồng thời lưu log vào Firestore.
 *
 * @param {Object} data - Request data từ frontend
 * @param {string} data.researcherData - Dữ liệu JSON từ Researcher (dạng chuỗi)
 * @param {string} [data.format='social_post'] - Định dạng: social_post, blog_post, short_caption, news_summary
 * @param {string} [data.styleHint] - Ghi chú phong cách thêm
 */
export const writerGenerate = onCall(
    {
        region: 'asia-southeast1',
        timeoutSeconds: 120,
        memory: '512MiB',
        cors: ['https://erp.9tripphuquoc.com', 'erp.9tripphuquoc.com', '9tripphuquoc.com'],
        invoker: 'public',
    },
    async (request) => {
        const { researcherData, format = 'social_post', styleHint } = request.data || {};

        if (!researcherData) {
            throw new HttpsError('invalid-argument', 'Thiếu researcherData. Vui lòng truyền dữ liệu từ Researcher Agent.');
        }

        // Validate format
        if (!writerConfig.formats.includes(format)) {
            throw new HttpsError('invalid-argument', `Format "${format}" không hợp lệ. Hỗ trợ: ${writerConfig.formats.join(', ')}`);
        }

        console.log(`[Writer] Frontend gọi viết — format: ${format} | data length: ${researcherData.length}`);

        // Ghi log task vào Firestore
        const taskRef = db.collection(writerConfig.taskCollection).doc();
        await taskRef.set({
            researcherData: researcherData.substring(0, 500), // Chỉ lưu 500 ký tự đầu để tra cứu
            format,
            styleHint: styleHint || '',
            status: 'processing',
            created_at: FieldValue.serverTimestamp(),
            updated_at: FieldValue.serverTimestamp(),
        });

        try {
            // Gọi Writer Flow
            const writtenContent = await writerGenerateFlow({ researcherData, format, styleHint });

            // Cập nhật Firestore: thành công
            await taskRef.update({
                status: 'completed',
                result_data: writtenContent,
                updated_at: FieldValue.serverTimestamp(),
            });

            console.log(`[Writer] ✅ Hoàn thành task ${taskRef.id} — ${writtenContent.wordCount || '?'} từ`);
            return {
                success: true,
                taskId: taskRef.id,
                data: writtenContent,
            };
        } catch (error) {
            console.error(`[Writer ERROR] Task ${taskRef.id}:`, error);

            // Cập nhật Firestore: lỗi
            await taskRef.update({
                status: 'error',
                error_message: error.message || 'Lỗi không xác định.',
                updated_at: FieldValue.serverTimestamp(),
            });

            throw new HttpsError('internal', error.message || 'Viết nội dung thất bại, vui lòng thử lại.');
        }
    }
);
