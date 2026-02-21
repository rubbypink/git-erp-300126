/**
 * Messaging API Handler
 * Cloud Function: sendTopicMessage
 * Responsible for handling requests to send messages to FCM topics
 */

const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");
const messagingService = require("../services/messaging.service");
const userService = require("../services/user.service");
const rateLimitService = require("../services/ratelimit.service");
const auditService = require("../services/audit.service");
const config = require("../config/system.config");

/**
 * Cloud Function: sendTopicMessage
 * Send a message to FCM topic (authenticated users only)
 *
 * @example
 * const functions = getFunctions();
 * const sendTopicMessage = httpsCallable(functions, 'sendTopicMessage');
 * const result = await sendTopicMessage({
 *   topic: 'Sales',
 *   title: 'New Order',
 *   body: 'You have a new order waiting',
 *   data: { orderId: '123' }
 * });
 */
exports.sendTopicMessage = onCall(
    {
      region: config.FIREBASE.REGION,
      cors: config.CORS,
      maxInstances: config.FUNCTIONS.MAX_INSTANCES,
      timeoutSeconds: config.FUNCTIONS.TIMEOUT,
    },
    async (request) => {
      try {
        // ─── PHASE 1: AUTHENTICATION ───
        if (!request.auth) {
          logger.warn("⚠️ Unauthenticated request to sendTopicMessage");
          throw new HttpsError(
              "unauthenticated",
              config.ERRORS.UNAUTHENTICATED,
          );
        }

        const uid = request.auth.uid;
        logger.debug(`👤 User ${uid} calling sendTopicMessage`);

        // ─── PHASE 2: AUTHORIZATION ───
        // Verify user exists in database
        await userService.verifyUserExists(uid);

        // ─── PHASE 3: VALIDATION ───
        const {topic, title, body, data} = request.data;

        if (!topic || !title) {
          throw new HttpsError(
              "invalid-argument",
              "Topic and title are required",
          );
        }

        // ─── PHASE 4: RATE LIMITING ───
        await rateLimitService.checkRateLimit(uid, topic);

        // ─── PHASE 5: BUSINESS LOGIC ───
        const messageId = await messagingService.sendTopicMessage(
            topic,
            title,
            body,
            data,
        );

        // ─── PHASE 6: AUDIT LOGGING ───
        await auditService.logNotificationSent({
          messageId: messageId,
          uid: uid,
          topic: topic,
          title: title,
          body: body,
          customData: data,
        });

        // ─── PHASE 7: RESPONSE ───
        return {
          success: true,
          messageId: messageId,
          timestamp: new Date().toISOString(),
          topic: topic,
        };
      } catch (error) {
      // Handle known errors
        if (error instanceof HttpsError) {
          throw error;
        }

        // Unexpected error
        logger.error("❌ Unexpected error in sendTopicMessage:", error);
        throw new HttpsError(
            "internal",
            "Unexpected error occurred",
            error.message,
        );
      }
    },
);
