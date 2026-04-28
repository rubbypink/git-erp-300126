const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore } = require('../utils/firebase-admin.util');
const db = getFirestore();
const { hotelCrawlerFlow } = require('../ai/flows/hotel-crawler.flow');

/**
 * @Callable crawlerDataOnline
 * @description Frontend gọi trực tiếp để kích hoạt cào dữ liệu khách sạn.
 * Kết quả trả về ngay qua HTTP response, đồng thời lưu log vào Firestore để tra cứu.
 *
 * @param {Object} data - Request data từ frontend
 * @param {string} data.url - URL trang khách sạn cần cào
 * @param {string} [data.type='hotel'] - Loại dữ liệu cần cào (mở rộng sau: tour, service...)
 * @param {string} [data.supplier_name] - Tên nhà cung cấp (tùy chọn, để gán metadata)
 */
exports.crawlerDataOnline = onCall(
    {
        region: 'asia-southeast1',
        timeoutSeconds: 300,
        memory: '1GiB',
        cors: true,
    },
    async (request) => {
        const { url, type = 'hotel', supplier_name } = request.data || {};

        if (!url) {
            throw new HttpsError('invalid-argument', 'Thiếu URL. Vui lòng truyền vào { url: "..." }.');
        }

        console.log(`[Crawler] Frontend gọi trực tiếp — URL: ${url} | Type: ${type}`);

        // Ghi log task vào Firestore để tracking (không block response)
        const taskRef = db.collection('ai_crawler_tasks').doc();
        if (!taskRef) {
            console.error('[Crawler] Không thể tạo document mới trong Firestore.');
            throw new HttpsError('internal', 'Lỗi hệ thống, vui lòng thử lại sau.');
        }
        await taskRef.set({
            url,
            type,
            supplier_name: supplier_name || '',
            status: 'processing',
            created_at: db.FieldValue.serverTimestamp(),
            updated_at: db.FieldValue.serverTimestamp(),
        });

        try {
            // Gọi Flow AI — chọn flow theo type (mở rộng sau)
            let extractedData;
            if (type === 'hotel') {
                extractedData = await hotelCrawlerFlow({ url });
            } else {
                throw new HttpsError('invalid-argument', `Loại cào "${type}" chưa được hỗ trợ.`);
            }

            // Cập nhật Firestore: thành công
            await taskRef.update({
                status: 'completed',
                result_data: extractedData,
                updated_at: db.FieldValue.serverTimestamp(),
            });

            console.log(`[Crawler] Hoàn thành task ${taskRef.id}`);
            return {
                success: true,
                taskId: taskRef.id,
                data: extractedData,
            };
        } catch (error) {
            console.error(`[Crawler ERROR] Task ${taskRef.id}:`, error);

            // Cập nhật Firestore: lỗi
            await taskRef.update({
                status: 'error',
                error_message: error.message || 'Lỗi không xác định.',
                updated_at: db.FieldValue.serverTimestamp(),
            });

            throw new HttpsError('internal', error.message || 'Cào dữ liệu thất bại, vui lòng thử lại.');
        }
    }
);
