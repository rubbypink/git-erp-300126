import { initializeApp, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { getDatabase } from 'firebase-admin/database';
import { getAuth } from 'firebase-admin/auth';
import { logger } from 'firebase-functions';

// 1. Singleton Initialization tại mức Module (Chỉ chạy 1 lần duy nhất)
let app;
if (!getApps().length) {
    try {
        app = initializeApp();
        logger.info('✅ [AI-AGENT] Firebase Admin SDK v13 initialized successfully');
    } catch (error) {
        logger.error('❌ [AI-AGENT] Failed to initialize Firebase Admin SDK:', error);
        throw error;
    }
} else {
    app = getApp();
    logger.info('🔄 [AI-AGENT] Firebase Admin SDK already exists, reusing instance');
}

// 2. Khởi tạo các services dùng chung ngay lập tức
const db = getFirestore(app);
const auth = getAuth(app);
const messaging = getMessaging(app);
const rtdb = getDatabase(app);
// 3. Cấu hình bảo toàn dữ liệu (Helper First)
// Bỏ qua cảnh báo lỗi nếu lỡ truyền dữ liệu undefined vào Firestore (Rất quan trọng cho ERP)
db.settings({ ignoreUndefinedProperties: true });

// 4. Export trực tiếp các Instances đã sẵn sàng
export { app, db, auth, messaging, rtdb };
