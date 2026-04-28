/**
 * ═══════════════════════════════════════════════════════════════════════════
 * User Sync Cloud Functions
 * Handles automatic synchronization of Firestore users with Firebase Auth
 * Updated for Cloud Functions v7 (v2) & Admin SDK v13
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { logger } = require('firebase-functions');
const { onDocumentWritten, onDocumentDeleted } = require('firebase-functions/v2/firestore');
const { onCall } = require('firebase-functions/v2/https');
const { getFirestore } = require('../utils/firebase-admin.util');
const { syncUserToAuth, syncUsersToAuth, deleteUserFromAuth } = require('../services/user-sync.service');
const config = require('../config/system.config');

// ★ Region must match the Firestore database location.
const REGION = config.FIREBASE.REGION; // 'asia-southeast1'

/**
 * TRIGGER: On Firestore "users" document write
 */
exports.syncUserToAuthOnWrite = onDocumentWritten({ document: 'users/{docId}', region: REGION }, async (event) => {
  const docId = event.params.docId;
  const beforeData = event.data.before.data?.();
  const afterData = event.data.after.data?.();

  // Skip if document was deleted
  if (!afterData) {
    logger.info(`ℹ️ User doc ${docId} deleted from Firestore (no sync needed)`);
    return { status: 'skipped', reason: 'document_deleted' };
  }

  // Skip if document is being created with empty data
  if (!beforeData && !afterData) {
    logger.info(`ℹ️ Empty document for user doc ${docId}`);
    return { status: 'skipped', reason: 'empty_document' };
  }

  const authUid = afterData?.uid || docId;

  if (!authUid) {
    logger.warn(`⚠️ Cannot determine Auth UID for doc ${docId} — skipping`);
    return { status: 'skipped', reason: 'no_uid' };
  }

  try {
    const result = await syncUserToAuth(authUid, afterData, beforeData || null);

    if (result.synced) {
      logger.info(`✅ Firestore trigger: User ${authUid} synced to Auth (doc: ${docId})`);
    }

    return result;
  } catch (error) {
    logger.error(`❌ Firestore trigger error for user ${authUid}:`, error);
    return {
      success: false,
      error: error.message,
      uid: authUid,
    };
  }
});

/**
 * TRIGGER: On Firestore "users" document delete
 */
exports.syncUserAuthDeleteOnDelete = onDocumentDeleted({ document: 'users/{uid}', region: REGION }, async (event) => {
  const uid = event.params.uid;

  logger.info(`🗑️ User document deleted from Firestore: ${uid}`);

  try {
    const result = await deleteUserFromAuth(uid);

    if (result.deleted) {
      logger.info(`✅ Firestore trigger: User ${uid} deleted from Firebase Auth`);
    } else if (result.success && !result.deleted) {
      logger.info(`ℹ️ User ${uid} was not in Firebase Auth (already deleted or never synced)`);
    }

    return result;
  } catch (error) {
    logger.error(`❌ Firestore delete trigger error for user ${uid}:`, error);
    return {
      success: false,
      error: error.message,
      uid,
    };
  }
});

/**
 * CALLABLE FUNCTION: Manual sync user to Firebase Auth
 */
exports.runSyncUserToAuth = onCall({ region: REGION, cors: true }, async (request) => {
  if (!request.auth) {
    throw new Error('Bạn phải đăng nhập để sử dụng chức năng này.');
  }

  try {
    const targetUid = request.data?.uid || request.auth.uid;
    const db = getFirestore();

    const userDoc = await db.collection('users').doc(targetUid).get();

    if (!userDoc.exists) {
      throw new Error(`User ${targetUid} not found in Firestore`);
    }

    const result = await syncUserToAuth(targetUid, userDoc.data());

    return result;
  } catch (error) {
    logger.error(`❌ Manual sync error for user ${request.data?.uid}:`, error);
    throw new Error(`Lỗi khi đồng bộ dữ liệu người dùng: ${error.message}`);
  }
});

/**
 * CALLABLE FUNCTION: Batch sync multiple users
 */
exports.runBatchSyncUsers = onCall({ region: REGION, cors: true }, async (request) => {
  if (!request.auth) {
    throw new Error('Bạn phải đăng nhập để sử dụng chức năng này.');
  }

  try {
    if (!Array.isArray(request.data?.uids) || request.data.uids.length === 0) {
      throw new Error('Please provide array of UIDs');
    }

    const result = await syncUsersToAuth(request.data.uids);

    return result;
  } catch (error) {
    logger.error('❌ Batch sync error:', error);
    throw new Error(`Lỗi khi đồng bộ dữ liệu hàng loạt: ${error.message}`);
  }
});
