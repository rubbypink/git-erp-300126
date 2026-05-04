import { ai } from '../genkit-init.js';
import { z } from 'genkit';
import plannerConfig from '../../.9trip-agents/configs/planner.config.js';

const PlannerInputSchema = z.object({
  item: z.object({
    title: z.string(),
    summary: z.string(),
    category: z.string(),
    phuQuocRelevance: z.number(),
    matchedProducts: z
      .array(
        z.object({
          type: z.string(),
          id: z.string(),
          name: z.string(),
          price: z.number().nullable(),
        })
      )
      .optional(),
    enrichmentContext: z.string().optional(),
  }),
});

const PlannerOutputSchema = z.object({
  angle: z.string().describe('Id của angle đã chọn'),
  target: z.string().describe('Id của target đã chọn'),
  mediaType: z.string().describe('Id của media type'),
  format: z.string().describe('Định dạng bài viết: social_post | blog_post | short_caption | news_summary'),
  suggestedTitle: z.string().describe('Tiêu đề gợi ý (< 60 ký tự)'),
  suggestedCTA: z.string().describe('CTA gợi ý nhẹ nhàng'),
  reasoning: z.string().describe('Lý do chọn các option trên'),
});

const plannerFlow = ai.defineFlow(
  {
    name: 'plannerAgent',
    inputSchema: PlannerInputSchema,
    outputSchema: PlannerOutputSchema,
  },
  async (input) => {
    const { item } = input;
    console.log(`[Planner] 🏁 Planning content: "${item.title.slice(0, 50)}..."`);

    const angleMap = plannerConfig.categoryAngleMap;
    const targetMap = plannerConfig.categoryTargetMap;
    const mediaMap = plannerConfig.categoryMediaMap;

    const angle = angleMap[item.category] || plannerConfig.defaultAngle;
    const target = targetMap[item.category] || plannerConfig.defaultTarget;
    const mediaType = mediaMap[item.category] || plannerConfig.defaultMediaType;

    const hasImages = item.matchedProducts && item.matchedProducts.some((p) => p.type === 'hotel');
    const finalMediaType = mediaType === 'image' && !hasImages ? 'image' : mediaType;

    const angleNames = {
      chi_phi: 'Chi phí & tiết kiệm',
      dia_diem: 'Địa điểm & review',
      canh_bao: 'Cảnh báo & lưu ý',
      kinh_nghiem: 'Kinh nghiệm du lịch',
      am_thuc: 'Ẩm thực',
      khach_san: 'Khách sạn & Resort',
    };
    const targetNames = {
      family: 'Gia đình',
      couple: 'Cặp đôi',
      solo: 'Một mình',
      group: 'Nhóm bạn',
    };

    const format = item.category === 'thuế_chính_sách' ? 'news_summary' : item.phuQuocRelevance >= 8 ? 'social_post' : 'blog_post';

    const suggestedTitle = item.title.length > 60 ? item.title.slice(0, 57) + '...' : item.title;
    const cta = `9 Trip gợi ý thêm trải nghiệm Phú Quốc — ghé app xem nhẹ bạn nhé 😊`;

    const reasoning = `Category "${item.category}" → angle "${angleNames[angle]}", target "${targetNames[target]}", media "${finalMediaType}"`;

    console.log(`[Planner] ✅ ${reasoning}`);

    return {
      angle,
      target,
      mediaType: finalMediaType,
      format,
      suggestedTitle,
      suggestedCTA: cta,
      reasoning,
    };
  }
);

export { plannerFlow, PlannerInputSchema, PlannerOutputSchema };
