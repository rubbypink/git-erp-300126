import axios from 'axios';
import { db, rtdb } from '../../utils/firebase-admin.util.js';
import { FieldValue } from 'firebase-admin/firestore';
import publisherConfig from '../configs/publisher.config.js';
import { log } from '../shared-logic/helpers.js';

const AGENT_NAME = 'publisher_agent';
const fb = publisherConfig.platforms.facebook;
const tk = publisherConfig.platforms.tiktok;

async function publishToFacebook(content) {
  const pageId = process.env[fb.pageIdEnv];
  const accessToken = process.env[fb.pageAccessTokenEnv];
  if (!pageId || !accessToken) throw new Error('Thiếu FB_PAGE_ID hoặc FB_PAGE_ACCESS_TOKEN');

  const url = fb.graphBaseUrl + '/' + fb.graphVersion + '/' + pageId + '/feed';
  const payload = { message: content.message, access_token: accessToken };
  if (content.link) payload.link = content.link;

  let response;
  let retryCount = 0;
  while (retryCount < fb.maxRetries) {
    try {
      response = await axios.post(url, payload, { timeout: fb.timeoutMs, headers: { 'Content-Type': 'application/json' } });
      break;
    } catch (error) {
      retryCount++;
      if (error.response?.status === 190 || error.response?.status === 401) {
        await log(AGENT_NAME, 'warn', 'Facebook token hết hạn — thử refresh...');
        const refreshed = await refreshFacebookToken();
        if (refreshed) { payload.access_token = process.env[fb.pageAccessTokenEnv]; continue; }
        throw new Error('Facebook token expired: ' + error.message);
      }
      if (retryCount >= fb.maxRetries) throw new Error('Facebook publish failed after ' + retryCount + ' retries: ' + error.message);
      await new Promise((r) => setTimeout(r, fb.retryDelayMs));
    }
  }

  const postId = response?.data?.id;
  if (!postId) throw new Error('Facebook trả về không có post ID.');
  return { success: true, postId, platform: 'facebook' };
}

async function publishPhotoToFacebook(content) {
  const pageId = process.env[fb.pageIdEnv];
  const accessToken = process.env[fb.pageAccessTokenEnv];
  if (!pageId || !accessToken) throw new Error('Thiếu FB credentials.');
  if (!content.imageUrl) throw new Error('publishPhotoToFacebook yêu cầu imageUrl.');

  const url = fb.graphBaseUrl + '/' + fb.graphVersion + '/' + pageId + '/photos';
  const response = await axios.post(url, {
    url: content.imageUrl, message: content.message, access_token: accessToken,
  }, { timeout: fb.timeoutMs });

  const photoId = response?.data?.id;
  if (!photoId) throw new Error('Facebook Photo API trả về không có photo ID.');
  return { success: true, postId: photoId, platform: 'facebook_photo' };
}

async function refreshFacebookToken() {
  try {
    const longLivedToken = process.env[fb.longLivedTokenEnv];
    if (!longLivedToken) return false;
    const appId = process.env.FB_APP_ID;
    const appSecret = process.env.FB_APP_SECRET;
    if (!appId || !appSecret) return false;

    const response = await axios.get(fb.tokenRefreshUrl, {
      params: { grant_type: 'fb_exchange_token', client_id: appId, client_secret: appSecret, fb_exchange_token: longLivedToken },
      timeout: 15000,
    });
    const newToken = response?.data?.access_token;
    if (!newToken) return false;
    process.env[fb.pageAccessTokenEnv] = newToken;
    await log(AGENT_NAME, 'success', 'Facebook token refresh thành công.');
    return true;
  } catch (error) {
    await log(AGENT_NAME, 'error', 'Facebook token refresh thất bại: ' + error.message);
    return false;
  }
}

async function publishToTikTok(content) {
  const clientKey = process.env[tk.clientKeyEnv];
  const accessToken = process.env[tk.accessTokenEnv];
  if (!clientKey || !accessToken) throw new Error('Thiếu TikTok credentials.');
  if (!content.videoUrl) throw new Error('publishToTikTok yêu cầu videoUrl.');

  const initUrl = tk.baseUrl + '/' + tk.apiVersion + '/post/publish/content/init/';
  const initPayload = {
    post_info: {
      title: (content.title || '').slice(0, 150),
      description: content.description || '',
      privacy_level: 'PUBLIC_TO_EVERYONE',
    },
    source_info: { source: 'PULL_FROM_URL', video_url: content.videoUrl },
  };
  if (content.hashtags?.length > 0) {
    initPayload.post_info.hashtag_names = content.hashtags.slice(0, 5);
  }

  let retryCount = 0;
  while (retryCount < tk.maxRetries) {
    try {
      const initResponse = await axios.post(initUrl, initPayload, {
        timeout: tk.timeoutMs,
        headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
      });
      const publishId = initResponse?.data?.data?.publish_id;
      if (!publishId) throw new Error('TikTok init failed: ' + JSON.stringify(initResponse?.data));
      return { success: true, postId: publishId, platform: 'tiktok' };
    } catch (error) {
      retryCount++;
      if (error.response?.status === 401 || error.response?.status === 403) {
        const refreshed = await refreshTikTokToken();
        if (refreshed) continue;
        throw new Error('TikTok token expired: ' + error.message);
      }
      if (retryCount >= tk.maxRetries) throw new Error('TikTok failed after ' + retryCount + ' retries: ' + error.message);
      await new Promise((r) => setTimeout(r, tk.retryDelayMs));
    }
  }
}

