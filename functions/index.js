/**
 * ═════════════════════════════════════════════════════════════════════════
 * 9 TRIP ERP - Firebase Cloud Functions (Modular v2)
 * ═════════════════════════════════════════════════════════════════════════
 */

const { setGlobalOptions } = require('firebase-functions/v2');
setGlobalOptions({ region: 'asia-southeast1' });

const { initializeFirebaseAdmin } = require('./utils/firebase-admin.util');
initializeFirebaseAdmin();

// ─── Import Functions ───
const { syncUserToAuthOnWrite, syncUserAuthDeleteOnDelete, runSyncUserToAuth, runBatchSyncUsers } = require('./api/user-sync.api');
const migrateFieldModule = require('./api/migration.api');
const { validateGoogleLoginOnSignIn } = require('./api/auth-blocking.api');

// IMPORT HÀM MỚI TẠI ĐÂY
const { deleteBooking } = require('./api/bookings.api');
const { archiveOldData } = require('./api/archive.api');
const { dailyReminders } = require('./api/cron.api');

// ─── Export Functions ───
module.exports = {
  syncUserToAuthOnWrite,
  syncUserAuthDeleteOnDelete,
  runSyncUserToAuth,
  runBatchSyncUsers,
  ...migrateFieldModule,
  validateGoogleLoginOnSignIn,

  // XUẤT HÀM MỚI TẠI ĐÂY
  deleteBooking,
  archiveOldData,
  dailyReminders,
};
