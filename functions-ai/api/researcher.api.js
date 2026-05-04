import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../utils/firebase-admin.util.js';
import { researcherScanRSSFlow } from '../ai/flows/researcher-rss.flow.js';

export const researcherScanRSS = onCall(
    {
        region: 'asia-southeast1',
        timeoutSeconds: 300,
        memory: '1GiB',
        cors: ['https://erp.9tripphuquoc.com', 'erp.9tripphuquoc.com', '9tripphuquoc.com'],
        invoker: 'public',
    },
    async (request) => {
        const { url, maxItems = 10, keywords, hoursBack = 24, enableFacebookGroupSearch = true } = request.data || {};

        if (url) {
            try {
                new URL(url);
            } catch (_) {
                throw new HttpsError('invalid-argument', `URL không hợp lệ: ${url}`);
            }
        }

        if (!url && (!keywords || keywords.length === 0)) {
            console.log('[Researcher] Không có URL — sẽ sử dụng auto search với keywords mặc định');
        }

        console.log(`[Researcher] Frontend gọi — url: ${url || 'N/A (auto search)'} | maxItems: ${maxItems} | hoursBack: ${hoursBack} | fbGroups: ${enableFacebookGroupSearch}`);

        const taskRef = db.collection('ai_researcher_tasks').doc();
        await taskRef.set({
            url: url || null,
            maxItems,
            keywords: keywords || null,
            hoursBack,
            enableFacebookGroupSearch,
            type: url ? 'rss_scan' : 'auto_search',
            status: 'processing',
            created_at: FieldValue.serverTimestamp(),
            updated_at: FieldValue.serverTimestamp(),
        });

        try {
            const scannedData = await researcherScanRSSFlow({
                url: url || undefined,
                maxItems,
                keywords: keywords || undefined,
                hoursBack,
                enableFacebookGroupSearch,
            });

            await taskRef.update({
                status: 'completed',
                result_data: scannedData,
                updated_at: FieldValue.serverTimestamp(),
            });

            console.log(`[Researcher] ✅ Hoàn thành task ${taskRef.id} — ${scannedData.totalItems} items`);
            return {
                success: true,
                taskId: taskRef.id,
                data: scannedData,
            };
        } catch (error) {
            console.error(`[Researcher ERROR] Task ${taskRef.id}:`, error);

            await taskRef.update({
                status: 'error',
                error_message: error.message || 'Lỗi không xác định.',
                updated_at: FieldValue.serverTimestamp(),
            });

            throw new HttpsError('internal', error.message || 'Quét RSS thất bại, vui lòng thử lại.');
        }
    }
);
