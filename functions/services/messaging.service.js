/**
 * Messaging Service
 * Handles Firebase Cloud Messaging (FCM) business logic
 */

const {logger} = require("firebase-functions");
const {HttpsError} = require("firebase-functions/v2/https");
const {getMessaging} = require("../utils/firebase-admin.util");
const config = require("../config/system.config");

/**
 * Validate topic before sending message
 * @param {string} topic - Topic name
 * @throws {HttpsError} If topic is invalid
 */
function validateTopic(topic) {
  if (!config.MESSAGING.VALID_TOPICS.includes(topic)) {
    const validTopics = config.MESSAGING.VALID_TOPICS.join(", ");
    throw new HttpsError(
        "invalid-argument",
        `Chủ đề '${topic}' không hợp lệ. ` +
        `Danh sách cho phép: ${validTopics}`,
    );
  }
}

/**
 * Send message to FCM topic
 * @param {string} topic - FCM topic name
 * @param {string} title - Notification title
 * @param {string} [body=''] - Notification body
 * @param {Object} [data={}] - Additional data payload
 * @return {Promise<string>} Message ID
 * @throws {HttpsError} If sending fails
 */
async function sendTopicMessage(topic, title, body = "", data = {}) {
  try {
    // Validate topic
    validateTopic(topic);

    // Build FCM payload
    const messagePayload = {
      notification: {
        title: title || config.MESSAGING.DEFAULT_TITLE,
        body: body || "",
      },
      topic: topic,
    };

    // Add data payload if provided
    if (Object.keys(data).length > 0) {
      messagePayload.data = data;
    }

    // Send message via Firebase Admin SDK
    const messageId = await getMessaging().send(messagePayload);

    logger.info(`✅ Message sent to topic '${topic}'`, {messageId});

    return messageId;
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    logger.error("❌ Error sending message:", error);
    throw new HttpsError(
        "internal",
        config.ERRORS.MESSAGING_ERROR,
        error.message,
    );
  }
}

/**
 * Subscribe FCM token to topics
 * @param {string} token - FCM device token
 * @param {Array<string>} topics - List of topics to subscribe to
 * @return {Promise<Array<string>>} List of subscribed topics
 * @throws {HttpsError} If validation fails
 */
async function subscribeTokenToTopics(token, topics) {
  try {
    // Validate inputs
    if (!token || !topics || !Array.isArray(topics)) {
      throw new HttpsError(
          "invalid-argument",
          config.ERRORS.INVALID_TOKEN,
      );
    }

    // Validate each topic before subscribing
    topics.forEach((topic) => validateTopic(topic));

    // Subscribe to all topics
    const promises = topics.map((topic) =>
      getMessaging().subscribeToTopic(token, topic),
    );

    await Promise.all(promises);

    const tokenPreview = `...${token.substr(-5)}`;
    logger.info(
        `✅ Token ${tokenPreview} subscribed to ${topics.length} topic(s)`,
        {subscribedTopics: topics},
    );

    return topics;
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    logger.error("❌ Error in subscription:", error);
    throw new HttpsError(
        "internal",
        config.ERRORS.SUBSCRIPTION_ERROR,
        error.message,
    );
  }
}

/**
 * Unsubscribe FCM token from topics
 * @param {string} token - FCM device token
 * @param {Array<string>} topics - List of topics to unsubscribe from
 * @return {Promise<Array<string>>} List of unsubscribed topics
 */
async function unsubscribeTokenFromTopics(token, topics) {
  try {
    if (!token || !topics || !Array.isArray(topics)) {
      throw new HttpsError(
          "invalid-argument",
          config.ERRORS.INVALID_TOKEN,
      );
    }

    const promises = topics.map((topic) =>
      getMessaging().unsubscribeFromTopic(token, topic),
    );

    await Promise.all(promises);

    logger.info(`✅ Token unsubscribed from ${topics.length} topic(s)`);

    return topics;
  } catch (error) {
    logger.error("❌ Error unsubscribing:", error);
    throw new HttpsError(
        "internal",
        "Lỗi khi hủy đăng ký topic.",
        error.message,
    );
  }
}

module.exports = {
  sendTopicMessage,
  subscribeTokenToTopics,
  unsubscribeTokenFromTopics,
  validateTopic,
};
