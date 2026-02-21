/**
 * ==========================================
 * 3. JAVASCRIPT: CORE MENU CONTROLLER & UTILS
 * ==========================================
 */

const MenuUtils = {
    currentZoom: 100,
    zoomIn: function(e) { if(e) e.stopPropagation(); this.currentZoom = Math.min(this.currentZoom + 10, 200); this.applyZoom(); },
    zoomOut: function(e) { if(e) e.stopPropagation(); this.currentZoom = Math.max(this.currentZoom - 10, 50); this.applyZoom(); },
    applyZoom: function() {
        document.body.style.zoom = `${this.currentZoom}%`;
        const display = document.getElementById('zoom-level-display');
        if(display) display.innerText = `${this.currentZoom}%`;
    },
    toggleFullScreen: function(e) {
        if(e) e.stopPropagation();
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => console.error(err));
        } else {
            document.exitFullscreen();
        }
    },
    toggleTheme: function(e) {
        if(e) e.stopPropagation();
        document.body.classList.toggle('dark-theme');
        const isDark = document.body.classList.contains('dark-theme');
        const themeText = document.getElementById('theme-toggle-text');
        const themeIcon = document.getElementById('theme-toggle-icon');
        if (themeText && themeIcon) {
            themeText.innerText = isDark ? 'Giao diện Sáng' : 'Giao diện Tối';
            themeIcon.className = isDark ? 'menu-icon fa-solid fa-sun text-warning' : 'menu-icon fa-solid fa-moon text-secondary';
        }
    }
};

