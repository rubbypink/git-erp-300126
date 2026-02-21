/**
 * 9 TRIP ERP - SERVICE WORKER
 * File: firebase-messaging-sw.js
 * Standard: PWA & Push Notification Optimized
 */

// 1. Import Firebase Scripts (Sử dụng bản Compat ổn định cho SW)
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

// 2. Cấu hình (Config)
firebase.initializeApp({
    apiKey: "AIzaSyAhBOSEAGKN5_8_lfWSPLzQ5gBBd33Jzdc",
    authDomain: "trip-erp-923fd.firebaseapp.com",
    projectId: "trip-erp-923fd",
    storageBucket: "trip-erp-923fd.firebasestorage.app",
    messagingSenderId: "600413765548",
    appId: "1:600413765548:web:bc644e1e58f7bead5d8409",
    measurementId: "G-BG2ECM4R89"
});

const messaging = firebase.messaging();

// 3. Xử lý tin nhắn khi App chạy ngầm (Background/Closed)
messaging.onBackgroundMessage((payload) => {
    console.log('%c[SW] 1. 📬 Đã nhận tin ngầm:', 'background: #ff0000; color: #fff; font-size: 14px', payload);

    const notificationTitle = payload.notification?.title || 'Thông báo mới';
    const notificationBody = payload.notification?.body || '';
    
    // Tạo ID duy nhất
    const notifId = `bg_${Date.now()}`;

    const notificationOptions = {
        body: notificationBody,
        icon: '/src/images/logo.png', // Đảm bảo đường dẫn icon đúng
        badge: '', // Icon nhỏ trên thanh status bar (Android)
        tag: 'trip-erp-notification', // Group các thông báo lại
        renotify: true, // Rung lại khi có tin mới đè lên tag cũ
        data: {
            id: notifId,
            url: payload.data?.url || '/', // Link cần mở khi click
            ...payload.data
        },
        actions: [
            { action: 'open', title: 'Xem chi tiết' }
        ]
    };

    // A. Hiển thị thông báo
    self.registration.showNotification(notificationTitle, notificationOptions);

    // B. Gửi tín hiệu sang App (Nếu App đang mở nhưng ẩn tab)
    // Thay vì localStorage (lỗi), ta dùng BroadcastChannel
    const channel = new BroadcastChannel('erp_notification_channel');
    console.log('%c[SW] 2. 📡 Đang bắn sang App qua Broadcast...', 'background: #cc0000; color: #fff;');
    channel.postMessage({
        type: 'BACKGROUND_MESSAGE',
        payload: {
            notification: {
                title: notificationTitle,
                body: notificationBody
            },
            timestamp: new Date().toISOString(),
            read: false,
            data: {
                id: notifId,  // ★ IMPORTANT: Include ID in data object
                url: payload.data?.url || '/',
                ...payload.data
            }
        }
    });
});

// 4. Xử lý sự kiện CLICK vào thông báo
self.addEventListener('notificationclick', (event) => {
    console.log('[SW] 🔔 Notification Clicked');
    
    event.notification.close(); // Đóng thông báo

    const targetUrl = event.notification.data.url || '/';

    // Logic: Tìm xem App có đang mở không?
    // - Nếu có: Focus vào tab đó và điều hướng.
    // - Nếu không: Mở cửa sổ mới.
    const promiseChain = clients.matchAll({
        type: 'window',
        includeUncontrolled: true
    }).then((windowClients) => {
        // Tìm tab đang mở (đúng domain)
        let matchingClient = null;
        for (let i = 0; i < windowClients.length; i++) {
            const client = windowClients[i];
            // Kiểm tra xem có phải là App của mình không
            if (client.url.includes(self.registration.scope)) {
                matchingClient = client;
                break;
            }
        }

        if (matchingClient) {
            // Tab đang mở -> Focus vào nó
            return matchingClient.focus().then((client) => {
                // Gửi tin nhắn bảo Client cập nhật UI / Điều hướng
                client.postMessage({
                    type: 'NOTIFICATION_CLICK',
                    url: targetUrl,
                    data: event.notification.data
                });
            });
        } else {
            // App đang tắt -> Mở mới
            return clients.openWindow(targetUrl);
        }
    });

    event.waitUntil(promiseChain);
});

console.log('[SW] ✅ Service Worker Initialized (v2.0)');