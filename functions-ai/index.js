/**
 * ═════════════════════════════════════════════════════════════════════════
 * 9 TRIP ERP — AI Agents Cloud Functions (Codebase: ai-agents)
 * Chứa tất cả Sub-agent: Researcher, Writer, MediaMaster, ...
 * Và các AI Service: Emily Chatbot, Document Import, Hotel Crawler
 * Deploy riêng qua: firebase deploy --only functions:ai-agents
 * ═════════════════════════════════════════════════════════════════════════
 */
import { setGlobalOptions } from 'firebase-functions/v2';
setGlobalOptions({ region: 'asia-southeast1' });

import './utils/firebase-admin.util.js';

import { researcherScanRSS } from './api/researcher.api.js';
import { writerGenerate } from './api/writer.api.js';
import { mediaMaster, getContentQueue, reviewContent } from './api/media-master.api.js';
import { publishContent as publishContentFn, getPublishLogs, getPublishStatus } from './api/social-publisher.api.js';
import { chatWithEmily } from './api/chat.api.js';
import { processDocumentAI } from './api/import-ai.api.js';
import { crawlerDataOnline } from './api/crawler-trigger.api.js';
import { runPipeline } from './api/orchestrator.api.js';

export { researcherScanRSS, writerGenerate, mediaMaster, getContentQueue, reviewContent, publishContentFn as publishContent, getPublishLogs, getPublishStatus, chatWithEmily, processDocumentAI, crawlerDataOnline, runPipeline };
