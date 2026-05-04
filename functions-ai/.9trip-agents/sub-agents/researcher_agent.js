import { researcherScanRSSFlow, RSSScanResultSchema, RSSItemSchema } from '../../ai/flows/researcher-rss.flow.js';
import researcherConfig from '../configs/researcher.config.js';
import { AGENT_CONFIGS } from '../configs/prompts_master.js';
import { log, validateResearchData, extractTopic, isQualifiedResearchData } from '../shared-logic/helpers.js';
import { db, rtdb } from '../../utils/firebase-admin.util.js';

const AGENT_NAME = 'researcher_agent';
const MIN_SCORE = AGENT_CONFIGS.RESEARCHER?.gradingThreshold || 8;

async function scanAndScore(input = {}) {
  const { url, maxItems = 10, keywords, hoursBack = 24, enableFacebookGroupSearch = true } = input;

  try {
    await log(AGENT_NAME, 'info', 'Bắt đầu quét dữ liệu', {
      source: url ? 'rss' : 'auto_search',
      maxItems,
      hoursBack,
    });

    const result = await researcherScanRSSFlow({
      url: url || undefined,
      maxItems,
      keywords,
      hoursBack,
      enableFacebookGroupSearch,
    });

    if (!result || !result.items || result.items.length === 0) {
      await log(AGENT_NAME, 'warn', 'Không tìm thấy item nào');
      return null;
    }

    const qualifiedItems = validateResearchData(result, MIN_SCORE);
    if (qualifiedItems) {
      await log(AGENT_NAME, 'success', `Tìm thấy ${result.totalItems} items, ${qualifiedItems.length} đạt điểm >= ${MIN_SCORE}`);
    } else {
      await log(AGENT_NAME, 'warn', `Tìm thấy ${result.totalItems} items nhưng không có item nào đạt điểm >= ${MIN_SCORE}`);
    }

    const today = new Date().toISOString().slice(0, 10);
    await rtdb.ref(`agent_reports/${today}/${AGENT_NAME}`).push({
      level: 'success',
      message: `[${result.sourceName}] ${result.totalItems} items`,
      timestamp: Date.now(),
      metadata: {
        source: result.sourceName,
        totalItems: result.totalItems,
        qualifiedCount: qualifiedItems?.length || 0,
        trendingTopics: result.trendingTopics,
      },
    });

    return {
      ...result,
      qualifiedCount: qualifiedItems?.length || 0,
      qualified: qualifiedItems,
    };
  } catch (error) {
    await log(AGENT_NAME, 'error', `Researcher lỗi: ${error.message}`);
    return null;
  }
}

export { scanAndScore, researcherScanRSSFlow, RSSScanResultSchema, RSSItemSchema };
