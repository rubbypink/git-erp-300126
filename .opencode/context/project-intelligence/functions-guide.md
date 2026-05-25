<!-- Context: project-intelligence/functions | Priority: high | Version: 1.0 | Updated: 2026-05-25 -->

# Cloud Functions Guide

**Purpose**: Patterns, conventions, and reference for both ERP (`functions/`) and AI (`functions-ai/`) Firebase Cloud Functions codebases.
**Audience**: Developers working on backend cloud functions.

---

## 1. Codebase Architecture

| Aspect | `functions/` (ERP) | `functions-ai/` (AI) |
|--------|-------------------|---------------------|
| **firebase.json key** | `default` | `ai-agents` |
| **Node version** | 24 | 24 |
| **Framework** | firebase-functions v7 | firebase-functions v7 + Genkit v1.33 |
| **Key dependency** | firebase-admin v13 | firebase-admin v13 + @genkit-ai/googleai |
| **Deploy command** | `cd functions && npm run deploy` | `cd functions-ai && npm run deploy` |

---

## 2. Firebase Callable v2 Pattern (ERP)

```javascript
// functions/api/example.api.js
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from '../utils/firebase-admin.util.js';

export const myApi = onCall(
    { 
        cors: true,                      // Bắt buộc
        region: 'asia-southeast1',       // Singapore region
        memory: '256MiB',                // Default
        timeoutSeconds: 60,              // Default
    },
    async (request) => {
        // 1. Auth check (ALWAYS first)
        if (!request.auth) {
            throw new HttpsError('unauthenticated', 'Yêu cầu đăng nhập.');
        }

        // 2. Get user profile
        const db = getFirestore();
        const userDoc = await db.collection('users')
            .doc(request.auth.uid).get();
        
        if (!userDoc.exists) {
            throw new HttpsError('permission-denied', 'User không tồn tại.');
        }

        const userData = userDoc.data();

        // 3. Role/permission check
        if (userData.role !== 'admin' && userData.level < 50) {
            throw new HttpsError('permission-denied', 'Không có quyền.');
        }

        // 4. Business logic
        try {
            const result = await doSomething(db, request.data);
            return { success: true, data: result };
        } catch (error) {
            throw new HttpsError('internal', error.message);
        }
    }
);
```

### HttpsError Codes

| Code | HTTP Status | When to Use |
|------|-----------|-------------|
| `unauthenticated` | 401 | No auth token |
| `permission-denied` | 403 | Auth but wrong role |
| `invalid-argument` | 400 | Bad input data |
| `not-found` | 404 | Document not found |
| `already-exists` | 409 | Duplicate |
| `internal` | 500 | Unexpected error |

---

## 3. Firestore Write Triggers (ERP)

```javascript
// functions/index.js
import { onDocumentWritten } from 'firebase-functions/v2/firestore';

export const onBookingWritten = onDocumentWritten(
    {
        document: 'bookings/{bookingId}',
        region: 'asia-southeast1',
    },
    async (event) => {
        const beforeData = event.data?.before?.data();
        const afterData = event.data?.after?.data();
        
        // Detect create vs update vs delete
        if (!beforeData && afterData) {
            // CREATE
        } else if (beforeData && afterData) {
            // UPDATE — compare fields
            const changedFields = getChangedFields(beforeData, afterData);
        } else if (beforeData && !afterData) {
            // DELETE
        }
    }
);
```

---

## 4. ERP Exported Functions

| Function | Type | File | Purpose |
|----------|------|------|---------|
| `syncUserToAuthOnWrite` | Trigger | `user-sync.api.js` | Sync Firestore user → Auth claims on write |
| `syncUserAuthDeleteOnDelete` | Trigger | `user-sync.api.js` | Clean up on user delete |
| `runSyncUserToAuth` | Callable | `user-sync.api.js` | Manual sync trigger |
| `runBatchSyncUsers` | Callable | `user-sync.api.js` | Batch sync all users |
| `migrateField` | Callable | `migration.api.js` | Field migration utility |
| `validateGoogleLoginOnSignIn` | Auth Block | `auth-blocking.api.js` | Validate Google login domain |
| `deleteBooking` | Callable | `bookings.api.js` | Delete booking + details + transactions |
| `archiveOldData` | Callable | `archive.api.js` | Archive old records |
| `dailyReminders` | Scheduled | `cron.api.js` | Daily reminder notifications |
| `syncTransactionOnWrite` | Trigger | `transaction-sync.api.js` | Auto-update fund balances |
| `commitFundAccount` | Callable | `accountant.api.js` | Commit fund account transaction |

---

## 5. Genkit Flow Pattern (AI)

