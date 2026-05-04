import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getFirestore } from '../utils/firebase-admin.util.js';
import { FieldValue } from 'firebase-admin/firestore';

const deleteBooking = onCall({ cors: true, region: 'asia-southeast1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Yêu cầu đăng nhập.');

  const uid = request.auth.uid;
  const { bookingId } = request.data;
  if (!bookingId) throw new HttpsError('invalid-argument', 'Thiếu bookingId.');

  const db = getFirestore();

  try {
    // 1. Check Level User
    const userRef = db.collection('users').doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) throw new HttpsError('permission-denied', 'User không tồn tại.');
    const userData = userSnap.data();
    const userLevel = userData.level || 0;

    if (userLevel < 10) {
      throw new HttpsError('permission-denied', 'Bạn không có quyền xóa booking này.');
    }

    // 2. Server TỰ ĐỌC ĐỂ KIỂM CHỨNG
    const bookingRef = db.collection('bookings').doc(bookingId);
    const bookingSnap = await bookingRef.get();
    if (!bookingSnap.exists) throw new HttpsError('not-found', 'Booking không tồn tại.');

    // Khởi tạo các biến để lấy dữ liệu 1 lần
    const allDetails = await db.collection('booking_details').where('booking_id', '==', bookingId).get();
    const allOps = await db.collection('operator_entries').where('booking_id', '==', bookingId).get();
    const allTx = await db.collection('transactions').where('booking_id', '==', bookingId).get();

    // Hàm kiểm tra các điều kiện ràng buộc
    let isSafeToDelete = true;
    let warningMsg = '';

    // 1. Check Cọc
    if ((bookingSnap.data().deposit_amount || 0) > 0) {
      isSafeToDelete = false;
      warningMsg += 'Đã có tiền cọc. ';
    } else {
      // 2. Check Operator Debt bằng JS
      let hasDebt = false;
      allOps.forEach((doc) => {
        if ((doc.data().debt_balance || 0) > 0) hasDebt = true;
      });
      if (hasDebt) {
        isSafeToDelete = false;
        warningMsg += 'Đang có công nợ NCC. ';
      }

      // 3. Check Transactions bằng JS
      if (isSafeToDelete) {
        let hasCompletedTx = false;
        allTx.forEach((doc) => {
          if (doc.data().status === 'Completed') hasCompletedTx = true;
        });
        if (hasCompletedTx) {
          isSafeToDelete = false;
          warningMsg += 'Có phiếu thu/chi đã hoàn thành. ';
        }
      }
    }

    // NẾU KHÔNG AN TOÀN -> BẮT BUỘC LEVEL >= 50
    if (!isSafeToDelete && userLevel < 50) {
      throw new HttpsError('permission-denied', `Booking này ${warningMsg} Chỉ Quản lý (Level >= 50) mới được ép xóa!`);
    }

    // THỰC THI BATCH DELETE
    const batch = db.batch();
    batch.delete(bookingRef);
    allDetails.forEach((doc) => batch.delete(doc.ref));
    allOps.forEach((doc) => batch.delete(doc.ref));
    allTx.forEach((doc) => batch.delete(doc.ref));

    // 5. TRACKING: TẠO NOTIFICATION CHO ADMIN
    const notifRef = db.collection('notifications').doc();
    batch.set(notifRef, {
      title: isSafeToDelete ? 'Thông báo: Xóa Booking' : 'CẢNH BÁO: ÉP XÓA BOOKING',
      message: `Nhân viên ${userData.email} (Level ${userLevel}) vừa xóa Booking ID: ${bookingId}. Trạng thái: ${isSafeToDelete ? 'An toàn' : 'ÉP XÓA - ' + warningMsg}`,
      type: isSafeToDelete ? 'info' : 'alert',
      created_at: FieldValue.serverTimestamp(),
      role: 'admin',
      group: ['admin', 'manager'],
      is_read: false,
      target_users: [bookingSnap.data().staff_id],
    });

    await batch.commit();

    return { success: true, message: 'Đã xóa Booking an toàn.' };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    logger.error('❌ Lỗi xóa Booking:', error);
    throw new HttpsError('internal', 'Lỗi server khi xóa Booking.');
  }
});

export { deleteBooking };
