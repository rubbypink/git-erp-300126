/**
 * User Service
 * Handles user-related business logic (authentication, validation, etc.)
 */

const {logger} = require("firebase-functions");
const {HttpsError} = require("firebase-functions/v2/https");
const {getFirestore} = require("../utils/firebase-admin.util");
const config = require("../config/system.config");

/**
 * Verify user exists in Firestore
 * @param {string} uid - User UID from Firebase Auth
 * @return {Promise<Object>} User document data
 * @throws {HttpsError} If user doesn't exist
 */
async function verifyUserExists(uid) {
  try {
    const userDoc = await getFirestore()
        .collection(config.FIREBASE.COLLECTIONS.USERS)
        .doc(uid)
        .get();

    if (!userDoc.exists) {
      logger.warn(`⚠️ User ${uid} not found in database`);
      throw new HttpsError(
          "permission-denied",
          config.ERRORS.USER_NOT_FOUND,
      );
    }

    return userDoc.data();
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    logger.error("❌ Error verifying user:", error);
    throw new HttpsError(
        "internal",
        "Lỗi khi xác thực người dùng.",
        error.message,
    );
  }
}

/**
 * Verify user has required role
 * @param {string} uid - User UID
 * @param {string|Array<string>} requiredRole - Role(s) required
 * @return {Promise<boolean>}
 */
async function verifyUserRole(uid, requiredRole) {
  const userData = await verifyUserExists(uid);
  const userRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
  return userRoles.includes(userData.role);
}

/**
 * Get user data from Firestore
 * @param {string} uid - User UID
 * @return {Promise<Object|null>} User data or null if not found
 */
async function getUserData(uid) {
  try {
    const userDoc = await getFirestore()
        .collection(config.FIREBASE.COLLECTIONS.USERS)
        .doc(uid)
        .get();

    return userDoc.exists ? userDoc.data() : null;
  } catch (error) {
    logger.error("❌ Error getting user data:", error);
    return null;
  }
}

module.exports = {
  verifyUserExists,
  verifyUserRole,
  getUserData,
};
