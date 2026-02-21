/**
 * Audit Service
 * Log notification history for business intelligence & compliance
 */

const {logger} = require("firebase-functions");
const {getFirestore} = require("../utils/firebase-admin.util");

/**
 * Log notification as sent
 * Store in Firestore for audit trail & analytics
 *
 * @param {Object} data - Notification data
 * @param {string} data.messageId - FCM message ID
 * @param {string} data.uid - Sender user ID
 * @param {string} data.topic - Topic sent to
 * @param {string} data.title - Message title
 * @param {string} data.body - Message body
 * @param {Object} data.customData - Custom data payload
 * @return {Promise<string>} Document ID in Firestore
 */
async function logNotificationSent(data) {
  try {
    const db = getFirestore();
    const {messageId, uid, topic, title, body, customData = {}} = data;

    const docData = {
      messageId: messageId,
      senderId: uid,
      topic: topic,
      title: title,
      body: body,
      data: customData,
      status: "sent", // Can update later: sent -> delivered -> read
      sentAt: new Date(),
      createdAt: new Date(),
    };

    // Add to notification_logs collection
    const docRef = await db.collection("notification_logs").add(docData);

    logger.info(
        `✅ Notification logged: ${messageId} to ${topic}`,
        {docId: docRef.id},
    );

    return docRef.id;
  } catch (error) {
    logger.error("❌ Error logging notification:", error);
    // Don't throw - failing to log should not block sending
    // But do log the error
    return null;
  }
}

/**
 * Get notification history for user
 * For admin dashboard or user activity log
 *
 * @param {string} uid - User ID
 * @param {number} limit - Max results (default 50)
 * @return {Promise<Array>} List of sent notifications
 */
async function getNotificationHistory(uid, limit = 50) {
  try {
    const db = getFirestore();

    const snapshot = await db.collection("notification_logs")
        .where("senderId", "==", uid)
        .orderBy("sentAt", "desc")
        .limit(limit)
        .get();

    const docs = [];
    snapshot.forEach((doc) => {
      docs.push({
        id: doc.id,
        ...doc.data(),
      });
    });

    logger.debug(`✅ Retrieved ${docs.length} notifications for ${uid}`);
    return docs;
  } catch (error) {
    logger.error("❌ Error retrieving notification history:", error);
    throw error;
  }
}

/**
 * Get statistics for notification sending
 * For analytics dashboard
 *
 * @param {Object} options - Query options
 * @param {string} options.topic - Filter by topic
 * @param {Date} options.startDate - Start date
 * @param {Date} options.endDate - End date
 * @return {Promise<Object>} Statistics
 */
async function getNotificationStats(options = {}) {
  try {
    const db = getFirestore();
    const {topic, startDate, endDate} = options;

    let query = db.collection("notification_logs");

    if (topic) {
      query = query.where("topic", "==", topic);
    }

    if (startDate) {
      query = query.where("sentAt", ">=", startDate);
    }

    if (endDate) {
      query = query.where("sentAt", "<=", endDate);
    }

    const snapshot = await query.get();

    const stats = {
      totalSent: snapshot.size,
      byTopic: {},
      byStatus: {
        sent: 0,
        delivered: 0,
        read: 0,
      },
      dateRange: {
        from: startDate || null,
        to: endDate || null,
      },
    };

    snapshot.forEach((doc) => {
      const data = doc.data();

      // Count by topic
      stats.byTopic[data.topic] = (stats.byTopic[data.topic] || 0) + 1;

      // Count by status
      stats.byStatus[data.status] = (stats.byStatus[data.status] || 0) + 1;
    });

    logger.info(`✅ Generated stats: ${stats.totalSent} notifications`);
    return stats;
  } catch (error) {
    logger.error("❌ Error getting notification stats:", error);
    throw error;
  }
}

/**
 * Update notification status (for delivery tracking)
 * Called when notification is delivered or read
 *
 * @param {string} docId - Document ID in notification_logs
 * @param {string} newStatus - delivered | read
 * @return {Promise<boolean>}
 */
async function updateNotificationStatus(docId, newStatus) {
  try {
    const db = getFirestore();

    await db.collection("notification_logs").doc(docId).update({
      status: newStatus,
      updatedAt: new Date(),
    });

    logger.debug(`✅ Updated notification status: ${newStatus}`);
    return true;
  } catch (error) {
    logger.error("❌ Error updating status:", error);
    return false;
  }
}

module.exports = {
  logNotificationSent,
  getNotificationHistory,
  getNotificationStats,
  updateNotificationStatus,
};
