/**
 * Auth Blocking API
 * Xử lý các trigger chặn trước khi đăng nhập / tạo tài khoản
 * Updated for Cloud Functions v7 (v2) & Admin SDK v13
 */

const { beforeUserSignedIn } = require('firebase-functions/v2/identity');
const { HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const { getFirestore } = require('../utils/firebase-admin.util');
const config = require('../config/system.config');

const validateGoogleLoginOnSignIn = beforeUserSignedIn(async (event) => {
  const user = event.data;
  const credential = event.credential;

  if (credential && credential.providerId === 'google.com') {
    const userEmail = user.email;

    if (!userEmail) {
      logger.error('❌ Đăng nhập Google thất bại: Không lấy được email.');
      throw new HttpsError('invalid-argument', 'Không nhận diện được email từ Google.');
    }

    try {
      const db = getFirestore();
      const collectionName = config.FIREBASE?.COLLECTIONS?.USERS || 'users';

      const userQuerySnapshot = await db.collection(collectionName).where('email', '==', userEmail).limit(1).get();

      // 1. Kiểm tra email có tồn tại không
      if (userQuerySnapshot.empty) {
        logger.warn(`⚠️ Từ chối đăng nhập: Email ${userEmail} chưa được cấp quyền.`);
        throw new HttpsError('permission-denied', 'Email của bạn chưa được đăng ký trên hệ thống ERP. Vui lòng liên hệ Quản trị viên!');
      }

      // 2. Lấy dữ liệu user và kiểm tra trạng thái hoạt động (status === true)
      const userData = userQuerySnapshot.docs[0].data();

      if (userData.status !== true) {
        logger.warn(`⚠️ Từ chối đăng nhập: User ${userEmail} đang bị vô hiệu hóa (status: ${userData.status}).`);
        throw new HttpsError('permission-denied', 'Tài khoản của bạn đã bị khóa hoặc chưa được kích hoạt. Vui lòng liên hệ Quản trị viên!');
      }

      logger.info(`✅ Chấp nhận đăng nhập Google: Email ${userEmail} hợp lệ và đang Active.`);
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }
      logger.error('❌ Lỗi truy vấn database xác thực:', error);
      throw new HttpsError('internal', 'Lỗi máy chủ khi xác thực thông tin đăng nhập.');
    }
  }

  return {};
});

module.exports = {
  validateGoogleLoginOnSignIn,
};
