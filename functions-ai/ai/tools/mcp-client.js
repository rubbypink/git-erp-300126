import { ai } from '../genkit-init.js';
import { z } from 'genkit';
import axios from 'axios';

/**
 * @module MCP_Tools
 * @description Quản lý kết nối tới CrawlForge REST API và xuất ra các Genkit Tools.
 *
 * 🔧 ĐÃ SỬA: Chuyển từ MCP Stdio Transport (không tương thích Firebase Cloud Functions)
 * sang REST API trực tiếp qua HTTPS. CrawlForge cung cấp REST endpoint tại:
 *   https://api.crawlforge.dev
 *
 * Biến môi trường cần thiết:
 *   CRAWLFORGE_API_KEY  — API key (định dạng cf_live_...), lấy từ https://www.crawlforge.dev/signup
 *   CRAWLFORGE_API_URL  — (tùy chọn) Mặc định: https://api.crawlforge.dev
 */

const CRAWLFORGE_API_URL = process.env.CRAWLFORGE_API_URL || 'https://api.crawlforge.dev';
const CRAWLFORGE_API_KEY = process.env.CRAWLFORGE_API_KEY || '';

/**
 * @function callCrawlForgeAPI
 * @description Gọi CrawlForge REST API tool bằng HTTP POST
 * @param {string} toolName    — Tên tool (vd: 'scrape_with_actions')
 * @param {object} arguments   — Tham số gửi kèm
 * @return {Promise<string>}  — Nội dung text trả về từ CrawlForge
 */
async function callCrawlForgeAPI(toolName, args) {
    if (!CRAWLFORGE_API_KEY) {
        throw new Error('Thiếu CRAWLFORGE_API_KEY. Vui lòng đăng ký tại https://www.crawlforge.dev/signup ' + 'và set biến môi trường CRAWLFORGE_API_KEY.');
    }

    const response = await axios({
        method: 'POST',
        url: `${CRAWLFORGE_API_URL}/tools/${toolName}`,
        headers: {
            Authorization: `Bearer ${CRAWLFORGE_API_KEY}`,
            'Content-Type': 'application/json',
            'User-Agent': '9trip-erp/1.0 (Firebase Cloud Functions)',
        },
        data: args,
        timeout: 120_000, // 2 phút — đủ cho các trang nặng + Cloudflare challenge
    });

    // CrawlForge API trả về { content: [{ type: 'text', text: '...' }] }
    // Hoặc { result: '...' } tùy phiên bản
    if (response.data?.content?.[0]?.text) {
        return response.data.content[0].text;
    }
    if (response.data?.result) {
        return response.data.result;
    }
    if (typeof response.data === 'string') {
        return response.data;
    }

    // Fallback: serialize toàn bộ response
    return JSON.stringify(response.data);
}

// ═══════════════════════════════════════════════════════════════
// 1. Tool Cào Dữ Liệu Raw (Vượt Cloudflare)
// ═══════════════════════════════════════════════════════════════
const crawlforgeScrapeTool = ai.defineTool(
    {
        name: 'crawlforge_scrape',
        description: 'Sử dụng để truy cập một URL và lấy toàn bộ HTML/Text sạch, tự động vượt qua Cloudflare và Bot Protection.',
        schema: z.object({
            url: z.string().describe('Đường dẫn URL cần cào dữ liệu'),
            waitForSelector: z.string().optional().describe('CSS Selector cần chờ load xong (Tùy chọn)'),
            stealthMode: z.boolean().default(true).describe('Bật chế độ ẩn danh chống block'),
        }),
    },
    async (input) => {
        try {
            console.log(`[MCP Tool] Đang gọi CrawlForge REST API scrape: ${input.url}`);

            const result = await callCrawlForgeAPI('scrape_with_actions', {
                url: input.url,
                stealth_mode: input.stealthMode !== false, // mặc định true
                wait_for: input.waitForSelector || undefined,
            });

            console.log(`[MCP Tool] ✅ CrawlForge scrape thành công (${result.length} ký tự)`);
            return result;
        } catch (error) {
            const status = error.response?.status;
            const detail = error.response?.data?.message || error.message;

            console.error(`[MCP Tool ERROR] HTTP ${status || '???'}:`, detail);

            if (status === 401 || status === 403) {
                return 'Lỗi xác thực CrawlForge: Kiểm tra lại CRAWLFORGE_API_KEY (cần định dạng cf_live_...). Đăng ký free tại https://www.crawlforge.dev/signup';
            }
            if (status === 402) {
                return 'Hết credits CrawlForge. Vui lòng nâng cấp gói tại https://www.crawlforge.dev/pricing';
            }
            if (status === 429) {
                return 'CrawlForge rate limit. Đợi vài giây rồi thử lại.';
            }

            return `Lỗi khi cào dữ liệu: ${detail}`;
        }
    }
);

// ═══════════════════════════════════════════════════════════════
// 2. Export
// ═══════════════════════════════════════════════════════════════
export { crawlforgeScrapeTool, callCrawlForgeAPI };
