import axios from 'axios';
import mediaMasterConfig from '../../.9trip-agents/configs/media-master.config.js';

async function downloadVideo(url) {
  const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000 });
  return Buffer.from(response.data);
}

function buildVideoSpec(input, options = {}) {
  const { trimStart = 0, trimDuration = 8, scaleWidth = 720, scaleHeight = 1280, title = '', bgMusicUrl = null, logoUrl = mediaMasterConfig.logo.url, logoPosition = mediaMasterConfig.logo.position } = options;

  const shortTitle = title.length > 40 ? title.slice(0, 37) + '...' : title;

  console.log(`[VideoProcessor] 🎬 Spec: trim ${trimStart}+${trimDuration}s | scale ${scaleWidth}x${scaleHeight} | "${shortTitle}"`);

  const spec = {
    sourceUrl: input,
    trim: { start: trimStart, duration: Math.min(Math.max(trimDuration, 5), 10) },
    scale: { w: scaleWidth, h: scaleHeight },
    textOverlay: {
      text: shortTitle,
      position: 'bottom_center',
      fontSize: 36,
      color: '#FFFFFF',
      bgColor: 'rgba(0,0,0,0.5)',
    },
    logo: {
      url: logoUrl,
      position: logoPosition,
      opacity: mediaMasterConfig.logo.opacity,
    },
    backgroundMusic: bgMusicUrl ? { url: bgMusicUrl, volume: 0.3 } : null,
    outputFormat: 'mp4',
    status: 'spec_generated',
    message: `Cần xử lý FFmpeg: trim ${trimStart}-${trimStart + trimDuration}s, scale 9:16, text overlay, music`,
  };

  return spec;
}

function suggestTrimPoints(contentType) {
  const map = {
    review: { start: 2, duration: 8 },
    tour: { start: 0, duration: 10 },
    am_thuc: { start: 1, duration: 6 },
    event: { start: 0, duration: 8 },
    tip: { start: 0, duration: 7 },
  };
  return map[contentType] || { start: 0, duration: 8 };
}

export { buildVideoSpec, suggestTrimPoints, downloadVideo };