async function refreshTikTokToken() {
  try {
    const clientKey = process.env[tk.clientKeyEnv];
    const clientSecret = process.env[tk.clientSecretEnv];
    const refreshToken = process.env[tk.refreshTokenEnv];
    if (!clientKey || !clientSecret || !refreshToken) return false;

    const response = await axios.post(tk.baseUrl + '/' + tk.apiVersion + '/oauth/token/', {
      client_key: clientKey, client_secret: clientSecret, grant_type: 'refresh_token', refresh_token: refreshToken,
    }, { timeout: 15000 });

    const newAccessToken = response?.data?.access_token;
    const newRefreshToken = response?.data?.refresh_token;
    if (!newAccessToken) return false;
    process.env[tk.accessTokenEnv] = newAccessToken;
    if (newRefreshToken) process.env[tk.refreshTokenEnv] = newRefreshToken;
    return true;
  } catch (error) {
    await log(AGENT_NAME, 'error', 'TikTok refresh failed: ' + error.message);
    return false;
  }
}

async function publishContent(contentId, options = {}) {
  const { platforms = ['facebook'] } = options;
  const results = {};

  try {
    await log(AGENT_NAME, 'info', 'Bắt đầu publish content [' + contentId + ']...');
    const docRef = db.collection(publisherConfig.contentQueueCollection).doc(contentId);
    const doc = await docRef.get();
    if (!doc.exists) throw new Error('Content ' + contentId + ' không tồn tại.');

    const contentData = doc.data();
    if (publisherConfig.rules.requireApprovedStatus && contentData.status !== 'approved') {
      throw new Error('Content ' + contentId + ' chưa approved (status: ' + contentData.status + ').');
    }

    const wc = contentData.writerContent || {};
    const title = wc.title || contentData.sourceTopic || 'Phú Quốc Experience';
    const body = wc.content || '';
    const cta = wc.cta || '';
    const hashtags = wc.hashtags || [];
    const format = wc.format || 'social_post';

    for (const platform of platforms) {
      try {
        if (platform === 'facebook' && publisherConfig.platforms.facebook.enabled) {
          const message = formatFacebookMessage(title, body, cta, hashtags);
          const publishPayload = { message };
          if (contentData.mediaResult?.processedUrl) {
            publishPayload.imageUrl = contentData.mediaResult.processedUrl;
          }
          results.facebook = publishPayload.imageUrl
            ? await publishPhotoToFacebook(publishPayload)
            : await publishToFacebook(publishPayload);
        } else if (platform === 'tiktok' && publisherConfig.platforms.tiktok.enabled) {
          const videoUrl = contentData.mediaResult?.processedUrl || contentData.videoUrl;
          if (!videoUrl) {
            results.tiktok = { success: false, error: 'Thiếu video URL.' };
            continue;
          }
          results.tiktok = await publishToTikTok({
            title: title.slice(0, 150),
            description: body.slice(0, 100) + '\n' + hashtags.map((h) => '#' + h).join(' '),
            videoUrl, hashtags,
          });
        }
      } catch (platformError) {
        results[platform] = { success: false, error: platformError.message };
      }
    }

    const anySuccess = Object.values(results).some((r) => r.success);
    const newStatus = anySuccess ? 'published' : 'publish_failed';

    await docRef.update({
      status: newStatus, published_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(), publish_results: results,
    });

    await db.collection(publisherConfig.publishLogCollection).add({
      contentId, title: title.slice(0, 100), platforms, results,
      status: newStatus, published_at: FieldValue.serverTimestamp(),
    });

    return { contentId, status: newStatus, results };
  } catch (error) {
    await log(AGENT_NAME, 'error', 'Publisher lỗi: ' + error.message);
    try {
      await db.collection(publisherConfig.contentQueueCollection).doc(contentId).update({
        status: 'publish_failed', publish_error: error.message, updated_at: FieldValue.serverTimestamp(),
      });
    } catch (_) {}
    return { contentId, status: 'publish_failed', error: error.message, results };
  }
}

function formatFacebookMessage(title, body, cta, hashtags) {
  const parts = [];
  if (title) parts.push(title);
  if (body) parts.push(body.slice(0, 450));
  if (cta) parts.push('\n' + cta);
  if (hashtags?.length) parts.push('\n' + hashtags.map((h) => '#' + h).join(' '));
  return parts.join('\n\n').slice(0, 5000);
}

export { publishContent, publishToFacebook, publishPhotoToFacebook, publishToTikTok, refreshFacebookToken, refreshTikTokToken };
