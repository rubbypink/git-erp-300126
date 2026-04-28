const { ai } = require('../genkit-init');
const { z } = require('genkit');
// Tích hợp SDK của MCP
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

/**
 * @module MCP_Tools
 * @description Quản lý kết nối tới CrawlForge MCP và xuất ra các Genkit Tools
 */

// 1. Tool Cào Dữ Liệu Raw (Vượt Cloudflare)
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
            console.log(`[MCP Tool] Đang khởi chạy CrawlForge Scrape cho: ${input.url}`);

            // Khởi tạo luồng giao tiếp Stdio tới MCP Server được cài local/server
            // Lưu ý: Trên Firebase, lệnh này sẽ gọi npx để kích hoạt server của CrawlForge
            const transport = new StdioClientTransport({
                command: 'npx',
                args: ['-y', 'crawlforge-mcp-server'],
            });

            const client = new Client({ name: 'erp-genkit-client', version: '1.0.0' }, { capabilities: { tools: {} } });

            await client.connect(transport);

            // Gọi tool có sẵn của CrawlForge
            const result = await client.callTool({
                name: 'scrape_with_actions',
                arguments: {
                    url: input.url,
                    stealth_mode: input.stealthMode,
                    wait_for: input.waitForSelector,
                },
            });

            // Ngắt kết nối dọn dẹp RAM
            await transport.close();

            return result.content[0].text; // Trả về nội dung web
        } catch (error) {
            console.error(`[MCP Tool ERROR]`, error);
            return `Lỗi khi cào dữ liệu: ${error.message}`;
        }
    }
);

module.exports = {
    crawlforgeScrapeTool,
};
