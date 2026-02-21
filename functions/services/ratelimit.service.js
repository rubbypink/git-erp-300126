/**
 * Rate Limit Service
 * Chống spam & ngăn bill Firebase tăng vọt
 */

const {HttpsError} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");
const {getFirestore} = require("../utils/firebase-admin.util");

/**
 * Rate limit configuration per topic (messages per minute)
 */
const RATE_LIMITS = {
  Sales: 10,
  Operator: 10,
  Accountant: 5,
  All: 5,
  Admin: 100, // Admin có giới hạn cao hơn
};

/**
 * Check if user exceeded rate limit for topic
 * Store counter in Firestore with TTL
 *
 * @param {string} uid - User ID
 * @param {string} topic - Topic name
 * @return {Promise<boolean>} true if within limit, throw error if exceeded
 */
async function checkRateLimit(uid, topic) {
  try {
    const db = getFirestore();
    const limit = RATE_LIMITS[topic] || 5;
    const windowMs = 60 * 1000; // 1 minute window

    // Tạo key duy nhất per user per topic
    const counterKey = `ratelimit_${uid}_${topic}`;
    const counterRef = db.collection("rate_limit_counters").doc(counterKey);

    // Atomic increment counter
    await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(counterRef);

      if (!doc.exists) {
        // Lần đầu -> tạo counter = 1 với expiry
        transaction.set(counterRef, {
          count: 1,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + windowMs),
        });
        return {count: 1, isNew: true};
      }

      const data = doc.data();
      const now = Date.now();
      const createdAt = data.createdAt.toDate().getTime();
      const elapsed = now - createdAt;

      if (elapsed > windowMs) {
        // Window hết hạn -> reset counter
        transaction.update(counterRef, {
          count: 1,
          createdAt: new Date(),
          expiresAt: new Date(now + windowMs),
        });
        return {count: 1, isNew: false};
      }

      // Còn trong window -> increment
      const newCount = data.count + 1;
      transaction.update(counterRef, {
        count: newCount,
        updatedAt: new Date(),
      });
      return {count: newCount, isNew: false};
    });

    // Fetch current count để check
    const current = await counterRef.get();
    const count = current.data().count;

    if (count > limit) {
      logger.warn(
          `⚠️ Rate limit exceeded for user ${uid} on topic ${topic}:
           ${count}/${limit}`,
      );
      throw new HttpsError(
          "resource-exhausted",
          `Quá nhiều yêu cầu. Giới hạn: ${limit} tin/phút. ` +
          `Vui lòng thử lại sau.`,
      );
    }

    logger.debug(
        `✅ Rate limit OK: ${count}/${limit} for ${uid} on ${topic}`,
    );
    return true;
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    logger.error("❌ Error checking rate limit:", error);
    // Fail open - nếu error, cho phép request
    // (tốt hơn là deny & làm user chặn)
    return true;
  }
}

/**
 * Reset rate limit counter (admin only, for testing)
 * @param {string} uid - User ID
 * @param {string} topic - Topic name
 * @return {Promise<boolean>} Success status
 */
async function resetRateLimit(uid, topic) {
  try {
    const db = getFirestore();
    const key = `ratelimit_${uid}_${topic}`;
    await db.collection("rate_limit_counters").doc(key).delete();
    logger.info(
        `✅ Rate limit reset for ${uid} on ${topic}`,
    );
    return true;
  } catch (error) {
    logger.error("❌ Error resetting rate limit:", error);
    throw new HttpsError("internal", "Lỗi reset rate limit");
  }
}

module.exports = {
  checkRateLimit,
  resetRateLimit,
  RATE_LIMITS,
};
