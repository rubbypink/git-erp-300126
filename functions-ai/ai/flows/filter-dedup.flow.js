import { ai } from '../genkit-init.js';
import { z } from 'genkit';

const FilterDedupInputSchema = z.object({
  items: z
    .array(
      z.object({
        title: z.string(),
        link: z.string(),
        pubDate: z.string(),
        summary: z.string(),
        category: z.string(),
        sentiment: z.string(),
        phuQuocRelevance: z.number(),
        scores: z
          .object({
            freshness: z.number(),
            trend: z.number(),
            businessRelevance: z.number(),
            seasonFit: z.number(),
            total: z.number(),
          })
          .optional(),
        shouldProcess: z.boolean().optional(),
      })
    )
    .describe('Danh sách items cần lọc'),
});

const FilteredItemSchema = z.object({
  title: z.string(),
  link: z.string(),
  pubDate: z.string(),
  summary: z.string(),
  category: z.string(),
  sentiment: z.string(),
  phuQuocRelevance: z.number(),
  scores: z
    .object({
      freshness: z.number(),
      trend: z.number(),
      businessRelevance: z.number(),
      seasonFit: z.number(),
      total: z.number(),
    })
    .optional(),
  shouldProcess: z.boolean(),
  dedupGroup: z.string().optional().describe('Nhóm trùng lặp để tham khảo'),
  filterReason: z.string().optional().describe('Lý do nếu bị loại'),
});

const FilterDedupOutputSchema = z.object({
  kept: z.array(FilteredItemSchema),
  removed: z.array(FilteredItemSchema),
  summary: z.object({
    total: z.number(),
    kept: z.number(),
    removed: z.number(),
    reasons: z.record(z.number()).describe('Map lý do → số lượng'),
  }),
});

const spamKeywords = ['đăng ký ngay', 'nhấn vào link', 'link đây', 'link trong bio', 'chia sẻ để nhận', 'tặng iphone', 'tặng quà', 'miễn phí 100%', 'kiếm tiền online', 'tiền ảo', 'crypto', 'đa cấp'];

const negativeKeywords = ['cờ bạc', 'bài bạc', 'đánh đề', 'lô đề', 'sòng bạc', 'casino', 'ma túy', 'thuốc lắc', 'mua bán ma túy', 'lừa đảo', 'scam', 'lường gạt', 'chiếm đoạt'];

function normalizeTitle(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\u00e0-\u1ef9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function jaccardSimilarity(a, b) {
  const setA = new Set(a.split(/\s+/));
  const setB = new Set(b.split(/\s+/));
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

function isSpam(title, summary) {
  const text = `${title} ${summary}`.toLowerCase();
  for (const kw of spamKeywords) {
    if (text.includes(kw)) return true;
  }
  return false;
}

function hasNegativeContent(title, summary) {
  const text = `${title} ${summary}`.toLowerCase();
  for (const kw of negativeKeywords) {
    if (text.includes(kw)) return true;
  }
  return false;
}

const filterDedupFlow = ai.defineFlow(
  {
    name: 'filterDedupAgent',
    inputSchema: FilterDedupInputSchema,
    outputSchema: FilterDedupOutputSchema,
  },
  async (input) => {
    console.log(`[FilterDedup] 🏁 Bắt đầu lọc ${input.items.length} items`);

    const kept = [];
    const removed = [];
    const reasons = {};
    const processed = [];

    for (const item of input.items) {
      let reason = null;

      if (item.phuQuocRelevance < 3) {
        reason = 'phu_quoc_relevance_thap';
      } else if (hasNegativeContent(item.title, item.summary)) {
        reason = 'noi_dung_tieu_cuc';
      } else if (isSpam(item.title, item.summary)) {
        reason = 'spam';
      } else if (item.scores && item.scores.total < 3) {
        reason = 'diem_tong_thap';
      }

      if (reason) {
        reasons[reason] = (reasons[reason] || 0) + 1;
        removed.push({ ...item, shouldProcess: false, filterReason: reason });
        continue;
      }

      const normTitle = normalizeTitle(item.title);
      let isDuplicate = false;

      for (const existing of processed) {
        const existingNorm = normalizeTitle(existing.title);
        if (jaccardSimilarity(normTitle, existingNorm) > 0.75) {
          isDuplicate = true;
          reason = 'trung_lap_noi_dung';
          break;
        }
        if (item.link && existing.link && item.link === existing.link) {
          isDuplicate = true;
          reason = 'trung_lap_url';
          break;
        }
      }

      if (isDuplicate) {
        reasons[reason] = (reasons[reason] || 0) + 1;
        removed.push({ ...item, shouldProcess: false, filterReason: reason });
        continue;
      }

      processed.push(item);
      kept.push({ ...item, shouldProcess: item.shouldProcess !== false, dedupGroup: null });
    }

    console.log(`[FilterDedup] ✅ Giữ lại: ${kept.length} / Loại: ${removed.length}`);
    console.log(`[FilterDedup] 📊 Lý do:`, reasons);

    return {
      kept,
      removed,
      summary: {
        total: input.items.length,
        kept: kept.length,
        removed: removed.length,
        reasons,
      },
    };
  }
);

export { filterDedupFlow, FilterDedupInputSchema, FilterDedupOutputSchema };
