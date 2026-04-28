/**
 * Archive API
 * Updated for Cloud Functions v7 (v2) & Admin SDK v13
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const { getFirestore } = require('../utils/firebase-admin.util');
const config = require('../config/system.config');

const archiveOldData = onCall(
  {
    region: config.FIREBASE.REGION,
    cors: true,
  },
  async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Yêu cầu đăng nhập.');

  const uid = request.auth.uid;
  const db = getFirestore();

  const userSnap = await db.collection('users').doc(uid).get();
  if (!userSnap.exists || userSnap.data().level < 99) {
    throw new HttpsError('permission-denied', 'Chỉ Admin mới có quyền chạy lưu trữ dữ liệu.');
  }

  try {
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - 6);
    const cutoffString = cutoffDate.toISOString().split('T')[0];

    // 1. Lấy Booking bản gốc
    let bookingsSnap = await db.collection('bookings').where('end_date', '<=', cutoffString).limit(50).get();

    // =========================================================
    // 🚧 ĐOẠN CODE TẠM THỜI: VÉT RÁC & FIX DỮ LIỆU
    // =========================================================
    const archivedSnap = await db.collection('archived_bookings').limit(500).get();

    // ĐÁNH DẤU CỜ CỨNG
    bookingsSnap.docs.forEach((doc) => {
      doc._isArchived = false;
    });
    archivedSnap.docs.forEach((doc) => {
      doc._isArchived = true;
    });

    bookingsSnap = {
      empty: bookingsSnap.empty && archivedSnap.empty,
      docs: [...bookingsSnap.docs, ...archivedSnap.docs],
    };
    // =========================================================

    if (bookingsSnap.empty) {
      return { success: true, message: 'Không có dữ liệu cũ nào cần lưu trữ.', processed: 0 };
    }

    let processedCount = 0;
    let opCount = 0;
    const batch = db.batch();

    for (const bookingDoc of bookingsSnap.docs) {
      if (opCount >= 480) break;

      const bookingId = String(bookingDoc.id);
      const bookingData = bookingDoc.data();
      const isAlreadyArchived = bookingDoc._isArchived === true;

      const searchIds = [bookingId];
      const numId = Number(bookingId);
      if (!isNaN(numId)) {
        searchIds.push(numId);
      }

      const balance = Number(bookingData.balance_amount) || 0;
      if (!isAlreadyArchived && balance > 0) continue;

      const opsSnap = await db.collection('operator_entries').where('booking_id', 'in', searchIds).get();
      const detailsSnap = await db.collection('booking_details').where('booking_id', 'in', searchIds).get();
      const txSnap = await db.collection('transactions').where('booking_id', 'in', searchIds).get();

      let hasOperatorDebt = false;
      opsSnap.forEach((doc) => {
        const debt = Number(doc.data().debt_balance) || 0;
        if (debt > 0) hasOperatorDebt = true;
      });
      if (!isAlreadyArchived && hasOperatorDebt) continue;

      const bookingOps = isAlreadyArchived ? 0 : 2;
      const opsNeededForThisBooking = bookingOps + opsSnap.size * 2 + detailsSnap.size * 2 + txSnap.size * 2;

      if (isAlreadyArchived && opsNeededForThisBooking === 0) continue;
      if (opCount + opsNeededForThisBooking > 480) break;

      processedCount++;
      opCount += opsNeededForThisBooking;

      if (!isAlreadyArchived) {
        batch.set(db.collection('archived_bookings').doc(bookingId), bookingData);
        batch.delete(bookingDoc.ref);
      }

      opsSnap.forEach((doc) => {
        const data = doc.data();
        data.booking_id = bookingId;
        batch.set(db.collection('archived_operator_entries').doc(doc.id), data);
        batch.delete(doc.ref);
      });

      detailsSnap.forEach((doc) => {
        const data = doc.data();
        data.booking_id = bookingId;
        batch.set(db.collection('archived_booking_details').doc(doc.id), data);
        batch.delete(doc.ref);
      });

      txSnap.forEach((doc) => {
        const data = doc.data();
        data.booking_id = bookingId;
        batch.set(db.collection('archived_transactions').doc(doc.id), data);
        batch.delete(doc.ref);
      });
    }

    if (processedCount === 0) {
      return { success: true, message: 'Các booking đều vướng công nợ, hoặc đã sạch rác.', processed: 0 };
    }

    await batch.commit();

    logger.info(`✅ User ${uid} archive thành công ${processedCount} bookings (${opCount} ops).`);
    return { success: true, processed: processedCount, message: `Đã dọn dẹp ${processedCount} Bookings.` };
  } catch (error) {
    logger.error('❌ Lỗi khi chạy Archive:', error);
    throw new HttpsError('internal', 'Lỗi server khi lưu trữ dữ liệu.');
  }
});

module.exports = { archiveOldData };
