/**
 * ═════════════════════════════════════════════════════════════════════════
 * Researcher Agent — Sub-agent chuyên nghiên cứu & thu thập dữ liệu
 * Sử dụng Gemini 1.5 Flash (nhanh, rẻ) + Genkit để quét RSS du lịch Phú Quốc
 * ═════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ MÃI NGUỒN THỰC TẾ nằm trong functions-ai/ (Cloud Functions codebase riêng).
 * File này chỉ là LỚP BỌC (thin wrapper) để import phía .9trip-agents/.
 *
 * Cách gọi:
 *   // Qua Cloud Function (production):
 *   const result = await firebase.functions().httpsCallable('researcherScanRSS')({ url: '...' });
 *
 *   // Qua module trực tiếp (local/dev):
 *   const { researcher, researcherScanRSSFlow } = require('../../functions-ai/ai/flows/researcher-rss.flow');
 */

// Re-export trực tiếp từ functions-ai codebase (thực thi thực tế)
const { researcher, researcherScanRSSFlow, RSSScanResultSchema, RSSItemSchema } = require('../../functions-ai/ai/flows/researcher-rss.flow');

module.exports = {
    researcher,
    researcherScanRSSFlow,
    RSSScanResultSchema,
    RSSItemSchema,
};