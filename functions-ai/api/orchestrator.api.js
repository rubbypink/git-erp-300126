import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { db, rtdb } from '../utils/firebase-admin.util.js';
import { orchestratorFlow } from '../ai/flows/orchestrator.flow.js';
import { stripUndefined } from '../.9trip-agents/shared-logic/helpers.js';

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

        orchestratorFlow({
            source,
            url: url || undefined,
            keywords: keywords || undefined,
            maxItems,
            hoursBack,
            enableFacebookGroupSearch,
        }).then((result) => {
            return taskRef.update({
                status: result.status,
                result: stripUndefined(result),
                updated_at: FieldValue.serverTimestamp(),
            });
        }).catch((error) => {
            console.error(`[Orchestrator] ❌ Pipeline ${taskRef.id} failed:`, error.message);
            return taskRef.update({
                status: 'failed',
                error: error.message,
                stack: error.stack?.slice(0, 1000),
                updated_at: FieldValue.serverTimestamp(),
            });
        });

        return { success: true, taskId: taskRef.id, status: 'processing' };
    }
);

export const getRunningPipelines = onCall(
    {
        region: 'asia-southeast1',
        timeoutSeconds: 15,
        cors: ['https://erp.9tripphuquoc.com', 'erp.9tripphuquoc.com', '9tripphuquoc.com'],
        invoker: 'public',
    },
    async (request) => {
        try {
            const today = new Date().toISOString().slice(0, 10);
            const snapshot = await rtdb.ref(`agent_reports/${today}/orchestrator`).once('value');
            const data = snapshot.val() || {};
            const running = [];
            for (const [id, task] of Object.entries(data)) {
                const hasRunning = task.steps?.some((s) => s.status === 'running');
                if (hasRunning) {
                    running.push({
                        pipelineId: id,
                        status: task.status,
                        steps: task.steps,
                        results: task.results || null,
                        error: task.error || null,
                        timestamp: task.timestamp,
                        input: task.input || null,
                    });
                }
            }
            return { success: true, count: running.length, running };
        } catch (error) {
            console.warn(`[getRunningPipelines] Không thể query RTDB: ${error.message}`);
            return { success: true, count: 0, running: [], message: 'Không thể kết nối database.' };
        }
    }
);
