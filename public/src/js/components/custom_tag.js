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
    Hủy: 'cancel',

    // Payment Status (Trạng thái thanh toán)
    'Chưa Thanh Toán': 'pending',
    'Thanh Toán Một Phần': 'partial',
    'Thanh Toán Đầy Đủ': 'full',
    'Quá Hạn': 'overdue',
    'Hoàn Tiền': 'refund',

    // Priority (Mức ưu tiên)
    'Khẩn Cấp': 'critical',
    Cao: 'high',
    'Trung Bình': 'medium',
    Thấp: 'low',

    // Role (Vai trò)
    'Quản Trị': 'admin',
    'Quản Lý': 'manager',
    'Nhân Viên Vận Hành': 'operator',
    'Bán Hàng': 'sales',
    Khách: 'guest',

    // Service Type (Loại dịch vụ)
    Phòng: 'room',
    'Máy Bay': 'flight',
    Tàu: 'train',
    'Ăn Uống': 'food',
    Tour: 'tour',

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
    Lỗi: 'error',

    // Category (Loại/Nhãn)
    Hot: 'hot',
    'Nổi Bật': 'featured',
    'Đặc Biệt': 'special',
    'Khuyến Mãi': 'promo',
    VIP: 'vip',

    // Online Status (Trạng thái kết nối)
    'Trực Tuyến': 'online',
    'Ngoại Tuyến': 'offline',
    Bận: 'busy',
    'Không Hoạt Động': 'idle',
    'Vắng Mặt': 'away',

    // Document Status (Trạng thái tài liệu)
    'Đang Xem Xét': 'review',
    'Lưu Trữ': 'archived',
};

class AtStatus extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        // Cờ kiểm soát việc render để tránh re-render liên tục gây nghẽn cổ chai
        this._isRendering = false;
    }

    static get observedAttributes() {
        return ['status'];
    }

    connectedCallback() {
        try {
            this.render();
            this._setupEventListeners();
        } catch (error) {
            console.error('[AtStatus] Lỗi khi khởi tạo component:', error);
        }
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue !== newValue) {
            this.render();
        }
    }

    // ========== HELPER: Giao tiếp với getVal() / setVal() global ==========
    // Việc định nghĩa getter/setter này giúp AtStatus hoạt động như một form control thực thụ
    get value() {
        const childEl = this.querySelector('input, select, textarea');
        return childEl ? childEl.value : this.getAttribute('status');
    }

    set value(val) {
        const childEl = this.querySelector('input, select, textarea');
        if (childEl) {
            childEl.value = val;
            // Kích hoạt event change để các logic khác (nếu có) nắm bắt được sự thay đổi
            childEl.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
            this.setAttribute('status', val);
        }
        this.render();
    }

    // ========== HELPER: Thiết lập Event Listeners an toàn ==========
    _setupEventListeners() {
        const childEl = this.querySelector('input, select, textarea');
        if (childEl) {
            // Lắng nghe thay đổi từ input con
            const updateUI = () => this.render();
            childEl.addEventListener('change', updateUI);
            childEl.addEventListener('input', updateUI);

            // Bắt sự thay đổi của attribute 'data-val' nếu DOM bị modify từ script ngoài
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'data-val') {
                        this.render();
                    }
                });
            });
            observer.observe(childEl, { attributes: true });
        }
    }

    _autoDetectStatus() {
        if (this.hasAttribute('status')) return this.getAttribute('status');

        const childEl = this.querySelector('input, select, textarea');
        if (childEl) {
            if (childEl.hasAttribute('data-val')) return childEl.getAttribute('data-val');
            if (childEl.value) return childEl.value;
        }

        const allText = this.textContent?.trim() || '';
        if (allText && !childEl) return allText;

        return 'new';
    }

    _mapStatus(status) {
        if (!status) return 'new';

        const normalized = String(status).trim();
        if (typeof STATUS_VI_TO_EN !== 'undefined') {
            if (STATUS_VI_TO_EN[normalized]) return STATUS_VI_TO_EN[normalized];
            const lowerStatus = normalized.toLowerCase();
            for (const [key, val] of Object.entries(STATUS_VI_TO_EN)) {
                if (key.toLowerCase() === lowerStatus) return val;
            }
        }
        return normalized.toLowerCase();
    }

    render() {
        // Ngăn chặn việc render đè chéo liên tục
        if (this._isRendering) return;
        this._isRendering = true;

        try {
            let status = this._autoDetectStatus();
            let label = status || 'N/A';
            status = this._mapStatus(status);

            const style = `
              <style>
                  :host {
                      display: inline-flex;
                      align-items: center;
                      gap: 0.5rem;
                  }
                  
                  /* Thay vì display: none, ta dùng kỹ thuật ẩn UI (visually-hidden) 
                     để trình duyệt vẫn focus và validator vẫn hoạt động mà không chiếm diện tích */
                  ::slotted(input),
                  ::slotted(select),
                  ::slotted(textarea) {
                      position: absolute !important;
                      width: 1px !important;
                      height: 1px !important;
                      padding: 0 !important;
                      margin: -1px !important;
                      overflow: hidden !important;
                      clip: rect(0, 0, 0, 0) !important;
                      white-space: nowrap !important;
                      border: 0 !important;
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
                      border-radius: 0.75rem;
                      font-family: sans-serif;
                      flex-shrink: 0;
                  }

                  /* Giữ nguyên các class CSS badge của bạn ở đây... */
                  .badge.new { background-color: #366d2bec; } 
                  .badge.deposit { background-color: #f9fd0d6c; color: #333; }
                  /* ... */
              </style>
          `;

            const html = `
              <span class="badge ${status} small">${label}</span>
              <slot></slot>
          `;

            // XÓA BỎ DÒNG NÀY: this.textContent = '';
            // Cập nhật Shadow DOM
            this.shadowRoot.innerHTML = `${style}${html}`;
        } catch (error) {
            console.error('[AtStatus] Lỗi khi render:', error);
        } finally {
            this._isRendering = false;
        }
    }
}

// Đăng ký component an toàn
if (!customElements.get('at-status')) {
    customElements.define('at-status', AtStatus);
}
