/**
 * 9 TRIP ERP - CLIENT SIDE
 * NotificationModule - Notification Management System
 * Standard: Singleton Pattern + Firebase Cloud Functions v2
 * 
 * Usage in main.js:
 * 1. NotificationModule.getInstance() → Returns singleton
 * 2. Async init runs automatically in background
 * 3. OR await NotificationModule.getInstance().waitForInitialization()
 */

import NotificationPanelRenderer from '../common/components/NotificationPanel.js';

/**
 * 9TRIP NOTIFICATION MANAGER - VERSION 1.0
 * Chuyên trách: Lắng nghe, lưu trữ và điều phối thông báo ERP
 */
class NotificationModule {
    static #STORAGE_KEY = '9trip_notifications_logs';
    static #LAST_SYNC_KEY = '9trip_notify_last_sync';
    static #instance = null;
    markAllBtn = '#markAllReadBtn';
    clearAllBtn = '#clearAllBtn';
    _initialized = false;

    // ─── Instance Fields ───
    #unreadCount = 0;
    #firstRenderDone = false;

    constructor() {
        // ★ Pre-load cache NGAY TẠI ĐÂY để tránh race condition:
        //   Khi Firestore onSnapshot bắn 'new-notifications-arrived' TRƯỚC KHI init() chạy,
        //   dedup check (this.notifications.some) sẽ hoạt động đúng và giữ nguyên isRead state.
        const cached = this.#loadFromStorage();
        this.notifications = cached.items;
        this.listener = null;
        this.db = null;
        // ★ KHÔNG gọi init() ở đây vì CURRENT_USER chưa sẵn sàng khi module load.
        // Gọi NotificationManager.init() thủ công sau khi auth thành công.
    }
    async render() {
        NotificationPanelRenderer.render(this.notifications, this.#unreadCount);
    }
    /**
     * Bước 1: Khởi tạo lắng nghe Realtime
     */
    init() {
        if (!CURRENT_USER || this._initialized) return;
        if (!this.db) this.db = A.DB?.db || window.firebase.firestore();

        try {
            // ★ Cache đã được pre-load trong constructor → chỉ cần sort + render.
            this._initialized = true;
            this._log('🔄 Initializing notifications from pre-loaded cache...');

            // ★ Sau snapshot ĐẦU TIÊN: sort lại, tính unread, render toàn bộ
            if (!this.#firstRenderDone) {
                this.#firstRenderDone = true;
                const toDate = v => v?.seconds ? new Date(v.seconds * 1000) : new Date(v || 0);
                this.notifications.sort((a, b) => {
                    if (a.isRead !== b.isRead) return a.isRead ? 1 : -1;
                    return toDate(b.created_at) - toDate(a.created_at);
                });
                this.#unreadCount = this.notifications.filter(n => !n.isRead).length;
                this.render();
            }

            // Cập nhật mốc thời gian đồng bộ cuối cùng
            localStorage.setItem(NotificationModule.#LAST_SYNC_KEY, Date.now().toString());
            this._setupEventListeners();
            this._log('✅ NotificationModule initialized and listening for changes');

        } catch (e) {
            console.error('❌ Notification Init Failed:', e);
        }
    }

    static getInstance() {
        if (!NotificationModule.#instance) {
            NotificationModule.#instance = new NotificationModule();
        }
        return NotificationModule.#instance;
    }

    /**
     * Bước 2: Xử lý thông báo đến – chỉ tích lũy vào mảng, không tự render.
     * Caller chịu trách nhiệm gọi render() sau khi xử lý toàn bộ batch.
     *
     * @param {Object} notifyData - Dữ liệu thông báo từ server/event
     * @returns {boolean} true nếu notification mới được thêm vào, false nếu đã tồn tại (dedup)
     */
    #handleIncoming(notifyData) {
        // Kiểm tra trùng lặp
        if (this.notifications.some(n => n.id === notifyData.id)) return false;

        // Giữ trạng thái isRead từ server nếu có, mặc định false
        const newNotify = {
            ...notifyData,
            isRead: notifyData.isRead ?? false,
            receivedAt: Date.now()
        };

        this.notifications.unshift(newNotify);
        console.log(`🔔 Notify Queued: ${newNotify.title}`);
        return true;
    }

    // =========================================================================
    // 4. EVENT HANDLERS
    // =========================================================================

    _setupEventListeners() {
        // Gán sự kiện click cho các nút (nếu tìm thấy)
        const markAllBtn = document.querySelector(this.markAllBtn);
        if (markAllBtn) {
            markAllBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.markAllNotificationsAsRead();
            });
        }

