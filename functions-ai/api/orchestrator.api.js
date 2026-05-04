import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../utils/firebase-admin.util.js';
import { orchestratorFlow } from '../ai/flows/orchestrator.flow.js';

export const runPipeline = onCall(
    {
        region: 'asia-southeast1',
        timeoutSeconds: 540,
        memory: '2GiB',
        cors: ['https://erp.9tripphuquoc.com', 'erp.9tripphuquoc.com', '9tripphuquoc.com'],
        invoker: 'public',
    },
    async (request) => {
        const { source = 'auto_search', url, keywords, maxItems = 10, hoursBack = 24, enableFacebookGroupSearch = true } = request.data || {};

        if (source === 'rss' && !url) {
            throw new HttpsError('invalid-argument', 'source=rss yêu cầu URL RSS.');
        }

        if (url) {
            try {
                new URL(url);
            } catch (_) {
                throw new HttpsError('invalid-argument', 'URL không hợp lệ.');
            }
        }

        console.log(`[Orchestrator] 🚀 Pipeline gọi từ frontend — source: ${source}`);

        const taskRef = db.collection('ai_pipeline_tasks').doc();
        await taskRef.set({
            source,
            url: url || null,
            keywords: keywords || null,
            maxItems,
            hoursBack,
            enableFacebookGroupSearch,
            status: 'processing',
            created_at: FieldValue.serverTimestamp(),
        });

        try {
            const result = await orchestratorFlow({
                source,
                url: url || undefined,
                keywords: keywords || undefined,
                maxItems,
                hoursBack,
                enableFacebookGroupSearch,
            });

            await taskRef.update({
                status: result.status,
                result,
                updated_at: FieldValue.serverTimestamp(),
            });

            return { success: true, taskId: taskRef.id, data: result };
        } catch (error) {
            console.error(`[Orchestrator] ❌ Pipeline crash:`, error);
            await taskRef.update({
                status: 'failed',
                error: error.message,
                stack: error.stack,
                updated_at: FieldValue.serverTimestamp(),
            });

            return {
                success: false,
                taskId: taskRef.id,
                error: error.message,
                data: null,
            };
        }
    }
);
