/**
 * 9 Trip ERP - Mobile Interface Manager
 * Quản lý toàn bộ các tính năng đặc thù trên thiết bị di động
 */
// const MobileManager = {
//     longPressTimer: null,
//     menuElement: null,

//     init() {
//         if (window.isMobile === false) window.isMobile = window.innerWidth <= 768 || ('ontouchstart' in window);
//         if (!window.isMobile) return;

//         this.initModalTouchFix();
//         this.initLongPressMenu();
//         console.log("9 Trip ERP: Mobile Manager Ready 🚀");
//     },

//     // 1. Xử lý đóng Modal khi click ra ngoài (đã tối ưu)
//     initModalTouchFix() {
//         document.addEventListener('click', (e) => {
//             const modal = document.querySelector('.modal.show');
//             if (!modal) return;
//             const dialog = modal.querySelector('.modal-dialog');
//             if (modal === e.target || (modal.contains(e.target) && !dialog.contains(e.target))) {
//                 const inst = bootstrap.Modal.getInstance(modal);
//                 inst ? inst.hide() : modal.querySelector('[data-bs-dismiss="modal"]')?.click();
//             }
//         }, true);
//     },

//     // 2. Giả lập Context Menu khi nhấn giữ (Long Press)
//     initLongPressMenu() {
//         // Tạo style cho Menu (Chỉ tạo 1 lần)
//         const style = document.createElement('style');
//         style.innerHTML = `
//             .mobile-context-menu {
//                 position: fixed; z-index: 10000; background: #fff; border-radius: 8px;
//                 box-shadow: 0 4px 15px rgba(0,0,0,0.2); display: none; flex-direction: column;
//                 padding: 5px; min-width: 150px;
//             }
//             .mobile-context-menu button {
//                 padding: 10px; border: none; background: none; text-align: left;
//                 font-size: 14px; border-bottom: 1px solid #eee; display: flex; align-items: center;
//             }
//             .mobile-context-menu button:last-child { border: none; }
//             .mobile-context-menu i { margin-right: 10px; width: 20px; text-align: center; }
//         `;
//         document.head.appendChild(style);

//         // Tạo Menu Element
//         this.menuElement = document.createElement('div');
//         this.menuElement.className = 'mobile-context-menu';
//         this.menuElement.innerHTML = `
//             <button data-action="click"><i class="fa fa-mouse-pointer"></i> Click</button>
//             <button data-action="right-click"><i class="fa fa-mouse"></i> Right Click</button>
//             <button data-action="ctrl-click"><i class="fa fa-keyboard"></i> Ctrl + Click</button>
//             <button data-action="double-click"><i class="fa fa-hand-pointer"></i> Double Click</button>
//             <button data-action="forceCloseModal"><i class="fa fa-hand-pointer"></i> Force Close Modal</button>
//         `;
//         document.body.appendChild(this.menuElement);

//         // Sự kiện Long Press
//         document.addEventListener('touchstart', (e) => {
//             this.hideMenu();
//             this.longPressTimer = setTimeout(() => {
//                 this.showMenu(e.touches[0].clientX, e.touches[0].clientY, e.target);
//                 const row = e.target.closest('tr');
//                 if (row) {
//                     row.classList.add('highlight');
//                     setTimeout(() => row.classList.remove('highlight'), 1500);
//                     // Save context
//                     window.CURRENT_CTX_ROW = row;
//                     const sidInput = row.querySelector('input[data-field="id"]');
//                     window.CURRENT_CTX_ID = sidInput ? sidInput.value : '';
//                     // Get row data
//                     if (typeof getRowData === 'function') {
//                         window.CURRENT_ROW_DATA = getRowData(collection, window.CURRENT_CTX_ROW, tbody);
//                     }
//                 }
                
//             }, 600); // Nhấn giữ 600ms
//         });

//         document.addEventListener('touchend', () => clearTimeout(this.longPressTimer));
//         document.addEventListener('touchmove', () => clearTimeout(this.longPressTimer));
        
//         // Xử lý Click trên Menu
//         this.menuElement.addEventListener('click', (e) => {
//             const btn = e.target.closest('button');
//             if (!btn) return;
//             this.handleAction(btn.dataset.action, this.currentTarget);
//             this.hideMenu();
//         });
//     },

