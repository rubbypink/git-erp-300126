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

const researcherConfig = require('./researcher.config');
const hotelCrawlerConfig = require('./hotel-crawler.config');
const emilyConfig = require('./emily.config');
const writerConfig = require('./writer.config');
const mediaMasterConfig = require('./media-master.config');
const publisherConfig = require('./publisher.config');

module.exports = {
    researcher: researcherConfig,
    hotelCrawler: hotelCrawlerConfig,
    emily: emilyConfig,
    writer: writerConfig,
    mediaMaster: mediaMasterConfig,
    publisher: publisherConfig,
};