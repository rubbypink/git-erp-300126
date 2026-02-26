/**
 * ═════════════════════════════════════════════════════════════════════════
 * 9 TRIP ERP - Firebase Cloud Functions (Modular v2)
 * ═════════════════════════════════════════════════════════════════════════
 * Entry point for Cloud Functions
 *
 * Architecture:
 *   config/        - System-wide configuration & constants
 *   utils/         - Utility functions (Firebase Admin init, helpers)
 *   services/      - Business logic (Messaging, User, etc.)
 *   api/           - Cloud Function handlers (public endpoints)
 *   index.js       - Main entry point (imports & exports)
 * ═════════════════════════════════════════════════════════════════════════
 */

// ─── Step 1: Initialize Firebase Admin SDK ───
const {initializeFirebaseAdmin} =
  require("./utils/firebase-admin.util");
initializeFirebaseAdmin();

// ─── Step 2: Import all Cloud Function handlers ───
// FCM Messaging removed — replaced by Firestore onSnapshot on client side.
const {
  syncUserToAuthOnWrite,
  syncUserAuthDeleteOnDelete,
  runSyncUserToAuth,
  runBatchSyncUsers,
} = require("./api/user-sync.api");
const migrateFieldModule = require("./api/migration.api");

// ─── Step 3: Export Cloud Functions (public API) ───
module.exports = {
  // User Sync APIs (Firestore ↔ Auth Synchronization)
  syncUserToAuthOnWrite,
  syncUserAuthDeleteOnDelete,
  runSyncUserToAuth,
  runBatchSyncUsers,

  // Data Migration APIs
  ...migrateFieldModule,

  // Future: Add more Cloud Functions here as you expand
  // Example:
  // getUserData,
  // createNotification,
  // etc.
};