//     showMenu(x, y, target) {
//         this.currentTarget = target;
//         this.menuElement.style.display = 'flex';
//         // Tính toán để menu không bị tràn màn hình
//         const menuWidth = 150;
//         const posX = (x + menuWidth > window.innerWidth) ? x - menuWidth : x;
//         this.menuElement.style.left = `${posX}px`;
//         this.menuElement.style.top = `${y}px`;
//         if (navigator.vibrate) navigator.vibrate(50); // Rung nhẹ báo hiệu
//     },

//     forceCloseModal() {
//         const modal = document.querySelector('.modal.show');   
//         if (modal) {
//             const inst = bootstrap.Modal.getInstance(modal);
//             inst ? inst.hide() : modal.querySelector('[data-bs-dismiss="modal"]')?.click();
//         }
//     },

//     hideMenu() {
//         if (this.menuElement) this.menuElement.style.display = 'none';
//     },

//     handleAction(action, target) {
//         console.log(`Action: ${action} on`, target);
//         const options = { bubbles: true, cancelable: true, view: window };
        
//         switch(action) {
//             case 'click':
//                 target.dispatchEvent(new MouseEvent('click', options));
//                 break;
//             case 'right-click':
//                 target.dispatchEvent(new MouseEvent('contextmenu', options));
//                 break;
//             case 'ctrl-click':
//                 target.dispatchEvent(new MouseEvent('click', { ...options, ctrlKey: true }));
//                 break;
//             case 'double-click':
//                 target.dispatchEvent(new MouseEvent('dblclick', options));
//                 break;
//             case 'forceCloseModal':
//                 this.forceCloseModal();
//                 break;
//         }
//     }
// };

/**
 * 9 Trip ERP - Mobile Interface Manager (Pro Version)
 */
