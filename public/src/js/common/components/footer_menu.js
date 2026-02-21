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
        
        // Bind context để chống Memory Leak
        this._boundHandleClickOutside = this._handleClickOutside.bind(this);
        
        this.config = {
            height: '3rem',
            zIndex: '1030', 
            bgColor: '#ffffff',
            boxShadow: '0 -2px 10px rgba(0, 0, 0, 0.05)'
        };
    }

    async init() {
        try {
            this._injectStyles();
            this._renderBaseLayout();
            
            await new Promise(resolve => requestAnimationFrame(resolve));
            this._ensureInViewport();
            
            document.addEventListener('click', this._boundHandleClickOutside);
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
            console.log('[9 Trip ERP] Footer Menu Module đã được HỦY an toàn.');
        } catch (error) {
            console.error('[9 Trip ERP] Lỗi khi hủy Footer Menu Module:', error);
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
            }
            .erp-footer-desktop { display: flex; gap: 0.5rem; align-items: center; width: 100%; justify-content: flex-end; }
            .erp-footer-mobile { display: none; width: 100%; position: relative; }
            .erp-mobile-dropup {
                position: absolute; bottom: calc(${this.config.height} + 10px); left: 0;
                background: #fff; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);
                min-width: 200px; padding: 0.5rem 0; display: flex; flex-direction: column;
                transform: translateY(20px); opacity: 0; pointer-events: none; transition: all 0.2s ease-in-out;
            }
            .erp-mobile-dropup.active { transform: translateY(0); opacity: 1; pointer-events: auto; }
            .erp-mobile-dropup button { width: 100%; text-align: left; border: none; background: none; padding: 10px 20px; transition: background 0.2s; }
            .erp-mobile-dropup button:hover { background: #f8f9fa; }
            @media (max-width: 991px) {
                .erp-footer-desktop { display: none !important; }
                .erp-footer-mobile { display: flex !important; justify-content: flex-start; align-items: center;}
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
            </div>
        `;
        document.getElementById('erp-f-mobile-trigger').addEventListener('click', (e) => {
            e.stopPropagation();
            this._toggleMobileMenu();
        });
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
        this.isMobileMenuOpen = !this.isMobileMenuOpen;
        this.isMobileMenuOpen ? dropup.classList.add('active') : dropup.classList.remove('active');
    }

    _handleClickOutside(event) {
        if (!this.isMobileMenuOpen) return;
        const mobileContainer = document.querySelector('.erp-footer-mobile');
        if (mobileContainer && !mobileContainer.contains(event.target)) {
            this._toggleMobileMenu();
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

            // Mobile
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
        console.log(`[9 Trip ERP] Đang load Footer Menu cho Role: ${userRole}`);

        // 1. Chuẩn hóa Role đầu vào (Chống lỗi type mismatch)
        const currentRole = (userRole || 'sale').toLowerCase();

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
                callback: () => { A.UI.renderForm(null, 'form-admin'); },
                attributes: { 'title': 'Công cụ Admin'},
            },
            // -- SALES --
            {
                id: 'btn-new-bk', label: 'Tạo Booking', iconClass: 'fa-solid fa-plus-circle', btnClass: 'btn-primary sales-only',
                callback: () => { if(typeof activateTab === 'function') activateTab('tab-form'); },
                attributes: { 'data-bs-target': '#tab-form', 'data-ontabs': '1 3 4' }
            },
            {
                id: 'btn-new-customer', label: 'Tạo Khách Hàng', iconClass: 'fa-solid fa-user-plus', btnClass: 'btn-info sales-only',
                callback: () => { if(typeof activateTab === 'function') activateTab('tab-sub-form'); },
                attributes: { 'data-ontabs': '1 2' }
            },
            {
                id: 'btn-create-contract', label: 'Tạo Hợp Đồng', iconClass: 'fa-solid fa-print', btnClass: 'btn-warning line-clamp-2 sales-only',
                callback: () => { if(typeof createContract === 'function') createContract(); },
                attributes: { 'data-ontabs': '2 4' }
            },
            {
                id: 'btn-delete-form', label: 'Hủy Booking', iconClass: 'fa-solid fa-trash', btnClass: 'btn-danger sales-only',
                callback: () => { if(typeof logA === 'function') logA('CẢNH BÁO: Hủy Booking?', 'danger', deleteForm); },
                attributes: { 'data-ontabs': '2' }
            },
            // -- OPERATOR --
            {
                id: 'btn-request-rates', label: 'Gửi Yêu Cầu Báo Giá', iconClass: 'fa-solid fa-palette', btnClass: 'btn-primary op-only',
                callback: () => { if(typeof PartnerMailModule !== 'undefined') PartnerMailModule.open(); }
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
                callback: () => { if(typeof saveBatchDetails === 'function') saveBatchDetails(); },
                attributes: { 'data-ontabs': '' }
            },
            {
                id: 'btn-save-form', label: 'Lưu Booking', iconClass: 'fa-solid fa-save', btnClass: 'btn-success',
                callback: () => { if(typeof saveForm === 'function') saveForm(); },
                attributes: { 'data-ontabs': '2' }
            },
            {
                id: 'btn-reset-form', label: 'Xóa Form', iconClass: 'fa-solid fa-rotate', btnClass: 'btn-danger',
                callback: () => { if(typeof logA === 'function') logA('Xóa hết dữ liệu vừa nhập ?', 'warning', refreshForm); },
                attributes: { 'data-ontabs': '2' }
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