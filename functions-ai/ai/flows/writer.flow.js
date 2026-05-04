import { ai } from '../genkit-init.js';
import { z } from 'genkit';
import AiManager from '../ai.manager.js';
import writerConfig from '../../.9trip-agents/configs/writer.config.js';

// ─── Agent Instance — DeepSeek V4 Pro, fallback Gemini Flash ────────────
const writer = new AiManager({
    modelName: writerConfig.model,
    apiKey: process.env[writerConfig.apiKeyEnv],
});

const fallbackWriter = new AiManager({
    modelName: writerConfig.fallbackModel,
    apiKey: process.env[writerConfig.fallbackApiKeyEnv],
});

// ─── Zod Schema — Đầu vào ──────────────────────────────────────────────
const WriterInputSchema = z.object({
    researcherData: z.string().describe('Dữ liệu JSON từ Researcher Agent (dạng chuỗi)'),
    format: z.enum(writerConfig.formats).default('social_post').describe('Định dạng bài viết'),
    styleHint: z.string().optional().describe('Ghi chú phong cách thêm (vd: "vui vẻ", "chuyên nghiệp")'),
});

// ─── Zod Schema — Kết quả bài viết ──────────────────────────────────────
const WriterOutputSchema = z.object({
    title: z.string().describe('Tiêu đề bài viết (dưới 60 ký tự)'),
    content: z.string().describe('Nội dung bài viết đầy đủ'),
    cta: z.string().describe('Call-to-action nhẹ nhàng (1-2 câu)'),
    format: z.string().describe('Định dạng đã sử dụng'),
    wordCount: z.number().describe('Số từ của nội dung'),
    hashtags: z.array(z.string()).describe('Mảng tối đa 5 hashtag liên quan'),
});

// ═════════════════════════════════════════════════════════════════════════
// Genkit Flow — Viết nội dung từ dữ liệu Researcher
// Prompts & Rules đọc từ .9trip-agents/configs/writer.config.js
// ═════════════════════════════════════════════════════════════════════════
const writerGenerateFlow = ai.defineFlow(
    {
        name: 'writerGenerate',
        inputSchema: WriterInputSchema,
        outputSchema: WriterOutputSchema,
    },
    async (input) => {
        console.log(`[Writer] ✍️ Bắt đầu viết — format: ${input.format}`);

        // ── Build prompt từ config ──────────────────────────────────────
        const lengthLimits = writerConfig.lengthLimits[input.format] || writerConfig.lengthLimits.social_post;
        const lengthHint = `${lengthLimits.min}-${lengthLimits.max} từ`;
        const styleHint = input.styleHint || writerConfig.style;

        const userPrompt = writerConfig.userPromptTemplate
            .replace(/\{\{format\}\}/g, input.format)
            .replace(/\{\{researcherData\}\}/g, input.researcherData)
            .replace(/\{\{lengthHint\}\}/g, lengthHint)
            .replace(/\{\{styleHint\}\}/g, styleHint)
            .replace(/\{\{bannedWords\}\}/g, writerConfig.bannedWords.join(', '));

        // ── Gọi Writer (DeepSeek) với fallback sang Gemini Flash ────────
        let result;
        try {
            console.log(`[Writer] Gọi model chính: ${writer.modelName}`);
            result = await writer.extractJSON(userPrompt, WriterOutputSchema, writerConfig.systemPrompt);
        } catch (primaryError) {
            console.warn(`[Writer] ⚠️ Model chính lỗi: ${primaryError.message}. Chuyển fallback: ${fallbackWriter.modelName}`);
            try {
                result = await fallbackWriter.extractJSON(userPrompt, WriterOutputSchema, writerConfig.systemPrompt);
            } catch (fallbackError) {
                console.error(`[Writer] ❌ Fallback cũng lỗi: ${fallbackError.message}`);
                throw new Error(`Viết nội dung thất bại: ${primaryError.message}`);
            }
        }

        if (!result.success) {
            throw new Error(`Bóc tách bài viết thất bại: ${result.error}`);
        }

        const outputData = result.data;
        console.log(`[Writer] ✅ Hoàn thành — ${outputData.wordCount || '?'} từ, format: ${outputData.format || input.format}`);

        return outputData;
    }
);

export { writer, fallbackWriter, writerGenerateFlow, WriterInputSchema, WriterOutputSchema };
