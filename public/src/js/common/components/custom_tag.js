/**
    * 9 Trip ERP - Trip Badge Component
    * Usage: <at-badge status="new" label="Mới tạo"></at-badge>
    * rows.forEach(booking => {
    * const badge = document.createElement('at-badge');
    * badge.setAttribute('status', booking.status); // Ví dụ: 'new'
    * badge.setAttribute('label', getStatusText(booking.status)); // Ví dụ: 'Mới'
    * tdStatus.appendChild(badge);
    * });
 */

class TripBadge extends HTMLElement {
    constructor() {
        super();
        // 1. Tạo Shadow DOM (Open để dễ debug)
        this.attachShadow({ mode: 'open' });
    }

    // 2. Định nghĩa các thuộc tính cần theo dõi sự thay đổi
    static get observedAttributes() {
        return ['status', 'label'];
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

    // Hàm render giao diện
    render() {
        const status = this.getAttribute('status') || 'default';
        const label = this.getAttribute('label') || 'N/A';

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
                /* Logic màu sắc */
                .badge.new { background-color: #366d2bec; } 
                .badge.deposit { background-color: #f9fd0d6c; } 
                .badge.dept { background-color: #9e4b07; }
                .badge.paid { background-color: #267cfd; }
                .badge.complete { background-color: #0011a8; }
                .badge.cancel { background-color: #000000; }
                .badge.default { background-color: #6c757d; } 
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