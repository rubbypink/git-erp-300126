import { mediaMasterFlow } from '../../ai/flows/media-master.flow.js';
import mediaMasterConfig from '../configs/media-master.config.js';
import { FieldValue } from 'firebase-admin/firestore';
import { processImage } from '../../ai/services/image-processor.service.js';
import { buildVideoSpec, suggestTrimPoints } from '../../ai/services/video-processor.service.js';
import { log } from '../shared-logic/helpers.js';
import { db } from '../../utils/firebase-admin.util.js';

const AGENT_NAME = 'media_master';

async function analyzeAndQueue(writerOutput, sourceTopic = '', options = {}) {
  const { angle, target, mediaType, matchedProducts } = options;
  try {
    if (!writerOutput || !writerOutput.content) throw new Error('Dữ liệu đầu vào từ Writer trống');

    if (writerOutput.content.length < (mediaMasterConfig.minContentLength || 50)) {
      await log(AGENT_NAME, 'warn', 'Nội dung Writer quá ngắn (' + writerOutput.content.length + ' ký tự). Bỏ qua.');
      return null;
    }

    const topic = sourceTopic || writerOutput.title?.slice(0, 40) || 'Không xác định';
    await log(AGENT_NAME, 'info', 'Đang xử lý media cho [' + topic + ']', {
      mediaType: mediaType || 'image', angle: angle || 'default', target: target || 'family',
    });

    const result = await mediaMasterFlow({
      title: writerOutput.title || '',
      content: writerOutput.content,
      cta: writerOutput.cta || '',
      hashtags: writerOutput.hashtags || [],
      format: writerOutput.format || 'social_post',
      sourceTopic,
      angle: angle || 'kinh_nghiem',
      target: target || 'family',
      mediaType: mediaType || 'image',
      matchedProducts: matchedProducts || [],
    });

    if (!result || !result.contentId) {
      await log(AGENT_NAME, 'warn', 'Xử lý media thất bại — không có contentId');
      return null;
    }

    await log(AGENT_NAME, 'success', 'Media hoàn tất — Queue ID: ' + result.contentId, {
      contentId: result.contentId, mediaType: result.mediaType,
      platforms: result.platformOptimized || [], status: 'pending_review',
    });

    return {
      contentId: result.contentId, mediaResult: result.mediaResult,
      logoSpec: result.logoSpec, platformOptimized: result.platformOptimized, status: 'pending_review',
    };
  } catch (error) {
    await log(AGENT_NAME, 'error', 'Media Master lỗi: ' + error.message);
    return null;
  }
}

async function getContentQueue(status = 'pending_review', limit = 20) {
  try {
    let query = db.collection(mediaMasterConfig.contentQueueCollection)
      .orderBy('created_at', 'desc').limit(limit);
    if (status) query = query.where('status', '==', status);
    const snapshot = await query.get();
    const items = [];
    snapshot.forEach((doc) => items.push({ id: doc.id, ...doc.data() }));
    return items;
  } catch (error) {
    await log(AGENT_NAME, 'error', 'Lỗi lấy content queue: ' + error.message);
    return [];
  }
}

async function updateQueueStatus(contentId, status, reviewData = null) {
  try {
    const update = { status, updated_at: FieldValue.serverTimestamp() };
    if (reviewData) update.review = reviewData;
    await db.collection(mediaMasterConfig.contentQueueCollection).doc(contentId).update(update);
    await log(AGENT_NAME, 'success', 'Content ' + contentId + ' → ' + status);
    return true;
  } catch (error) {
    await log(AGENT_NAME, 'error', 'Lỗi cập nhật queue ' + contentId + ': ' + error.message);
    return false;
  }
}

export { analyzeAndQueue, getContentQueue, updateQueueStatus };
