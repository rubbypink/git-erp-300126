/**
 * ═════════════════════════════════════════════════════════════════════════
 * 9 TRIP ERP - Firebase Cloud Functions (Modular v2)
 * Updated for Cloud Functions v7 (v2) & Admin SDK v13
 * ═════════════════════════════════════════════════════════════════════════
 */

import dotenv from 'dotenv/config';
import { setGlobalOptions } from 'firebase-functions/v2';
setGlobalOptions({ region: 'asia-southeast1' });

import { initializeFirebaseAdmin } from './utils/firebase-admin.util.js';
initializeFirebaseAdmin();

import { syncUserToAuthOnWrite, syncUserAuthDeleteOnDelete, runSyncUserToAuth, runBatchSyncUsers } from './api/user-sync.api.js';
import { migrateField } from './api/migration.api.js';
import { validateGoogleLoginOnSignIn } from './api/auth-blocking.api.js';
import { deleteBooking } from './api/bookings.api.js';
import { archiveOldData } from './api/archive.api.js';
import { dailyReminders } from './api/cron.api.js';
import { syncTransactionOnWrite } from './api/transaction-sync.api.js';
import { commitFundAccount } from './api/accountant.api.js';

export { syncUserToAuthOnWrite, syncUserAuthDeleteOnDelete, runSyncUserToAuth, runBatchSyncUsers, migrateField, validateGoogleLoginOnSignIn, deleteBooking, archiveOldData, dailyReminders, syncTransactionOnWrite, commitFundAccount };
