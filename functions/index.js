/**
 * ═════════════════════════════════════════════════════════════════════════
 * 9 TRIP ERP - Firebase Cloud Functions (Modular v2)
 * Updated for Cloud Functions v7 (v2) & Admin SDK v13
 * ═════════════════════════════════════════════════════════════════════════
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const { setGlobalOptions } = require('firebase-functions/v2');
setGlobalOptions({ region: 'asia-southeast1' });

const { initializeFirebaseAdmin } = require('./utils/firebase-admin.util');
initializeFirebaseAdmin();

// ─── Import Functions ───
const { syncUserToAuthOnWrite, syncUserAuthDeleteOnDelete, runSyncUserToAuth, runBatchSyncUsers } = require('./api/user-sync.api');
const migrateFieldModule = require('./api/migration.api');
const { validateGoogleLoginOnSignIn } = require('./api/auth-blocking.api');

const { deleteBooking } = require('./api/bookings.api');
const { archiveOldData } = require('./api/archive.api');
const { dailyReminders } = require('./api/cron.api');
const { syncTransactionOnWrite } = require('./api/transaction-sync.api');
const { commitFundAccount } = require('./api/accountant.api');
const { processDocumentAI } = require('./api/import-ai.api');
const { chatWithEmily } = require('./api/chat.api');
const { crawlerDataOnline } = require('./api/crawler-trigger.api');

// ─── Export Functions ───
module.exports = {
    syncUserToAuthOnWrite,
    syncUserAuthDeleteOnDelete,
    runSyncUserToAuth,
    runBatchSyncUsers,
    ...migrateFieldModule,
    validateGoogleLoginOnSignIn,
    deleteBooking,
    archiveOldData,
    dailyReminders,
    syncTransactionOnWrite,
    commitFundAccount,
    // AI Import API (Frontend sẽ gọi tên hàm này)
    processDocumentAI,
    chatWithEmily,
    crawlerDataOnline,
};
