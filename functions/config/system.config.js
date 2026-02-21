/**
 * System Configuration
 * Centralized configuration for Cloud Functions
 */

module.exports = {
  // Messaging configuration
  MESSAGING: {
    VALID_TOPICS: ["Sales", "Operator", "Accountant", "All", "Admin"],
    DEFAULT_TITLE: "Thông báo ERP",
    // Rate limiting (messages per minute per user per topic)
    RATE_LIMITS: {
      Sales: 10,
      Operator: 10,
      Accountant: 5,
      All: 5,
      Admin: 100, // Admin có giới hạn cao hơn
    },
  },

  // Firebase configuration
  FIREBASE: {
    REGION: "asia-southeast1",
    COLLECTIONS: {
      USERS: "users",
      MESSAGES: "messages",
      NOTIFICATION_LOGS: "notification_logs",
      RATE_LIMIT_COUNTERS: "rate_limit_counters",
      USER_SUBSCRIPTIONS: "user_subscriptions",
      USER_NOTIFICATION_PREFS: "user_notification_prefs",
    },
  },

  // CORS configuration - whitelist domains
  CORS: [
    "https://9tripphuquoc.com",
    "https://www.9tripphuquoc.com",
    "http://localhost:5000",
    "http://127.0.0.1:5000",
  ],

  // Cloud Function configuration
  FUNCTIONS: {
    MAX_INSTANCES: 10,
    TIMEOUT: 60, // seconds
  },

  // Error messages (Vietnamese)
  ERRORS: {
    UNAUTHENTICATED: "Truy cập bị từ chối: Vui lòng đăng nhập hệ thống ERP.",
    INVALID_TOKEN: "Token hoặc danh sách Topic không hợp lệ.",
    USER_NOT_FOUND:
      "Tài khoản của bạn không tồn tại trong hệ thống nhân sự.",
    MESSAGING_ERROR: "Lỗi hệ thống khi gửi tin nhắn.",
    SUBSCRIPTION_ERROR: "Lỗi khi đăng ký topic.",
  },
};
