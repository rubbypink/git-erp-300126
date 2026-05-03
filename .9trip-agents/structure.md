# 9 TRIP AI AGENTS — CẤU TRÚC HỆ THỐNG

## Pipeline Multi-Agent

```
Researcher → Writer → MediaMaster → Publisher
   (Cào & Chấm)  (Viết)  (Chỉnh ảnh)  (Đăng)
```

**Kim chỉ nam**: `.9trip-agents/configs/prompts_master.js` — đọc TRƯỚC làm SAU.

---

## TARGET CODEBASE — Chỉ tập trung vào 2 thư mục

### 1. `.9trip-agents/` — Linh hồn (Tư duy, Prompt, Config, Rules)

```
.9trip-agents/
├── configs/                        ← System Prompts, Scoring Matrix, Instructions
│   ├── index.js                    ← Hub — require 1 lần lấy tất cả config
│   ├── prompts_master.js           ← MASTER — AGENT_CONFIGS, MASTER_PROMPTS, Kim chỉ nam
│   ├── researcher.config.js        ← Researcher Agent (Gemini 1.5 Flash)
│   ├── hotel-crawler.config.js     ← Hotel Crawler Agent (DeepSeek)
│   ├── emily.config.js             ← Emily Chatbot (Gemini 2.5 Flash)
│   ├── writer.config.js            ← Writer Agent (DeepSeek V4 Pro)
│   ├── media-master.config.js      ← Media Master Agent (Gemini 1.5 Flash)
│   └── publisher.config.js         ← Publisher Agent (Social API — Facebook, TikTok)
├── rules/
│   └── rules.md                    ← Quy tắc hành vi BẮT BUỘC
├── shared-logic/                   ← Helper dùng chung (log, validate, training vault, queue)
│   └── helpers.js                  ← log(), validateResearchData(), extractTopic(), getTrainingSamples(), pushToContentQueue()
├── sub-agents/                     ← Agent orchestrators — điều phối flow + config + log
│   ├── researcher_agent.js         ← Re-export từ functions-ai/ai/flows/
│   ├── writer_agent.js             ← Writer Agent (DeepSeek V4 Pro) — validate, train, write, report
│   └── publisher_agent.js         ← Publisher (Social API) — Facebook, TikTok, refresh token, log RTDB
└── structure.md                    ← File này
```

### 2. `functions-ai/` — Hành động (Cloud Functions thực thi)

```
functions-ai/
├── ai/
│   ├── flows/                      ← Genkit flows (code thực thi)
│   │   ├── researcher-rss.flow.js  ← Researcher Flow
│   │   ├── writer.flow.js          ← Writer Flow
│   │   └── media-master.flow.js    ← Media Master Flow (visual analysis + queue)
│   ├── tools/                      ← AI Tools (MCP, search, DB skills)
│   │   ├── db-skills.js
│   │   ├── mcp-client.js
│   │   └── phuquoc-search.js
│   ├── ai.manager.js               ← AiManager class (extractJSON, generateWithTools, chatWithMemory)
│   ├── genkit-init.js              ← Khởi tạo Genkit AI
│   └── index.js
├── api/                            ← Callable Cloud Functions
│   ├── researcher.api.js
│   ├── writer.api.js
│   ├── media-master.api.js         ← mediaMaster, getContentQueue, reviewContent
│   └── social-publisher.api.js     ← publishContent, getPublishLogs, getPublishStatus
├── config/                         ← Config riêng functions
├── utils/                          ← Utilities (firebase-admin.util, RTDB support)
└── index.js                        ← Entry point — export tất cả functions
```

---

## Content Queue — ai_content_queue (Firestore)

Media Master push kết quả vào `ai_content_queue` collection để chờ duyệt qua Matrix Input UI:

```
ai_content_queue/{docId}
├── visualAnalysis: { topic, mood, keyElements }
├── suggestions: [{ format, sceneDescription, dominantColors, emotionKey, textOverlay, logoPosition, mediaSource }]
├── logoSpec: { url, position, opacity, maxWidthPercent }
├── writerContent: { title, content, cta, hashtags, format }
├── sourceTopic: string
├── platformOptimized: ['Facebook', 'TikTok', ...]
├── status: 'pending_review' | 'approved' | 'rejected' | 'revision'
├── review: { matrixScore, notes, reviewer }
├── created_at: Timestamp
└── updated_at: Timestamp
```

---

## KHÔNG VIẾT CODE AI MỚI vào `functions/`

| Codebase | Directory | firebase.json key | Purpose |
|----------|-----------|-------------------|---------|
| `default` | `functions/` | `default` | ERP business logic — KHÔNG liên quan AI |
| `ai-agents` | `functions-ai/` | `ai-agents` | AI sub-agents — TARGET CODEBASE |

---

## Agent Configs Mapping

| Config file | Agent | Model | Controls |
|-------------|-------|-------|----------|
| `prompts_master.js` | MASTER | — | AGENT_CONFIGS, MASTER_PROMPTS — Kim chỉ nam |
| `researcher.config.js` | Researcher | Gemini 1.5 Flash | RSS scrape/extract prompts, scoring matrix |
| `writer.config.js` | Writer | DeepSeek V4 Pro | Writing style, CTA rules, banned words |
| `media-master.config.js` | Media Master | Gemini 1.5 Flash | Visual analysis, logo overlay, media sources, content queue |
| `publisher.config.js` | Publisher | Social API (no AI) | Facebook/TikTok configs, token handling, publish rules, format mapping |
| `hotel-crawler.config.js` | Hotel Crawler | DeepSeek V4 Pro | Multi-page scrape, extraction rules |
| `emily.config.js` | Emily Chatbot | Gemini 2.5 Flash | Identity, tools mapping, chat sessions |

---

## Quy tắc quan trọng

1. **Sửa hành vi Agent → sửa config** trong `.9trip-agents/configs/`, KHÔNG sửa code flow.
2. **Helper First** — Dùng helper sẵn có (log, validateResearchData, pushToContentQueue, AiManager).
3. **Mobile First** — Cho mọi Dashboard AI và nội dung sinh ra.
4. **Matrix Input** — Cho UI chấm điểm và duyệt nội dung trong `ai_content_queue`.
5. **80/20 Content** — 80% giá trị + 20% CTA nhẹ nhàng.
6. **Data Loop** — Researcher chấm > 8/10 → auto gợi ý lưu `training-data-vault`.
7. **Report Logging** — Ghi log vào `agent_reports/yyyy-mm-dd/` trong Firebase Realtime Database.
8. **Content Queue** — Media Master push → `ai_content_queue` (pending_review) → Matrix Input duyệt → approved → Publisher đăng Social.
9. **Publish Logging** — Publisher ghi mọi kết quả (post ID, lỗi API, refresh token) vào RTDB + Firestore `ai_publish_logs`.
10. **Video TikTok** — Truyền URL Firebase Storage, KHÔNG stream buffer để tránh Cloud Functions timeout.
8. **Content Queue** — Media Master push xong → `ai_content_queue` (pending_review) → Matrix Input duyệt → approved/rejected/revision.