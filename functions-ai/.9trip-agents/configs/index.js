/**
 * ═════════════════════════════════════════════════════════════════════════
 * 9 TRIP AI AGENTS — CONFIG HUB
 * ═════════════════════════════════════════════════════════════════════════
 *
 * ĐÂY LÀ ĐIỂM VÀO DUY NHẤT. Tất cả flow/module chỉ cần require file này.
 *
 * Quy ước:
 *   - Mỗi agent có 1 file config riêng: researcher.config.js, emily.config.js, ...
 *   - Muốn sửa "tính cách" Agent → sửa config, KHÔNG sửa code flow.
 *   - Muốn thêm agent mới → tạo file config mới + thêm vào index dưới đây.
 */

import researcherConfig from './researcher.config.js';
import hotelCrawlerConfig from './hotel-crawler.config.js';
import emilyConfig from './emily.config.js';
import writerConfig from './writer.config.js';
import mediaMasterConfig from './media-master.config.js';
import publisherConfig from './publisher.config.js';
import plannerConfig from './planner.config.js';
import scoringConfig from './scoring.config.js';
import analyticsConfig from './analytics.config.js';

export {
    researcherConfig as researcher,
    hotelCrawlerConfig as hotelCrawler,
    emilyConfig as emily,
    writerConfig as writer,
    mediaMasterConfig as mediaMaster,
    publisherConfig as publisher,
    plannerConfig as planner,
    scoringConfig as scoring,
    analyticsConfig as analytics,
};
