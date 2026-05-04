import { ai } from '../genkit-init.js';
import { z } from 'genkit';
import { rtdb } from '../../utils/firebase-admin.util.js';
import { safeRtdbSet } from '../../.9trip-agents/shared-logic/helpers.js';
import researcherConfig from '../../.9trip-agents/configs/researcher.config.js';

import { researcherScanRSSFlow } from './researcher-rss.flow.js';
import { scoringFlow } from './scoring.flow.js';
import { filterDedupFlow } from './filter-dedup.flow.js';
import { enrichmentFlow } from './enrichment.flow.js';
import { plannerFlow } from './planner.flow.js';
import { writerGenerateFlow } from './writer.flow.js';
import { mediaMasterFlow } from './media-master.flow.js';

const OrchestratorInputSchema = z.object({
    source: z.enum(['rss', 'auto_search']).default('auto_search').describe('Nguồn dữ liệu'),
    url: z.string().optional().describe('URL RSS (nếu source=rss)'),
    keywords: z.array(z.string()).optional().describe('Từ khóa (nếu source=auto_search)'),
    maxItems: z.number().min(1).max(50).default(10),
    hoursBack: z.number().min(1).max(168).default(24),
    enableFacebookGroupSearch: z.boolean().default(true),
});

const PipelineStepSchema = z.object({
    name: z.string(),
    status: z.enum(['pending', 'running', 'completed', 'failed']),
    duration: z.number().optional(),
    error: z.string().optional(),
});

const OrchestratorOutputSchema = z.object({
    pipelineId: z.string(),
    status: z.enum(['completed', 'partial', 'failed']),
    steps: z.array(PipelineStepSchema),
    results: z.object({
        totalResearched: z.number(),
        scored: z.number(),
        kept: z.number(),
        enriched: z.number(),
        planned: z.number(),
        written: z.number(),
        mediaQueued: z.number(),
    }),
    contentIds: z.array(z.string()),
    error: z.string().optional(),
});

