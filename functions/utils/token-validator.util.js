/**
 * FCM Token Validator Utility
 * Validate FCM token format before processing
 */

const {HttpsError} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");

/**
 * Validate FCM token format
 * FCM tokens are typically:
 * - Base64-like strings
 * - 150-200+ characters
 * - Contains alphanumeric, dash, underscore
 *
 * @param {string} token - FCM token to validate
 * @return {boolean} true if valid
 * @throws {HttpsError} if invalid
 */
function validateFCMToken(token) {
  // Check if token is string
  if (typeof token !== "string") {
    throw new HttpsError(
        "invalid-argument",
        "Token phải là chuỗi ký tự",
    );
  }

  // Check length (FCM tokens typically 152+ chars)
  if (token.length < 100) {
    throw new HttpsError(
        "invalid-argument",
        "Token quá ngắn (tối thiểu 100 ký tự)",
    );
  }

  if (token.length > 300) {
    throw new HttpsError(
        "invalid-argument",
        "Token quá dài (max 300 ký tự)",
    );
  }

  // Check allowed characters: alphanumeric, dash,
  // underscore, colon (for some tokens)
  const FCM_TOKEN_REGEX = /^[a-zA-Z0-9_:-]+$/;
  if (!FCM_TOKEN_REGEX.test(token)) {
    throw new HttpsError(
        "invalid-argument",
        "Token chứa ký tự không hợp lệ",
    );
  }

  logger.debug(`✅ FCM token valid: ${token.substring(0, 10)}...`);
  return true;
}

/**
 * Batch validate multiple tokens
 *
 * @param {Array<string>} tokens - List of tokens
 * @return {boolean} true if all valid
 */
function validateFCMTokens(tokens) {
  if (!Array.isArray(tokens)) {
    throw new HttpsError(
        "invalid-argument",
        "Tokens phải là mảng",
    );
  }

  if (tokens.length === 0) {
    throw new HttpsError(
        "invalid-argument",
        "Token list không được rỗng",
    );
  }

  tokens.forEach((token, idx) => {
    try {
      validateFCMToken(token);
    } catch (err) {
      throw new HttpsError(
          "invalid-argument",
          `Token ${idx} không hợp lệ: ${err.message}`,
      );
    }
  });

  return true;
}

module.exports = {
  validateFCMToken,
  validateFCMTokens,
};
