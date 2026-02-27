/**
 * Module: ErpFooterMenu (ES6 Module)
 * Chức năng: Quản lý thanh công cụ (Footer Menu) cố định dưới đáy màn hình.
 * Hỗ trợ Responsive: Horizontal Desktop, Drop-up Mobile.
 */

// ==========================================
// 1. CLASS CORE (Quản lý UI & Logic DOM)
// ==========================================
export default class ErpFooterMenu {
    constructor(containerId = 'erp-footer-menu-container') {
        this.containerId = containerId;
        this.buttons = [];
        this.isMobileMenuOpen = false;
        this.role = 'guest';

        // Bind context để chống Memory Leak
        this._boundHandleClickOutside = this._handleClickOutside.bind(this);

        this.config = {
            height: '3rem',
            zIndex: '1030',
            bgColor: `var(--bs-body-bg, #ffffff)`,
            boxShadow: '0 -2px 10px rgba(0, 0, 0, 0.05)'
        };
    }

    async init() {
        if (this._initialized) {
            console.warn('[ERP Footer Menu] Đã khởi tạo rồi, bỏ qua...');
            return;
        }
        this._initialized = true;
        this.role = CURRENT_USER?.role || 'guest';
        try {
            this._injectStyles();
            this._renderBaseLayout();

            await new Promise(resolve => requestAnimationFrame(resolve));
            this._ensureInViewport();

            document.addEventListener('click', this._boundHandleClickOutside);
            if (this.role) renderRoleBasedFooterButtons(this.role, this);
        } catch (error) {
            console.error('[9 Trip ERP] Lỗi khởi tạo Footer Menu:', error);
        }
    }

    destroy() {
        try {
            document.removeEventListener('click', this._boundHandleClickOutside);
            const container = document.getElementById(this.containerId);
            if (container) container.remove();
            const style = document.getElementById('erp-footer-styles');
            if (style) style.remove();
            this.buttons = [];
            this.isMobileMenuOpen = false;
            if (this._footerResizeObserver) {
                this._footerResizeObserver.disconnect();
                this._footerResizeObserver = null;
            }

            document.documentElement.style.removeProperty('--footer-actual-height');

        } catch (error) {
            console.error('[9 Trip ERP] Lỗi khi hủy Footer Menu Module:', error);
        }
    }

    // ==========================================
    // WIDGET MODE SUPPORT (Mobile Icon + Drag)
    // ==========================================

