/**
 * ═══════════════════════════════════════════════════════════════════════════
 * User Sync Cloud Functions
 * Handles automatic synchronization of Firestore users with Firebase Auth
 * ═══════════════════════════════════════════════════════════════════════════
 */

const {logger} = require("firebase-functions");
const {onDocumentWritten, onDocumentDeleted} =
    require("firebase-functions/v2/firestore");
const {onCall} = require("firebase-functions/v2/https");
const {getFirestore} = require("../utils/firebase-admin.util");
const {
  syncUserToAuth,
  syncUsersToAuth,
  deleteUserFromAuth,
} = require("../services/user-sync.service");
const config = require("../config/system.config");

/**
 * TRIGGER: On Firestore "users" document write
 * Automatically syncs changes to Firebase Authentication
 *
 * Triggered when:
 * - New user document is created
 * - Existing user document is updated
 *
 * Watches fields: phone, email, name, password, status
 */
exports.syncUserToAuthOnWrite = onDocumentWritten(
    "users/{uid}",
    async (event) => {
      const uid = event.params.uid;
      const beforeData = event.data.before.data?.();
      const afterData = event.data.after.data?.();

      // Skip if document was deleted
      if (!afterData) {
        logger.info(`ℹ️ User ${uid} deleted from Firestore (no sync needed)`);
        return {status: "skipped", reason: "document_deleted"};
      }

      // Skip if document is being created with empty data
      if (!beforeData && !afterData) {
        logger.info(`ℹ️ Empty document for user ${uid}`);
        return {status: "skipped", reason: "empty_document"};
      }

      try {
        const result = await syncUserToAuth(uid, afterData, beforeData || null);

        if (result.synced) {
          logger.info(`✅ Firestore trigger: User ${uid} synced to Auth`);
        }

        return result;
      } catch (error) {
        logger.error(`❌ Firestore trigger error for user ${uid}:`, error);
        return {
          success: false,
          error: error.message,
          uid,
        };
      }
    },
);

/**
 * TRIGGER: On Firestore "users" document delete
 * Automatically deletes corresponding Firebase Auth user
 *
 * Triggered when:
 * - User document is deleted from Firestore
 *
 * Action:
 * - Delete the corresponding Firebase Auth user
 * - Log the deletion
 */
exports.syncUserAuthDeleteOnDelete = onDocumentDeleted(
    "users/{uid}",
    async (event) => {
      const uid = event.params.uid;
      const userData = event.data.data?.();

      logger.info(`🗑️ User document deleted from Firestore: ${uid}`);

      try {
        // Delete corresponding Firebase Auth user
        const result = await deleteUserFromAuth(uid);

        if (result.deleted) {
          logger.info(`✅ Firestore trigger: User ${uid} deleted from Firebase Auth`);
        } else if (result.success && !result.deleted) {
          logger.info(`ℹ️ User ${uid} was not in Firebase Auth (already deleted or never synced)`);
        }

        return result;
      } catch (error) {
        logger.error(`❌ Firestore delete trigger error for user ${uid}:`, error);
        // Note: We don't throw error here because Firestore document is already deleted
        // Just log it to monitor for issues
        return {
          success: false,
          error: error.message,
          uid,
        };
      }
    },
);

/**
 * CALLABLE FUNCTION: Manual sync user to Firebase Auth
 * Allows authorized callers to manually trigger sync
 *
 * Required Auth: Must be authenticated
 * @param {Object} data
 *   - {string} uid - User UID (optional, if not provided uses caller's UID)
 * @return {Promise<Object>}
 *
 * Example:
 *   const result = await runSyncUserToAuth({uid: 'user123'});
 */
exports.runSyncUserToAuth = onCall(async (request) => {
  // Verify user is authenticated
  if (!request.auth) {
    throw new Error("Bạn phải đăng nhập để sử dụng chức năng này.");
  }

  try {
    const targetUid = request.data?.uid || request.auth.uid;
    const db = getFirestore();

    // Get current user data from Firestore
    const userDoc = await db.collection("users").doc(targetUid).get();

    if (!userDoc.exists) {
      throw new Error(`User ${targetUid} not found in Firestore`);
    }

    // Sync to Firebase Auth
    const result = await syncUserToAuth(
        targetUid,
        userDoc.data(),
    );

    return result;
  } catch (error) {
    logger.error(
        `❌ Manual sync error for user ${request.data?.uid}:`,
        error,
    );
    throw new Error(`Lỗi khi đồng bộ dữ liệu người dùng: ${error.message}`);
  }
});

/**
 * CALLABLE FUNCTION: Batch sync multiple users
 * Syncs multiple users to Firebase Auth in bulk
 *
 * Required Auth: Must be authenticated (Admin or special role)
 * @param {Object} data
 *   - {Array<string>} uids - Array of user UIDs to sync
 * @return {Promise<Object>}
 *
 * Example:
 *   const result = await runBatchSyncUsers({uids: ['user1', 'user2']});
 */
exports.runBatchSyncUsers = onCall(async (request) => {
  // Verify user is authenticated
  if (!request.auth) {
    throw new Error("Bạn phải đăng nhập để sử dụng chức năng này.");
  }

  try {
    if (!Array.isArray(request.data?.uids) || request.data.uids.length === 0) {
      throw new Error("Please provide array of UIDs");
    }

    const result = await syncUsersToAuth(request.data.uids);

    return result;
  } catch (error) {
    logger.error("❌ Batch sync error:", error);
    throw new Error(`Lỗi khi đồng bộ dữ liệu hàng loạt: ${error.message}`);
  }
});
