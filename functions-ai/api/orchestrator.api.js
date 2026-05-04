import { onCall } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { db, rtdb } from '../utils/firebase-admin.util.js';
import { orchestratorFlow } from '../ai/flows/orchestrator.flow.js';
import { stripUndefined } from '../.9trip-agents/shared-logic/helpers.js';

const CLAMP_MAX_ITEMS = { min: 1, max: 50, default: 10 };
const CLAMP_HOURS_BACK = { min: 1, max: 168, default: 24 };

/**
 * Sanitize toàn bộ tham số đầu vào — đảm bảo không bao giờ có INVALID ARGUMENT
 * Tất cả các trường đều có giá trị an toàn hoặc undefined (để flow tự dùng default)
 */
function sanitizePipelineInput(raw = {}) {
    const source = raw.source === 'rss' ? 'rss' : 'auto_search';

    const url = (source === 'rss' && raw.url && typeof raw.url === 'string')
        ? (() => { try { new URL(raw.url); return raw.url; } catch (_) { return undefined; } })()
        : undefined;

    const keywords = Array.isArray(raw.keywords) && raw.keywords.length > 0
        ? raw.keywords.filter(k => typeof k === 'string' && k.trim()).map(k => k.trim())
        : undefined;

    const maxItems = Number.isFinite(raw.maxItems)
        ? Math.min(CLAMP_MAX_ITEMS.max, Math.max(CLAMP_MAX_ITEMS.min, Math.floor(raw.maxItems)))
        : CLAMP_MAX_ITEMS.default;

    const hoursBack = Number.isFinite(raw.hoursBack)
        ? Math.min(CLAMP_HOURS_BACK.max, Math.max(CLAMP_HOURS_BACK.min, Math.floor(raw.hoursBack)))
        : CLAMP_HOURS_BACK.default;

    const enableFacebookGroupSearch = raw.enableFacebookGroupSearch !== false;

    return { source, url, keywords, maxItems, hoursBack, enableFacebookGroupSearch };
}

/**
 * Cập nhật Firestore task doc an toàn — luôn thử ít nhất 2 lần
 * Đảm bảo tiến trình pipeline LUÔN được ghi vào database
 */
async function safelyUpdateTask(taskRef, data) {
    try {
        await taskRef.update(stripUndefined({ ...data, updated_at: FieldValue.serverTimestamp() }));
        console.log(`[Orchestrator] ✅ Task ${taskRef.id} updated — status: ${data.status}`);
    } catch (err) {
        console.error(`[Orchestrator] ❌ Update task ${taskRef.id} failed (attempt 1): ${err.message}`);
        try {
            await taskRef.update({
                status: data.status || 'failed',
                error: err.message,
                updated_at: FieldValue.serverTimestamp(),
            });
            console.log(`[Orchestrator] ✅ Task ${taskRef.id} updated on retry`);
        } catch (finalErr) {
            console.error(`[Orchestrator] ❌ FATAL — Cannot update task ${taskRef.id}: ${finalErr.message}`);
        }
    }
}

export const runPipeline = onCall(
    {
        region: 'asia-southeast1',
        timeoutSeconds: 540,
        memory: '2GiB',
        cors: ['https://erp.9tripphuquoc.com', 'erp.9tripphuquoc.com', '9tripphuquoc.com'],
        invoker: 'public',
    },
    async (request) => {
        const safeInput = sanitizePipelineInput(request.data || {});

        console.log(`[Orchestrator] 🚀 Pipeline gọi từ frontend — source: ${safeInput.source}${safeInput.keywords ? ` | keywords: ${safeInput.keywords.length}` : ''}`);

        const taskRef = db.collection('ai_pipeline_tasks').doc();
        await taskRef.set({
            source: safeInput.source,
            url: safeInput.url || null,
            keywords: safeInput.keywords || null,
            maxItems: safeInput.maxItems,
            hoursBack: safeInput.hoursBack,
            enableFacebookGroupSearch: safeInput.enableFacebookGroupSearch,
            status: 'processing',
            created_at: FieldValue.serverTimestamp(),
        });

        orchestratorFlow({
            source: safeInput.source,
            url: safeInput.url,
            keywords: safeInput.keywords,
            maxItems: safeInput.maxItems,
            hoursBack: safeInput.hoursBack,
            enableFacebookGroupSearch: safeInput.enableFacebookGroupSearch,
        }).then((result) => {
            return safelyUpdateTask(taskRef, {
                status: result.status,
                result: stripUndefined(result),
            });
        }).catch((error) => {
            console.error(`[Orchestrator] ❌ Pipeline ${taskRef.id} failed:`, error.message);
            return safelyUpdateTask(taskRef, {
                status: 'failed',
                error: error.message,
                stack: error.stack?.slice(0, 1000),
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
