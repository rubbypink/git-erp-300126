/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Accountant API
 * Cloud Functions cho nghiệp vụ kế toán
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { commitFundAccountLogic } = require('../services/accountant.service');
const config = require('../config/system.config');

const REGION = config.FIREBASE.REGION;

/**
 * Callable Function: Chốt số dư tài khoản quỹ
 */
exports.commitFundAccount = onCall(
  {
    region: REGION,
    enforceAppCheck: false, // Tùy chỉnh theo cấu hình bảo mật của dự án
  },
  async (request) => {
    // Kiểm tra auth
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Vui lòng đăng nhập để thực hiện thao tác này.');
    }

    const { accountId, start, end } = request.data;

    if (!accountId) {
      throw new HttpsError('invalid-argument', 'Thiếu accountId.');
    }

    try {
      const newBalance = await commitFundAccountLogic(accountId, start, end);
      return {
        success: true,
        accountId,
        newBalance,
      };
    } catch (error) {
      throw new HttpsError('internal', error.message);
    }
  }
);
