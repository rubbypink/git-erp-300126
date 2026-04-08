/**
 * Firebase Admin Initialization Utility
 * Singleton pattern - ensures Admin SDK is initialized only once
 * Updated for Firebase Admin SDK v13 (Modular)
 */

const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const { getAuth } = require('firebase-admin/auth');
const { logger } = require('firebase-functions');

/**
 * Initialize Firebase Admin SDK (Singleton)
 * @return {import('firebase-admin/app').App} Firebase Admin app instance
 */
function initializeFirebaseAdmin() {
  const apps = getApps();
  if (!apps.length) {
    try {
      const app = initializeApp();
      logger.info('✅ Firebase Admin SDK v13 initialized successfully');
      return app;
    } catch (error) {
      logger.error('❌ Failed to initialize Firebase Admin SDK:', error);
      throw error;
    }
  }
  return apps[0];
}

/**
 * Get Firestore instance
 * @return {import('firebase-admin/firestore').Firestore}
 */
function getFirestoreInstance() {
  return getFirestore();
}

/**
 * Get Firebase Messaging instance
 * @return {import('firebase-admin/messaging').Messaging}
 */
function getMessagingInstance() {
  return getMessaging();
}

/**
 * Get Firebase Auth instance
 * @return {import('firebase-admin/auth').Auth}
 */
function getAuthInstance() {
  return getAuth();
}

module.exports = {
  initializeFirebaseAdmin,
  getFirestore: getFirestoreInstance,
  getMessaging: getMessagingInstance,
  getAuth: getAuthInstance,
};
