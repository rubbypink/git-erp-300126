import { ai } from '../genkit-init.js';
import { z } from 'genkit';
import { FieldValue } from 'firebase-admin/firestore';
import { db, rtdb } from '../../utils/firebase-admin.util.js';
import analyticsConfig from '../../.9trip-agents/configs/analytics.config.js';
import publisherConfig from '../../.9trip-agents/configs/publisher.config.js';
import axios from 'axios';

const AnalyticsInputSchema = z.object({
  lookbackDays: z.number().default(7),
  dryRun: z.boolean().default(true),
});

const AnalyticsOutputSchema = z.object({
  analyzed: z.number(),
  updated: z.number(),
  adjustments: z.array(
    z.object({
      contentId: z.string(),
      oldScore: z.number(),
      newScore: z.number(),
      engagement: z.string(),
    })
  ),
  summary: z.object({
    highEngagement: z.number(),
    mediumEngagement: z.number(),
    lowEngagement: z.number(),
    noData: z.number(),
  }),
});

async function getFacebookEngagement(postId) {
  try {
    const fbConfig = publisherConfig.platforms.facebook;
    const pageId = process.env[fbConfig.pageIdEnv];
    const token = process.env[fbConfig.pageAccessTokenEnv];
    if (!pageId || !token) return null;
    const response = await axios.get(`${fbConfig.graphBaseUrl}/${fbConfig.graphVersion}/${pageId}_${postId}`, { params: { fields: 'reactions.limit(0).summary(true),comments.limit(0).summary(true),shares', access_token: token }, timeout: 10000 });
    const data = response.data;
    return {
      reach: (data.reactions?.summary?.total_count || 0) * 5,
      likes: data.reactions?.summary?.total_count || 0,
      comments: data.comments?.summary?.total_count || 0,
      shares: data.shares?.count || 0,
    };
  } catch (e) {
    console.warn(`[Analytics] FB engagement fetch failed: ${e.message}`);
    return null;
  }
}

function classifyEngagement(engagement) {
  if (!engagement) return 'noData';
  const h = analyticsConfig.engagementThresholds.high;
  const m = analyticsConfig.engagementThresholds.medium;
  if (engagement.reach >= h.minReach || engagement.likes >= h.minLikes) return 'high';
  if (engagement.reach >= m.minReach || engagement.likes >= m.minLikes) return 'medium';
  return 'low';
}

function calculateAdjustment(level) {
  return analyticsConfig.scoringAdjustment[`${level}Engagement`] || 0;
}

const analyticsFlow = ai.defineFlow(
  {
    name: 'analyticsAgent',
    inputSchema: AnalyticsInputSchema,
    outputSchema: AnalyticsOutputSchema,
  },
  async (input) => {
    const { lookbackDays, dryRun } = input;
    const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
    const today = new Date().toISOString().slice(0, 10);

    console.log(`[Analytics] 📊 Phân tích ${lookbackDays} ngày gần nhất (dryRun: ${dryRun})`);

    const snapshot = await db.collection(analyticsConfig.collections.publishLogs).where('published_at', '>=', since).where('status', '==', 'published').orderBy('published_at', 'desc').get();

    const adjustments = [];
    const counts = { highEngagement: 0, mediumEngagement: 0, lowEngagement: 0, noData: 0 };
    let updated = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const resultsMap = data.results || {};
      let engagement = null;

      if (resultsMap.facebook?.postId) {
        engagement = await getFacebookEngagement(resultsMap.facebook.postId);
      }

      const level = classifyEngagement(engagement);
      counts[`${level}Engagement`]++;

      if (level !== 'noData' && !dryRun) {
        const adjustment = calculateAdjustment(level);
        const vaultRef = db.collection(analyticsConfig.collections.trainingVault);
        const vaultSnapshot = await vaultRef.where('contentId', '==', doc.id).limit(1).get();

        if (!vaultSnapshot.empty) {
          const vaultDoc = vaultSnapshot.docs[0];
          const oldScore = vaultDoc.data().phuQuocRelevance || 0;
          const newScore = Math.min(Math.max(oldScore + adjustment, 0), 10);
          await vaultDoc.ref.update({
            phuQuocRelevance: newScore,
            analytics_engagement: level,
            analytics_updated_at: FieldValue.serverTimestamp(),
          });
          adjustments.push({
            contentId: doc.id,
            oldScore,
            newScore,
            engagement: level,
          });
          updated++;
        } else {
          await vaultRef.add({
            contentId: doc.id,
            title: data.title || '',
            phuQuocRelevance: 5 + (calculateAdjustment(level) > 0 ? 2 : -1),
            source: 'analytics_agent',
            status: 'auto_logged',
            analytics_engagement: level,
            created_at: FieldValue.serverTimestamp(),
          });
          updated++;
        }
      }
    }

    await rtdb.ref(`agent_reports/${today}/analytics`).set({
      analyzed: snapshot.size,
      updated,
      counts,
      dryRun,
      timestamp: Date.now(),
    });

    console.log(`[Analytics] ✅ Analyzed: ${snapshot.size} | Updated: ${updated} | H:${counts.highEngagement} M:${counts.mediumEngagement} L:${counts.lowEngagement}`);

    return {
      analyzed: snapshot.size,
      updated,
      adjustments,
      summary: counts,
    };
  }
);

export { analyticsFlow, AnalyticsInputSchema, AnalyticsOutputSchema };