```javascript
// functions-ai/ai/flows/example.flow.js
import { ai } from '../genkit-init.js';
import { z } from 'genkit';
import { getConfig } from '../../.9trip-agents/configs/index.js';

// Get agent config
const config = getConfig('writer');

export const writerFlow = ai.defineFlow(
    {
        name: 'writerFlow',
        inputSchema: z.object({
            planData: z.string(),
            format: z.enum(['article', 'social_post']).default('article'),
        }),
        outputSchema: z.object({
            title: z.string(),
            content: z.string(),
            metadata: z.object({
                wordCount: z.number(),
                readingTime: z.number(),
            }),
        }),
    },
    async (input) => {
        // 1. Build prompt from config + input
        const prompt = config.systemPrompt
            .replace('{{format}}', input.format)
            .replace('{{styleHint}}', config.styleHint || '')
            .replace('{{bannedWords}}', config.bannedWords.join(', '));

        // 2. Generate with AI
        const { output } = await ai.generate({
            model: config.model,
            prompt: `${prompt}\n\nInput data: ${input.planData}`,
            config: {
                temperature: config.temperature || 0.7,
                maxOutputTokens: config.maxTokens || 2000,
            },
        });

        // 3. Extract structured output
        const result = AiManager.extractJSON(output);
        
        // 4. Validate
        return {
            title: result.title,
            content: result.content,
            metadata: {
                wordCount: result.content.split(' ').length,
                readingTime: Math.ceil(result.content.split(' ').length / 200),
            },
        };
    }
);
```

---

## 6. AI Exported Functions

| Function | File | Purpose |
|----------|------|---------|
| `runPipeline` | `orchestrator.api.js` | Start AI content pipeline |
| `getRunningPipelines` | `orchestrator.api.js` | Check active pipelines |
| `scanRSS` | `researcher.api.js` | Scan RSS sources |
| `webSearch` | `researcher.api.js` | Search web for content |
| `generateContent` | `writer.api.js` | Generate article |
| `processMedia` | `media-master.api.js` | Process images/video |
| `manageContentQueue` | `media-master.api.js` | CRUD on `ai_content_queue` |
| `publishToSocial` | `social-publisher.api.js` | Publish to FB/TikTok |
| `chatWithEmily` | `chat.api.js` | Emily chatbot |
| `importDocument` | `import-ai.api.js` | Import AI documents |
| `triggerCrawler` | `crawler-trigger.api.js` | Start hotel crawler |

---

## 7. Firebase Admin Init

**Shared pattern** (both codebases):

```javascript
// functions/utils/firebase-admin.util.js
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

// Singleton init
const app = getApps().length === 0 
    ? initializeApp() 
    : getApps()[0];

const db = getFirestore(app);

export { db, FieldValue, Timestamp };
export const getFirestore = () => db;
```

---

## 8. Security Rules (`firestore.rules`)

```javascript
rules_version = '2';
service cloud.firestore {
    match /databases/{database}/documents {
        // Auth required for ALL reads/writes
        match /{document=**} {
            allow read: if request.auth != null;
            allow write: if request.auth != null;
        }
        
        // Special rule: transactions blocked if status=Completed
        match /transactions/{txId} {
            allow update, delete: if 
                request.auth != null 
                && (!(resource.data.status == 'Completed') 
                    || get(/databases/$(database)/documents/users/$(request.auth.uid)).data.level >= 50);
        }
    }
}
```

---

## 9. Environment & Config

### Functions Config

```bash
# Set config
firebase functions:config:set ai.gemini_key="..."

# Read in code
import { defineSecret } from 'firebase-functions/params';
const GEMINI_KEY = defineSecret('GEMINI_API_KEY');
```

### Local Development

```bash
# Start Firebase emulators
npm run emulator

# Emulator ports:
# Auth: 9099
# Functions: 5001
# Firestore: 8080
# Hosting: 5000

# Dev + emulators together
npm run dev:all
```

### Deploy

```bash
# Deploy hosting only
npm run deploy:hosting

# Deploy ERP functions
cd functions && npm run deploy

# Deploy AI functions
cd functions-ai && npm run deploy

# Deploy everything
firebase deploy
```

---

## 10. Testing

- **No test framework** for ERP functions — single manual test file: `functions/tests/test_transaction_save.mjs`
- **AI tests**: `functions-ai/test-pipeline-agents.js` (pipeline integration), `functions-ai/test-search-layers.js` (search)

---

## Related Files

- `ai-agents-system.md` — AI pipeline deep dive
- `database-dataflow.md` — Firestore schema & data flow
- `erp-architecture.md` — Frontend that calls these functions
