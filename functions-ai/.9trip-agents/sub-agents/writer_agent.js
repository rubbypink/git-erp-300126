import { writerGenerateFlow } from '../../ai/flows/writer.flow.js';
import writerConfig from '../configs/writer.config.js';
import { AGENT_CONFIGS } from '../configs/prompts_master.js';
import { log, validateResearchData, extractTopic, getTrainingSamples } from '../shared-logic/helpers.js';

const AGENT_NAME = 'writer_agent';
const MIN_RELEVANCE_SCORE = AGENT_CONFIGS.RESEARCHER?.grading_threshold || 8;

async function generateSocialContent(researchData, options = {}) {
  const { format = 'social_post', styleHint } = options;

  try {
    if (!researchData) throw new Error('Dữ liệu đầu vào trống');

    const parsedData = typeof researchData === 'string' ? JSON.parse(researchData) : researchData;
    const qualifiedItems = validateResearchData(parsedData, MIN_RELEVANCE_SCORE);

    if (!qualifiedItems || qualifiedItems.length === 0) {
      await log(AGENT_NAME, 'warn', 'Không có item nào đạt điểm >= ' + MIN_RELEVANCE_SCORE + '. Bỏ qua.');
      return null;
    }

    const topic = extractTopic(qualifiedItems);
    await log(AGENT_NAME, 'info', 'Đang biên tập nội dung về [' + topic + ']', {
      itemCount: qualifiedItems.length, format, style: styleHint || writerConfig.style,
    });

    const trainingSamples = await getTrainingSamples(5);
    let styleContext = '';

    if (trainingSamples.length > 0) {
      await log(AGENT_NAME, 'info', 'Học phong cách từ ' + trainingSamples.length + ' bài viết thành công...');
      const sampleSummaries = trainingSamples.map((s) => ({
        title: s.title || '', cta: s.cta || '', style: s.style || '',
      }));
      styleContext = '\n\nPHONG CÁCH THAM KHẢO:\n' + JSON.stringify(sampleSummaries, null, 2);
    }

    const enrichedResearcherData = JSON.stringify({ qualifiedItems, styleContext });

    const result = await writerGenerateFlow({
      researcherData: enrichedResearcherData, format,
      styleHint: styleHint || writerConfig.style,
    });

    if (!result || !result.content) {
      await log(AGENT_NAME, 'warn', 'Model trả về kết quả trống cho [' + topic + ']');
      return null;
    }

    await log(AGENT_NAME, 'success', 'Hoàn thành bài viết — ' + (result.wordCount || '?') + ' từ', {
      topic, format: result.format || format, wordCount: result.wordCount || 0,
      sourceItems: qualifiedItems.length, hasTrainingRef: trainingSamples.length > 0,
    });

    return {
      ...result, sourceItems: qualifiedItems.length,
      platform_optimized: ['Facebook', 'TikTok'], trainingRef: trainingSamples.length > 0,
    };
  } catch (error) {
    await log(AGENT_NAME, 'error', 'Writer Agent lỗi: ' + error.message);
    return null;
  }
}

export { generateSocialContent };
