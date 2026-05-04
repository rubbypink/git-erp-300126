import { z } from 'genkit';

const ResearcherItemSchema = z.object({
  title: z.string().describe('Tiêu đề bài viết'),
  link: z.string().describe('Link gốc bài viết'),
  pubDate: z.string().describe('Ngày đăng'),
  summary: z.string().describe('Tóm tắt 2-3 câu'),
  category: z.string().describe('Phân loại'),
  sentiment: z.string().describe('Cảm sắc'),
  phuQuocRelevance: z.number().min(0).max(10).describe('Mức độ liên quan Phú Quốc'),
});

const ScoredItemSchema = ResearcherItemSchema.extend({
  scores: z.object({
    freshness: z.number().min(0).max(10),
    trend: z.number().min(0).max(10),
    businessRelevance: z.number().min(0).max(10),
    seasonFit: z.number().min(0).max(10),
    total: z.number().min(0).max(10),
  }),
  shouldProcess: z.boolean(),
});

const MatchedProductSchema = z.object({
  type: z.string().describe('Loại: tour | hotel | service'),
  id: z.string(),
  name: z.string(),
  price: z.number().nullable(),
  matchReason: z.string(),
});

const EnrichedItemSchema = ScoredItemSchema.extend({
  matchedProducts: z.array(MatchedProductSchema),
  enrichmentContext: z.string(),
});

const PlanSchema = z.object({
  angle: z.string(),
  target: z.string(),
  mediaType: z.string(),
  format: z.string(),
  suggestedTitle: z.string(),
  suggestedCTA: z.string(),
});

const WriterOutputSchema = z.object({
  title: z.string(),
  content: z.string(),
  cta: z.string(),
  format: z.string(),
  wordCount: z.number(),
  hashtags: z.array(z.string()),
});

const ContentQueueSchema = z.object({
  contentId: z.string(),
  writerContent: z.object({
    title: z.string(),
    content: z.string(),
    cta: z.string(),
    hashtags: z.array(z.string()),
    format: z.string(),
  }),
  sourceTopic: z.string().nullable(),
  angle: z.string(),
  target: z.string(),
  mediaType: z.string(),
  mediaResult: z.any(),
  logoSpec: z.any(),
  platformOptimized: z.array(z.string()),
  matchedProducts: z.array(MatchedProductSchema),
  status: z.string(),
  review: z.any().optional(),
  publish_results: z.any().optional(),
  created_at: z.any().optional(),
  updated_at: z.any().optional(),
  published_at: z.any().optional(),
});

const PublisherOutputSchema = z.object({
  contentId: z.string(),
  status: z.string(),
  results: z.record(z.object({
    success: z.boolean(),
    postId: z.string().optional(),
    platform: z.string().optional(),
    error: z.string().optional(),
  })).optional(),
});

const FilterDedupSchema = z.object({
  kept: z.array(ScoredItemSchema),
  removed: z.array(ScoredItemSchema.extend({
    filterReason: z.string(),
  })),
  summary: z.object({
    total: z.number(),
    kept: z.number(),
    removed: z.number(),
    reasons: z.record(z.number()),
  }),
});

const AnalyticsOutputSchema = z.object({
  analyzed: z.number(),
  updated: z.number(),
  adjustments: z.array(z.object({
    contentId: z.string(),
    oldScore: z.number(),
    newScore: z.number(),
    engagement: z.string(),
  })),
  summary: z.object({
    highEngagement: z.number(),
    mediumEngagement: z.number(),
    lowEngagement: z.number(),
    noData: z.number(),
  }),
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

export {
  ResearcherItemSchema,
  ScoredItemSchema,
  MatchedProductSchema,
  EnrichedItemSchema,
  PlanSchema,
  WriterOutputSchema,
  ContentQueueSchema,
  PublisherOutputSchema,
  FilterDedupSchema,
  AnalyticsOutputSchema,
  PipelineStepSchema,
  OrchestratorOutputSchema,
};
