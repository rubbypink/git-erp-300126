/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Accountant API
 * Updated for Cloud Functions v7 (v2) & Admin SDK v13
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { commitFundAccountLogic } from '../services/accountant.service.js';
import config from '../config/system.config.js';

const REGION = config.FIREBASE.REGION;

/**
 * Callable Function: Chốt số dư tài khoản quỹ
 */
export const commitFundAccount = onCall(
  {
    region: REGION,
    enforceAppCheck: false,
    cors: true,
  },
  async (request) => {
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
