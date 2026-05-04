import { ai } from '../genkit-init.js';
import { z } from 'genkit';
import AiManager from '../ai.manager.js';
import { db } from '../../utils/firebase-admin.util.js';

const EnrichmentInputSchema = z.object({
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
        shouldProcess: z.boolean().optional(),
      })
    )
    .describe('Items đã qua scoring + filter'),
});

const MatchedProductSchema = z.object({
  type: z.string().describe('Loại: tour | hotel | service'),
  id: z.string().describe('Firestore document ID'),
  name: z.string(),
  price: z.number().nullable(),
  matchReason: z.string().describe('Lý do match với content'),
});

const EnrichedItemSchema = z.object({
  title: z.string(),
  link: z.string(),
  pubDate: z.string(),
  summary: z.string(),
  category: z.string(),
  sentiment: z.string(),
  phuQuocRelevance: z.number(),
  matchedProducts: z.array(MatchedProductSchema).describe('Sản phẩm matched từ Firestore'),
  enrichmentContext: z.string().describe('Context tổng hợp cho Writer'),
});

const EnrichmentOutputSchema = z.object({
  enrichedItems: z.array(EnrichedItemSchema),
  summary: z.object({
    totalInput: z.number(),
    enriched: z.number(),
    noMatch: z.number(),
  }),
});

function extractKeywords(title, summary, category) {
  const text = `${title} ${summary}`.toLowerCase();
  const words = text
    .replace(/[^a-z0-9\u00e0-\u1ef9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);
  const unique = [...new Set(words)];
  const categoryMap = {
    tour: ['tour', 'combo', 'du lịch', 'khám phá', 'trải nghiệm'],
    khách_sạn: ['khách sạn', 'resort', 'homestay', 'nghỉ dưỡng', 'phòng'],
    ẩm_thực: ['nhà hàng', 'quán', 'ăn', 'món', 'đặc sản', 'ẩm thực'],
    thời_tiết: ['thời tiết', 'mùa', 'nắng', 'mưa', 'bão'],
  };
  const categoryKeywords = categoryMap[category] || [];
  return [...new Set([...unique, ...categoryKeywords])];
}

async function queryTours(keywords) {
  try {
    const snapshot = await db.collection('tour_prices').where('status', '!=', 'false').limit(5).get();
    const results = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      const name = (data.name || '').toLowerCase();
      const match = keywords.some((kw) => name.includes(kw));
      if (match) {
        results.push({
          type: 'tour',
          id: doc.id,
          name: data.name || '',
          price: data.base_price || null,
          matchReason: 'Nội dung tour liên quan',
        });
      }
    });
    return results;
  } catch (e) {
    console.warn(`[Enrichment] Tour query failed: ${e.message}`);
    return [];
  }
}

async function queryHotels(keywords) {
  try {
    const snapshot = await db.collection('hotels').limit(5).get();
    const results = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      const name = (data.name || '').toLowerCase();
      const match = keywords.some((kw) => name.includes(kw));
      if (match) {
        results.push({
          type: 'hotel',
          id: doc.id,
          name: data.name || '',
          price: null,
          matchReason: 'Khách sạn/resort liên quan',
        });
      }
    });
    return results;
  } catch (e) {
    console.warn(`[Enrichment] Hotel query failed: ${e.message}`);
    return [];
  }
}

async function queryServices(keywords) {
  try {
    const snapshot = await db.collection('services').limit(3).get();
    const results = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      const name = (data.name || '').toLowerCase();
      const match = keywords.some((kw) => name.includes(kw));
      if (match) {
        results.push({
          type: 'service',
          id: doc.id,
          name: data.name || '',
          price: data.price || null,
          matchReason: 'Dịch vụ du lịch liên quan',
        });
      }
    });
    return results;
  } catch (e) {
    console.warn(`[Enrichment] Service query failed: ${e.message}`);
    return [];
  }
}

function buildEnrichmentContext(item, products) {
  const parts = [`Chủ đề: ${item.title}`];
  if (products.length > 0) {
    parts.push('Sản phẩm liên quan:');
    for (const p of products) {
      parts.push(`- [${p.type}] ${p.name}${p.price ? ` (${p.price.toLocaleString('vi-VN')}₫)` : ''}`);
    }
  } else {
    parts.push('Không có sản phẩm matched trong DB.');
  }
  parts.push(`Category: ${item.category} | Sentiment: ${item.sentiment}`);
  return parts.join('\n');
}

const enrichmentFlow = ai.defineFlow(
  {
    name: 'enrichmentAgent',
    inputSchema: EnrichmentInputSchema,
    outputSchema: EnrichmentOutputSchema,
  },
  async (input) => {
    console.log(`[Enrichment] 🏁 Bắt đầu enrich ${input.items.length} items`);

    const enrichedItems = [];
    let noMatch = 0;

    for (const item of input.items) {
      const keywords = extractKeywords(item.title, item.summary, item.category);
      const [tours, hotels, services] = await Promise.all([queryTours(keywords), queryHotels(keywords), queryServices(keywords)]);

      const allProducts = [...tours, ...hotels, ...services];
      if (allProducts.length === 0) noMatch++;

      const enrichmentContext = buildEnrichmentContext(item, allProducts);

      enrichedItems.push({
        title: item.title,
        link: item.link,
        pubDate: item.pubDate,
        summary: item.summary,
        category: item.category,
        sentiment: item.sentiment,
        phuQuocRelevance: item.phuQuocRelevance,
        matchedProducts: allProducts,
        enrichmentContext,
      });
    }

    console.log(`[Enrichment] ✅ Enriched: ${enrichedItems.length} | Không match: ${noMatch}`);

    return {
      enrichedItems,
      summary: {
        totalInput: input.items.length,
        enriched: enrichedItems.length,
        noMatch,
      },
    };
  }
);

export { enrichmentFlow, EnrichmentInputSchema, EnrichmentOutputSchema };
