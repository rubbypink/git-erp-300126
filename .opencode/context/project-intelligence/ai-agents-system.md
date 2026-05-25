<!-- Context: project-intelligence/ai-agents | Priority: critical | Version: 1.0 | Updated: 2026-05-25 -->

# AI Agents System — 8-Step Content Pipeline

**Purpose**: Complete reference for the AI content pipeline architecture, agent configurations, flows, APIs, and content rules.
**Audience**: AI developers, agents working on `functions-ai/` codebase.

---

## 1. Pipeline Overview

```
┌────────────┐    ┌────────────┐    ┌────────────┐    ┌────────────┐
│Orchestrator│───→│ Researcher │───→│  Scoring   │───→│FilterDedup │
│   Step 0   │    │   Step 1   │    │   Step 2   │    │   Step 3   │
└────────────┘    └────────────┘    └────────────┘    └────────────┘
                                                              │
┌────────────┐    ┌────────────┐    ┌────────────┐    ┌──────▼─────┐
│ Publisher  │←───│MediaMaster │←───│   Writer   │←───│Enrichment  │
│   Step 8   │    │   Step 7   │    │   Step 6   │    │   Step 5   │
└────────────┘    └────────────┘    └────────────┘    └────────────┘
       │                                                  ▲
       │              ┌────────────┐                      │
       │              │  Planner   │──────────────────────┘
       │              │   Step 5   │
       │              └────────────┘
       ▼
┌────────────┐
│  Facebook  │
│  TikTok    │
└────────────┘
```

### Standalone Services
| Service | Model | Purpose |
|---------|-------|---------|
| **Emily** (chatbot) | Gemini 2.5 Flash | Tư vấn du lịch Phú Quốc qua chat |
| **Hotel Crawler** | DeepSeek V4 Flash | Tự động crawl giá khách sạn từ web |
| **Analytics** | Gemini Flash | Post-publish engagement metrics |

---

## 2. Agent Model Assignments

| # | Agent | Primary Model | Fallback | Config File |
|---|-------|--------------|----------|-------------|
| 0 | **Orchestrator** | Gemini Flash | — | `prompts_master.js` |
| 1 | **Researcher** | Gemini 2.5 Flash | — | `researcher.config.js` |
| 2 | **Scoring** | Gemini Flash | — | `scoring.config.js` |
| 3 | **FilterDedup** | Gemini Flash | — | `prompts_master.js` |
| 4 | **Enrichment** | Gemini Flash | — | `prompts_master.js` |
| 5 | **Planner** | Gemini Flash | — | `planner.config.js` |
| 6 | **Writer** | **DeepSeek V4 Pro** | — | `writer.config.js` |
| 7 | **MediaMaster** | Gemini 2.5 Flash | — | `media-master.config.js` |
| 8 | **Publisher** | Social API | — | `publisher.config.js` |

**Config Hub**: `functions-ai/.9trip-agents/configs/index.js` — single `require` to get all configs.

---

## 3. NORTH STAR: `prompts_master.js`

**File**: `functions-ai/.9trip-agents/configs/prompts_master.js`
**Purpose**: Định nghĩa TẤT CẢ agents, models, pipeline positions.

### Agent Definition Structure

```javascript
{
    orchestrator: {
        name: 'Orchestrator',
        position: 0,
        model: 'googleai/gemini-flash-latest',
        systemPrompt: `...`,
        outputSchema: z.object({ ... }),
    },
    researcher: {
        name: 'Researcher',
        position: 1,
        model: 'googleai/gemini-2.5-flash',
        config: 'researcher.config.js',
    },
    // ... 6 more agents
}
```

### Pipeline Coordination

Orchestrator quyết định:
- Source nào cần research (URL, RSS feed)
- Agent nào cần chạy (có thể skip nếu không cần)
- Thứ tự và dependencies giữa các agents
- Xử lý lỗi và retry logic

---

## 4. Agent Details

### 4.0 Orchestrator (Step 0)

| Field | Value |
|-------|-------|
| **Input** | User source/URL (manual trigger hoặc scheduled) |
| **Output** | Coordinated pipeline execution |
| **Flow** | `orchestrator.flow.js` |
| **API** | `orchestrator.api.js` — `runPipeline`, `getRunningPipelines` |

### 4.1 Researcher (Step 1)

| Field | Value |
|-------|-------|
| **Input** | RSS URLs, web search queries |
| **Output** | Scored items (articles, news, events về Phú Quốc) |
| **Config** | `researcher.config.js` — scrape prompts, scoring matrix, keywords |
| **Flow** | `researcher-rss.flow.js` |
| **API** | `researcher.api.js` |
| **Keywords** | Phú Quốc, du lịch, khách sạn, resort, vé máy bay, tour, đặc sản, điểm đến |

### 4.2 Scoring (Step 2)

