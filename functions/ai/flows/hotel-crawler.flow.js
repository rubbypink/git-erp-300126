const { ai } = require('../genkit-init');
const { z } = require('genkit');
const path = require('path');
const { deepseek } = require('../index');
const { crawlforgeScrapeTool } = require('../tools/mcp-client');
const hotelCrawlerConfig = require(path.resolve(__dirname, '../../../.9trip-agents/configs/hotel-crawler.config'));

/**
 * @Flow Hotel Crawler
 * @description: Quy trình tự động cào dữ liệu khách sạn đa trang:
 *   1. Cào trang chính khách sạn → lấy thông tin KS & tìm link trang chi tiết phòng/giá
 *   2. Cào từng trang chi tiết phòng → lấy bảng giá
 *   3. Bóc tách JSON tổng hợp
 *
 * Prompts đọc từ: .9trip-agents/configs/hotel-crawler.config.js
 */

const HotelSchema = z.object({
    hotel_info: z.object({
        name: z.string().describe('Tên khách sạn'),
        address: z.string(),
        phone: z.string(),
        email: z.string(),
        star: z.number().nullable().describe('Hạng sao, ví dụ: 5'),
        website: z.string(),
        pictures: z.array(z.string()).describe('Mảng chứa các link ảnh'),
        rooms: z.array(z.string()).describe('Mảng chứa tên TẤT CẢ các hạng phòng tìm thấy'),
    }),
    metadata: z.object({
        supplier_name: z.string().describe('Tên nhà cung cấp hoặc chuỗi rỗng'),
        year: z.number(),
    }),
    items: z.array(
        z.object({
            room_name: z.string(),
            rate_name: z.string().default('base'),
            period_name: z.string().default('all_year'),
            from: z.string().describe('Định dạng YYYY-MM-DD'),
            to: z.string().describe('Định dạng YYYY-MM-DD'),
            price: z.number().describe('CHỈ LẤY SỐ NGUYÊN SẠCH, vd: 1600000'),
            note: z.string().describe('Ghi chú phụ thu, trẻ em...'),
        })
    ),
});

const hotelCrawlerFlow = ai.defineFlow(
    {
        name: 'hotelCrawlerFlow',
        inputSchema: z.object({
            url: z.string().url('Vui lòng truyền vào một URL hợp lệ'),
        }),
        outputSchema: HotelSchema,
    },
    async (input) => {
        console.log(`[Flow] ========== BẮT ĐẦU CÀO KHÁCH SẠN ==========`);
        console.log(`[Flow] URL gốc: ${input.url}`);

        // ═══════════════════════════════════════════
        // PHASE 1: DISCOVERY — Cào trang chính + tìm & cào trang chi tiết phòng
        // ═══════════════════════════════════════════
        const promptScrape = hotelCrawlerConfig.scrapeUserPromptTemplate.replace('{{url}}', input.url);

        console.log(`[Flow] Phase 1 — Discovery: Deepseek cầm Tool cào đa trang...`);
        const scrapeResult = await deepseek.generateWithTools(promptScrape, [crawlforgeScrapeTool], hotelCrawlerConfig.scrapeSystemPrompt);

        if (!scrapeResult.success) {
            throw new Error(`Cào Web thất bại: ${scrapeResult.error}`);
        }

        const rawContent = scrapeResult.data.text || scrapeResult.text || '';
        console.log(`[Flow] Phase 1 xong — Tổng độ dài nội dung thu thập: ${rawContent.length} ký tự`);

        if (!rawContent || rawContent.length < hotelCrawlerConfig.minContentLength) {
            throw new Error('Nội dung cào về quá ngắn, có thể trang bị chặn hoặc không có dữ liệu.');
        }

        // ═══════════════════════════════════════════
        // PHASE 2: EXTRACTION — Bóc tách JSON từ toàn bộ dữ liệu thô
        // ═══════════════════════════════════════════
        console.log(`[Flow] Phase 2 — Extraction: Deepseek bóc tách JSON...`);
        const extractResult = await deepseek.extractJSON(rawContent, HotelSchema, hotelCrawlerConfig.extractSystemPrompt);

        if (!extractResult.success) {
            throw new Error(`Bóc tách JSON thất bại: ${extractResult.error}`);
        }

        const resultData = extractResult.data;
        console.log(`[Flow] Phase 2 xong — Đã trích xuất:`);
        console.log(`  - Hotel: ${resultData.hotel_info?.name || 'N/A'}`);
        console.log(`  - Rooms: ${resultData.hotel_info?.rooms?.length || 0} hạng phòng`);
        console.log(`  - Items (dòng giá): ${resultData.items?.length || 0}`);
        console.log(`[Flow] ========== HOÀN THÀNH ==========`);

        return resultData;
    }
);

module.exports = { hotelCrawlerFlow };