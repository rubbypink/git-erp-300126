/**
 * ═══════════════════════════════════════════════════════════════════════════
 * User Sync Service
 * Synchronizes Firestore user data with Firebase Authentication
 * ═══════════════════════════════════════════════════════════════════════════
 */

const {logger} = require("firebase-functions");
const {getAuth, getFirestore} = require("../utils/firebase-admin.util");

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
  if (!user_phone || typeof user_phone !== "string") {
    return null;
  }

  // Remove whitespace and special characters
  let cleaned = user_phone.trim().replace(/[\s\-\(\)\.]/g, "");

  // Already in E.164 format
  if (cleaned.startsWith("+")) {
    return /^\+\d{10,15}$/.test(cleaned) ? cleaned : null;
  }

  // Convert 0 prefix to +84
  if (cleaned.startsWith("0")) {
    cleaned = "84" + cleaned.slice(1);
  }

  // Add + prefix if not present
  if (!cleaned.startsWith("+")) {
    cleaned = "+" + cleaned;
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
  const oldPhone = oldData?.user_phone || "";
  const newPhone = newData?.user_phone || "";
  if (oldPhone !== newPhone) {
    changes.user_phone = newPhone;
  }

  // Check email
  const oldEmail = oldData?.email || "";
  const newEmail = newData?.email || "";
  if (oldEmail !== newEmail) {
    changes.email = newEmail;
  }

  // Check user_name
  const oldName = oldData?.user_name || "";
  const newName = newData?.user_name || "";
  if (oldName !== newName) {
    changes.user_name = newName;
  }

  // Check password
  const oldPassword = oldData?.password || "";
  const newPassword = newData?.password || "";
  if (oldPassword !== newPassword) {
    changes.password = newPassword;
  }

  // Check status
  const oldStatus = oldData?.status || "";
  const newStatus = newData?.status || "";
  if (oldStatus !== newStatus) {
    changes.status = newStatus;
  }

  return changes;
}

/**
 * Sync Firestore user data with Firebase Auth user
 * Updates only fields that have changed
 *
 * @param {string} uid - User UID (document ID in Firestore)
 * @param {Object} firestoreData - User data from Firestore
 * @param {Object} [previousData] - Previous Firestore data (for change detection)
 * @return {Promise<Object>} Update result with status and details
 */
async function syncUserToAuth(uid, firestoreData, previousData = null) {
  try {
    // Get changed fields
    const changes = previousData 
      ? getChangedFields(previousData, firestoreData)
      : {
          user_phone: firestoreData?.user_phone || "",
          email: firestoreData?.email || "",
          user_name: firestoreData?.user_name || "",
          password: firestoreData?.password || "",
          status: firestoreData?.status || "",
        };

    // If no changes, return early
    if (Object.keys(changes).length === 0) {
      logger.info(`✓ No changes for user ${uid}, skipping sync`);
      return {
        success: true,
        synced: false,
        message: "No changes detected",
        uid,
      };
    }

    const auth = getAuth();
    const updatePayload = {};

    // Process user_phone number
    if ("user_phone" in changes && changes.user_phone) {
      const normalizedPhone = normalizePhoneNumber(changes.user_phone);
      if (normalizedPhone) {
        updatePayload.user_phoneNumber = normalizedPhone;
        logger.info(
            `📱 User ${uid}: user_phone updated to ${normalizedPhone}`,
        );
      } else {
        logger.warn(
            `⚠️ User ${uid}: invalid user_phone format "${changes.user_phone}"`,
        );
      }
    }

    // Process email
    if ("email" in changes && changes.email) {
      updatePayload.email = changes.email;
      logger.info(
          `📧 User ${uid}: email updated to ${changes.email}`,
      );
    }

    // Process user_name (maps to displayName in Auth)
    if ("user_name" in changes && changes.user_name) {
      updatePayload.displayName = changes.user_name;
      logger.info(
          `👤 User ${uid}: displayName updated to ${changes.user_name}`,
      );
    }

    // Process password
    if ("password" in changes && changes.password) {
      updatePayload.password = changes.password;
      logger.info(
          `🔐 User ${uid}: password updated`,
      );
    }

    // Process status (maps to disabled flag)
    // status = "active" → disabled = false
    // status = "inactive" or empty → disabled = true
    if ("status" in changes) {
      updatePayload.disabled = changes.status !== "active" && changes.status !== "enabled";
      logger.info(
          `⚠️ User ${uid}: disabled=${updatePayload.disabled} (status: ${changes.status})`,
      );
    }

    // Apply updates to Firebase Auth
    if (Object.keys(updatePayload).length === 0) {
      logger.info(`ℹ️ User ${uid}: no valid fields to update`);
      return {
        success: true,
        synced: false,
        message: "No valid fields to update",
        uid,
      };
    }

    await auth.updateUser(uid, updatePayload);

    logger.info(`✅ User ${uid} synced successfully:`, {
      fields: Object.keys(updatePayload),
    });

    return {
      success: true,
      synced: true,
      uid,
      updatedFields: Object.keys(updatePayload),
      details: {
        user_phone: changes.user_phone || null,
        email: changes.email || null,
        user_name: changes.user_name || null,
        password: changes.password ? "[REDACTED]" : null,
        status: changes.status || null,
      },
    };
  } catch (error) {
    logger.error(
        `❌ Error syncing user ${uid} to Firebase Auth:`,
        error,
    );

    return {
      success: false,
      synced: false,
      uid,
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
      message: "User successfully deleted from Firebase Auth",
    };
  } catch (error) {
    // If user doesn't exist in Auth, it's not an error
    if (error.code === "auth/user-not-found") {
      logger.info(`ℹ️ User ${uid} not found in Firebase Auth (already deleted or never synced)`);
      return {
        success: true,
        deleted: false,
        uid,
        message: "User not found in Firebase Auth",
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
      const userDoc = await db.collection("users").doc(uid).get();
      if (userDoc.exists) {
        const result = await syncUserToAuth(uid, userDoc.data());
        results.push(result);
      } else {
        results.push({
          success: false,
          uid,
          error: "User not found in Firestore",
        });
      }
    }

    return {
      success: true,
      totalProcessed: results.length,
      results,
    };
  } catch (error) {
    logger.error("❌ Error during batch user sync:", error);
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
