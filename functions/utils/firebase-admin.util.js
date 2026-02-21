/**
 * Firebase Admin Initialization Utility
 * Singleton pattern - ensures Admin SDK is initialized only once
 */

const admin = require("firebase-admin");
const {logger} = require("firebase-functions");

/**
 * Initialize Firebase Admin SDK (Singleton)
 * @return {admin.app.App} Firebase Admin app instance
 */
function initializeFirebaseAdmin() {
  if (!admin.apps.length) {
    try {
      admin.initializeApp();
      logger.info("✅ Firebase Admin SDK initialized successfully");
    } catch (error) {
      logger.error("❌ Failed to initialize Firebase Admin SDK:", error);
      throw error;
    }
  }
  return admin;
}

/**
 * Get Firestore instance
 * @return {admin.firestore.Firestore}
 */
function getFirestore() {
  return admin.firestore();
}

/**
 * Get Firebase Messaging instance
 * @return {admin.messaging.Messaging}
 */
function getMessaging() {
  return admin.messaging();
}

/**
 * Get Firebase Auth instance
 * @return {admin.auth.Auth}
 */
function getAuth() {
  return admin.auth();
}

module.exports = {
  initializeFirebaseAdmin,
  getFirestore,
  getMessaging,
  getAuth,
  admin, // Export admin object directly if needed
};
