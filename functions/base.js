


// The Cloud Functions for Firebase SDK to create Cloud Functions and triggers.
const {logger} = require("firebase-functions");
const {onRequest} = require("firebase-functions/https");
const {onDocumentCreated} = require("firebase-functions/firestore");

const admin = require('firebase-admin');
admin.initializeApp(); // Khởi tạo Admin SDK

const db = admin.firestore();


// Ví dụ về cách tương tác với Firestore trong Cloud Function (sử dụng Node.js):
exports.writeToFirestoreOnDocumentWrite = functions.firestore
  .document('some/doc') // Lắng nghe sự kiện trên một tài liệu cụ thể
  .onWrite((change, context) => {
    // 'change.after' chứa dữ liệu mới của tài liệu sau sự kiện
    // 'change.before' chứa dữ liệu cũ của tài liệu trước sự kiện

    const newData = change.after.data();

    // Ghi vào một tài liệu khác trong Firestore
    return db.doc('some/otherdoc').set({
      // Ví dụ: sao chép một trường từ tài liệu gốc
      fieldFromOriginal: newData.someField
    });
  });

// Một ví dụ khác, lắng nghe sự kiện khi tạo tài liệu và chuyển đổi chữ hoa
exports.makeUppercase = functions.firestore
  .document("/messages/{documentId}") // Lắng nghe sự kiện trên các tài liệu trong collection 'messages'
  .onCreate((snap, context) => {
    const original = snap.data().original;
    const uppercase = original.toUpperCase();

    // Ghi dữ liệu trở lại tài liệu đã kích hoạt, hoặc một tài liệu khác
    return snap.ref.set({ uppercase }, { merge: true }); // Cập nhật trường 'uppercase' trong tài liệu
  });

  // Ví dụ về cách xử lý sự kiện xác thực người dùng trong Cloud Function (sử dụng Node.js):

  exports.createUserProfile = functions.auth.user().onCreate((user) => {
    // `user` đối tượng chứa thông tin về người dùng mới được tạo
    const uid = user.uid;
    const email = user.email; // Có thể null
    const displayName = user.displayName; // Có thể null
  
    // Tạo một tài liệu trong Firestore cho người dùng mới
    return admin.firestore().collection('users').doc(uid).set({
      email: email,
      displayName: displayName,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
      // Thêm các trường mặc định khác nếu cần
    });
  });
  
  exports.cleanUpUserData = functions.auth.user().onDelete((user) => {
    // `user` đối tượng chứa thông tin về người dùng bị xóa
    const uid = user.uid;
  
    // Xóa tài liệu của người dùng khỏi Firestore
    return admin.firestore().collection('users').doc(uid).delete();
    // Có thể thêm logic để xóa dữ liệu khác liên quan đến người dùng này
  });

