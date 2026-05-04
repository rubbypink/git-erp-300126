import axios from 'axios';
import mediaMasterConfig from '../../.9trip-agents/configs/media-master.config.js';

const IMG_SIZES = {
  '1:1': { w: 1080, h: 1080 },
  '9:16': { w: 720, h: 1280 },
  '4:5': { w: 1080, h: 1350 },
  '16:9': { w: 1920, h: 1080 },
};

async function downloadImage(url) {
  const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
  return Buffer.from(response.data);
}

function determineFormat(text) {
  const textLower = text.toLowerCase();
  if (textLower.includes('tiktok') || textLower.includes('reels') || textLower.includes('story')) return '9:16';
  if (textLower.includes('blog') || textLower.includes('youtube')) return '16:9';
  if (textLower.includes('instagram') && textLower.includes('portrait')) return '4:5';
  return '1:1';
}

async function processImage(sourceUrl, title, options = {}) {
  const { format = '1:1', logoUrl = mediaMasterConfig.logo.url, logoOpacity = mediaMasterConfig.logo.opacity, logoMaxWidthPercent = mediaMasterConfig.logo.maxWidthPercent, logoPosition = mediaMasterConfig.logo.position } = options;

  const size = IMG_SIZES[format] || IMG_SIZES['1:1'];
  const shortTitle = title.length > 40 ? title.slice(0, 37) + '...' : title;

  console.log(`[ImageProcessor] 🖼️ Processing: ${format} | "${shortTitle}"`);

  const result = {
    sourceUrl,
    processedUrl: null,
    format,
    dimensions: size,
    titleOverlay: shortTitle,
    logoSpec: {
      url: logoUrl,
      position: logoPosition,
      opacity: logoOpacity,
      maxWidthPercent: logoMaxWidthPercent,
    },
    status: 'spec_generated',
    message: `Cần xử lý: resize ${size.w}x${size.h}, overlay text "${shortTitle}", logo tại ${logoPosition}`,
  };

  return result;
}

async function createOgImage(title, context, format = '1:1') {
  const shortTitle = title.length > 40 ? title.slice(0, 37) + '...' : title;
  return {
    title: shortTitle,
    format,
    status: 'og_spec',
    message: `OG Image spec: ${shortTitle}`,
  };
}

export { processImage, createOgImage, IMG_SIZES, determineFormat };