| Field | Value |
|-------|-------|
| **Input** | Researcher output items |
| **Output** | Scored items (4 dimensions) |
| **Config** | `scoring.config.js` |
| **Flow** | `scoring.flow.js` |

**Scoring Dimensions** (weights from `scoring.config.js`):

| Dimension | Weight | Description |
|-----------|--------|-------------|
| **Freshness** | 0.25 | How recent/new is the content? |
| **Trend** | 0.20 | Is this topic trending? |
| **Business Relevance** | 0.30 | How relevant to Phú Quốc tourism business? |
| **Season Fit** | 0.25 | Does it match current season/travel period? |

### 4.3 FilterDedup (Step 3)

| Field | Value |
|-------|-------|
| **Input** | Scored items |
| **Output** | Kept items + removed duplicates |
| **Config** | `prompts_master.js` |
| **Flow** | `filter-dedup.flow.js` |
| **Threshold** | Score > 8/10 → keep; else discard |

### 4.4 Enrichment (Step 4)

| Field | Value |
|-------|-------|
| **Input** | Filtered items |
| **Output** | Items matched with Phú Quốc products (hotels, tours, services) |
| **Config** | `prompts_master.js` |
| **Flow** | `enrichment.flow.js` |
| **Purpose** | Link content ideas to bookable products — tăng business value |

### 4.5 Planner (Step 5)

| Field | Value |
|-------|-------|
| **Input** | Enriched items |
| **Output** | Content plan: angle, target audience, format, key message |
| **Config** | `planner.config.js` — category → angle/target/media maps |
| **Flow** | `planner.flow.js` |

### 4.6 Writer (Step 6) — Core Content Engine

| Field | Value |
|-------|-------|
| **Input** | Planner output + product context |
| **Output** | Mobile First article (Vietnamese) |
| **Model** | **DeepSeek V4 Pro** (primary) |
| **Config** | `writer.config.js` |
| **Flow** | `writer.flow.js` |
| **API** | `writer.api.js` |

### 4.7 MediaMaster (Step 7)

| Field | Value |
|-------|-------|
| **Input** | Writer output (text) |
| **Output** | Media-enhanced content (images with logo overlay, video) |
| **Config** | `media-master.config.js` — visual analysis, logo overlay spec |
| **Flow** | `media-master.flow.js` |
| **API** | `media-master.api.js` |
| **Services** | `image-processor.service.js` (sharp), `video-processor.service.js` (ffmpeg) |

### 4.8 Publisher (Step 8)

| Field | Value |
|-------|-------|
| **Input** | MediaMaster output |
| **Output** | Published posts on Facebook + TikTok |
| **Config** | `publisher.config.js` — API endpoints, token handling |
| **Flow** | Social API integration |
| **API** | `social-publisher.api.js` |

---

## 5. AI Content Rules (MANDATORY)

### Mobile First Format

| Rule | Spec |
|------|------|
| **Title** | Under 60 characters, 1 natural keyword, NO all-caps |
| **Hook** | 1-2 engaging sentences, never start with meaningless greetings |
| **Paragraphs** | Max 3 sentences per paragraph |
| **Sentences** | Max 25 words per sentence |
| **Line breaks** | Every 2-3 sentences, NO dense text blocks |
| **Emoji** | Max 2-3 emoji per article |

### Content Strategy: 80/20 Rule

```
80% Giá trị hữu ích (tips, thông tin, câu chuyện)
20% Soft CTA (gợi ý trải nghiệm, không pushy)
```

### Banned Words (from `writer.config.js`)

> ❌ `đặt ngay`, `mua ngay`, `giảm giá sốc`, `khuyến mãi Hot`, `chạy ngay`, `click ngay`, `deal khủng`, `flash sale`, `săn sale`, `siêu ưu đãi`, `chốt deal`, `fomo`

### Good CTAs (experience-oriented)

```
✅ "Trải nghiệm hoàng hôn Phú Quốc từ cáp treo Hòn Thơm..."
✅ "Ghé thăm chợ đêm Phú Quốc vào thứ 6 hàng tuần..."
```

### Tone

Lively, approachable — như đang kể chuyện cho bạn bè. Không formal, không sales-y.

---

## 6. Template Variables

Các biến được replace tại runtime bởi flows:

| Variable | Usage | Example |
|----------|-------|---------|
| `{{url}}` | URL của source content | `https://...` |
| `{{maxItems}}` | Giới hạn số items | `10` |
| `{{researcherData}}` | Output của Researcher | JSON string |
| `{{format}}` | Định dạng output | `article`, `social_post` |
| `{{lengthHint}}` | Độ dài mong muốn | `300-500 từ` |
| `{{styleHint}}` | Style guide hint | `kể chuyện`, `listicle` |
| `{{bannedWords}}` | Danh sách từ cấm | Array |

---

## 7. Project Structure

