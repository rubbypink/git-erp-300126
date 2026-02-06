/**
    * 9 Trip ERP - Trip Badge Component
    * Usage (English): <at-badge status="paid">Thanh toán</at-badge>
    * Usage (Vietnamese): <at-badge status="Thanh Toán">Thanh toán</at-badge>
    * 
    * JavaScript: 
    * const badge = document.createElement('at-badge');
    * badge.setAttribute('status', 'Thanh Toán'); // Hoặc 'paid'
    * badge.textContent = 'Thanh toán';
    * tdStatus.appendChild(badge);
 */

// =========================================================================
// STATUS MAPPING: Ánh xạ tiếng Việt sang tiếng Anh (CSS class names)
// =========================================================================
const STATUS_VI_TO_EN = {
    // Booking Status (Trạng thái booking)
    'Đặt Lịch': 'new',
    'Đặt Cọc': 'deposit',
    'Công Nợ': 'dept',
    'Thanh Toán': 'paid',
    'Hoàn Thành': 'complete',
    'Hủy': 'cancel',

    // Payment Status (Trạng thái thanh toán)
    'Chưa Thanh Toán': 'pending',
    'Thanh Toán Một Phần': 'partial',
    'Thanh Toán Đầy Đủ': 'full',
    'Quá Hạn': 'overdue',
    'Hoàn Tiền': 'refund',

    // Priority (Mức ưu tiên)
    'Khẩn Cấp': 'critical',
    'Cao': 'high',
    'Trung Bình': 'medium',
    'Thấp': 'low',

    // Role (Vai trò)
    'Quản Trị': 'admin',
    'Quản Lý': 'manager',
    'Nhân Viên Vận Hành': 'operator',
    'Bán Hàng': 'sales',
    'Khách': 'guest',

    // Service Type (Loại dịch vụ)
    'Phòng': 'room',
    'Máy Bay': 'flight',
    'Tàu': 'train',
    'Ăn Uống': 'food',
    'Tour': 'tour',

    // Action Status (Trạng thái hành động)
    'Hoạt Động': 'active',
    'Bất Hoạt Động': 'inactive',
    'Được Phê Duyệt': 'approved',
    'Bị Từ Chối': 'rejected',
    'Bản Nháp': 'draft',

    // Alert Level (Mức cảnh báo)
    'Thành Công': 'success',
    'Thông Tin': 'info',
    'Cảnh Báo': 'warning',
    'Nguy Hiểm': 'danger',
    'Lỗi': 'error',

    // Category (Loại/Nhãn)
    'Hot': 'hot',
    'Nổi Bật': 'featured',
    'Đặc Biệt': 'special',
    'Khuyến Mãi': 'promo',
    'VIP': 'vip',

    // Online Status (Trạng thái kết nối)
    'Trực Tuyến': 'online',
    'Ngoại Tuyến': 'offline',
    'Bận': 'busy',
    'Không Hoạt Động': 'idle',
    'Vắng Mặt': 'away',

    // Document Status (Trạng thái tài liệu)
    'Đang Xem Xét': 'review',
    'Lưu Trữ': 'archived',
};

class TripBadge extends HTMLElement {
    constructor() {
        super();
        // 1. Tạo Shadow DOM (Open để dễ debug)
        this.attachShadow({ mode: 'open' });
    }

    // 2. Định nghĩa các thuộc tính cần theo dõi sự thay đổi
    static get observedAttributes() {
        return ['status'];
    }

    // 3. Callback chạy khi Component được gắn vào trang web
    connectedCallback() {
        this.render();
    }

