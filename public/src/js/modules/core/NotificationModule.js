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

import { getFirestore, collection, doc, getDocs, query, orderBy, limit, startAfter, serverTimestamp } from 'firebase/firestore';
import { getApp } from 'firebase/app';

import NotificationPanelRenderer from '/src/js//components/NotificationPanel.js';

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
  reloadBtn = '#reloadNotifs';
  loadMoreBtn = '#loadMoreNotifs';
  _initialized = false;

  // ─── Instance Fields ───
  #unreadCount = 0;
  #firstRenderDone = false;
  #displayLimit = 15; // Số lượng item hiển thị ban đầu và mỗi lần load thêm
  #lastDoc = null; // Lưu document cuối cùng để phân trang Firestore

  constructor() {
    // ★ Pre-load cache NGAY TẠI ĐÂY để tránh race condition:
    //   Khi Firestore onSnapshot bắn 'new-notifications-arrived' TRƯỚC KHI init() chạy,
    //   dedup check (this.notifications.some) sẽ hoạt động đúng và giữ nguyên isRead state.
    const cached = this.#loadFromStorage();
    this.notifications = cached.items;
    this.listener = null;
    this.db = null;
    // 2. Lắng nghe tiếng gọi "app-ready" từ hệ thống
    window.addEventListener('app-ready', () => {
      L._('🔔 Event App Ready received');
      this.init();
    });
  }
  async render() {
    // Chỉ render số lượng item theo giới hạn hiện tại
    const itemsToRender = this.notifications.slice(0, this.#displayLimit);
    NotificationPanelRenderer.render(itemsToRender, this.#unreadCount);
  }
  /**
   * Bước 1: Khởi tạo lắng nghe Realtime
   */
  init() {
    // KHÔNG check CURRENT_USER nữa. Load thẳng từ cache LocalStorage lên UI.
    if (this._initialized) return;

    try {
      this._initialized = true;

      // ★ Render cache ngay lập tức không cần chờ DB hay Auth
      if (!this.#firstRenderDone) {
        this.#firstRenderDone = true;

        // Nếu cache trống, thử load từ Firestore
        if (this.notifications.length === 0) {
          this.reloadFromServer();
        } else {
          this.#sortNotifications();
          this.#unreadCount = this.notifications.filter((n) => !n.isRead).length;
          this.render();
        }
      }

      this._setupEventListeners();
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
   * Hứng dữ liệu trực tiếp từ DBManager
   * @param {Array} newDocs - Danh sách notification thật (không chứa data-change)
   */
  receiveFromServer(newDocs) {
    if (!newDocs || newDocs.length === 0) return;

    let isChanged = false;

    newDocs.forEach((docData) => {
      // ★ BỘ LỌC CHỐNG DATA-CHANGE (Lớp bảo vệ 2)
      if (docData.type === 'data-change') return;

      // BỘ LỌC CHỐNG TRÙNG LẶP (Dedup)
      const exists = this.notifications.some((n) => n.id === docData.id);
      if (!exists) {
        // Mặc định thông báo mới từ server là chưa đọc
        this.notifications.unshift({ ...docData, isRead: false, receivedAt: Date.now() });
        isChanged = true;
      }
    });

    // Chỉ Render 1 lần duy nhất sau khi đã thêm hết lô thông báo
    if (isChanged) {
      this._saveToStorage(); // Cập nhật LocalStorage

      // Sắp xếp lại: Chưa đọc lên trên, mới nhất lên trên
      this.#sortNotifications();

      this.#unreadCount = this.notifications.filter((n) => !n.isRead).length;

      // Gọi UI cập nhật
      if (this._initialized) {
        this.render();
      }
    }
  }

  #sortNotifications() {
    const toDate = (v) => (v?.seconds ? new Date(v.seconds * 1000) : new Date(v || 0));
    this.notifications.sort((a, b) => {
      if (a.isRead !== b.isRead) return a.isRead ? 1 : -1;
      return toDate(b.created_at) - toDate(a.created_at);
    });
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
    if (this.notifications.some((n) => n.id === notifyData.id)) return false;

    // Giữ trạng thái isRead từ server nếu có, mặc định false
    const newNotify = {
      ...notifyData,
      isRead: notifyData.isRead ?? false,
      receivedAt: Date.now(),
    };

    this.notifications.unshift(newNotify);
    L._(`🔔 Notify Queued: ${newNotify.title}`);
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

    const reloadBtn = document.querySelector(this.reloadBtn);
    if (reloadBtn) {
      reloadBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.reloadFromServer();
      });
    }

    const loadMoreBtn = document.querySelector(this.loadMoreBtn);
    if (loadMoreBtn) {
      loadMoreBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.loadMore();
      });
    }
  }

  _log(msg, type = 'info') {
    const prefix = '[NotificationModule] ';
    if (typeof log === 'function') L._(prefix + msg, type);
    else L._(prefix + msg);
  }

  /**
   * Bước 3: Hàm tạo thông báo mới (Dành cho Admin/Hệ thống)
   */
  async _send(title, message, group, options = {}) {
    try {
      // Lazy-load DB: Chỉ tìm DB khi có lệnh gửi thông báo
      if (!this.db) this.db = getFirestore(getApp());

      // Nếu user chưa đăng nhập hoặc DB chưa có thì bỏ qua (An toàn tuyệt đối)
      if (!this.db || !window.CURRENT_USER) {
        console.warn('⚠️ Hệ thống chưa sẵn sàng để gửi thông báo.');
        return null;
      }

      const newDoc = {
        title: title,
        message: message,
        type: options.type || 'info',
        role: options.role || CURRENT_USER.role,
        group: group || CURRENT_USER.group?.[0] || 'All',
        data: options.data || {},
        created_by: CURRENT_USER.name || 'System',
        created_at: serverTimestamp(),
      };

      // Modular SDK: generate ID by calling doc(collection(db, 'name'))
      const notifRef = doc(collection(this.db, 'notifications'));
      const notifId = notifRef.id;

      // Gọi qua A.DB.saveRecord để đảm bảo qua Chốt chặn Gatekeeper
      await A.DB.saveRecord('notifications', { ...newDoc, id: notifId });
      return notifId;
    } catch (e) {
      console.error('❌ Gửi thông báo thất bại:', e);
      return null;
    }
  }

  async sendToOperator(title, message) {
    return await this._send(title, message, 'Operator', 'op');
  }
  async sendToSales(title, message) {
    return await this._send(title, message, 'Sales', 'sale');
  }
  async sendToAccountant(title, message) {
    return await this._send(title, message, 'Accountant', 'acc');
  }
  async sendToAdmin(title, message) {
    return await this._send(title, message, 'Admin', 'admin');
  }
  async sendToAll(title, message) {
    return await this._send(title, message, 'All');
  }

  /**
   * Tải lại 15 item mới nhất từ Firestore
   */
  async reloadFromServer() {
    try {
      this._log('🔄 Reloading notifications from server...');
      if (!this.db) this.db = getFirestore(getApp());
      if (!this.db) return;

      // ★ BỘ LỌC CHỐNG DATA-CHANGE (Lớp bảo vệ 2)
      const q = query(collection(this.db, 'notifications'), orderBy('created_at', 'desc'), limit(15));

      let snap = await getDocs(q);
      if (snap.empty) {
        this.notifications = [];
      } else {
        this.#lastDoc = snap.docs[snap.docs.length - 1];

        const newItems = [];
        snap.forEach((d) => {
          const data = { id: d.id, ...d.data(), isRead: d.data().isRead ?? false };
          // ★ BỘ LỌC CHỐNG DATA-CHANGE (Lớp bảo vệ 2)
          if (!this.notifications.some((n) => n.id === data.id) && data.type !== 'data-change') {
            newItems.push(data);
          }
        });
        this.notifications = newItems;
      }

      this.#displayLimit = 15;
      this._saveToStorage();
      this.#sortNotifications();
      this.#unreadCount = this.notifications.filter((n) => !n.isRead).length;
      this.render();
    } catch (e) {
      console.error('❌ Reload notifications failed:', e);
    }
  }

  /**
   * Load thêm 15 item tiếp theo
   */
  async loadMore() {
    try {
      // Nếu trong mảng notifications hiện tại vẫn còn item chưa hiển thị (do displayLimit < notifications.length)
      if (this.#displayLimit < this.notifications.length) {
        this.#displayLimit += 15;
        this.render();
        return;
      }

      // Nếu đã hiển thị hết mảng hiện tại, load thêm từ Firestore
      this._log('📥 Loading more notifications from server...');
      if (!this.db) this.db = getFirestore(getApp());
      if (!this.db || !this.#lastDoc) return;

      const q = query(collection(this.db, 'notifications'), orderBy('created_at', 'desc'), startAfter(this.#lastDoc), limit(15));

      let snap = await getDocs(q);
      if (snap.empty) {
        this._log('ℹ️ No more notifications on server.');
        return;
      }

      this.#lastDoc = snap.docs[snap.docs.length - 1];
      const moreItems = [];

      snap.forEach((d) => {
        const data = { id: d.id, ...d.data(), isRead: d.data().isRead ?? false };
        // ★ BỘ LỌC CHỐNG DATA-CHANGE (Lớp bảo vệ 2)
        if (!this.notifications.some((n) => n.id === data.id) && data.type !== 'data-change') {
          moreItems.push(data);
        }
      });

      this.notifications = [...this.notifications, ...moreItems];
      this.#displayLimit += 15;
      this._saveToStorage();
      this.#sortNotifications();
      this.#unreadCount = this.notifications.filter((n) => !n.isRead).length;
      this.render();
    } catch (e) {
      console.error('❌ Load more notifications failed:', e);
    }
  }

  /**
   * Bước 4: Quản lý trạng thái Đã đọc
   */
  async markAsRead(id) {
    const index = this.notifications.findIndex((n) => n.id === id);

    if (index !== -1 && !this.notifications[index].isRead) {
      this.notifications[index].isRead = true;
      // ★ Tính lại từ nguồn gốc, tránh giá trị âm khi có lệch trạng thái
      this.#unreadCount = this.notifications.filter((n) => !n.isRead).length;
      this._saveToStorage();
      NotificationPanelRenderer.updateBadges(this.#unreadCount);
    }
  }
  markAllNotificationsAsRead() {
    let changed = false;
    this.notifications.forEach((n) => {
      if (!n.isRead) {
        n.isRead = true;
        changed = true;
      }
    });
    this.#unreadCount = 0;

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

      // ★ BỘ LỌC CHỐNG DATA-CHANGE (Dọn dẹp dữ liệu cũ trong cache)
      items = items.filter((n) => n.type !== 'data-change');

      // Helper: parse Firestore Timestamp ({ seconds }) hoặc ISO string
      const toDate = (v) => (v?.seconds ? new Date(v.seconds * 1000) : new Date(v || 0));

      // Sắp xếp: chưa đọc lên trước, sau đó mới nhất trước
      items.sort((a, b) => {
        if (a.isRead !== b.isRead) return a.isRead ? 1 : -1;
        return toDate(b.created_at) - toDate(a.created_at);
      });

      const unreadCount = items.filter((n) => !n.isRead).length;
      return { items, unreadCount };
    } catch {
      return { items: [], unreadCount: 0 };
    }
  }

  _showNotificationBadge() {
    const count = this.notifications.filter((n) => !n.isRead).length;
    this.#unreadCount = count;
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