        const clearAllBtn = document.querySelector(this.clearAllBtn);
        if (clearAllBtn) {
            clearAllBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (confirm('Xóa toàn bộ thông báo?')) {
                    this.clearAllNotifications();
                }
            });
        }

        window.addEventListener('new-notifications-arrived', (e) => {
            const newNotifs = e.detail || [];
            this._log(`📢 ${newNotifs.length} new notification(s) arrived via event`);

            // ★ FIX Bug 1: Xử lý toàn bộ batch trước, sau đó mới render MỘT LẦN.
            // Tránh việc appendItem() từng item riêng lẻ gây mất thông báo khi có race condition.
            let addedCount = 0;
            newNotifs.forEach(notif => {
                if (this.#handleIncoming(notif)) addedCount++;
            });

            if (addedCount > 0) {
                this._saveToStorage();
                this._log(`✅ ${addedCount} new notification(s) added — re-rendering full list`);
            }

            // ★ Luôn render lại toàn bộ để đảm bảo UI đồng bộ với this.notifications
            if (this.#firstRenderDone) {
                this.#unreadCount = this.notifications.filter(n => !n.isRead).length;
                this.render();
            }
        });
    }

    _log(msg, type = 'info') {
        const prefix = '[NotificationModule] ';
        if (typeof log === 'function') log(prefix + msg, type);
        else console.log(prefix + msg);
    }

    /**
     * Bước 3: Hàm tạo thông báo mới (Dành cho Admin/Hệ thống)
     */
    async _send(title, message, group, options = {}) {
        try {
            const newDoc = {
                title: title,
                message: message,
                type: options.type || 'info', // info, success, warning, danger
                role: options.role || CURRENT_USER.role,
                group: group || CURRENT_USER.group?.[0] || 'All',
                data: options.data || {}, // Payload đi kèm (booking_id, v.v..)
                created_by: CURRENT_USER.username || 'System',
                created_at: firebase.firestore.FieldValue.serverTimestamp()
            };

            // ✅ Tạo ID trước rồi dùng saveRecord để đồng bộ qua DBManager
            const notifId = this.db.collection('notifications').doc().id;
            await A.DB.saveRecord('notifications', { ...newDoc, id: notifId });
            return notifId;
        } catch (e) {
            console.error("❌ Gửi thông báo thất bại:", e);
            return null;
        }
    }

    async sendToOperator(title, message) {
        return await this._send(title, message, 'Operator');
    }
    async sendToSales(title, message) {
        return await this._send(title, message, 'Sales');
    }
    async sendToAccountant(title, message) {
        return await this._send(title, message, 'Accountant');
    }
    async sendToAdmin(title, message) {
        return await this._send(title, message, 'Admin');
    }
    sendToAll = async (title, message) => {
        return await this._send(title, message, 'All');
    }
    /**
     * Bước 4: Quản lý trạng thái Đã đọc
     */
    markAsRead(id) {
        const index = this.notifications.findIndex(n => n.id === id);

        if (index !== -1 && !this.notifications[index].isRead) {
            this.notifications[index].isRead = true;
            // ★ Tính lại từ nguồn gốc, tránh giá trị âm khi có lệch trạng thái
            this.#unreadCount = this.notifications.filter(n => !n.isRead).length;
            this._saveToStorage();

            // ★ FIX Bug 2: Cập nhật trực tiếp DOM item đó (xoá unread class + blue dot)
            // thay vì chỉ cập nhật badge mà bỏ qua visual của item.
            NotificationPanelRenderer.markItemAsRead(id);
            NotificationPanelRenderer.updateBadges(this.#unreadCount);
        }
    }
    markAllNotificationsAsRead() {
        let changed = false;
        this.notifications.forEach(n => {
            if (!n.isRead) {
                n.isRead = true;
                changed = true;
            }
        });

        if (changed) {
            this._saveToStorage();
            this.render();
            this._log('✓ All notifications marked as read', 'info');
        }
    }
    /**
     * Helper: Lưu trữ & Tải từ LocalStorage
     */
    _saveToStorage() {
        // Chỉ giữ lại 50 thông báo gần nhất để tránh nặng máy
        const limitData = this.notifications.slice(0, 50);
        localStorage.setItem(NotificationModule.#STORAGE_KEY, JSON.stringify(limitData));
    }

    /**
     * Tải dữ liệu từ LocalStorage, sắp xếp và đếm unread.
     *
     * @returns {{ items: Array, unreadCount: number }}
     */
    #loadFromStorage() {
        try {
            const raw = localStorage.getItem(NotificationModule.#STORAGE_KEY);
            let items = raw ? JSON.parse(raw) : [];

            // Helper: parse Firestore Timestamp ({ seconds }) hoặc ISO string
            const toDate = v => v?.seconds ? new Date(v.seconds * 1000) : new Date(v || 0);

            // Sắp xếp: chưa đọc lên trước, sau đó mới nhất trước
            items.sort((a, b) => {
                if (a.isRead !== b.isRead) return a.isRead ? 1 : -1;
                return toDate(b.created_at) - toDate(a.created_at);
            });

            const unreadCount = items.filter(n => !n.isRead).length;
            return { items, unreadCount };
        } catch {
            return { items: [], unreadCount: 0 };
        }
    }

    _showNotificationBadge() {
        const count = this.notifications.filter(n => !n.isRead).length;
        this.#unreadCount = count;
        // Gọi qua public API (updateBadges được expose từ NotificationPanel)
        NotificationPanelRenderer.updateBadges(count);
    }

    /**
     * Clear all notifications
     */
    clearAllNotifications() {
        this.notifications = [];
        this._saveToStorage();
        this._showNotificationBadge();
        this.render();
        this._log('✓ All notifications cleared', 'info');
    }
}

const NotificationManager = new NotificationModule();
export default NotificationManager;

window.sendToAll = NotificationManager.sendToAll;
