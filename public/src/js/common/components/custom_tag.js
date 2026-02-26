/**
    * 9 Trip ERP - Trip Status Component
    * Usage: <at-status status="paid"><input value="paid"></at-status>
    *        <at-status><input value="paid"></at-status>
    *        <at-status>Thanh toán</at-status>
    * 
    * Auto-detect priority: Attribute > Child Input/Select Value > Self Text Content
    * Designed as parent wrapper for input elements with status badge indicator
    * 
    * JavaScript: 
    * const status = document.createElement('at-status');
    * const input = document.createElement('input');
    * input.value = 'paid';
    * status.appendChild(input);
    * container.appendChild(status);
 */

// =========================================================================
// STATUS MAPPING: Ánh xạ tiếng Việt sang tiếng Anh (CSS class names)
// =========================================================================
// Usage example (as sibling of input):
// <div class="input-group">
//   <input value="paid" class="form-control">
//   <at-status>Thanh toán</at-status>
// </div>
const STATUS_VI_TO_EN = {
    // Booking Status (Trạng thái booking)
    'Đặt Lịch': 'new',
    'Đặt Cọc': 'deposit',
    'Công Nợ': 'dept',
    'Thanh Toán': 'paid',
    'Hoàn Thành': 'complete',
    'Xong BK': 'complete',
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

class AtStatus extends HTMLElement {
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
        
        // Watch for child input value changes
        const childEl = this.querySelector('input, select, textarea');
        if (childEl) {
            childEl.addEventListener('change', () => this.render());
            childEl.addEventListener('input', () => this.render());
            childEl.addEventListener('blur', () => this.render());
        }
        
        // Watch for data-value attribute changes on child
        const observer = new MutationObserver(() => this.render());
        observer.observe(this, { attributes: true, subtree: true, attributeFilter: ['status', 'data-value'] });
    }

    // 4. Callback chạy khi thuộc tính thay đổi (Reactivity)
    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue !== newValue) {
            this.render();
        }
    }

    // ========== HELPER: Tự động xác định status ==========
    _autoDetectStatus() {
        // Priority (theo thứ tự):
        // 1. Attribute status on at-status
        // 2. data-value on child element
        // 3. .value of input/select/textarea
        // 4. Text content
        // 5. Default: 'new'
        
        // 1. Nếu có attribute status được truyền -> dùng nó
        if (this.hasAttribute('status')) {
            return this.getAttribute('status');
        }
        
        // 2. Tìm input/select/textarea con
        const childEl = this.querySelector('input, select, textarea');
        if (childEl) {
            // Check data-value attribute first
            if (childEl.hasAttribute('data-value')) {
                return childEl.getAttribute('data-value');
            }
            // Then check .value property
            if (childEl.value) {
                return childEl.value;
            }
        }
        
        // 3. Lấy text content của element này (nếu không có child element)
        const allText = this.textContent?.trim() || '';
        if (allText && !childEl) {
            return allText;
        }
        
        // 4. Fallback: default 'new'
        return 'new';
    }

    // ========== HELPER: Chuyển đổi status Việt → Anh (Case-insensitive) ==========
    _mapStatus(status) {
        if (!status) return 'new';
        
        // Normalize: trim whitespace
        const normalized = status.trim();
        
        // 1. Try direct mapping first (exact match)
        if (STATUS_VI_TO_EN[normalized]) {
            return STATUS_VI_TO_EN[normalized];
        }
        
        // 2. Try case-insensitive match (không phân biệt hoa/thường)
        const lowerStatus = normalized.toLowerCase();
        for (const [key, value] of Object.entries(STATUS_VI_TO_EN)) {
            if (key.toLowerCase() === lowerStatus) {
                return value;
            }
        }
        
        // 3. Return as-is (convert to lowercase) nếu không tìm thấy
        return lowerStatus;
    }

    // Hàm render giao diện
    render() {
        // Auto-detect status từ attribute, child input/select value, hoặc text content
        let status = this._autoDetectStatus();
        
        // Lấy label từ text content của child elements hoặc status
        let label = status || 'N/A';

        // Chuyển đổi status Việt sang Anh
        status = this._mapStatus(status);

        // CSS nội bộ (Encapsulated) - Hiển thị wrapper container với badge
        const style = `
            <style>
                :host {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 0.5rem;
                    width: 100%;
                }
                
                ::slotted(input),
                ::slotted(select),
                ::slotted(textarea) {
                    display: none !important; /* Ẩn phần tử input/select/textarea con */
                    margin-left: auto;
                }
                
                .badge {
                    display: inline-block;
                    padding: 0.3rem 1rem;
                    font-weight: 700;
                    line-height: 1;
                    color: #fff;
                    text-align: center;
                    white-space: nowrap;
                    vertical-align: middle;
                    border-radius: 0.25rem;
                    font-family: sans-serif;
                    flex-shrink: 0;
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

        // HTML cấu trúc: badge span trước + slot sau (input ẩn + button)
        const html = `
            <span class="badge ${status}">
                ${label}
            </span>
            <slot></slot>
        `;

        // Gắn vào Shadow DOM
        this.shadowRoot.innerHTML = `${style}${html}`;
    }
}

// 5. Đăng ký thẻ với trình duyệt (Bắt buộc phải có dấu gạch ngang "-")
customElements.define('at-status', AtStatus);