const orchestratorFlow = ai.defineFlow(
    {
        name: 'orchestrator',
        inputSchema: OrchestratorInputSchema,
        outputSchema: OrchestratorOutputSchema,
    },
    async (input) => {
        const pipelineId = `pipeline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const steps = [];
        const today = new Date().toISOString().slice(0, 10);
        const log = (name, status, extra = {}) => {
            const entry = { name, status, ...extra };
            steps.push(entry);
            return entry;
        };

        const safeInput = {
            source: input.source === 'rss' ? 'rss' : 'auto_search',
            url: (input.source === 'rss' && input.url && typeof input.url === 'string') ? input.url : undefined,
            keywords: (Array.isArray(input.keywords) && input.keywords.length > 0) ? input.keywords : undefined,
            maxItems: Number.isFinite(input.maxItems) ? Math.min(50, Math.max(1, Math.floor(input.maxItems))) : 10,
            hoursBack: Number.isFinite(input.hoursBack) ? Math.min(168, Math.max(1, Math.floor(input.hoursBack))) : 24,
            enableFacebookGroupSearch: input.enableFacebookGroupSearch !== false,
        };

        const results = { totalResearched: 0, scored: 0, kept: 0, enriched: 0, planned: 0, written: 0, mediaQueued: 0 };
        const contentIds = [];

        console.log(`[Orchestrator] 🚀 Pipeline ${pipelineId} bắt đầu — source: ${safeInput.source}${safeInput.keywords ? ' | keywords: ' + safeInput.keywords.length : ''}`);

        try {
            const step1 = log('researcher', 'running');
            const start1 = Date.now();

            let researcherData;
            if (safeInput.source === 'rss' && safeInput.url) {
                researcherData = await researcherScanRSSFlow({
                    url: safeInput.url,
                    maxItems: safeInput.maxItems,
                    hoursBack: safeInput.hoursBack,
                    enableFacebookGroupSearch: safeInput.enableFacebookGroupSearch,
                });
            } else {
                const effectiveKeywords = safeInput.keywords || researcherConfig.autoSearchDefaultKeywords;
                researcherData = await researcherScanRSSFlow({
                    maxItems: safeInput.maxItems,
                    keywords: effectiveKeywords,
                    hoursBack: safeInput.hoursBack,
                    enableFacebookGroupSearch: safeInput.enableFacebookGroupSearch,
                });
            }

            step1.status = 'completed';
            step1.duration = Date.now() - start1;
            results.totalResearched = researcherData.totalItems || 0;
            console.log(`[Orchestrator] ✅ Step 1 — Researcher: ${results.totalResearched} items`);

            const rawItems = (researcherData.items || []).map((item) => ({
                title: item.title,
                link: item.link,
                pubDate: item.pubDate,
                summary: item.summary,
                category: item.category,
                sentiment: item.sentiment,
                phuQuocRelevance: item.phuQuocRelevance,
            }));

            if (rawItems.length === 0) {
                console.warn(`[Orchestrator] ⚠️ Researcher returned 0 items — dừng pipeline, trả về partial`);
                step1.status = 'completed';
                step1.duration = Date.now() - start1;
                step1.message = 'No items found';

                await safeRtdbSet(rtdb.ref(`agent_reports/${today}/orchestrator/${pipelineId}`), {
                    status: 'partial',
                    error: 'Researcher returned 0 items',
                    researcherOutput: {
                        sourceName: researcherData?.sourceName,
                        totalItems: researcherData?.totalItems,
                        trendingTopics: researcherData?.trendingTopics,
                    },
                    input: { source: safeInput.source, url: safeInput.url || null, keywords: safeInput.keywords || null, maxItems: safeInput.maxItems, hoursBack: safeInput.hoursBack, enableFacebookGroupSearch: safeInput.enableFacebookGroupSearch },
                    steps: steps.map((s) => ({ name: s.name, status: s.status, duration: s.duration })),
                    timestamp: Date.now(),
                });

                return { pipelineId, status: 'partial', steps, results, contentIds: [], error: 'Không tìm thấy dữ liệu đầu vào.' };
            }

            const step2 = log('scoring', 'running');
            const start2 = Date.now();
            const scored = await scoringFlow({ items: rawItems });
            step2.status = 'completed';
            step2.duration = Date.now() - start2;
            results.scored = scored.summary.totalScored;
            console.log(`[Orchestrator] ✅ Step 2 — Scoring: ${scored.summary.shouldProcess} processable`);

            const step3 = log('filter_dedup', 'running');
            const start3 = Date.now();
            const filtered = await filterDedupFlow({ items: scored.scoredItems });
            step3.status = 'completed';
            step3.duration = Date.now() - start3;
            results.kept = filtered.summary.kept;
            console.log(`[Orchestrator] ✅ Step 3 — Filter: ${filtered.summary.kept} kept, ${filtered.summary.removed} removed`);

            if (filtered.kept.length === 0) {
                console.warn(`[Orchestrator] ⚠️ Tất cả items bị filter hết — trả về partial`);
                step3.status = 'completed';
                step3.duration = Date.now() - start3;
                step3.message = 'All items filtered/deduped';

                await safeRtdbSet(rtdb.ref(`agent_reports/${today}/orchestrator/${pipelineId}`), {
                    status: 'partial',
                    error: 'All items filtered out',
                    input: { source: safeInput.source, url: safeInput.url || null, keywords: safeInput.keywords || null, maxItems: safeInput.maxItems, hoursBack: safeInput.hoursBack, enableFacebookGroupSearch: safeInput.enableFacebookGroupSearch },
                    filterSummary: filtered.summary,
                    steps: steps.map((s) => ({ name: s.name, status: s.status, duration: s.duration })),
                    results,
                    timestamp: Date.now(),
                });

                return { pipelineId, status: 'partial', steps, results, contentIds: [], error: 'Tất cả nội dung đã bị lọc (trùng lặp/không liên quan).' };
            }

            const step4 = log('enrichment', 'running');
            const start4 = Date.now();
            const enriched = await enrichmentFlow({ items: filtered.kept });
            step4.status = 'completed';
            step4.duration = Date.now() - start4;
            results.enriched = enriched.summary.enriched;
            console.log(`[Orchestrator] ✅ Step 4 — Enrichment: ${enriched.summary.enriched} enriched`);

            const step5 = log('planner', 'running');
            const start5 = Date.now();
            const plans = [];
            for (const item of enriched.enrichedItems) {
                const plan = await plannerFlow({ item });
                plans.push({ item, plan });
            }
            step5.status = 'completed';
            step5.duration = Date.now() - start5;
            results.planned = plans.length;
            console.log(`[Orchestrator] ✅ Step 5 — Planner: ${plans.length} plans`);

            const step6 = log('writer', 'running');
            const start6 = Date.now();
            const writtenItems = [];
            for (const { item, plan } of plans) {
                try {
                    const writerInput = {
                        researcherData: JSON.stringify({
                            title: item.title,
                            summary: item.summary,
                            category: item.category,
                            phuQuocRelevance: item.phuQuocRelevance,
                            enrichmentContext: item.enrichmentContext,
                            matchedProducts: item.matchedProducts || [],
                        }),
                        format: plan.format,
                        styleHint: `Viết theo angle: ${plan.angle}, target: ${plan.target}`,
                    };
                    const written = await writerGenerateFlow(writerInput);
                    writtenItems.push({ ...written, plan, enrichmentItem: item });
                } catch (e) {
                    console.warn(`[Orchestrator] Writer failed for "${item.title.slice(0, 40)}": ${e.message}`);
                }
            }
            step6.status = 'completed';
            step6.duration = Date.now() - start6;
            results.written = writtenItems.length;
            console.log(`[Orchestrator] ✅ Step 6 — Writer: ${writtenItems.length} written`);

            const step7 = log('media_master', 'running');
            const start7 = Date.now();
            for (const wi of writtenItems) {
                try {
                    const mediaResult = await mediaMasterFlow({
                        title: wi.title,
                        content: wi.content,
                        cta: wi.cta || '',
                        hashtags: wi.hashtags || [],
                        format: wi.format,
                        sourceTopic: wi.enrichmentItem?.title || '',
                        angle: wi.plan?.angle || 'kinh_nghiem',
                        target: wi.plan?.target || 'family',
                        mediaType: wi.plan?.mediaType || 'image',
                        matchedProducts: wi.enrichmentItem?.matchedProducts || [],
                    });
                    contentIds.push(mediaResult.contentId);
                } catch (e) {
                    console.warn(`[Orchestrator] MediaMaster failed for "${wi.title.slice(0, 40)}": ${e.message}`);
                }
            }
            step7.status = 'completed';
            step7.duration = Date.now() - start7;
            results.mediaQueued = contentIds.length;
            console.log(`[Orchestrator] ✅ Step 7 — Media: ${contentIds.length} queued`);

            await safeRtdbSet(rtdb.ref(`agent_reports/${today}/orchestrator/${pipelineId}`), {
                status: 'completed',
                results,
                contentIds,
                input: { source: safeInput.source, url: safeInput.url || null, keywords: safeInput.keywords || null, maxItems: safeInput.maxItems, hoursBack: safeInput.hoursBack, enableFacebookGroupSearch: safeInput.enableFacebookGroupSearch },
                details: {
                    rawItems: rawItems.length,
                    scoredItems: scored.scoredItems.length,
                    keptItems: filtered.kept.length,
                    enrichedItems: enriched.enrichedItems.length,
                    plans: plans.length,
                    writtenItems: writtenItems.length,
                    mediaQueued: contentIds.length,
                },
                steps: steps.map((s) => ({ name: s.name, status: s.status, duration: s.duration })),
                timestamp: Date.now(),
            });

            return {
                pipelineId,
                status: contentIds.length > 0 ? 'completed' : 'partial',
                steps,
                results,
                contentIds,
            };
        } catch (error) {
            console.error(`[Orchestrator] ❌ Pipeline ${pipelineId} failed:`, error.message);

            await safeRtdbSet(rtdb.ref(`agent_reports/${today}/orchestrator/${pipelineId}`), {
                status: 'failed',
                error: error.message,
                stack: error.stack?.slice(0, 1000),
                input: { source: safeInput.source, url: safeInput.url || null, keywords: safeInput.keywords || null, maxItems: safeInput.maxItems, hoursBack: safeInput.hoursBack, enableFacebookGroupSearch: safeInput.enableFacebookGroupSearch },
                results,
                steps: steps.map((s) => ({ name: s.name, status: s.status, duration: s.duration })),
                timestamp: Date.now(),
            });

            const lastCompleted = steps.filter((s) => s.status === 'completed').length;
            return {
                pipelineId,
                status: lastCompleted > 0 ? 'partial' : 'failed',
                steps,
                results,
                contentIds,
                error: error.message,
            };
        }
    }
);

export { orchestratorFlow, OrchestratorInputSchema, OrchestratorOutputSchema };
