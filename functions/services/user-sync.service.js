/**
 * ═══════════════════════════════════════════════════════════════════════════
 * User Sync Service
 * Synchronizes Firestore user data with Firebase Authentication
 * Updated for Firebase Admin SDK v13 (Modular)
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { logger } = require('firebase-functions');
const { getAuth, getFirestore } = require('../utils/firebase-admin.util');

/**
 * Convert Vietnamese user_phone number to international format (E.164)
 * Examples:
 *   "0909123456" → "+84909123456"
 *   "+84909123456" → "+84909123456" (no change)
 *   "909123456" → "+84909123456"
 *
 * @param {string} user_phone - Phone number to convert
 * @return {string|null} Formatted user_phone number or null if invalid
 */
function normalizePhoneNumber(user_phone) {
  if (!user_phone || typeof user_phone !== 'string') {
    return null;
  }

  // Remove whitespace and special characters
  let cleaned = user_phone.trim().replace(/[\s\-\(\)\.]/g, '');

  // Already in E.164 format
  if (cleaned.startsWith('+')) {
    return /^\+\d{10,15}$/.test(cleaned) ? cleaned : null;
  }

  // Convert 0 prefix to +84
  if (cleaned.startsWith('0')) {
    cleaned = '84' + cleaned.slice(1);
  }

  // Add + prefix if not present
  if (!cleaned.startsWith('+')) {
    cleaned = '+' + cleaned;
  }

  // Validate E.164 format
  return /^\+\d{10,15}$/.test(cleaned) ? cleaned : null;
}

/**
 * Check if user data has actual changes
 * @param {Object} oldData - Previous user data from Firestore
 * @param {Object} newData - New user data from Firestore
 * @return {Object} Object containing fields that changed and their new values
 */
function getChangedFields(oldData, newData) {
  const changes = {};

  // Check user_phone
  const oldPhone = oldData?.user_phone || '';
  const newPhone = newData?.user_phone || '';
  if (oldPhone !== newPhone) {
    changes.user_phone = newPhone;
  }

  // Check email
  const oldEmail = oldData?.email || '';
  const newEmail = newData?.email || '';
  if (oldEmail !== newEmail) {
    changes.email = newEmail;
  }

  // Check user_name
  const oldName = oldData?.user_name || '';
  const newName = newData?.user_name || '';
  if (oldName !== newName) {
    changes.user_name = newName;
  }

  // Check password
  const oldPassword = oldData?.password || '';
  const newPassword = newData?.password || '';
  if (oldPassword !== newPassword) {
    changes.password = newPassword;
  }

  // Check status
  const oldStatus = oldData?.status || '';
  const newStatus = newData?.status || '';
  if (oldStatus !== newStatus) {
    changes.status = newStatus;
  }

  return changes;
}

/**
 * Sync Firestore user data with Firebase Auth user.
 * Updates only fields that have changed.
 *
 * Firestore `users` document fields:
 *   uid        - Firebase Auth UID (field + used as doc ID)
 *   user_phone - Vietnamese phone (normalized to E.164)
 *   user_name  - Display name
 *   email      - Email address
 *   password   - Plain-text password (written once)
 *   status     - "active"|"inactive" (maps to Auth `disabled`)
 *
 * @param {string} uid - Auth UID (from document's `uid` field or doc ID)
 * @param {Object} firestoreData - User data from Firestore
 * @param {Object} [previousData] - Previous data (for change detection)
 * @return {Promise<Object>} Update result with status and details
 */