```
functions-ai/
├── index.js                    # Exports all cloud functions
├── config/system.config.js     # AI system config
├── utils/firebase-admin.util.js
│
├── api/                        # Cloud Function endpoints
│   ├── orchestrator.api.js     # runPipeline, getRunningPipelines
│   ├── researcher.api.js       # RSS scan + web search
│   ├── writer.api.js           # Content generation
│   ├── media-master.api.js     # Media processing + queue
│   ├── social-publisher.api.js # Facebook/TikTok
│   ├── chat.api.js             # Emily chatbot
│   ├── import-ai.api.js        # Document import
│   └── crawler-trigger.api.js  # Hotel crawler
│
├── ai/
│   ├── ai.manager.js           # AiManager class
│   ├── genkit-init.js          # Genkit initialization
│   ├── schemas/index.js        # Shared Zod schemas
│   ├── tools/
│   │   ├── db-skills.js        # Firestore query tools
│   │   ├── mcp-client.js       # MCP protocol client
│   │   └── phuquoc-search.js   # Web search for Phú Quốc
│   ├── services/
│   │   ├── image-processor.service.js  # Sharp image processing
│   │   ├── video-processor.service.js  # FFmpeg video processing
│   │   └── web-search.service.js       # Web search integration
│   └── flows/                  # 11 flow files
│       ├── orchestrator.flow.js
│       ├── researcher-rss.flow.js
│       ├── scoring.flow.js
│       ├── filter-dedup.flow.js
│       ├── enrichment.flow.js
│       ├── planner.flow.js
│       ├── writer.flow.js
│       ├── media-master.flow.js
│       ├── hotel-crawler.flow.js
│       ├── chatbot.flow.js
│       └── analytics.flow.js
│
└── .9trip-agents/
    ├── configs/                # 11 config files
    │   ├── index.js            # Config hub
    │   ├── prompts_master.js   # NORTH STAR
    │   ├── researcher.config.js
    │   ├── scoring.config.js
    │   ├── planner.config.js
    │   ├── writer.config.js
    │   ├── media-master.config.js
    │   ├── publisher.config.js
    │   ├── emily.config.js
    │   ├── hotel-crawler.config.js
    │   └── analytics.config.js
    ├── rules/rules.md          # Agent behavior rules
    ├── shared-logic/helpers.js # log(), validateResearchData(), pushToContentQueue()
    └── sub-agents/             # Orchestrator wrappers
        ├── researcher_agent.js
        ├── writer_agent.js
        ├── media_master.js
        └── publisher_agent.js
```

---

## 8. AiManager Class

**File**: `functions-ai/ai/ai.manager.js`

```javascript
class AiManager {
    // Extract JSON from LLM response (handles markdown fences)
    static extractJSON(response) { ... }
    
    // Generate with tool calling
    static async generateWithTools(prompt, tools, options) { ... }
    
    // Multi-turn chat with memory
    static async chatWithMemory(sessionId, message, systemPrompt) { ... }
}
```

### Genkit Flow Pattern

```javascript
import { ai } from '../genkit-init.js';
import { z } from 'genkit';

const myFlow = ai.defineFlow(
    {
        name: 'myFlow',
        inputSchema: z.object({ url: z.string() }),
        outputSchema: z.object({ result: z.string() }),
    },
    async (input) => {
        const { output } = await ai.generate({
            model: 'googleai/gemini-flash-latest',
            prompt: `Analyze: ${input.url}`
        });
        return { result: output };
    }
);
```

---

## 9. Shared Helpers

**File**: `functions-ai/.9trip-agents/shared-logic/helpers.js`

```javascript
// Log agent activity to RTDB
log(agent, level, msg, meta);
// Writes to: agent_reports/yyyy-mm-dd/{agent}_{timestamp}

// Filter items by phuQuocRelevance threshold
validateResearchData(data, minScore);

// Push content to Firestore queue
pushToContentQueue(data);
// Writes to: ai_content_queue/{autoId}
```

---

## 10. Matrix Input UI (Frontend)

**File**: `public/src/components/tpl_ai_marketing.html`
**Controller**: `public/src/js/modules/ai/M_AiMarketing.js`

Scoring/review UI pattern:
- Mỗi criterion = 1 hàng, mỗi level = 1 cột
- Click cell = chọn combo (criterion × level)
- Auto-calculate tổng score, hiển thị Pass/Fail
- Score > 8/10 → auto-suggest lưu vào `training-data-vault`

Maps từ `phuQuocRelevance` scoring matrix trong `researcher.config.js`.

---

## 11. Deployment

```bash
# Deploy AI functions only
cd functions-ai && npm run deploy

# Both codebases deploy independently
firebase deploy --only functions:default    # ERP
firebase deploy --only functions:ai-agents  # AI
```

---

## Related Files

- `technical-domain.md` — Full tech stack
- `functions-guide.md` — Cloud Functions patterns
- `decisions-log.md` — ADR-005 (Genkit), ADR-006 (Config-driven)