const MenuController = {
    containerId: 'erp-menu-container',
    triggerId: 'erp-menu-trigger',
    actionsRegistry: {}, // Kho chứa các hàm gọi an toàn
    
    // Khung dữ liệu Menu mặc định
    config: [
        { type: 'item', label: 'Reload ERP', icon: 'fa-solid fa-rotate text-primary', actionCode: "if(typeof reloadPage === 'function') reloadPage()" },
        { type: 'item', label: 'Cập Nhật Dữ Liệu', icon: 'fa-solid fa-cloud-arrow-down text-info', actionCode: "if(typeof A !== 'undefined' && A.DB && A.DB.syncDelta) A.DB.syncDelta()" },
        { type: 'divider' },
        { type: 'theme_toggle' }, 
        { type: 'zoom_row' },
        { type: 'divider' },
        { type: 'submenu', label: 'Admin Tools', icon: 'fa-solid fa-gear text-secondary', cssClass: 'admin-only', children: [
            { type: 'item', label: 'Cài Đặt', icon: 'fa-solid fa-sliders text-success', actionCode: "if(typeof openSettingsModal === 'function') openSettingsModal()" },
            { type: 'item', label: 'Operator DB', icon: 'fa-solid fa-database text-primary', actionCode: "window.open('#', '_blank')" },
            { type: 'divider' },
            { type: 'item', label: 'Xóa Cache', icon: 'fa-solid fa-trash text-warning', actionCode: "if(typeof clearLocalCache === 'function') clearLocalCache()" }
        ]},
        { type: 'divider' },
        { type: 'user_info' }, 
        { type: 'item', id: 'btn-login-menu', label: 'Đăng Nhập', icon: 'fa-solid fa-sign-in-alt text-primary', actionCode: "if(typeof A !== 'undefined' && A.Auth) A.Auth.showChoiceScreen()" },
        { type: 'item', id: 'btn-logout-menu', label: 'Đăng Xuất', icon: 'fa-solid fa-sign-out-alt text-danger', inlineStyle: 'display:none;', actionCode: "if(typeof A !== 'undefined' && A.Auth) A.Auth.signOut()" },
        { type: 'role_switcher', cssClass: 'manager-only' }
    ],

    // Khởi chạy hệ thống
    init: async function() {
        try {
            this.normalizeConfig(this.config);
            await this.renderMenuAsync(this.config);
            this.bindEvents();
        } catch (error) {
            console.error('[ERP Menu Error] Init failed:', error);
        }
    },

    // Tiền xử lý: Gắn ID và lưu Hàm vào Registry để chống lỗi khi render chuỗi
    normalizeConfig: function(itemsArray) {
        itemsArray.forEach(item => {
            const actionLogic = item.action || item.actionCode;
            if (actionLogic && !item._internalActionId) {
                const actionId = item.id || 'act_' + Math.random().toString(36).substring(2, 9);
                this.actionsRegistry[actionId] = actionLogic;
                item._internalActionId = actionId;
            }
            if (item.type === 'submenu' && item.children) {
                this.normalizeConfig(item.children);
            }
        });
    },

    // Thêm Menu mở rộng từ bên ngoài
    addMenu: function(menuItem, targetSubmenuLabel = null, insertIndex = -1) {
        let targetArray = this.config;
        if (targetSubmenuLabel) {
            const parent = this.config.find(item => item.label === targetSubmenuLabel && item.type === 'submenu');
            if (parent) targetArray = parent.children = parent.children || [];
        }

        if (insertIndex >= 0 && insertIndex < targetArray.length) {
            targetArray.splice(insertIndex, 0, menuItem);
        } else {
            targetArray.push(menuItem);
        }

        this.normalizeConfig(targetArray); // Đăng ký action mới
        
        // Tự động render lại nếu giao diện đã tồn tại
        const container = document.getElementById(this.containerId);
        if (container && container.innerHTML !== '') {
            this.renderMenuAsync(this.config);
        }
    },

    // Vẽ Menu bất đồng bộ
    renderMenuAsync: async function(config) {
        return new Promise((resolve) => {
            const container = document.getElementById(this.containerId);
            container.innerHTML = config.map(item => this.buildItemHtml(item)).join('');
            resolve();
        });
    },

    // Đóng Menu
    hideMenu: function() {
        document.getElementById(this.containerId).classList.add('d-none');
        document.querySelectorAll('.erp-submenu').forEach(sub => sub.classList.remove('active'));
    },

    // Bật tắt Submenu cho Mobile Accordion
    toggleSubmenu: function(e, element) {
        if (e) e.stopPropagation(); 
        const parentSubmenu = element.parentElement;
        const allSubmenus = document.querySelectorAll('.erp-submenu');
        allSubmenus.forEach(sub => {
            if (sub !== parentSubmenu) sub.classList.remove('active');
        });
        parentSubmenu.classList.toggle('active');
    },

    // Render HTML cho từng Item
    buildItemHtml: function(item) {
        const idAttr = item.id ? `id="${item.id}"` : '';
        const styleAttr = item.inlineStyle ? `style="${item.inlineStyle}"` : '';
        const wrapperClass = item.cssClass ? ` ${item.cssClass}` : '';
        
        // Kích hoạt sự kiện lấy từ Registry
        const clickEvent = item._internalActionId 
            ? `onclick="MenuController.executeAction('${item._internalActionId}')"` 
            : '';

        switch (item.type) {
            case 'divider': 
                return `<div class="erp-menu-divider${wrapperClass}" ${styleAttr}></div>`;
            case 'theme_toggle': 
                return `<div class="erp-menu-item${wrapperClass}" onclick="MenuUtils.toggleTheme(event)" ${styleAttr}><i id="theme-toggle-icon" class="menu-icon fa-solid fa-moon text-secondary"></i><span id="theme-toggle-text" class="menu-text">Giao diện Tối</span></div>`;
            case 'zoom_row': 
                return `<div class="erp-menu-item d-flex align-items-center justify-content-between${wrapperClass}" style="cursor: default; ${item.inlineStyle || ''}"><div class="d-flex align-items-center"><i class="menu-icon fa-solid fa-magnifying-glass"></i><span class="menu-text">Thu phóng</span></div><div class="d-flex align-items-center"><div class="chrome-zoom-controls"><button onclick="MenuUtils.zoomOut(event)">-</button><span id="zoom-level-display">100%</span><button onclick="MenuUtils.zoomIn(event)">+</button></div><button class="btn btn-sm btn-light ms-2 border" onclick="MenuUtils.toggleFullScreen(event)" title="Toàn màn hình"><i class="fa-solid fa-expand"></i></button></div></div>`;
            case 'user_info': 
                return `<div id="user-info-card" class="px-3 py-2 bg-light border-bottom border-top${wrapperClass}" ${styleAttr}><div class="text-dark"><div><strong id="user-menu-name">Guest</strong></div><div id="user-menu-email" class="text-muted" style="font-size: 11px;"></div></div></div>`;
            case 'role_switcher': 
                return `<div class="px-3 py-2 border-top${wrapperClass}" ${styleAttr}><select id="btn-select-masked-role" class="form-select form-select-sm fw-bold text-primary" onchange="if(typeof reloadSystemMode === 'function') reloadSystemMode(this.value); MenuController.hideMenu();"><option id="user-menu-role" value="" selected>-- Chọn Role --</option><option value="sale">Sales Mode</option><option value="op">Operator Mode</option></select></div>`;
            case 'submenu':
                const childrenHtml = item.children ? item.children.map(child => this.buildItemHtml(child)).join('') : '';
                return `
                    <div class="erp-submenu${wrapperClass}" ${styleAttr}>
                        <div class="erp-menu-item" onclick="MenuController.toggleSubmenu(event, this)" ${idAttr}>
                            <i class="menu-icon ${item.icon}"></i>
                            <span class="menu-text flex-grow-1">${item.label}</span>
                            <i class="fa-solid fa-chevron-right submenu-arrow" style="font-size:10px;"></i>
                        </div>
                        <div class="erp-submenu-content">${childrenHtml}</div>
                    </div>
                `;
            case 'item':
            default:
                return `
                    <div class="erp-menu-item${wrapperClass}" ${idAttr} ${styleAttr} ${clickEvent}>
                        <i class="menu-icon ${item.icon}"></i>
                        <span class="menu-text flex-grow-1">${item.label}</span>
                    </div>
                `;
        }
    },

    // Thực thi lệnh an toàn
    executeAction: function(actionId) {
        this.hideMenu(); // Ẩn menu đi
        const actionLogic = this.actionsRegistry[actionId];
        if (!actionLogic) return;

        if (typeof actionLogic === 'function') {
            actionLogic(); 
        } else if (typeof actionLogic === 'string') {
            try {
                new Function(actionLogic)(); 
            } catch (error) {
                console.error(`[Menu Syntax Error] Failed to execute code: ${actionLogic}`, error);
            }
        }
    },

    // Gán sự kiện đóng mở (Chống tràn click)
    bindEvents: function() {
        const triggerBtn = document.getElementById(this.triggerId);
        const container = document.getElementById(this.containerId);
        if(!triggerBtn || !container) return;

        // Bật/tắt menu chính
        triggerBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            container.classList.toggle('d-none');
            document.querySelectorAll('.erp-submenu').forEach(sub => sub.classList.remove('active'));
        });

        // Bắt sự kiện Window ở Capture Phase (Tham số true) để đóng menu khi click chỗ khác
        window.addEventListener('click', (e) => {
            if (!container.classList.contains('d-none')) {
                if (!container.contains(e.target) && !triggerBtn.contains(e.target)) {
                    this.hideMenu();
                }
            }
        }, true);
    }
};

// Kích hoạt khởi tạo khi trang load xong
document.addEventListener('DOMContentLoaded', () => {
    MenuController.addMenu(
        {
            type: 'item',
            label: 'Báo Cáo Hệ Thống',
            icon: 'fa-solid fa-file-invoice text-warning',
            
            // Bạn cũng có thể dùng string (actionCode) truyền thống nếu thích cho gọn
            action: function() {
                const modal = document.querySelector('at-modal-full');
                if (modal) {
                    // Set tiêu đề và hiển thị
                    
                    // Gọi hàm show của Report Module
                    // Lưu ý: Cần đảm bảo script logic_report.js đã được load
                    if (window.ReportModule) {
                        window.ReportModule.init(); // Init report content inside modal
                        modal.show(); // Show modal container
                    } else {
                        console.error("ReportModule not found. Please load logic_report.js");
                        alert("Chưa tải module báo cáo. Vui lòng refresh trang.");
                    }
                } else {
                    console.error("Modal component not found. Please ensure at-modal-full is included in the page.");
                    alert("Không tìm thấy thành phần modal. Vui lòng refresh trang.");
                }
                },
        }, 'Admin Tools' // Chỉ định chính xác tên (label) của Submenu đích
    );
    MenuController.init();
});