async function syncUserToAuth(uid, firestoreData, previousData = null) {
  // Prefer the `uid` field inside the document over the passed-in param.
  // This ensures we always target the correct Firebase Auth user even when
  // the Firestore document ID differs from the Auth UID.
  const authUid = uid || firestoreData?.uid;
  try {
    // Get changed fields.
    // For new users (no previousData): collect all non-empty fields so the
    // early-exit works and we don't send empty strings to Firebase Auth.
    const rawChanges = previousData
      ? getChangedFields(previousData, firestoreData)
      : {
          user_phone: firestoreData?.user_phone || '',
          email: firestoreData?.email || '',
          user_name: firestoreData?.user_name || '',
          password: firestoreData?.password || '',
          status: firestoreData?.status || '',
        };

    // Filter empty-string values (new users only) — they carry no information.
    const changes = previousData ? rawChanges : Object.fromEntries(Object.entries(rawChanges).filter(([, v]) => v !== ''));

    // If no changes, return early
    if (Object.keys(changes).length === 0) {
      logger.info(`✓ No changes for user ${authUid}, skipping sync`);
      return {
        success: true,
        synced: false,
        message: 'No changes detected',
        uid: authUid,
      };
    }

    const auth = getAuth();
    const updatePayload = {};

    // Process phone number.
    // Firebase Auth uses `phoneNumber` field (not `user_phoneNumber`).
    if ('user_phone' in changes && changes.user_phone) {
      const normalizedPhone = normalizePhoneNumber(changes.user_phone);
      if (normalizedPhone) {
        updatePayload.phoneNumber = normalizedPhone;
        logger.info(`📱 User ${authUid}: phoneNumber → ${normalizedPhone}`);
      } else {
        logger.warn(`⚠️ User ${authUid}: invalid user_phone "${changes.user_phone}"`);
      }
    }

    // Process email
    if ('email' in changes && changes.email) {
      updatePayload.email = changes.email;
      logger.info(`📧 User ${authUid}: email updated to ${changes.email}`);
    }

    // Process user_name (maps to displayName in Auth)
    if ('user_name' in changes && changes.user_name) {
      updatePayload.displayName = changes.user_name;
      logger.info(`👤 User ${authUid}: displayName → ${changes.user_name}`);
    }

    // Process password
    if ('password' in changes && changes.password) {
      updatePayload.password = changes.password;
      logger.info(`🔐 User ${authUid}: password updated`);
    }

    // Process status (maps to disabled flag)
    // status = "active" → disabled = false
    // status = "inactive" or empty → disabled = true
    if ('status' in changes) {
      updatePayload.disabled = changes.status !== 'active' && changes.status !== 'enabled' && changes.status !== 'true';
      logger.info(`⚠️ User ${authUid}: disabled=${updatePayload.disabled}` + ` (status: ${changes.status})`);
    }

    // Apply updates to Firebase Auth
    if (Object.keys(updatePayload).length === 0) {
      logger.info(`ℹ️ User ${authUid}: no valid fields to update`);
      return {
        success: true,
        synced: false,
        message: 'No valid fields to update',
        uid: authUid,
      };
    }

    // ─── Create or Update Firebase Auth user ──────────────────────────
    // For new Firestore documents, the Auth user may not exist yet.
    // Check first: call createUser() for new users, updateUser() for existing.
    let userExists = true;
    try {
      await auth.getUser(authUid);
    } catch (getError) {
      if (getError.code === 'auth/user-not-found') {
        userExists = false;
      } else {
        throw getError; // Unexpected error — propagate up
      }
    }

    let action;
    if (userExists) {
      await auth.updateUser(authUid, updatePayload);
      action = 'updated';
      logger.info(`✅ User ${authUid} updated in Firebase Auth:`, {
        fields: Object.keys(updatePayload),
      });
    } else {
      // createUser requires uid to be passed explicitly
      await auth.createUser({ uid: authUid, ...updatePayload });
      action = 'created';
      logger.info(`✅ User ${authUid} created in Firebase Auth:`, {
        fields: Object.keys(updatePayload),
      });
    }

    return {
      success: true,
      synced: true,
      action,
      uid: authUid,
      updatedFields: Object.keys(updatePayload),
      details: {
        user_phone: changes.user_phone || null,
        email: changes.email || null,
        user_name: changes.user_name || null,
        password: changes.password ? '[REDACTED]' : null,
        status: changes.status || null,
      },
    };
  } catch (error) {
    logger.error(`❌ Error syncing user ${firestoreData?.uid || uid} to Firebase Auth:`, error);

    return {
      success: false,
      synced: false,
      uid: firestoreData?.uid || uid,
      error: error.message,
    };
  }
}

/**
 * Delete user from Firebase Authentication
 * Called when user document is deleted from Firestore
 *
 * @param {string} uid - User UID to delete from Auth
 * @return {Promise<Object>} Deletion result with status
 */
async function deleteUserFromAuth(uid) {
  try {
    const auth = getAuth();

    // Attempt to delete user from Firebase Auth
    await auth.deleteUser(uid);

    logger.info(`✅ User ${uid} deleted from Firebase Auth`);

    return {
      success: true,
      deleted: true,
      uid,
      message: 'User successfully deleted from Firebase Auth',
    };
  } catch (error) {
    // If user doesn't exist in Auth, it's not an error
    if (error.code === 'auth/user-not-found') {
      logger.info(`ℹ️ User ${uid} not found in Firebase Auth (already deleted or never synced)`);
      return {
        success: true,
        deleted: false,
        uid,
        message: 'User not found in Firebase Auth',
      };
    }

    logger.error(`❌ Error deleting user ${uid} from Firebase Auth:`, error);
    return {
      success: false,
      deleted: false,
      uid,
      error: error.message,
    };
  }
}

/**
 * Sync multiple users or perform batch sync
 * @param {Array<string>} uids - Array of user UIDs to sync
 * @return {Promise<Object>} Batch sync result
 */
async function syncUsersToAuth(uids = []) {
  try {
    const db = getFirestore();
    const results = [];

    for (const uid of uids) {
      const userDoc = await db.collection('users').doc(uid).get();
      if (userDoc.exists) {
        const result = await syncUserToAuth(uid, userDoc.data());
        results.push(result);
      } else {
        results.push({
          success: false,
          uid,
          error: 'User not found in Firestore',
        });
      }
    }

    return {
      success: true,
      totalProcessed: results.length,
      results,
    };
  } catch (error) {
    logger.error('❌ Error during batch user sync:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

module.exports = {
  normalizePhoneNumber,
  getChangedFields,
  syncUserToAuth,
  syncUsersToAuth,
  deleteUserFromAuth,
};