    // 4. Callback chạy khi thuộc tính thay đổi (Reactivity)
    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue !== newValue) {
            this.render();
        }
    }

    // ========== HELPER: Chuyển đổi status Việt → Anh ==========
    _mapStatus(status) {
        // Nếu status có trong mapping, trả về giá trị Anh, ngược lại trả về status gốc
        return STATUS_VI_TO_EN[status] || status;
    }

    // Hàm render giao diện
    render() {
        let status = this.getAttribute('status') || 'new';
        const label = this.textContent || 'N/A';

        // Chuyển đổi status Việt sang Anh
        status = this._mapStatus(status);

        // CSS nội bộ (Encapsulated) - Không sợ xung đột với Bootstrap bên ngoài
        const style = `
            <style>
                .badge {
                    display: inline-block;
                    padding: 0.35em 0.65em;
                    font-size: 0.75em;
                    font-weight: 700;
                    line-height: 1;
                    color: #fff;
                    text-align: center;
                    white-space: nowrap;
                    vertical-align: baseline;
                    border-radius: 0.25rem;
                    font-family: sans-serif;
                }
                
                /* ========== BOOKING STATUS ========== */
                .badge.new { background-color: #366d2bec; } 
                .badge.deposit { background-color: #f9fd0d6c; color: #333; }
                .badge.dept { background-color: #9e4b07; }
                .badge.paid { background-color: #267cfd; }
                .badge.complete { background-color: #0011a8; }
                .badge.cancel { background-color: #000000; }
                
                /* ========== PAYMENT STATUS ========== */
                .badge.pending { background-color: #ffc107; color: #333; }
                .badge.partial { background-color: #ff9800; color: #fff; }
                .badge.full { background-color: #28a745; }
                .badge.overdue { background-color: #dc3545; }
                .badge.refund { background-color: #6f42c1; }
                
                /* ========== PRIORITY / URGENCY ========== */
                .badge.critical { background-color: #dc3545; animation: pulse 2s infinite; }
                .badge.high { background-color: #fd7e14; }
                .badge.medium { background-color: #ffc107; color: #333; }
                .badge.low { background-color: #17a2b8; }
                
                /* ========== USER ROLE / PERMISSION ========== */
                .badge.admin { background-color: #d32f2f; }
                .badge.manager { background-color: #f57c00; }
                .badge.operator { background-color: #1976d2; }
                .badge.sales { background-color: #388e3c; }
                .badge.guest { background-color: #757575; }
                
                /* ========== SERVICE TYPE ========== */
                .badge.room { background-color: #9c27b0; }
                .badge.flight { background-color: #00bcd4; }
                .badge.train { background-color: #673ab7; }
                .badge.food { background-color: #ff5722; }
                .badge.tour { background-color: #4caf50; }
                
                /* ========== ACTION / TASK STATUS ========== */
                .badge.active { background-color: #4caf50; }
                .badge.inactive { background-color: #9e9e9e; }
                .badge.approved { background-color: #2196f3; }
                .badge.rejected { background-color: #f44336; }
                .badge.draft { background-color: #9e9e9e; }
                
                /* ========== ALERT / NOTIFICATION LEVEL ========== */
                .badge.success { background-color: #4caf50; }
                .badge.info { background-color: #2196f3; }
                .badge.warning { background-color: #ff9800; color: #fff; }
                .badge.danger { background-color: #f44336; }
                .badge.error { background-color: #e53935; }
                
                /* ========== CATEGORY / TAGS ========== */
                .badge.hot { background-color: #ff5252; }
                .badge.featured { background-color: #ffb300; color: #333; }
                .badge.special { background-color: #e91e63; }
                .badge.promo { background-color: #4caf50; }
                .badge.vip { background-color: #ffd700; color: #333; }
                
                /* ========== DOCUMENT STATUS ========== */
                .badge.review { background-color: #ff9800; }
                .badge.archived { background-color: #455a64; }
                
                /* ========== ONLINE STATUS ========== */
                .badge.online { background-color: #4caf50; }
                .badge.offline { background-color: #9e9e9e; }
                .badge.busy { background-color: #f44336; }
                .badge.idle { background-color: #ffb300; color: #333; }
                .badge.away { background-color: #9e9e9e; }
                
                /* ========== DEFAULT ========== */
                .badge.default { background-color: #6c757d; }
                
                /* ========== ANIMATION ========== */
                @keyframes pulse {
                    0% { opacity: 1; }
                    50% { opacity: 0.7; }
                    100% { opacity: 1; }
                }
            </style>
        `;

        // HTML cấu trúc
        const html = `
            <span class="badge ${status}">
                ${label}
            </span>
        `;

        // Gắn vào Shadow DOM
        this.shadowRoot.innerHTML = `${style}${html}`;
    }
}

// 5. Đăng ký thẻ với trình duyệt (Bắt buộc phải có dấu gạch ngang "-")
customElements.define('at-badge', TripBadge);