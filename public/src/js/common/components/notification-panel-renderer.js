/**
 * =========================================================================
 * 9 TRIP ERP - UI RENDERER (FINAL FIX)
 * Module: NotificationPanelRenderer
 * Status: Bulletproof (Chống crash)
 * 
 * DEPENDENCIES (from NotificationModule.js):
 * - window.getAllNotifications(limit) → Get notifications array
 * - window.getUnreadNotificationCount() → Get unread count
 * - window.markNotificationAsRead(id) → Mark as read
 * - window.markAllNotificationsAsRead() → Mark all as read
 * - window.clearAllNotifications() → Clear all notifications
 * 
 * EVENTS LISTENED:
 * - notification_received → Trigger render()
 * - notification_count_changed → Update badge with count
 * - notification_marked_read → Trigger render()
 * 
 * EXPECTED STRUCTURE (from NotificationModule):
 * notification = {
 *     id: string,
 *     title: string,
 *     body: string,
 *     timestamp: ISO string,
 *     read: boolean,
 *     data: {id, url, ...}
 * }
 * =========================================================================
 */

// ★ LOAD SEQUENCE LOGGING
console.log('%c[LOAD_SEQUENCE] notification-panel-renderer.js executing...', 'color: #2196F3; font-weight: bold; font-size: 11px;');

