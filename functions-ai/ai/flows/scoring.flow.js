import { ai } from '../genkit-init.js';
import { z } from 'genkit';
import scoringConfig from '../../.9trip-agents/configs/scoring.config.js';

const ScoringInputSchema = z.object({
  items: z
    .array(
      z.object({
        title: z.string(),
        link: z.string(),
        pubDate: z.string(),
        summary: z.string(),
        category: z.string(),
        sentiment: z.string(),
        phuQuocRelevance: z.number().min(0).max(10),
      })
    )
    .describe('Danh sách items từ Researcher'),
});

const ScoredItemSchema = z.object({
  title: z.string(),
  link: z.string(),
  pubDate: z.string(),
  summary: z.string(),
  category: z.string(),
  sentiment: z.string(),
  phuQuocRelevance: z.number(),
  scores: z.object({
    freshness: z.number().min(0).max(10),
    trend: z.number().min(0).max(10),
    businessRelevance: z.number().min(0).max(10),
    seasonFit: z.number().min(0).max(10),
    total: z.number().min(0).max(10),
  }),
  shouldProcess: z.boolean(),
});

const ScoringOutputSchema = z.object({
  scoredItems: z.array(ScoredItemSchema),
  summary: z.object({
    totalScored: z.number(),
    shouldProcess: z.number(),
    highValue: z.number(),
    averageScore: z.number(),
  }),
});

function scoreFreshness(pubDate, hoursBack) {
  if (!pubDate) return 0;
  const pub = new Date(pubDate);
  if (isNaN(pub.getTime())) return 3;
  const now = new Date();
  const diffHours = (now - pub) / (1000 * 60 * 60);
  const thresholds = scoringConfig.dimensions.freshness.thresholds;
  for (const t of thresholds) {
    if (t.maxHours === null || diffHours <= t.maxHours) return t.score;
  }
  return 0;
}

function scoreTrend(title, summary) {
  const text = `${title} ${summary}`.toLowerCase();
  const phrases = scoringConfig.dimensions.trend.priorityPhrases;
  let score = 0;
  for (const phrase of phrases) {
    if (text.includes(phrase.toLowerCase())) score += 2;
  }
  return Math.min(score, 10);
}

function scoreBusinessRelevance(category, title, summary) {
  const text = `${title} ${summary}`.toLowerCase();
  const categories = scoringConfig.dimensions.businessRelevance.productCategories;
  let score = category && categories.includes(category) ? 5 : 2;
  const boosts = scoringConfig.dimensions.businessRelevance.boostKeywords;
  for (const kw of boosts) {
    if (text.includes(kw.toLowerCase())) score += 2;
  }
  return Math.min(score, 10);
}

function scoreSeasonFit(pubDate) {
  if (!pubDate) return 5;
  const d = new Date(pubDate);
  if (isNaN(d.getTime())) return 5;
  const mmdd = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  let seasonKey = null;
  for (const [range, config] of Object.entries(scoringConfig.dimensions.seasonFit.seasons)) {
    const [startM, startD] = range.split('-').map(Number);
    const [endM, endD] = range.split('-').map(Number);
    const startDay = new Date(d.getFullYear(), startM - 1, startD);
    const endDay = new Date(d.getFullYear(), endM - 1, endD);
    if (d >= startDay && d <= endDay) {
      seasonKey = config.name;
      break;
    }
  }
  if (seasonKey) {
    const season = Object.values(scoringConfig.dimensions.seasonFit.seasons).find((s) => s.name === seasonKey);
    return season ? 5 + season.boost * 2 : 5;
  }
  return 5;
}

const scoringFlow = ai.defineFlow(
  {
    name: 'scoringAgent',
    inputSchema: ScoringInputSchema,
    outputSchema: ScoringOutputSchema,
  },
  async (input) => {
    console.log(`[Scoring] 🏁 Bắt đầu chấm ${input.items.length} items`);

    const { freshness, trend, businessRelevance, seasonFit } = scoringConfig.dimensions;
    const scoredItems = input.items.map((item) => {
      const freshnessScore = scoreFreshness(item.pubDate, 24);
      const trendScore = scoreTrend(item.title, item.summary);
      const businessScore = scoreBusinessRelevance(item.category, item.title, item.summary);
      const seasonScore = scoreSeasonFit(item.pubDate);

      const total = freshnessScore * freshness.weight + trendScore * trend.weight + businessScore * businessRelevance.weight + seasonScore * seasonFit.weight;

      return {
        ...item,
        scores: {
          freshness: freshnessScore,
          trend: trendScore,
          businessRelevance: businessScore,
          seasonFit: seasonScore,
          total: Math.round(total * 10) / 10,
        },
        shouldProcess: total >= scoringConfig.thresholds.shouldProcess,
      };
    });

    const processable = scoredItems.filter((i) => i.shouldProcess);
    const highValue = scoredItems.filter((i) => i.scores.total >= scoringConfig.thresholds.highValue);
    const avgScore = scoredItems.reduce((s, i) => s + i.scores.total, 0) / scoredItems.length;

    console.log(`[Scoring] ✅ ${processable.length}/${scoredItems.length} items đạt threshold (${scoringConfig.thresholds.shouldProcess})`);
    console.log(`[Scoring] 📊 Điểm TB: ${avgScore.toFixed(1)} | Cao: ${highValue.length} items`);

    return {
      scoredItems,
      summary: {
        totalScored: scoredItems.length,
        shouldProcess: processable.length,
        highValue: highValue.length,
        averageScore: Math.round(avgScore * 10) / 10,
      },
    };
  }
);

export { scoringFlow, ScoringInputSchema, ScoringOutputSchema };
