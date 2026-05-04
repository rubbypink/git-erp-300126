import { ai } from '../genkit-init.js';
import { z } from 'genkit';
import { FieldValue } from 'firebase-admin/firestore';
import AiManager from '../ai.manager.js';
import { db, rtdb } from '../../utils/firebase-admin.util.js';
import { safeRtdbPush } from '../../.9trip-agents/shared-logic/helpers.js';
import mediaMasterConfig from '../../.9trip-agents/configs/media-master.config.js';
import { processImage, determineFormat } from '../services/image-processor.service.js';
import { buildVideoSpec, suggestTrimPoints } from '../services/video-processor.service.js';

const mediaMaster = new AiManager({
  modelName: mediaMasterConfig.model,
  apiKey: process.env[mediaMasterConfig.apiKeyEnv],
});

const MediaMasterInputSchema = z.object({
  title: z.string(),
  content: z.string(),
  cta: z.string().optional().default(''),
  hashtags: z.array(z.string()).optional().default([]),
  format: z.string().default('social_post'),
  sourceTopic: z.string().optional().default(''),
  angle: z.string().optional().default('kinh_nghiem'),
  target: z.string().optional().default('family'),
  mediaType: z.string().optional().default('image'),
  matchedProducts: z
    .array(
      z.object({
        type: z.string(),
        id: z.string(),
        name: z.string(),
        price: z.number().nullable(),
      })
    )
    .optional()
    .default([]),
});

const MediaOutputSchema = z.object({
  contentId: z.string(),
  mediaType: z.string(),
  mediaResult: z.any(),
  logoSpec: z.any(),
  platformOptimized: z.array(z.string()),
  status: z.string(),
});

const mediaMasterFlow = ai.defineFlow(
  {
    name: 'mediaMaster',
    inputSchema: MediaMasterInputSchema,
    outputSchema: MediaOutputSchema,
  },
  async (input) => {
    const { title, content, cta, hashtags, format, sourceTopic, angle, target, mediaType, matchedProducts } = input;
    const today = new Date().toISOString().slice(0, 10);

    console.log(`[MediaMaster] 🎬 mediaType=${mediaType} | angle=${angle} | target=${target} | format=${format}`);

    let mediaResult;
    let platformOptimized = [];

    if (mediaType === 'video') {
      const trim = suggestTrimPoints(sourceTopic || angle);
      mediaResult = buildVideoSpec(content, {
        trimStart: trim.start,
        trimDuration: trim.duration,
        title: title.slice(0, 40),
      });
      platformOptimized = ['TikTok', 'Instagram Reels', 'Facebook Reels'];
    } else {
      const imageFormat = determineFormat(format);
      const imageTitle = title.length > 40 ? title.slice(0, 37) + '...' : title;
      mediaResult = await processImage(null, imageTitle, { format: imageFormat });
      platformOptimized = imageFormat === '1:1' ? ['Facebook', 'Instagram'] : imageFormat === '9:16' ? ['TikTok', 'Instagram Reels', 'Story'] : imageFormat === '4:5' ? ['Instagram Portrait'] : ['Facebook', 'YouTube'];
    }

    const logoSettings = {
      url: mediaMasterConfig.logo.url,
      position: mediaMasterConfig.logo.position,
      opacity: mediaMasterConfig.logo.opacity,
      maxWidthPercent: mediaMasterConfig.logo.maxWidthPercent,
    };

    const queueRef = db.collection(mediaMasterConfig.contentQueueCollection).doc();
    const queueData = {
      writerContent: { title, content, cta, hashtags, format },
      sourceTopic: sourceTopic || null,
      angle,
      target,
      mediaType,
      mediaResult,
      logoSpec: logoSettings,
      platformOptimized,
      matchedProducts,
      status: 'pending_review',
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    };

    await queueRef.set(queueData);

    await safeRtdbPush(rtdb.ref(`agent_reports/${today}/media_master`), {
      level: 'success',
      message: `[${mediaType}] Content queued: ${queueRef.id}`,
      timestamp: Date.now(),
      metadata: {
        contentId: queueRef.id,
        mediaType,
        angle,
        target,
        title: title.slice(0, 60),
        platforms: platformOptimized,
      },
    });

    console.log(`[MediaMaster] ✅ Queued: ${queueRef.id} | ${mediaType} | platforms: ${platformOptimized.join(', ')}`);

    return {
      contentId: queueRef.id,
      mediaType,
      mediaResult,
      logoSpec: logoSettings,
      platformOptimized,
      status: 'pending_review',
    };
  }
);

export { mediaMaster, mediaMasterFlow, MediaMasterInputSchema, MediaOutputSchema };
