

const NotificationPanelRenderer = (function () {
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

    let initialized = false;

    // =========================================================================
    // 2. PUBLIC API
    // =========================================================================

    function init() {
        if (initialized) return;
        render();

        initialized = true;
    }

    // =========================================================================
    // 3. CORE RENDERING (CÓ SAFETY GUARD)
    // =========================================================================

    function render(notifications, unreadCount) {
        // ★ SAFETY GUARD: Tìm element ngay tại thời điểm render
        const listEl = document.querySelector(SELECTORS.list);
        if (!listEl) {
            console.error('[UI] ❌ LỖI: Không tìm thấy #notificationList trong DOM!');
            return;
        }

        // ★ Fallback: Nếu gọi không có tham số (ví dụ từ waitForUI → init()), lấy từ window.*
        const items = Array.isArray(notifications)
            ? notifications
            : (window.getAllNotifications?.() ?? []);
        const count = (unreadCount != null)
            ? unreadCount
            : (window.getUnreadNotificationCount?.() ?? 0);

        _updateBadges(count);
        listEl.innerHTML = '';

        if (items.length === 0) {
            _showEmptyState(true);
            return;
        }

        _showEmptyState(false);

        const fragment = document.createDocumentFragment();
        items.forEach(notif => {
            fragment.appendChild(_createNotificationItem(notif));
        });

        listEl.appendChild(fragment);
    }


    // =========================================================================
    // 4. APPEND (New realtime item – không render lại toàn bộ)
    // =========================================================================

    /**
     * Thêm một item mới lên đầu danh sách mà không render lại toàn bộ.
     * Dùng cho thông báo realtime đến sau khi đã render lần đầu.
     *
     * @param {Object} notif        - Notification object
     * @param {number} unreadCount  - Số unread mới nhất để cập nhật badge
     */
    function appendItem(notif, unreadCount) {
        const listEl = document.querySelector(SELECTORS.list);
        if (!listEl) return;

        // Ẩn empty state nếu đang hiện
        _showEmptyState(false);

        // Tạo item và chèn vào đầu list
        const item = _createNotificationItem(notif);
        listEl.insertBefore(item, listEl.firstChild);

        _updateBadges(unreadCount ?? 0);
    }

    // =========================================================================
    // 5. DOM HELPERS (Private)
    // =========================================================================

    function _createNotificationItem(notif) {
        const item = document.createElement('div'); // Hoặc thẻ a tùy cấu trúc
        item.className = `dropdown-item notification-item ${!notif.isRead ? 'unread' : ''}`;
        item.dataset.notifId = notif.id; // ★ Để markItemAsRead() tìm đúng phần tử
        item.style.cursor = 'pointer';

        const iconClass = _getIconClass(notif?.type);
        const timeString = _formatTime(notif.created_at);

        item.innerHTML = `
            <div class="d-flex align-items-start p-2">
                <div class="notification-icon me-3 mt-1">
                    <i class="${iconClass}"></i>
                </div>
                <div class="notification-content flex-grow-1">
                    <div class="fw-bold text-dark" style="font-size: 0.9rem;">${_escapeHtml(notif.title)}</div>
                    <div class="small text-muted text-wrap" style="font-size: 0.85rem;">${_escapeHtml(notif.message)}</div>
                    <div class="tiny text-secondary mt-1" style="font-size: 0.75rem;">${timeString}</div>
                </div>
                <div class="ms-2">
                    ${!notif.isRead ? '<span class="badge bg-primary rounded-circle p-1" style="width:8px; height:8px; display:block;"> </span>' : ''}
                </div>
            </div>
        `;

        item.addEventListener('click', (e) => {
            if (!notif.isRead && A.NotificationManager) {
                A.NotificationManager.markAsRead(notif.id);
            }
            if (notif.data?.url && notif.data.url !== '/') {
                window.location.href = notif.data.url;
            }
        });

        return item;
    }

    /**
     * Cập nhật trực tiếp DOM của một item thành trạng thái "đã đọc".
     * Không cần render lại toàn bộ danh sách.
     *
     * @param {string} id - ID của thông báo cần cập nhật
     */
    function markItemAsRead(id) {
        const listEl = document.querySelector(SELECTORS.list);
        if (!listEl) return;
        const item = listEl.querySelector(`[data-notif-id="${id}"]`);
        if (!item) return;

        // Xoá class unread + ẩn blue dot
        item.classList.remove('unread');
        const dot = item.querySelector('.badge.bg-primary.rounded-circle');
        if (dot) dot.remove();
    }

    function _updateBadges(count) {
        const badge = document.querySelector(SELECTORS.badge);
        const headerCount = document.querySelector(SELECTORS.headerCount);

        if (badge) {
            if (count > 0) {
                badge.textContent = count > 99 ? '99+' : count;
                badge.classList.remove('d-none');
            } else {
                badge.classList.add('d-none');
            }
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
            'warning': 'fa-solid fa-triangle-exclamation text-warning',
            'success': 'fa-solid fa-check-circle text-success',
            'new': 'fa-solid fa-star text-info',
            'modify': 'fa-solid fa-pen-to-square text-secondary',
            'info': 'fa-solid fa-info-circle text-info'
        };
        return map[type] || 'fa-solid fa-bell text-info';
    }

    function _formatTime(iso) {
        if (!iso) return '';

        const now = new Date();
        // ★ Khi Firestore Timestamp được JSON.stringify rồi JSON.parse,
        //   nó thành plain object {seconds, nanoseconds} → new Date() trả về Invalid Date.
        //   Xử lý cả 3 dạng: Firestore Timestamp object, số ms, ISO string.
        const notifDate = iso?.seconds
            ? new Date(iso.seconds * 1000)
            : iso?.toDate
                ? iso.toDate()   // Firestore Timestamp chưa serialize (có method .toDate())
                : new Date(iso);

        if (isNaN(notifDate.getTime())) return '';
        const diff = (now - notifDate) / 1000; // seconds in difference

        // ★ FIX: Kiểm tra xem có phải cùng ngày không
        const isSameDay =
            now.getFullYear() === notifDate.getFullYear() &&
            now.getMonth() === notifDate.getMonth() &&
            now.getDate() === notifDate.getDate();

        // Nếu cùng ngày, tính theo giờ/phút
        if (isSameDay) {
            if (diff < 60) return 'Vừa xong';
            if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
            return `${Math.floor(diff / 3600)} giờ trước`; // ★ NEW: Tính theo giờ
        }

        // Nếu khác ngày, hiển thị ngày tháng
        return notifDate.toLocaleDateString('vi-VN');
    }

    function _escapeHtml(unsafe) {
        if (!unsafe) return '';
        return unsafe.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    return { init, render, appendItem, markItemAsRead, updateBadges: _updateBadges };
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
        } else if (attempts > 10) {
            clearInterval(interval); // Time out sau 10s
        }
    }, 500);
})();

export default NotificationPanelRenderer;