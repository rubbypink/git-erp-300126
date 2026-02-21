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
const {sendTopicMessage} = require("./api/messaging.api");
const {subscribeToTopics, unsubscribeFromTopics} =
  require("./api/subscription.api");
const {getNotificationHistory, getNotificationStats} =
  require("./api/analytics.api");
const {
  syncUserToAuthOnWrite,
  syncUserAuthDeleteOnDelete,
  runSyncUserToAuth,
  runBatchSyncUsers,
} = require("./api/user-sync.api");

// ─── Step 3: Export Cloud Functions (public API) ───
module.exports = {
  // Messaging APIs
  sendTopicMessage,
  subscribeToTopics,
  unsubscribeFromTopics,

  // Analytics & Admin APIs
  getNotificationHistory,
  getNotificationStats,

  // User Sync APIs (Firestore ↔ Auth Synchronization)
  syncUserToAuthOnWrite,
  syncUserAuthDeleteOnDelete,
  runSyncUserToAuth,
  runBatchSyncUsers,

  // Future: Add more Cloud Functions here as you expand
  // Example:
  // getUserData,
  // createNotification,
  // etc.
};

/**
 * ═════════════════════════════════════════════════════════════════════════
 * HOW TO CALL THESE FUNCTIONS FROM CLIENT
 * ═════════════════════════════════════════════════════════════════════════
 *
 * 1. SEND MESSAGE TO TOPIC (Authenticated Users)
 *    ─────────────────────────────────────────────
 *    const functions = getFunctions();
 *    const sendMsg = httpsCallable(functions,
 *                                   'sendTopicMessage');
 *
 *      // Optional: Additional data
 *      data: {
 *        orderId: '001',
 *        url: '/order/001'
 *      }
 *        orderId: '001',
 *        customUrl: '/order/001'
 *      }
 *    });
 *
 * 2. SUBSCRIBE TOKEN TO TOPICS
 *    ──────────────────────────
 *    const functions = getFunctions();
 *    const subscribe = httpsCallable(functions, 'subscribeToTopics');
 *
 *    const result = await subscribe({
 *      token: 'FCM_TOKEN_HERE',           // Required: Device FCM token
 *      topics: ['Sales', 'All']           // Required: Array of topics
 *    });
 *
 * 3. UNSUBSCRIBE TOKEN FROM TOPICS
 *    ──────────────────────────────
 *    const functions = getFunctions();
 *    const unsubscribe = httpsCallable(functions, 'unsubscribeFromTopics');
 *
 *    const result = await unsubscribe({
 *      token: 'FCM_TOKEN_HERE',           // Required: Device FCM token
 *      topics: ['Sales']                  // Required: Topics to unsubscribe
 *    });
 *
 * ═════════════════════════════════════════════════════════════════════════
 */