const NotificationPanelRenderer = (function() {
    // 1. CHỈ LƯU SELECTOR (CHUỖI), KHÔNG LƯU DOM ELEMENT
    // Để tránh việc lưu null khi khởi tạo
    const SELECTORS = {
        bellBtn: '#notificationBellBtn',
        badge: '#notificationBadge',
        panel: '#notificationPanel',
        list: '#notificationList',      // <--- Quan trọng nhất
        headerCount: '#notificationHeaderCount',
        markAllBtn: '#markAllReadBtn',
        clearAllBtn: '#clearAllBtn',
        emptyState: '#notificationEmptyState'
    };

    let isInitialized = false;
    let isListenersSetup = false;

    // =========================================================================
    // 2. PUBLIC API
    // =========================================================================

    function init() {
        if (isInitialized) return;
        render();

        // Đạng ký sự kiện (nếu chưa setup)
        if (!isListenersSetup) {
            _setupEventListeners();
        }

        isInitialized = true;
    }

    // =========================================================================
    // 3. CORE RENDERING (CÓ SAFETY GUARD + RETRY)
    // =========================================================================

    function render() {
        // ★ SAFETY GUARD 1: Tìm element ngay tại thời điểm render
        const listEl = document.querySelector(SELECTORS.list);
        
        // Nếu vẫn không tìm thấy
        if (!listEl) {
            console.warn('[NotificationPanel] ⚠️ #notificationList not found yet, will retry when init()');
            // Sẽ retry khi init() được gọi sau polling tìm thấy DOM
            return; 
        }

        // Lấy dữ liệu an toàn
        const notifications = (window.getAllNotifications && typeof window.getAllNotifications === 'function') 
                            ? window.getAllNotifications(50) 
                            : [];
        
        const unreadCount = (window.getUnreadNotificationCount && typeof window.getUnreadNotificationCount === 'function')
                            ? window.getUnreadNotificationCount()
                            : 0;

        console.log('[NotificationPanel] 📊 Rendering', notifications.length, 'notifications');

        // 1. Update Badge & Header (Nếu tìm thấy)
        _updateBadges(unreadCount);

        // 2. Render List (Bây giờ chắc chắn listEl đã tồn tại)
        listEl.innerHTML = ''; 

        if (notifications.length === 0) {
            _showEmptyState(true);
            return;
        }

        _showEmptyState(false);

        const fragment = document.createDocumentFragment();
        notifications.forEach(notif => {
            const item = _createNotificationItem(notif);
            fragment.appendChild(item);
        });

        listEl.appendChild(fragment);
        console.log('[NotificationPanel] ✓ Rendered successfully');
    }

    // =========================================================================
    // 4. EVENT HANDLERS
    // =========================================================================

    function _setupEventListeners() {
        // ★ SAFETY: Tránh setup lại
        if (isListenersSetup) {
            console.log('[NotificationPanel] ℹ️ Event listeners already setup');
            return;
        }
        isListenersSetup = true;

        console.log('[NotificationPanel] 🎧 Setting up event listeners...');

        // Lắng nghe sự kiện từ Module Logic ngay từ đầu (quan trọng!)
        window.addEventListener('notification_received', () => {
            console.log('[NotificationPanel] ✓ Event [notification_received] caught, calling render()');
            render();
        });

        window.addEventListener('notification_count_changed', (e) => {
            console.log('[NotificationPanel] 📊 Event [notification_count_changed] =', e.detail.count);
            _updateBadges(e.detail.count);
        });

        window.addEventListener('notification_marked_read', () => {
            console.log('[NotificationPanel] ✓ Event [notification_marked_read] caught');
            render();
        });

        // Gán sự kiện click cho các nút (nếu tìm thấy)
        const markAllBtn = document.querySelector(SELECTORS.markAllBtn);
        if (markAllBtn) {
            markAllBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (window.markAllNotificationsAsRead) window.markAllNotificationsAsRead();
            });
        }
        

        const clearAllBtn = document.querySelector(SELECTORS.clearAllBtn);
        if (clearAllBtn) {
            clearAllBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (confirm('Xóa toàn bộ thông báo?')) {
                    if (window.clearAllNotifications && typeof window.clearAllNotifications === 'function') {
                        window.clearAllNotifications();
                        // ★ FIX: Cập nhật UI ngay sau khi xóa
                        setTimeout(() => {
                            render();
                            console.log('[NotificationPanel] ✓ Đã xóa toàn bộ thông báo');
                        }, 100);
                    } else {
                        console.error('[NotificationPanel] ❌ Hàm clearAllNotifications không tồn tại');
                    }
                }
            });
        }

        console.log('[NotificationPanel] ✓ Event listeners setup complete');
    }

    // =========================================================================
    // 5. DOM HELPERS (Private)
    // =========================================================================

    function _createNotificationItem(notif) {
        // ★ Safety check
        if (!notif || !notif.id) {
            console.warn('[NotificationPanel] ⚠️ Invalid notification:', notif);
            return document.createElement('div');
        }

        const item = document.createElement('div'); // Hoặc thẻ a tùy cấu trúc
        item.className = `dropdown-item notification-item ${!notif.read ? 'unread' : ''}`;
        item.style.cursor = 'pointer';
        
        const iconClass = _getIconClass(notif.data?.type);
        const timeString = _formatTime(notif.timestamp);
        
        // ★ Get sender info if available
        const senderName = notif.data?.sender || notif.data?.from || 'System';
        console.log(`[NotificationPanel] 📤 Displaying notification from: ${senderName}`, {
            id: notif.id,
            title: notif.title,
            sender: senderName,
            data: notif.data
        });

        item.innerHTML = `
            <div class="d-flex align-items-start p-2">
                <div class="notification-icon me-3 mt-1">
                    <i class="${iconClass}"></i>
                </div>
                <div class="notification-content flex-grow-1">
                    <div class="fw-bold text-dark" style="font-size: 0.9rem;">${_escapeHtml(notif.title)}</div>
                    <div class="small text-muted text-wrap" style="font-size: 0.85rem;">${_escapeHtml(notif.body)}</div>
                    <div class="tiny text-secondary mt-1 d-flex justify-content-between align-items-center" style="font-size: 0.75rem;">
                        <span>${timeString}</span>
                        <span class="badge bg-secondary" style="font-size: 0.65rem;">📤 ${_escapeHtml(senderName)}</span>
                    </div>
                </div>
                <div class="ms-2">
                    ${!notif.read ? '<span class="badge bg-primary rounded-circle p-1" style="width:8px; height:8px; display:block;"> </span>' : ''}
                </div>
            </div>
        `;

        item.addEventListener('click', (e) => {
            if (!notif.read && window.markNotificationAsRead) {
                window.markNotificationAsRead(notif.id);
            }
            if (notif.data?.url && notif.data.url !== '/') {
                window.location.href = notif.data.url;
            }
        });

        return item;
    }

    function _updateBadges(count) {
        const badge = document.querySelector(SELECTORS.badge);
        const headerCount = document.querySelector(SELECTORS.headerCount);

        if (badge) {
            if (count > 0) {
                badge.textContent = count > 99 ? '99+' : count;
                badge.classList.remove('d-none');
                console.log('[NotificationPanel] 🔔 Badge updated:', count);
            } else {
                badge.classList.add('d-none');
            }
        } else {
            console.warn('[NotificationPanel] ⚠️ Badge element not found:', SELECTORS.badge);
        }

        if (headerCount) {
            headerCount.textContent = count > 0 ? `${count} mới` : '';
        }
    }

    function _showEmptyState(isEmpty) {
        const emptyEl = document.querySelector(SELECTORS.emptyState);
        if (!emptyEl) return;
        
        if (isEmpty) emptyEl.classList.remove('d-none');
        else emptyEl.classList.add('d-none');
    }

    // Utils
    function _getIconClass(type) {
        const map = {
            'booking': 'fa-solid fa-ticket text-primary',
            'payment': 'fa-solid fa-money-bill-wave text-success',
            'cancel': 'fa-solid fa-ban text-danger',
            'warning': 'fa-solid fa-triangle-exclamation text-warning'
        };
        return map[type] || 'fa-solid fa-bell text-info';
    }

    function _formatTime(iso) {
        if (!iso) return '';
        
        const now = new Date();
        const notifDate = new Date(iso);
        const diff = (now - notifDate) / 1000; // seconds in difference
        
        // ★ FIX: Kiểm tra xem có phải cùng ngày không
        const isSameDay = 
            now.getFullYear() === notifDate.getFullYear() &&
            now.getMonth() === notifDate.getMonth() &&
            now.getDate() === notifDate.getDate();
        
        // Nếu cùng ngày, tính theo giờ/phút
        if (isSameDay) {
            if (diff < 60) return 'Vừa xong';
            if (diff < 3600) return `${Math.floor(diff/60)} phút trước`;
            return `${Math.floor(diff/3600)} giờ trước`; // ★ NEW: Tính theo giờ
        }
        
        // Nếu khác ngày, hiển thị ngày tháng
        return notifDate.toLocaleDateString('vi-VN');
    }

    function _escapeHtml(unsafe) {
        if (!unsafe) return '';
        return unsafe.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    // ★ IMPORTANT: Setup event listeners IMMEDIATELY when module loads
    // This ensures events are captured even before DOM is ready
    _setupEventListeners();

    return { init, render };
})();

// =========================================================================
// AUTO-START: CƠ CHẾ SMART POLLING (Giữ nguyên cái này vì nó rất tốt)
// =========================================================================
(function waitForUI() {
    let attempts = 0;
    const interval = setInterval(() => {
        attempts++;
        const list = document.querySelector('#notificationList'); // Check trực tiếp
        
        if (list) {
            clearInterval(interval);
            NotificationPanelRenderer.init();
        } else if (attempts > 20) {
            clearInterval(interval); // Time out sau 10s
        }
    }, 500);
})();