/**
 * ═════════════════════════════════════════════════════════════════════════
 * SUB-AGENT: WRITER (The Creator)
 * Vị trí: .9trip-agents/sub-agents/writer_agent.js
 * Quy tắc: Mobile First, CTA nhẹ nhàng, Helper First
 * ═════════════════════════════════════════════════════════════════════════
 *
 * Pipeline: Researcher → Writer → MediaMaster → Publisher
 *                                     ↑ BẠN ĐANG Ở ĐÂY
 *
 * Logic:
 *   1. Nhận dữ liệu đã chấm điểm > 8 từ Researcher
 *   2. Phân tích training-data-vault để học phong cách bài thành công
 *   3. Viết theo cấu trúc: Giá trị hữu ích (80%) + CTA tinh tế (20%)
 *   4. Ghi báo cáo trạng thái lên RTDB qua Helper log
 *   5. Trả kết quả cho MediaMaster
 *
 * Model: DeepSeek V4 Pro (logic ngôn ngữ tốt, tiết kiệm)
 * Fallback: Gemini 1.5 Flash
 */

const { writerGenerateFlow } = require('../../functions-ai/ai/flows/writer.flow');
const writerConfig = require('../configs/writer.config');
const { AGENT_CONFIGS } = require('../configs/prompts_master');
const { log, validateResearchData, extractTopic, getTrainingSamples } = require('../shared-logic/helpers');

const AGENT_NAME = 'writer_agent';
const MIN_RELEVANCE_SCORE = AGENT_CONFIGS.RESEARCHER?.grading_threshold || 8;

/**
 * generateSocialContent — Hàm chính của Writer Agent
 *
 * @param {Object|Array|string} researchData - Dữ liệu từ Researcher (items đạt điểm > 8)
 * @param {Object} [options] - Tuỳ chọn
 * @param {string} [options.format='social_post'] - Định dạng: social_post | blog_post | short_caption | news_summary
 * @param {string} [options.styleHint] - Ghi chú phong cách thêm (vd: 'vui vẻ', 'chuyên nghiệp')
 * @returns {Promise<Object|null>} - Kết quả bài viết hoặc null nếu lỗi
 */
async function generateSocialContent(researchData, options = {}) {
    const { format = 'social_post', styleHint } = options;

    try {
        // ═══ 1. VALIDATE: Đảm bảo data research đạt điểm tối thiểu ═══
        if (!researchData) {
            throw new Error('Dữ liệu đầu vào trống');
        }

        const parsedData = typeof researchData === 'string' ? JSON.parse(researchData) : researchData;
        const qualifiedItems = validateResearchData(parsedData, MIN_RELEVANCE_SCORE);

        if (!qualifiedItems || qualifiedItems.length === 0) {
            await log(AGENT_NAME, 'warn', `Không có item nào đạt điểm ≥ ${MIN_RELEVANCE_SCORE}. Bỏ qua.`);
            return null;
        }

        const topic = extractTopic(qualifiedItems);

        // ═══ 2. BÁO CÁO: Đang bắt đầu biên tập ═══
        await log(AGENT_NAME, 'info', `Đang biên tập nội dung về [${topic}] theo phong cách Sống động...`, {
            itemCount: qualifiedItems.length,
            format,
            style: styleHint || writerConfig.style,
        });

        // ═══ 3. PHÂN TÍCH TRAINING-VAULT: Học phong cách bài thành công ═══
        const trainingSamples = await getTrainingSamples(5);
        let styleContext = '';

        if (trainingSamples.length > 0) {
            await log(AGENT_NAME, 'info', `Học phong cách từ ${trainingSamples.length} bài viết thành công...`);
            const sampleSummaries = trainingSamples.map((s) => ({
                title: s.title || '',
                cta: s.cta || '',
                style: s.style || '',
            }));
            styleContext = `\n\n═══ PHONG CÁCH THAM KHẢO (bài viết đã duyệt) ═══\n${JSON.stringify(sampleSummaries, null, 2)}\nHãy học cách viết CTA nhẹ nhàng và giọng văn sống động từ các bài tham khảo trên.`;
        }

        // ═══ 4. XÂY DỰNG PROMPT: Ghép training context vào researcherData ═══
        const enrichedResearcherData = JSON.stringify({
            qualifiedItems,
            styleContext,
        });

        // ═══ 5. GỌI MODEL (DeepSeek V4 Pro) qua Writer Flow ═══
        const result = await writerGenerateFlow({
            researcherData: enrichedResearcherData,
            format,
            styleHint: styleHint || writerConfig.style,
        });

        // ═══ 6. KIỂM TRA KẾT QUẢ ═══
        if (!result || !result.content) {
            await log(AGENT_NAME, 'warn', `Model trả về kết quả trống cho [${topic}]`);
            return null;
        }

        // ═══ 7. GHI BÁO CÁO THÀNH CÔNG lên RTDB ═══
        await log(AGENT_NAME, 'success', `Hoàn thành bài viết — ${result.wordCount || '?'} từ, format: ${result.format || format}`, {
            topic,
            format: result.format || format,
            wordCount: result.wordCount || 0,
            sourceItems: qualifiedItems.length,
            hasTrainingRef: trainingSamples.length > 0,
        });

        // ═══ 8. TRẢ KẾT QUẢ CHO MEDIA MASTER ═══
        return {
            ...result,
            sourceItems: qualifiedItems.length,
            platform_optimized: ['Facebook', 'TikTok'],
            trainingRef: trainingSamples.length > 0,
        };
    } catch (error) {
        await log(AGENT_NAME, 'error', `Writer Agent lỗi: ${error.message}`);
        return null;
    }
}

module.exports = { generateSocialContent };