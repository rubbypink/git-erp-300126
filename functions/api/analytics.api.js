/**
 * Analytics & Admin API Handler
 * Cloud Functions for admin dashboard & monitoring
 */

const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");
const auditService = require("../services/audit.service");
const userService = require("../services/user.service");
const config = require("../config/system.config");

/**
 * Cloud Function: getNotificationHistory
 * Get notification history for authenticated user
 * Shows all notifications this user has sent
 *
 * @example
 * const getHistory = httpsCallable(functions, 'getNotificationHistory');
 * const result = await getHistory({ limit: 50 });
 */
exports.getNotificationHistory = onCall(
    {
      region: config.FIREBASE.REGION,
      cors: config.CORS,
      maxInstances: config.FUNCTIONS.MAX_INSTANCES,
      timeoutSeconds: config.FUNCTIONS.TIMEOUT,
    },
    async (request) => {
      try {
        // \u2500\u2500\u2500 PHASE 1: AUTHENTICATION \u2500\u2500\u2500
        if (!request.auth) {
          throw new HttpsError("unauthenticated",
              config.ERRORS.UNAUTHENTICATED);
        }

        const uid = request.auth.uid;
        logger.debug(`\ud83d\udc64 User ${uid} fetching notification history`);

        // \u2500\u2500\u2500 PHASE 2: AUTHORIZATION \u2500\u2500\u2500
        await userService.verifyUserExists(uid);

        // \u2500\u2500\u2500 PHASE 3: VALIDATION \u2500\u2500\u2500
        const {limit = 50} = request.data;
        if (limit < 1 || limit > 500) {
          throw new HttpsError("invalid-argument",
              "Limit must be between 1 and 500");
        }

        // \u2500\u2500\u2500 PHASE 4: BUSINESS LOGIC \u2500\u2500\u2500
        const history = await auditService.getNotificationHistory(uid, limit);

        // \u2500\u2500\u2500 PHASE 5: RESPONSE \u2500\u2500\u2500
        return {
          success: true,
          count: history.length,
          notifications: history,
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        if (error instanceof HttpsError) {
          throw error;
        }

        logger.error("❌ Error fetching history:", error);
        throw new HttpsError("internal", "Unexpected error occurred",
            error.message);
      }
    },
);

/**
 * Cloud Function: getNotificationStats
 * Get notification statistics (admin only)
 * Shows counts by topic, date range, etc.
 *
 * @example
 * const getStats = httpsCallable(functions, 'getNotificationStats');
 * const result = await getStats({
 *   topic: 'Sales',
 *   startDate: new Date('2024-01-01'),
 *   endDate: new Date('2024-01-31')
 * });
 */
exports.getNotificationStats = onCall(
    {
      region: config.FIREBASE.REGION,
      cors: config.CORS,
      maxInstances: config.FUNCTIONS.MAX_INSTANCES,
      timeoutSeconds: config.FUNCTIONS.TIMEOUT,
    },
    async (request) => {
      try {
        // \u2500\u2500\u2500 PHASE 1: AUTHENTICATION \u2500\u2500\u2500
        if (!request.auth) {
          throw new HttpsError("unauthenticated",
              config.ERRORS.UNAUTHENTICATED);
        }

        const uid = request.auth.uid;

        // \u2500\u2500\u2500 PHASE 2: AUTHORIZATION \u2500\u2500\u2500
        // Only admin can access stats
        await userService.verifyUserRole(uid, ["admin", "manager"]);

        logger.debug(`\ud83d\udc64 Admin ${uid} fetching notification stats`);

        // \u2500\u2500\u2500 PHASE 3: VALIDATION \u2500\u2500\u2500
        const {topic, startDate, endDate} = request.data;

        const queryOptions = {};
        if (topic) queryOptions.topic = topic;
        if (startDate) queryOptions.startDate = new Date(startDate);
        if (endDate) queryOptions.endDate = new Date(endDate);

        // \u2500\u2500\u2500 PHASE 4: BUSINESS LOGIC \u2500\u2500\u2500
        const stats = await auditService.getNotificationStats(queryOptions);

        // \u2500\u2500\u2500 PHASE 5: RESPONSE \u2500\u2500\u2500
        return {
          success: true,
          stats: stats,
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        if (error instanceof HttpsError) {
          throw error;
        }

        logger.error("❌ Error fetching stats:", error);
        throw new HttpsError("internal", "Unexpected error occurred",
            error.message);
      }
    },
);
