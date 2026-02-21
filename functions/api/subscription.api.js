/**
 * Subscription API Handler
 * Cloud Function: subscribeToTopics
 * Responsible for subscribing FCM tokens to topics
 */

const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");
const admin = require("firebase-admin");
const messagingService = require("../services/messaging.service");
const tokenValidator = require("../utils/token-validator.util");
const config = require("../config/system.config");

/**
 * Cloud Function: subscribeToTopics
 * Subscribe an FCM device token to one or more topics
 *
 * @example
 * const functions = getFunctions();
 * const subscribeToTopics = httpsCallable(functions, 'subscribeToTopics');
 * const result = await subscribeToTopics({
 *   token: 'device-token-here',
 *   topics: ['Sales', 'All']
 * });
 */
exports.subscribeToTopics = onCall(
    {
      region: config.FIREBASE.REGION,
      cors: config.CORS,
      maxInstances: config.FUNCTIONS.MAX_INSTANCES,
      timeoutSeconds: config.FUNCTIONS.TIMEOUT,
    },
    async (request) => {
      try {
        // ─── PHASE 1: DATA EXTRACTION ───
        const {token, topics} = request.data;

        logger.debug("📝 Subscribe request received", {
          tokenPreview: `...${token.substr(-5)}`,
          topicsCount: topics.length,
        });

        // ─── PHASE 2: VALIDATION ───
        if (!token || !topics || !Array.isArray(topics)) {
          throw new HttpsError(
              "invalid-argument",
              config.ERRORS.INVALID_TOKEN,
          );
        }

        // Validate FCM token format
        tokenValidator.validateFCMToken(token);

        // ─── PHASE 3: BUSINESS LOGIC ───
        const subscribedTopics = await messagingService.subscribeTokenToTopics(
            token,
            topics,
        );

        // ─── PHASE 3.5: SEND ADMIN NOTIFICATION ───
        // ★ NEW: Gửi thông báo tới admin về thiết bị mới subscribe
        try {
          if (request.auth && request.auth.uid) {
            // Fetch user profile từ Firestore
            const userDoc = await admin
                .firestore()
                .collection("users")
                .doc(request.auth.uid)
                .get();

            if (userDoc.exists) {
              const userData = userDoc.data();
              const userName = userData.user_name || userData.email || "Unknown User";

              // Gửi thông báo tới admin topic
              await messagingService.sendTopicMessage("Admin", {
                title: "🔔 Thiết bị mới đã kết nối",
                body: `${userName} vừa đăng nhập từ thiết bị mới`,
                data: {
                  type: "device_subscription",
                  userId: request.auth.uid,
                  userName: userName,
                  timestamp: new Date().toISOString(),
                  url: "/admin/devices",
                },
              });

              logger.info("✅ Admin notification sent", {
                userId: request.auth.uid,
                userName: userName,
                topics: subscribedTopics,
              });
            }
          }
        } catch (notificationError) {
          // Log error nhưng không fail request
          logger.warn("⚠️ Failed to send admin notification", {
            error: notificationError.message,
            userId: request.auth?.uid,
          });
        }

        // ─── PHASE 4: RESPONSE ───
        return {
          success: true,
          subscribed: subscribedTopics,
          count: subscribedTopics.length,
          adminNotified: request.auth ? true : false, // ★ NEW: Báo admin notification status
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
      // Handle known errors
        if (error instanceof HttpsError) {
          throw error;
        }

        // Unexpected error
        logger.error("❌ Unexpected error in subscribeToTopics:", error);
        throw new HttpsError(
            "internal",
            "Unexpected error occurred",
            error.message,
        );
      }
    },
);

/**
 * Cloud Function: unsubscribeFromTopics
 * Unsubscribe an FCM device token from one or more topics
 */
exports.unsubscribeFromTopics = onCall(
    {
      region: config.FIREBASE.REGION,
      cors: config.CORS,
      maxInstances: config.FUNCTIONS.MAX_INSTANCES,
      timeoutSeconds: config.FUNCTIONS.TIMEOUT,
    },
    async (request) => {
      try {
        // ─── PHASE 1: DATA EXTRACTION ───
        const {token, topics} = request.data;

        logger.debug("📝 Unsubscribe request received", {
          tokenPreview: `...${token.substr(-5)}`,
          topicsCount: topics.length,
        });

        // ─── PHASE 2: VALIDATION ───
        if (!token || !topics || !Array.isArray(topics)) {
          throw new HttpsError(
              "invalid-argument",
              config.ERRORS.INVALID_TOKEN,
          );
        }

        // Validate FCM token format
        tokenValidator.validateFCMToken(token);

        // ─── PHASE 3: BUSINESS LOGIC ───
        const unsubscribedTopics =
          await messagingService.unsubscribeTokenFromTopics(
              token,
              topics,
          );

        // ─── PHASE 4: RESPONSE ───
        return {
          success: true,
          unsubscribed: unsubscribedTopics,
          count: unsubscribedTopics.length,
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        if (error instanceof HttpsError) {
          throw error;
        }

        logger.error("❌ Error in unsubscribeFromTopics:", error);
        throw new HttpsError(
            "internal",
            "Unexpected error occurred",
            error.message,
        );
      }
    },
);