    /**
     * Setup Widget Icon - Drag & Drop behavior
     */
    _setupWidgetIcon() {
        const btn = document.getElementById('erp-f-mobile-widget-icon');
        if (!btn) return;

        let isDragging = false;
        let startX = 0;
        let startY = 0;
        let startLeft = 0;
        let startRight = 0;
        let startBottom = 0;
        let currentSide = 'right'; // Track which side button is currently positioned: 'left' or 'right'

        const handleMouseDown = (e) => {
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;

            const rect = btn.getBoundingClientRect();
            const computedStyle = window.getComputedStyle(btn);

            // Determine current side based on computed values
            const leftVal = computedStyle.left;
            const rightVal = computedStyle.right;
            currentSide = (leftVal !== 'auto' && leftVal !== 'unset') ? 'left' : 'right';

            // Set start position based on current side
            if (currentSide === 'left') {
                startLeft = parseFloat(computedStyle.left);
                startBottom = window.innerHeight - rect.bottom;
            } else {
                startRight = window.innerWidth - rect.right;
                startBottom = window.innerHeight - rect.bottom;
            }

            btn.style.transition = 'none';
            btn.style.cursor = 'grabbing';
        };

        const handleMouseMove = (e) => {
            if (!isDragging) return;

            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;

            // Only update the property corresponding to current side
            if (currentSide === 'left') {
                btn.style.left = (startLeft + deltaX) + 'px';
            } else {
                btn.style.right = (startRight - deltaX) + 'px';
            }
            btn.style.bottom = (startBottom - deltaY) + 'px';
        };

        const handleMouseUp = (e) => {
            if (!isDragging) return;

            const isMiniClick = Math.abs(e.clientX - startX) < 5 && Math.abs(e.clientY - startY) < 5;

            isDragging = false;
            btn.style.cursor = 'grab';

            if (isMiniClick) {
                // Mini-click: Toggle dropup ✓
                e.stopPropagation();
                this._toggleWidgetDropup();
                return;
            }

            // Drag: Snap to nearest edge
            const rect = btn.getBoundingClientRect();
            const distToLeft = rect.left;
            const distToRight = window.innerWidth - rect.right;

            btn.style.transition = `all 0.3s ease`;

            if (distToLeft < distToRight) {
                // Snap to left
                btn.style.left = '20px';
                btn.style.right = 'auto';
                currentSide = 'left';
            } else {
                // Snap to right
                btn.style.right = '20px';
                btn.style.left = 'auto';
                currentSide = 'right';
            }

            setTimeout(() => {
                btn.style.transition = '';
            }, 300);
        };

        // Mouse events
        btn.addEventListener('mousedown', handleMouseDown);
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        // Touch events support (mobile)
        btn.addEventListener('touchstart', (e) => {
            const touch = e.touches[0];
            handleMouseDown({ clientX: touch.clientX, clientY: touch.clientY });
        });

        document.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            const touch = e.touches[0];
            handleMouseMove({ clientX: touch.clientX, clientY: touch.clientY });
        });

        document.addEventListener('touchend', (e) => {
            const touch = e.changedTouches[0];
            handleMouseUp({ clientX: touch.clientX, clientY: touch.clientY, stopPropagation: () => { } });
        });
    }

    /**
     * Setup Widget Dropup Menu - Close outside dropup (shared with regular menu)
     * Support both regular mode (trigger button) và widget mode (widget icon)
     */
    _setupWidgetDropup() {
        const widgetBtn = document.getElementById('erp-f-mobile-widget-icon');
        const regularBtn = document.getElementById('erp-f-mobile-trigger');
        const dropupMenu = document.getElementById('erp-f-mobile-dropup');

        if (!dropupMenu || !widgetBtn || !regularBtn) return;

        // Close dropup when clicking outside (works for both regular & widget mode)
        document.addEventListener('click', (e) => {
            const isDropupOpen = dropupMenu.classList.contains('active');
            const isClickOnButton = regularBtn.contains(e.target) || widgetBtn.contains(e.target);
            const isClickOnMenu = dropupMenu.contains(e.target);

            // Chỉ đóng nếu click ở ngoài buttons và dropup menu
            if (isDropupOpen && !isClickOnMenu) {
                this._toggleWidgetDropup();
            }
        });
    }

    /**
     * Toggle Widget Dropup with smooth animation (shared dropup)
     */
    _toggleWidgetDropup() {
        const dropup = document.getElementById('erp-f-mobile-dropup');
        dropup.classList.toggle('active');
    }

    /**
     * Load widget mode preference from localStorage (Mobile-only)
     */
    _loadWidgetModePreference() {
        // Only load widget mode on mobile (max-width: 991px)
        if (window.innerWidth >= 992) return;

        const preference = localStorage.getItem('erp-footer-widget-mode');
        if (preference === 'true') {
            this._setWidgetMode(true);
        }
    }

    /**
     * Set widget mode (icon only instead of full footer) - Mobile-only
     * @param {boolean} isWidgetMode - true for icon mode, false for footer bar mode
     */
    _setWidgetMode(isWidgetMode) {
        // Prevent widget mode on desktop
        if (window.innerWidth >= 992) {
            console.warn('[ERP Footer] Widget mode không được phép trên desktop');
            return;
        }

        const container = document.getElementById(this.containerId);
        const body = document.body;

        if (isWidgetMode) {
            container.classList.add('erp-footer-widget-mode');
            body.classList.add('erp-footer-widget-mode');
            localStorage.setItem('erp-footer-widget-mode', 'true');
            // Footer ẩn hoàn toàn → không chiếm không gian của app-content
            document.documentElement.style.setProperty('--footer-actual-height', '0px');
        } else {
            container.classList.remove('erp-footer-widget-mode');
            body.classList.remove('erp-footer-widget-mode');
            localStorage.setItem('erp-footer-widget-mode', 'false');
            // Đợi 1 frame để CSS apply xong, rồi đọc lại height thực tế
            requestAnimationFrame(() => {
                const h = container.getBoundingClientRect().height;
                document.documentElement.style.setProperty(
                    '--footer-actual-height',
                    `${h + 4}px`
                );
            });
        }
    }

    _injectStyles() {
        if (document.getElementById('erp-footer-styles')) return;
        const style = document.createElement('style');
        style.id = 'erp-footer-styles';
        style.innerHTML = `
            .erp-footer-wrapper {
                position: fixed; bottom: 0; left: 0; width: 100%;
                height: ${this.config.height}; background-color: ${this.config.bgColor};
                box-shadow: ${this.config.boxShadow}; z-index: ${this.config.zIndex};
                display: flex; align-items: center; padding: 0 1.5rem; transition: transform 0.3s ease;
                user-select: none;
            }
            .erp-footer-desktop { 
                display: flex; gap: 0.5rem; align-items: center; width: 100%; justify-content: flex-end;
                user-select: none;
            }
            .erp-footer-mobile { 
                display: none; width: 100%; position: relative; user-select: none;
            }
            .erp-mobile-dropup {
                position: absolute; bottom: calc(${this.config.height} + 10px); left: 0;
                background: #fff; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);
                min-width: 200px; padding: 0.5rem 0; display: flex; flex-direction: column;
                transform: translateY(20px); opacity: 0; pointer-events: none; visibility: hidden; 
                transition: all 0.2s ease-in-out; user-select: none;
            }
            .erp-mobile-dropup.active { 
                transform: translateY(0); opacity: 1; pointer-events: auto; visibility: visible; user-select: auto;
            }
            .erp-mobile-dropup button { 
                width: 100%; text-align: left; border: none; background: none; padding: 10px 20px; 
                transition: background 0.2s; cursor: pointer; user-select: none;
            }
            .erp-mobile-dropup button:hover { background: #f8f9fa; }
            /* ⭐ Ngăn chặn ALL tương tác khi menu ẩn (cascade inheritance) */
            .erp-mobile-dropup:not(.active) * { 
                pointer-events: none !important; cursor: default !important; user-select: none !important;
            }
            
            /* ⭐ WIDGET MODE: Dropup positioning động */
            .erp-footer-widget-mode #erp-f-mobile-dropup {
                position: fixed !important;
                bottom: 80px !important;
                right: 20px !important;
                left: auto !important;
                width: 200px !important;
                min-width: unset !important;
            }
            .erp-footer-widget-mode .erp-footer-wrapper {
                height: auto; padding: 0; background: transparent; box-shadow: none;
                pointer-events: none;
            }
            .erp-footer-widget-mode .erp-footer-desktop { 
                display: none !important; pointer-events: none;
            }
            .erp-footer-widget-mode .erp-footer-mobile { 
                display: flex !important; pointer-events: auto; position: static;
            }
            .erp-footer-widget-mode #erp-f-mobile-widget-icon { 
                display: flex !important; pointer-events: auto;
            }
            .erp-footer-widget-mode #erp-f-mobile-trigger { 
                display: none !important; pointer-events: none;
            }
            /* 🔥 FIX: Explicitly show #erp-f-mobile-trigger in NORMAL mode (non-widget) */
            #erp-f-mobile-trigger {
                display: flex; align-items: center; justify-content: center;
            }
            #erp-f-mobile-widget-icon {
                position: fixed; bottom: 20px; right: 20px; width: 50px; height: 50px;
                border-radius: 50%; background: #0d6efd; color: white; border: none;
                cursor: grab; z-index: 9999; opacity: 1; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
                transition: opacity 0.3s ease, box-shadow 0.3s ease;
                display: none; align-items: center; justify-content: center; font-size: 24px;
                user-select: none; -webkit-user-select: none;
            }
            #erp-f-mobile-widget-icon:hover { 
                box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3); cursor: grab;
            }
            #erp-f-mobile-widget-icon:active { cursor: grabbing; }
            .erp-footer-widget-mode #erp-f-mobile-widget-icon { display: flex !important; pointer-events: auto; }
            
            @media (max-width: 991px) {
                .erp-footer-desktop { 
                    display: none !important; pointer-events: none !important;
                }
                .erp-footer-mobile { 
                    display: flex !important; justify-content: flex-start; align-items: center;
                    pointer-events: auto;
                }
            }
            
            @media (min-width: 992px) {
                /* Desktop (không hiển thị widget elements) */
                #erp-f-mobile-widget-icon { 
                    display: none !important; pointer-events: none !important;
                }
                #erp-f-mobile-trigger { 
                    display: none !important; pointer-events: none !important;
                }
                #erp-f-mobile-dropup { 
                    display: none !important; pointer-events: none !important; visibility: hidden;
                }
                
                /* 🔥 FORCE: Desktop luôn hiển thị footer dù widget mode được enable */
                .erp-footer-widget-mode .erp-footer-wrapper {
                    height: ${this.config.height} !important;
                    background-color: ${this.config.bgColor} !important;
                    box-shadow: ${this.config.boxShadow} !important;
                    padding: 0 1.5rem !important;
                    pointer-events: auto !important;
                }
                .erp-footer-widget-mode .erp-footer-desktop { 
                    display: flex !important; pointer-events: auto;
                }
                .erp-footer-widget-mode .erp-footer-mobile {
                    display: none !important;
                }
                
                /* Hide toggle widget button on desktop */
                #btn-toggle-widget-mode,
                #widget-btn-toggle-widget-mode {
                    display: none !important; pointer-events: none !important;
                }
            }
        `;
        document.head.appendChild(style);
    }

    _renderBaseLayout() {
        let container = document.getElementById(this.containerId);
        if (!container) {
            container = document.createElement('div');
            container.id = this.containerId;
            document.body.appendChild(container);
        }
        container.className = 'erp-footer-wrapper';
        container.innerHTML = `
            <div id="erp-f-desktop-container" class="erp-footer-desktop"></div>
            <div class="erp-footer-mobile">
                <button id="erp-f-mobile-trigger" class="btn btn-outline-primary d-flex align-items-center gap-2">
                    <i class="fas fa-bars"></i> Thao tác
                </button>
                <div id="erp-f-mobile-dropup" class="erp-mobile-dropup"></div>
                <button id="erp-f-mobile-widget-icon" title="Mở menu thao tác">
                    <i class="fas fa-bars"></i>
                </button>
            </div>
        `;
        document.getElementById('erp-f-mobile-trigger').addEventListener('click', (e) => {
            e.stopPropagation();
            this._toggleMobileMenu();
        });

        // Widget Icon Events
        this._setupWidgetIcon();
        this._setupWidgetDropup();

        // Load widget mode from localStorage
        this._loadWidgetModePreference();
        this._syncHeightToCSS();
    }

    _syncHeightToCSS() {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        const update = () => {
            const h = container.getBoundingClientRect().height;
            document.documentElement.style.setProperty(
                '--footer-actual-height',
                h > 0 ? `${h + 4}px` : '0px'
            );
        };

        // Chạy ngay lần đầu
        update();

        // Theo dõi khi footer thay đổi kích thước (widget mode, responsive, v.v.)
        this._footerResizeObserver = new ResizeObserver(update);
        this._footerResizeObserver.observe(container);
    }

    _ensureInViewport() {
        const container = document.getElementById(this.containerId);
        if (container && container.getBoundingClientRect().bottom > window.innerHeight) {
            container.style.paddingBottom = 'env(safe-area-inset-bottom)';
            container.style.bottom = '0px';
        }
    }

    _toggleMobileMenu() {
        const dropup = document.getElementById('erp-f-mobile-dropup');
        dropup.classList.toggle('active');
    }

    _handleClickOutside(event) {
        const dropup = document.getElementById('erp-f-mobile-dropup');
        const mobileContainer = document.querySelector('.erp-footer-mobile');

        // Close menu if clicking outside and menu is open
        if (dropup.classList.contains('active') && mobileContainer && !mobileContainer.contains(event.target)) {
            dropup.classList.remove('active');
        }
    }

    addButton(btnConfig) {
        try {
            const { id, label, iconClass = '', btnClass = 'btn-primary', callback, attributes = {} } = btnConfig;
            const safeLabel = label || '';
            if (!id || typeof callback !== 'function') throw new Error(`Thiếu id/callback cho nút: ${safeLabel || id}`);

            this.buttons.push(btnConfig);

            // Desktop
            const desktopContainer = document.getElementById('erp-f-desktop-container');
            const desktopBtn = document.createElement('button');
            desktopBtn.id = `${id}`;
            desktopBtn.className = `btn ${btnClass} d-flex align-items-center gap-1`;
            desktopBtn.innerHTML = iconClass ? `<i class="${iconClass}"></i> ${safeLabel}` : safeLabel;
            Object.keys(attributes).forEach(key => desktopBtn.setAttribute(key, attributes[key]));
            desktopBtn.addEventListener('click', callback);
            desktopContainer.appendChild(desktopBtn);

            // Mobile Regular Mode
            const mobileDropup = document.getElementById('erp-f-mobile-dropup');
            const mobileBtn = document.createElement('button');
            mobileBtn.id = `mb-${id}`;
            const roleClasses = btnClass.split(' ').filter(c => c.includes('only') || c === 'd-none').join(' ');
            mobileBtn.className = `d-flex align-items-center gap-2 text-dark ${roleClasses}`;
            mobileBtn.innerHTML = iconClass ? `<i class="${iconClass}"></i> <span>${safeLabel || 'Thao tác'}</span>` : `<span>${safeLabel}</span>`;
            Object.keys(attributes).forEach(key => mobileBtn.setAttribute(key, attributes[key]));
            mobileBtn.addEventListener('click', (e) => {
                this._toggleMobileMenu();
                callback(e);
            });
            mobileDropup.appendChild(mobileBtn);

        } catch (error) {
            console.error('[9 Trip ERP] Lỗi thêm nút:', error);
        }
    }
}