const MobileManager = {
    longPressTimer: null,
    menuElement: null,
    hideTimer: null,
    openX: 0,
    openY: 0,
    currentTarget: null,

    init() {
        let isPhone = window.innerWidth <= 768 || ('ontouchstart' in window);
        if (!isPhone) return;
        if (!window.isMobile) window.isMobile = isPhone;

        this.initCSS();
        this.initModalTouchFix();
        this.initLongPressMenu();
        console.log("9 Trip ERP: Mobile Manager Optimized ✅");
    },

    initCSS() {
        const style = document.createElement('style');
        style.innerHTML = `
            /* Chặn select text khi đang thao tác long-press */
            .prevent-select, .prevent-select * {
                -webkit-user-select: none !important;
                user-select: none !important;
                -webkit-touch-callout: none !important;
            }
            .mobile-context-menu {
                position: fixed; z-index: 10000; background: var(--surface-color, #fff); 
                border-radius: 8px; border: 1px solid var(--border-color, #ccc);
                box-shadow: var(--shadow-lg); display: none; flex-direction: column;
                padding: 4px; min-width: 160px; touch-action: none;
            }
            .mobile-context-menu button {
                padding: 12px; border: none; background: none; text-align: left;
                font-size: 14px; color: var(--text-color, #333);
                border-bottom: 1px solid var(--border-color, #eee);
                display: flex; align-items: center; width: 100%;
            }
            .mobile-context-menu button:active { background: var(--hover-bg, #f0f0f0); }
            .mobile-context-menu i { margin-right: 12px; width: 16px; text-align: center; }
        `;
        document.head.appendChild(style);
    },

    initLongPressMenu() {
        this.menuElement = document.createElement('div');
        this.menuElement.className = 'mobile-context-menu';
        this.menuElement.innerHTML = `
            <button data-action="click"><i class="fa fa-mouse-pointer"></i> Click</button>
            <button data-action="right-click"><i class="fa fa-mouse"></i> Right Click</button>
            <button data-action="ctrl-click"><i class="fa fa-keyboard"></i> Ctrl + Click</button>
            <button data-action="double-click"><i class="fa fa-hand-pointer"></i> Double Click</button>
            <button data-action="forceCloseModal"><i class="fa fa-times"></i> Force Close Modal</button>
        `;
        document.body.appendChild(this.menuElement);

        // Ngăn sự kiện đóng menu khi chạm vào CHÍNH NÓ
        this.menuElement.addEventListener('touchstart', (e) => {
            e.stopPropagation(); // Chặn không cho lan ra ngoài gây đóng menu
            this.clearHideTimer();
        }, { passive: false });

        document.addEventListener('touchstart', (e) => {
            // Nếu chạm ngoài menu thì mới đóng
            if (!this.menuElement.contains(e.target)) {
                this.hideMenu(true);
            }

            this.longPressTimer = setTimeout(() => {
                this.handleLongPress(e);
            }, 2000);
        }, { passive: true });

        document.addEventListener('touchend', () => clearTimeout(this.longPressTimer));
        document.addEventListener('touchmove', () => clearTimeout(this.longPressTimer));

        // Xử lý Action
        this.menuElement.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.handleAction(btn.dataset.action);
                this.hideMenu(true); // Đóng ngay lập tức sau khi thực thi
            });
        });
    },

    handleLongPress(e) {
        const touch = e.touches[0];
        this.openX = touch.clientX;
        this.openY = touch.clientY;
        this.currentTarget = e.target;

        // 1. Chặn chọn text
        document.body.classList.add('prevent-select');

        // 2. Gán Context cho ERP
        const row = this.currentTarget.closest('tr');
        if (row) {
            window.CURRENT_ROW = row;
            const idCell = row.querySelector('[data-field="id"]');
            window.CURRENT_CTX_ID = idCell ? idCell.innerText || idCell.value : null;
        }

        this.showMenu(this.openX, this.openY);
    },

    showMenu(x, y) {
        this.menuElement.style.display = 'flex';
        const posX = (x + 160 > window.innerWidth) ? x - 160 : x;
        const posY = (y + 200 > window.innerHeight) ? y - 200 : y;
        
        this.menuElement.style.left = `${posX}px`;
        this.menuElement.style.top = `${posY}px`;

        if (navigator.vibrate) navigator.vibrate(50);
        
        // 3. Tự động đóng sau 10 giây
        this.startHideTimer();
    },

    hideMenu(immediate = false) {
        if (immediate) {
            setTimeout(() => this._doHide(), 100);
        } else {
            this.startHideTimer();
        }
    },

    _doHide() {
        if (this.menuElement) this.menuElement.style.display = 'none';
        document.body.classList.remove('prevent-select');
        this.clearHideTimer();
    },

    startHideTimer() {
        this.clearHideTimer();
        this.hideTimer = setTimeout(() => this._doHide(), 10000);
    },

    clearHideTimer() {
        if (this.hideTimer) clearTimeout(this.hideTimer);
    },

    handleAction(action) {
        const target = this.currentTarget;
        if (!target) return;

        const opts = { bubbles: true, cancelable: true, view: window, clientX: this.openX, clientY: this.openY };

        switch(action) {
            case 'click': target.dispatchEvent(new MouseEvent('click', opts)); break;
            case 'right-click': target.dispatchEvent(new MouseEvent('contextmenu', opts)); break;
            case 'ctrl-click': target.dispatchEvent(new MouseEvent('click', { ...opts, ctrlKey: true })); break;
            case 'double-click': target.dispatchEvent(new MouseEvent('dblclick', opts)); break;
        }
    },

    // 1. Xử lý đóng Modal khi click ra ngoài (đã tối ưu)
    initModalTouchFix() {
        document.addEventListener('click', (e) => {
            const modal = document.querySelector('.modal.show');
            if (!modal) return;
            const dialog = modal.querySelector('.modal-dialog');
            if (modal === e.target || (modal.contains(e.target) && !dialog.contains(e.target))) {
                const inst = bootstrap.Modal.getInstance(modal);
                inst ? inst.hide() : modal.querySelector('[data-bs-dismiss="modal"]')?.click();
            }
        }, true);
    },

    forceCloseModal() {
        const modal = document.querySelector('.modal.show');   
        if (modal) {
            const inst = bootstrap.Modal.getInstance(modal);
            inst ? inst.hide() : modal.querySelector('[data-bs-dismiss="modal"]')?.click();
        }
    }
};


export default MobileManager;