/**
 * Helper: Khởi tạo và phân quyền nút bấm cho Footer Menu
 * @param {string} userRole - Role của người dùng (ví dụ: 'admin', 'sale', 'op', 'acc')
 * @param {ErpFooterMenu} footerInstance - Instance của class ErpFooterMenu
 */
export function renderRoleBasedFooterButtons(userRole, footerInstance) {
    try {
        if (userRole === 'acc' || userRole === 'acc_thenice') return; // Tạm ẩn Footer Menu cho kế toán (theo yêu cầu)


        // 1. Chuẩn hóa Role đầu vào (Chống lỗi type mismatch)
        const currentRole = (userRole || CURRENT_USER?.role || 'guest').toLowerCase();

        // Map role code với class CSS tương ứng trên hệ thống
        const roleClassMap = {
            'sale': 'sales-only',
            'op': 'op-only',
            'acc': 'acc-only',
            'admin': 'admin-only' // Dù admin thấy hết, ta vẫn map để quản lý
        };
        const targetRoleClass = roleClassMap[currentRole] || '';
        const allRestrictedClasses = Object.values(roleClassMap);

        // 2. Định nghĩa toàn bộ Data Configuration (Mảng chứa mọi nút của hệ thống)
        const allButtonsConfig = [
            // -- ADMIN --
            {
                id: 'btn-admin-tools', label: '', iconClass: 'fas fa-tools', btnClass: 'btn-secondary admin-only',
                callback: () => { A.AdminConsole.openAdminSettings(); },
                // callback: () => { A.UI.renderForm(null, 'form-admin'); },
                attributes: { 'title': 'Công cụ Admin' },
            },
            // -- SALES --
            {
                id: 'btn-new-bk', label: 'Tạo Booking', iconClass: 'fa-solid fa-plus-circle', btnClass: 'btn-primary sales-only',
                callback: () => { if (typeof activateTab === 'function') activateTab('tab-form'); },
                attributes: { 'data-bs-target': '#tab-form', 'data-ontabs': '1 3 4' }
            },
            {
                id: 'btn-new-customer', label: 'Tạo Khách Hàng', iconClass: 'fa-solid fa-user-plus', btnClass: 'btn-info sales-only',
                callback: () => { A.UI.renderForm('customers', 'form-customer'); },
            },
            {
                id: 'btn-create-contract', label: 'Tạo Hợp Đồng', iconClass: 'fa-solid fa-print', btnClass: 'btn-warning line-clamp-2 sales-only',
                callback: () => { if (typeof createContract === 'function') createContract(); },
                attributes: { 'data-ontabs': '2 4' }
            },
            {
                id: 'btn-delete-form', label: 'Hủy Booking', iconClass: 'fa-solid fa-trash', btnClass: 'btn-danger sales-only',
                callback: () => { if (typeof logA === 'function') logA('CẢNH BÁO: Hủy Booking?', 'danger', deleteForm); },
                attributes: { 'data-ontabs': '2' }
            },
            // -- OPERATOR --
            {
                id: 'btn-request-rates', label: 'Gửi Yêu Cầu Báo Giá', iconClass: 'fa-solid fa-palette', btnClass: 'btn-primary op-only',
                callback: () => { if (typeof PartnerMailModule !== 'undefined') PartnerMailModule.open(); }
            },
            {
                id: 'btn-hotel-rate-plans', label: 'Quản lý Giá Hotel', iconClass: 'fa-solid fa-triangle-exclamation', btnClass: 'btn-primary op-only',
                callback: async () => {
                    let modal = document.querySelector('at-modal-full');
                    if (!modal) {
                        console.warn('[EventManager] Modal not found, creating...');
                        modal = document.createElement('at-modal-full');
                        document.body.appendChild(modal);
                    }

                    modal.render(null, 'Quản lý Giá Phòng');
                    modal.setFooter?.(false);

                    // ★ Gọi static init() - tự động tạo hoặc reuse instance (dùng cache)
                    // Không cleanup khi close → instance + cache sẽ tồn tại
                    await A.HotelPriceController.init('dynamic-modal-full-body');

                    modal.show();
                }
            },
            {
                id: 'btn-service-rate-plans', label: 'Quản lý Giá Dịch Vụ', iconClass: 'fa-solid fa-plus-circle', btnClass: 'btn-primary op-only',
                callback: async () => {
                    let modal = document.querySelector('at-modal-full');
                    if (!modal) {
                        console.warn('[EventManager] Modal not found, creating...');
                        modal = document.createElement('at-modal-full');
                        document.body.appendChild(modal);
                    }

                    modal.render(null, 'Quản lý Giá Dịch Vụ');
                    modal.setFooter?.(false);
                    // ★ Gọi static init() - tự động tạo hoặc reuse instance (dùng cache)
                    // Không cleanup khi close → instance + cache sẽ tồn tại
                    await A.ServicePriceController.init('dynamic-modal-full-body');
                    modal.show();
                }
            },
            // -- COMMON (Nút dùng chung, không giới hạn quyền) --
            {
                id: 'btn-save-batch', label: 'Lưu Theo (List)', iconClass: 'fa-solid fa-check-double', btnClass: 'btn-warning fw-bold d-none line-clamp-2',
                callback: () => { if (typeof saveBatchDetails === 'function') saveBatchDetails(); },
                attributes: { 'data-ontabs': '' }
            },
            {
                id: 'btn-save-form', label: 'Lưu Booking', iconClass: 'fa-solid fa-save', btnClass: 'btn-success',
                callback: () => { if (typeof saveForm === 'function') saveForm(); },
                attributes: { 'data-ontabs': '2' }
            },
            {
                id: 'btn-reset-form', label: 'Xóa Form', iconClass: 'fa-solid fa-rotate', btnClass: 'btn-danger',
                callback: () => { if (typeof logA === 'function') logA('Xóa hết dữ liệu vừa nhập ?', 'warning', refreshForm); },
                attributes: { 'data-ontabs': '2' }
            },
            // -- WIDGET MODE TOGGLE (Mobile only) --
            {
                id: 'btn-toggle-widget-mode', label: 'Chế độ Widget', iconClass: 'fa-solid fa-mobile', btnClass: 'btn-info',
                callback: () => {
                    const currentMode = localStorage.getItem('erp-footer-widget-mode') === 'true';
                    footerInstance._setWidgetMode(!currentMode);
                    if (typeof log === 'function') {
                        log(currentMode ? 'Chuyển sang thanh công cụ' : 'Chuyển sang chế độ widget', 'info');
                    }
                },
                attributes: { 'title': 'Chuyển đổi giữa thanh công cụ và chế độ widget' }
            }
        ];

        // 3. Logic Core: Lọc danh sách nút theo Quyền
        const filteredButtons = allButtonsConfig.filter(btn => {
            // Admin thì trả về true (Hiển thị tất cả)
            if (currentRole === 'admin') return true;

            const btnClass = btn.btnClass || '';

            // Kiểm tra xem nút này có bị gán class giới hạn quyền nào không (vd: có chứa 'sales-only' hay 'op-only' không?)
            const hasRoleRestriction = allRestrictedClasses.some(restrictedClass => btnClass.includes(restrictedClass));

            // Nếu nút KHÔNG có class giới hạn (như Lưu, Xóa Form) -> Cho phép hiển thị
            if (!hasRoleRestriction) return true;

            // Nếu nút CÓ class giới hạn -> Phải trùng với Role của User đang đăng nhập mới được hiển thị
            return targetRoleClass && btnClass.includes(targetRoleClass);
        });

        // 4. Bơm các nút đã lọc vào UI
        filteredButtons.forEach(btnConfig => {
            footerInstance.addButton(btnConfig);
        });

    } catch (error) {
        console.error('[9 Trip ERP] Lỗi trong quá trình render Footer theo Role:', error);
    }
}