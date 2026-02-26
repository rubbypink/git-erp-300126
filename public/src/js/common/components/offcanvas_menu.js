// =========================================================================
// MODAL FULL COMPONENT
// =========================================================================
class ModalFull extends HTMLElement {
    constructor() {
        super();
        this.modal = null;
        this.isFullscreen = true;
        this.showFooter = false;
    }

    connectedCallback() {
        this.init();
        this.setupModal();
        this._setupUI();
    }

    init() {
        const title = this.getAttribute('title') || 'Modal Title';
         this.showFooter = this.getAttribute('data-ft') !== 'false';

        this.innerHTML = `
            <div id="dynamic-modal-full" class="modal fade" tabindex="-1" aria-hidden="true">
                <div class="modal-dialog modal-fullscreen" id="modalFullDialog">
                    <div class="modal-content">
                        <div class="modal-header border-bottom" style="max-height: max-content;">
                            <h5 class="modal-title" style="font-weight: bold; justify-self: center;">${title}</h5>
                            <div style="display: flex; gap: 0.6rem; align-items: center;">
                                <button class="btn btn-sm btn-link text-dark btn-minimize px-1"><i class="fa-solid fa-minus"></i></button>
                                <button type="button" class="btn-resize-modal" id="btnResizeModal" title="Chuyển đổi kích thước" style="border: none; background: none; font-size: 1.2rem; color: #999; cursor: pointer; padding: 0.5rem; display: flex; align-items: center; justify-content: center;">
                                    <i class="fas fa-expand"></i>
                                </button>
                                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                            </div>
                        </div>
                        <div id="dynamic-modal-full-body" class="modal-body pt-0 overflow-auto"></div>
                        ${this.showFooter ? `
                            <div class="modal-footer gap-2">
                                <button type="button" class="btn btn-secondary">Xoá</button>
                                <button type="button" class="btn btn-primary">Lưu</button>
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    setupModal() {
        const modalEl = this.querySelector('#dynamic-modal-full');
        this.modal = new bootstrap.Modal(modalEl, { backdrop: false, keyboard: false });

        const dataLoad = this.getAttribute('data-body');
        if (dataLoad) {
            this._loadContent(dataLoad);
        }

        const dataAtSubmit = this.getAttribute('data-at-submit');
        if (dataAtSubmit && typeof window[dataAtSubmit] === 'function') {
            this.setSaveHandler(window[dataAtSubmit]);
        }

        // Setup resize toggle button
        const btnResize = this.querySelector('#btnResizeModal');
        if (btnResize) {
            btnResize.addEventListener('click', () => this._toggleModalSize());
        }
        
    }

    _setupUI() {
        if (window.DraggableSetup) {
            new window.DraggableSetup('dynamic-modal-full', { targetSelector: '.modal-dialog', handleSelector: '.modal-header' });
        }
        if (window.Resizable) {
            new Resizable('dynamic-modal-full', { targetSelector: '.modal-content',
                minWidth: 400, minHeight: 300 });
        }
        if (window.WindowMinimizer) {
            new WindowMinimizer('dynamic-modal-full', {title: 'Data', btnSelector: '.btn-minimize'});
        }
    }

    _loadContent(dataLoad) {
        let content = '';

        if (typeof window[dataLoad] === 'function') {
            try {
                content = window[dataLoad]();
            } catch (error) {
                log(`Error executing function "${dataLoad}": ${error.message}`, 'error');
                return;
            }
        } else {
            content = dataLoad;
        }

        if (content) {
            this.render(content);
        }
    }

    /**
     * Reset modal về trạng thái nguyên bản
     * Xoá nội dung, reset title, clear styles
     * @public
     */
    reset() {
        const bodyEl = this.querySelector('#dynamic-modal-full-body');
        if (bodyEl) {
            bodyEl.innerHTML = '';
            bodyEl.className = 'modal-body pt-0 overflow-auto';
        }
        
        const titleEl = this.querySelector('.modal-title');
        if (titleEl) {
            titleEl.textContent = this.getAttribute('title') || 'Modal Title';
        }
        
        console.log('[ModalFull] 🔄 Modal reset to default state');
    }

    /**
     * Render nội dung vào modal
     * @param {*} htmlContent - HTML content (string, Element, hoặc DocumentFragment)
     * @param {string} [title='9 Trip Dynamic Form'] - Modal title
     * 
     * ★ FLOW CHỦ YẾU:
     * 1. Controller render: new A.HotelPriceController('dynamic-modal-full-body')
     *    └─ Controller thêm HTML vào #dynamic-modal-full-body
     * 2. Gọi show(): modal.show(null, 'Title')
     *    └─ show() KHÔNG reset (DOM đã sạch từ hide())
     *    └─ show() KHÔNG render nếu htmlContent = null
     *    └─ Chỉ update title → display modal
     * 3. Khi close: hide() → reset() xóa sạch DOM cho lần mở tiếp
     */
    render(htmlContent, title = "9 Trip Dynamic Form") {
        if (!this.modal) {
            this.connectedCallback();
        }

        const bodyEl = this.querySelector('.modal-body');
        const titleEl = this.querySelector('.modal-title');
        
        if (titleEl) {
            titleEl.textContent = title;
        }
        if (!htmlContent) {
            bodyEl.innerHTML = '';
            return;
        }
        
        // Xử lý content type
        let processedContent = htmlContent;
        if (htmlContent instanceof HTMLElement && htmlContent.tagName === 'TEMPLATE') {
            processedContent = htmlContent.content;
        }
        
        const isFragment = processedContent instanceof DocumentFragment;
        const isElement = processedContent instanceof HTMLElement;
        const isString = typeof processedContent === 'string';

        try {
            if (isString) {
                bodyEl.innerHTML = processedContent;
            } else if (isFragment) {
                bodyEl.innerHTML = '';
                bodyEl.appendChild(processedContent.cloneNode(true));
            } else if (isElement) {
                bodyEl.innerHTML = '';
                bodyEl.appendChild(processedContent.cloneNode(true));
            } else if (processedContent) {
                bodyEl.innerHTML = String(processedContent);
            }     
            console.log(`[ModalFull] ✏️ Content rendered with title: ${title}`);
        } catch (error) {
            console.error("Error setting modal content:", error);
        }
        this.addEventListener('hidden.bs.modal', () => {
            log('[ModalFull] Modal hidden, disposing instance and cleaning up DOM');
            this.reset();
        }, { once: true });
    }

    /**
     * Show modal với nội dung mới
     * @param {*} [htmlContent=null] - HTML content để render
     * @param {string} [title=null] - Modal title
     * @param {Function} [saveHandler=null] - Save button handler
     * @param {Function} [resetHandler=null] - Reset button handler
     * 
     * ★ FLOW: show() được gọi SAU khi controller đã inject content
     * - Không gọi reset() (vì DOM đã sạch từ hide() lần trước)
     * - Chỉ render nếu htmlContent được truyền
     * - Render title lúc nào cũng cập nhật
     */
    show(htmlContent = null, title = null, saveHandler = null, resetHandler = null) {
        // Render content nếu có (modal đã sạch từ hide())
        if (htmlContent || title || !this.modal) {
            this.render(htmlContent, title);
        } 
        if (saveHandler) this.setSaveHandler(saveHandler);
        if (resetHandler) this.setResetHandler(resetHandler);
        this.modal.show();
    }

    hide() {
        this.modal?.hide();        
    }

    getSaveBtn() {
        return this.querySelector('.btn-primary');
    }

    getCloseBtn() {
        return this.querySelector('[data-bs-dismiss="modal"]');
    }

    setSaveHandler(handler) {
        this.setFooter(true); // Hiển thị footer nếu có nút save
        const saveBtn = this.getSaveBtn();
        if (!saveBtn || typeof handler !== 'function') return;

        const newBtn = saveBtn.cloneNode(true);
        saveBtn.parentNode.replaceChild(newBtn, saveBtn);

        newBtn.addEventListener('click', () => {
            handler.call(this);
        });
    }

    setResetHandler(handler, btnText = 'Reset') {
        const footerEl = this.querySelector('.modal-footer');
        if (!footerEl) return;
        let resetBtn = footerEl.querySelector('.btn-secondary');
        if (!resetBtn) {
            resetBtn = document.createElement('button');
            resetBtn.type = 'button';
            resetBtn.className = 'btn btn-secondary';
            resetBtn.textContent = btnText;
            footerEl.insertBefore(resetBtn, footerEl.firstChild);
        } else {
            resetBtn.textContent = btnText;
            resetBtn.classList.remove('d-none');
        }
        if (typeof handler === 'function') {
            resetBtn.addEventListener('click', () => {
                handler.call(this);
            });
        } else {
            resetBtn.addEventListener('click', (e) => {
                const inputEls = this.querySelectorAll('.modal-body input, .modal-body select, .modal-body textarea');
                inputEls.forEach(input => {
                    if (input.type === 'checkbox' || input.type === 'radio') {
                        input.checked = false;
                    } else {
                        input.value = '';
                    }
                });
            });
        }
    }

    setFooter(showFooter) {
        this.showFooter = showFooter;
        const footerEl = this.querySelector('.modal-footer');
        if (showFooter) {
            if (!footerEl) {
                const footerHTML = `
                    <div class="modal-footer gap-2" data-ft="true">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Đóng</button>
                        <button type="button" class="btn btn-primary">Lưu</button>
                    </div>
                `;
                this.querySelector('.modal-content').insertAdjacentHTML('beforeend', footerHTML);
            } else {
                footerEl.classList.remove('d-none');
                footerEl.setAttribute('data-ft', 'true');
            }
        } else {
            if (footerEl) {
                footerEl.classList.add('d-none');
            }
        }
    }



    /**
     * Toggle modal size between fullscreen and XL.
     * Updates the modal-dialog class and icon accordingly.
     * @private
     */
    _toggleModalSize() {
        const modalDialog = this.querySelector('#modalFullDialog');
        const btnResize = this.querySelector('#btnResizeModal');
        
        if (!modalDialog || !btnResize) return;

        this.isFullscreen = !this.isFullscreen;

        // Update modal dialog class
        if (this.isFullscreen) {
            modalDialog.className = 'modal-dialog modal-fullscreen';
            btnResize.innerHTML = '<i class="fas fa-expand"></i>';
            btnResize.title = 'Thu nhỏ modal';
        } else {
            modalDialog.className = 'modal-dialog modal-xl';
            modalDialog.style.draggable = true; // Enable dragging when not fullscreen
            btnResize.innerHTML = '<i class="fas fa-compress"></i>';
            btnResize.title = 'Phóng to modal';
        }
    }
}

customElements.define('at-modal-full', ModalFull);

class OffcanvasMenu extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._initialized = false;
        // State Management
        this.state = {
            selectedStages: new Set(['all']),
            searchQuery: '',
            isHoverEnabled: true,
            triggerWidth: 20,
            isPinned: false,
            isRightSide: false,
            menuWidth: 340,
            minWidth: 280,
            maxWidth: 600,
            isResizing: false
        };

        // ★ FIX: Bind methods with correct 'this' context
        this._handleMouseMove = this._handleMouseMove.bind(this);
        this._handleMouseLeave = this._handleMouseLeave.bind(this);
        this._handleResizeStart = this._handleResizeStart.bind(this);
        this._handleResizing = this._handleResizing.bind(this);
        this._handleResizeEnd = this._handleResizeEnd.bind(this);
    }

    connectedCallback() {
        if (this._initialized) {
            console.warn('[OffcanvasMenu] Đã khởi tạo rồi, bỏ qua...');
            return;
        }
        this._initialized = true;

        if (this.shadowRoot.querySelector('.offcanvas-wrapper')) return;

        this._render();
        this._setupDOM();
        this._attachEvents();
        this._initHoverTrigger();
        this._initResizeHandle();
        
        this.classList.remove('show');
    }



    // =========================================================================
    // 1. RENDERING
    // =========================================================================

    _render() {
        this.shadowRoot.innerHTML = '';
        const template = document.createElement('template');
        template.innerHTML = `
            ${this._getStyles()}
            <div class="offcanvas-wrapper">
              <div class="resize-handle resize-handle-left" title="Kéo để điều chỉnh chiều rộng"></div>
              <div class="resize-handle resize-handle-right" title="Kéo để điều chỉnh chiều rộng"></div>

              <div class="header">
                  <div class="header-title">
                      <i class="fas fa-sliders-h"></i> <span>BỘ LỌC & CÔNG CỤ</span>
                  </div>
                  <button class="btn-close"><i class="fas fa-times"></i></button>
              </div>

              <div class="body">
                <div class="section admin-only">
                  <div class="section-title">TEST AREA</div>
                  <textarea class="form-control" id="test-input" rows="3" placeholder="Nhập JSON test..."></textarea>
                  <button id="btn-admin-test" class="btn btn-danger w-100 mt-2">
                    <i class="fa-solid fa-bug"></i> RUN TEST
                  </button>
                </div> 

                <div class="section">
                    <div class="section-title">TÌM KIẾM BOOKING</div>
                    <div class="search-box">
                        <input type="text" id="searchInput" placeholder="Tên khách, Mã booking..." autocomplete="off">
                        <i class="fas fa-search search-icon"></i>
                    </div>
                </div>

                <div class="section">
                    <div class="section-title">TRẠNG THÁI XỬ LÝ</div>
                    <div class="stage-list">
                        ${this._renderCheckbox('all', 'Tất cả', 'all', true)}
                        ${this._renderCheckbox('planning', 'Lập kế hoạch', 'planning')}
                        ${this._renderCheckbox('confirmed', 'Đã xác nhận', 'confirmed')}
                        ${this._renderCheckbox('operating', 'Đang điều hành', 'in-progress')}
                        ${this._renderCheckbox('completed', 'Hoàn tất', 'completed')}
                        ${this._renderCheckbox('canceled', 'Hủy bỏ', 'canceled')}
                    </div>
                    <button class="btn-reset" id="btnReset"><i class="fas fa-redo"></i> Đặt lại</button>
                </div>

                <div class="section function-section">
                    <div class="section-title">CHỨC NĂNG HỆ THỐNG</div>
                    <div class="function-grid">
                        <button class="func-btn" data-action="AdminConsole.init" onclick="AdminConsole.init()">
                            <i class="fas fa-chart-line fa-fw" style="color: #dc3545"></i>
                            <span>Admin Console</span>
                        </button>
                        ${this._renderFuncBtn('import', 'Nhập liệu', 'file-upload', '#007bff')}
                        <button class="func-btn" data-action="openReport" onclick="this.getRootNode().host.openReport()">
                            <i class="fas fa-chart-line fa-fw" style="color: #dc3545"></i>
                            <span>Báo cáo</span>
                        </button>
                        ${this._renderFuncBtn('openSettingsModal', 'Cấu hình', 'cog', '#6c757d')}

                    </div>
                </div>
              </div>

              <div class="footer-controls">
              
                <button class="control-btn" id="btn-toggle-side" title="Đổi vị trí sidebar">
                  <i class="fas fa-arrow-left"></i>
                </button>
                <button class="control-btn" id="btn-pin" title="Ghim hiển thị">
                  <i class="fas fa-thumbtack"></i>
                </button>
              </div>
            </div>
        `;
        this.shadowRoot.appendChild(template.content.cloneNode(true));
    }

    _renderCheckbox(value, label, className, checked = false) {
        return `
            <label class="checkbox-item">
                <input type="checkbox" class="stage-filter" value="${value}" ${checked ? 'checked' : ''}>
                <span class="custom-check"></span>
                <span class="badge ${className}">${label}</span>
            </label>
        `;
    }

    _renderFuncBtn(action, label, icon, color) {
        return `
            <button class="func-btn" data-action="${action}">
                <i class="fas fa-${icon}" style="color: ${color}"></i>
                <span>${label}</span>
            </button>
        `;
    }

    _getStyles() {
        return `
        <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
        <style>
            :host {
                --w-panel: 340px;
                --bg-body: #f4f6f9;
                --primary: #0d6efd;
                --text: #343a40;
                --border: #e9ecef;
                --z-index: 9999;
                
                position: fixed;
                top: 0;
                left: 0;
                height: 100vh;
                z-index: var(--z-index);
                pointer-events: none;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            }

            :host(.right-side) {
                left: auto;
                right: 0;
            }

            /* RESIZE HANDLE */
            .resize-handle {
                position: absolute;
                top: 0;
                width: 6px;
                height: 100%;
                cursor: col-resize;
                background: transparent;
                z-index: 100;
                user-select: none;
                transition: background 0.2s;
            }

            .resize-handle-left {
                left: 0;
            }

            .resize-handle-right {
                right: 0;
            }

            .resize-handle:hover {
                background: var(--primary);
                box-shadow: inset 0 0 3px rgba(13, 110, 253, 0.5);
            }

            .resize-handle.active {
                background: var(--primary);
                box-shadow: inset 0 0 6px rgba(13, 110, 253, 0.8);
            }

            /* WRAPPER */
            .offcanvas-wrapper {
                width: var(--w-panel);
                height: 100%;
                background: #fff;
                box-shadow: 4px 0 15px rgba(0,0,0,0.1);
                display: flex;
                flex-direction: column;
                
                transform: translateX(-102%);
                transition: transform 0.8s cubic-bezier(0.4, 0, 0.2, 1);
                pointer-events: auto;
                will-change: transform;
                position: relative;
            }

            :host(.right-side) .offcanvas-wrapper {
                transform: translateX(102%);
                box-shadow: -4px 0 15px rgba(0,0,0,0.1);
            }

            :host(.show) .offcanvas-wrapper {
                transform: translateX(0);
            }

            /* HEADER */
            .header { 
                padding: 15px 20px; 
                border-bottom: 1px solid var(--border); 
                display: flex; 
                justify-content: space-between; 
                align-items: center; 
                background: #fff;
                flex-shrink: 0;
            }
            
            .header-title { 
                font-weight: 700; 
                color: var(--primary); 
                font-size: 14px; 
                display: flex; 
                gap: 8px; 
                align-items: center;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                min-width: 0;
            }

            .header-title i {
                flex-shrink: 0;
            }

            .btn-close { 
                border: none; 
                background: none; 
                font-size: 18px; 
                color: #999; 
                cursor: pointer; 
                padding: 5px; 
                flex-shrink: 0;
            }
            
            .btn-close:hover { 
                color: var(--text); 
            }

            /* BODY */
            .body { 
                flex: 1; 
                overflow-y: auto; 
                padding: 15px; 
                background: var(--bg-body);
                min-width: 0;
            }
            
            .section { 
                background: #fff; 
                padding: 12px; 
                border-radius: 8px; 
                box-shadow: 0 1px 3px rgba(0,0,0,0.05); 
                margin-bottom: 12px;
                min-width: 0;
            }

            .section-title { 
                font-size: 11px; 
                font-weight: 700; 
                text-transform: uppercase; 
                color: #adb5bd; 
                margin-bottom: 10px; 
                letter-spacing: 0.5px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .form-control { 
                display: block; 
                width: 100%; 
                padding: .375rem .75rem; 
                font-size: 0.875rem; 
                border: 1px solid #ced4da; 
                border-radius: .25rem; 
                box-sizing: border-box;
            }

            .btn { 
                font-weight: 400; 
                text-align: center; 
                cursor: pointer; 
                user-select: none; 
                border: 1px solid transparent; 
                padding: .375rem .75rem; 
                font-size: 0.875rem; 
                border-radius: .25rem;
            }

            .btn-danger { 
                color: #fff; 
                background-color: #dc3545; 
                border-color: #dc3545; 
            }

            .btn-danger:hover { 
                background-color: #bb2d3b; 
                border-color: #b02a37; 
            }

            .w-100 {
                width: 100%;
            }

            .mt-2 {
                margin-top: 0.5rem;
            }

            /* SEARCH */
            .search-box { 
                position: relative; 
            }

            .search-box input { 
                width: 100%; 
                padding: 8px 12px 8px 30px; 
                border: 1px solid var(--border); 
                border-radius: 6px; 
                font-size: 12px; 
                box-sizing: border-box; 
                outline: none;
            }

            .search-box input:focus { 
                border-color: var(--primary); 
            }

            .search-icon { 
                position: absolute; 
                left: 10px; 
                top: 50%; 
                transform: translateY(-50%); 
                color: #adb5bd; 
                font-size: 11px;
                pointer-events: none;
            }

            /* CHECKBOXES */
            .stage-list { 
                display: flex; 
                flex-direction: column; 
                gap: 6px;
            }

            .checkbox-item { 
                display: flex; 
                align-items: center; 
                cursor: pointer; 
                user-select: none;
            }

            .checkbox-item input { 
                display: none; 
            }

            .custom-check { 
                width: 16px; 
                height: 16px; 
                border: 2px solid #ced4da; 
                border-radius: 4px; 
                margin-right: 8px; 
                position: relative; 
                transition: all 0.2s;
                flex-shrink: 0;
            }

            .checkbox-item input:checked + .custom-check { 
                background: var(--primary); 
                border-color: var(--primary); 
            }

            .checkbox-item input:checked + .custom-check::after { 
                content: '✓'; 
                color: #fff; 
                position: absolute; 
                font-size: 10px; 
                top: 50%; 
                left: 50%; 
                transform: translate(-50%, -50%); 
            }
            
            .badge { 
                padding: 4px 6px; 
                border-radius: 4px; 
                font-size: 12px; 
                font-weight: 500; 
                width: 100%;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .all { background: #e9ecef; color: #495057; }
            .planning { background: #fff3cd; color: #856404; }
            .confirmed { background: #d1e7dd; color: #0f5132; }
            .in-progress { background: #cff4fc; color: #055160; }
            .completed { background: #d1e7dd; color: #198754; }
            .canceled { background: #f8d7da; color: #842029; }

            /* FUNCTION GRID */
            .function-grid { 
                display: grid; 
                grid-template-columns: repeat(auto-fit, minmax(65px, 1fr));
                gap: 6px;
            }

            .func-btn { 
                display: flex; 
                flex-direction: column; 
                align-items: center; 
                justify-content: center; 
                gap: 5px; 
                padding: 8px 6px; 
                background: #f8f9fa; 
                border: 1px solid var(--border); 
                border-radius: 5px; 
                cursor: pointer; 
                transition: all 0.2s;
                text-align: center;
                min-height: 70px;
            }

            .func-btn:hover { 
                background: #fff; 
                transform: translateY(-2px); 
                box-shadow: 0 2px 5px rgba(0,0,0,0.05); 
                border-color: var(--primary); 
            }

            .func-btn i { 
                font-size: 13px;
            }

            .func-btn span { 
                font-size: 10px; 
                font-weight: 500; 
                color: var(--text);
                line-height: 1.2;
                word-break: break-word;
            }

            .btn-reset { 
                width: 100%; 
                margin-top: 10px; 
                padding: 6px; 
                background: none; 
                border: 1px dashed var(--primary); 
                color: var(--primary); 
                border-radius: 6px; 
                cursor: pointer; 
                font-size: 11px;
                transition: all 0.2s;
            }

            .btn-reset:hover { 
                background: rgba(13, 110, 253, 0.05); 
            }

            /* FOOTER CONTROLS */
            .footer-controls {
                display: flex;
                justify-content: flex-end;
                align-items: center;
                gap: 8px;
                padding: 10px 12px;
                border-top: 1px solid var(--border);
                background: #fff;
                flex-shrink: 0;
            }

            .control-btn {
                width: 32px;
                height: 32px;
                border: 1px solid var(--border);
                background: #f8f9fa;
                border-radius: 6px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #666;
                font-size: 13px;
                transition: all 0.2s;
                flex-shrink: 0;
            }

            .control-btn:hover {
                background: #fff;
                border-color: var(--primary);
                color: var(--primary);
                transform: scale(1.1);
            }

            .control-btn.active {
                background: var(--primary);
                color: #fff;
                border-color: var(--primary);
            }

            #btn-toggle-side.right-active i {
                transform: scaleX(-1);
            }

            /* SCROLLBAR */
            .body::-webkit-scrollbar { 
                width: 4px; 
            }

            .body::-webkit-scrollbar-thumb { 
                background: #ccc; 
                border-radius: 10px; 
            }

            .body::-webkit-scrollbar-thumb:hover {
                background: #999;
            }
        </style>
        `;
    }

    // =========================================================================
    // 2. SETUP & EVENTS
    // =========================================================================

    _setupDOM() {
        this.dom = {
            wrapper: this.shadowRoot.querySelector('.offcanvas-wrapper'),
            closeBtn: this.shadowRoot.querySelector('.btn-close'),
            searchInput: this.shadowRoot.querySelector('#searchInput'),
            checkboxes: this.shadowRoot.querySelectorAll('.stage-filter'),
            btnReset: this.shadowRoot.querySelector('#btnReset'),
            funcButtons: this.shadowRoot.querySelectorAll('.func-btn'),
            testBtn: this.shadowRoot.querySelector('#btn-admin-test'),
            btnPin: this.shadowRoot.querySelector('#btn-pin'),
            btnToggleSide: this.shadowRoot.querySelector('#btn-toggle-side'),
            resizeHandleLeft: this.shadowRoot.querySelector('.resize-handle-left'),
            resizeHandleRight: this.shadowRoot.querySelector('.resize-handle-right'),
        };
    }

    _attachEvents() {
        this.dom.closeBtn.addEventListener('click', () => this.close());
        this.dom.btnReset.addEventListener('click', () => this._resetFilters());

        
        this.dom.searchInput.addEventListener('input', (e) => {
            this.state.searchQuery = e.target.value.trim();
            this._dispatchUpdate();
        });

        this.dom.checkboxes.forEach(cb => {
            cb.addEventListener('change', (e) => this._handleCheckboxChange(e));
        });

        this.dom.funcButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.action;
                this.dispatchEvent(new CustomEvent('offcanvas-action', {
                    detail: { action },
                    bubbles: true,
                    composed: true
                }));
                if (typeof window[action] === 'function') {
                    window[action]();
                }
            });

        });

        this.dom.wrapper.addEventListener('mouseleave', this._handleMouseLeave);
        this.dom.testBtn.addEventListener('click', () => this._test());

        this.dom.btnPin.addEventListener('click', () => this._togglePin());
        this.dom.btnToggleSide.addEventListener('click', () => this._toggleSide());
    }

    _handleCheckboxChange(e) {
        const val = e.target.value;
        const isChecked = e.target.checked;

        if (val === 'all') {
            if (isChecked) {
                this.state.selectedStages.clear();
                this.state.selectedStages.add('all');
                this.dom.checkboxes.forEach(c => {
                    if (c.value !== 'all') c.checked = false;
                });
            } else {
                e.target.checked = true;
            }
        } else {
            if (isChecked) {
                this.state.selectedStages.delete('all');
                this.dom.checkboxes.forEach(c => {
                    if (c.value === 'all') c.checked = false;
                });
                this.state.selectedStages.add(val);
            } else {
                this.state.selectedStages.delete(val);
                if (this.state.selectedStages.size === 0) {
                    this.state.selectedStages.add('all');
                    this.shadowRoot.querySelector('input[value="all"]').checked = true;
                }
            }
        }
        this._dispatchUpdate();
    }

    _resetFilters() {
        this.dom.searchInput.value = '';
        this.state.searchQuery = '';
        this.state.selectedStages.clear();
        this.state.selectedStages.add('all');
        
        this.dom.checkboxes.forEach(c => {
            c.checked = (c.value === 'all');
        });
        
        this._dispatchUpdate();
    }

    _test() {
        const val = this.shadowRoot.querySelector('#test-input')?.value || '';
        
        if (!val) {
            log('Vui lòng nhập mã lệnh hoặc tên hàm', 'warning');
            return;
        }
        
        try {
            const fn1 = new Function(`return (${val.trim()})`);
            fn1();
            log('Test executed successfully', 'success');
        } catch (e1) {
            try {
                const fn2 = new Function(val.trim());
                fn2();
                log('Test executed successfully', 'success');
            } catch (e2) {
                log(`Lỗi khi thực thi: ${e2.message}`, 'error');
            }
        }
    }

    openReport() {
        // Đóng menu sidebar
        const offcanvas = bootstrap.Offcanvas.getInstance(this.shadowRoot.querySelector('#offcanvas-menu'));
        if (offcanvas) offcanvas.hide();
    
        // Mở Modal Báo Cáo
        // Kiểm tra xem ModalFull đã được định nghĩa chưa, nếu chưa thì báo lỗi hoặc fallback
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
        }
    }

    _dispatchUpdate() {
        this.dispatchEvent(new CustomEvent('filter-change', {
            detail: {
                stages: Array.from(this.state.selectedStages),
                search: this.state.searchQuery
            },
            bubbles: true,
            composed: true
        }));
    }

    // =========================================================================
    // 3. PIN & SIDE TOGGLE
    // =========================================================================

    /**
     * Toggle pin state - when pinned, menu stays visible on hover-away.
     * When unpinned, menu auto-hides after mouse leaves.
     * @private
     */
    _togglePin() {
        this.state.isPinned = !this.state.isPinned;
        this.state.isHoverEnabled = !this.state.isPinned;
        
        if (this.state.isPinned) {
            this.dom.btnPin.classList.add('active');
            this.dom.closeBtn.style.display = 'none';
        } else {
            this.dom.btnPin.classList.remove('active');
            this.dom.closeBtn.style.display = '';
        }
        
        this.dispatchEvent(new CustomEvent('pin-changed', {
            detail: { isPinned: this.state.isPinned },
            bubbles: true,
            composed: true
        }));

        log(
            this.state.isPinned 
                ? 'Menu được ghim - không tự động ẩn' 
                : 'Menu có thể tự động ẩn khi hover rời',
            'info'
        );
    }

    /**
     * Toggle sidebar position - left ↔ right.
     * @private
     */
    _toggleSide() {
        this.state.isRightSide = !this.state.isRightSide;
        
        if (this.state.isRightSide) {
            this.classList.add('right-side');
            this.dom.btnToggleSide.classList.add('right-active');
        } else {
            this.classList.remove('right-side');
            this.dom.btnToggleSide.classList.remove('right-active');
        }

        this.dispatchEvent(new CustomEvent('side-changed', {
            detail: { isRightSide: this.state.isRightSide },
            bubbles: true,
            composed: true
        }));

        log(
            this.state.isRightSide 
                ? 'Sidebar chuyển sang bên phải' 
                : 'Sidebar chuyển sang bên trái',
            'info'
        );
    }

    // =========================================================================
    // ★ 4. RESIZE HANDLE LOGIC (FIXED)
    // =========================================================================
    
    /**
     * Initialize resize handle listeners.
     * Attach mousedown events to both left and right resize handles.
     * @private
     */
    _initResizeHandle() {
        if (!this.dom.resizeHandleLeft || !this.dom.resizeHandleRight) return;
        
        this.dom.resizeHandleLeft.addEventListener('mousedown', this._handleResizeStart);
        this.dom.resizeHandleRight.addEventListener('mousedown', this._handleResizeStart);
    }
    
    /**
     * Handle resize start - initialize drag state and attach global listeners.
     * ★ FIX: Correct binding and property access
     * @private
     * @param {MouseEvent} e
     */
    _handleResizeStart(e) {
        e.preventDefault();
        e.stopPropagation();
        
        // ★ FIX: Access 'this' correctly (bound in constructor)
        this.state.isResizing = true;
        this._resizeStartX = e.clientX;
        this._resizeStartWidth = this.state.menuWidth;
    
        // Visual feedback
        this.dom.resizeHandleLeft?.classList.add('active');
        this.dom.resizeHandleRight?.classList.add('active');
    
        // ★ FIX: Use .style.transition = 'none' NOT .transition('none')
        if (this.dom.wrapper) {
            this.dom.wrapper.style.transition = 'none';
        }
    
        // ★ FIX: Attach with correct binding context
        document.addEventListener('mousemove', this._handleResizing, false);
        document.addEventListener('mouseup', this._handleResizeEnd, false);
    }
    
    /**
     * Handle resizing - update menu width dynamically as user drags.
     * ★ FIX: Arrow function ensures 'this' binding is correct
     * @private
     * @param {MouseEvent} e
     */
    _handleResizing = (e) => {
        // ★ FIX: Guard clause to prevent errors if state lost
        if (!this.state || !this.state.isResizing) {
            return;
        }
    
        try {
            e.preventDefault();
            
            const deltaX = e.clientX - this._resizeStartX;
            let newWidth = this._resizeStartWidth;
            
            // ★ Correct direction calculation
            if (this.state.isRightSide) {
                newWidth = this._resizeStartWidth - deltaX;
            } else {
                newWidth = this._resizeStartWidth + deltaX;
            }
    
            // Apply constraints
            newWidth = Math.max(this.state.minWidth, Math.min(newWidth, this.state.maxWidth));
    
            // Update state and CSS
            this.state.menuWidth = newWidth;
            this.style.setProperty('--w-panel', `${newWidth}px`);
    
            // Dispatch event
            this.dispatchEvent(new CustomEvent('resize-changed', {
                detail: { width: newWidth },
                bubbles: true,
                composed: true
            }));
        } catch (err) {
            // ★ FIX: Silently fail without breaking event chain
            console.warn('Resize error (non-fatal):', err.message);
        }
    }
    
    /**
     * Handle resize end - cleanup listeners and restore transitions.
     * ★ FIX: Proper cleanup with error handling
     * @private
     * @param {MouseEvent} e
     */
    _handleResizeEnd = (e) => {
        try {
            // ★ FIX: Check state exists before accessing
            if (this.state) {
                this.state.isResizing = false;
            }
    
            // Remove visual feedback
            this.dom.resizeHandleLeft?.classList.remove('active');
            this.dom.resizeHandleRight?.classList.remove('active');
    
            // ★ FIX: Use .style.transition = '' to restore (empty string = restore CSS default)
            if (this.dom.wrapper) {
                this.dom.wrapper.style.transition = '';
            }
    
            // ★ FIX: Remove listeners with matching parameters
            document.removeEventListener('mousemove', this._handleResizing, false);
            document.removeEventListener('mouseup', this._handleResizeEnd, false);
    
            // Save state
            this._saveResizeState();
    
            log(`Menu width: ${this.state.menuWidth}px`, 'info');
        } catch (err) {
            console.warn('Resize end error (non-fatal):', err.message);
        }
    }
    
    /**
     * Save resize state to localStorage for persistence.
     * @private
     */
    _saveResizeState() {
        try {
            const state = JSON.parse(localStorage.getItem('offcanvas-menu-state') || '{}');
            state.menuWidth = this.state.menuWidth;
            localStorage.setItem('offcanvas-menu-state', JSON.stringify(state));
        } catch (err) {
            console.warn('State save error:', err.message);
        }
    }
    
    // =========================================================================
    // ★ 5. AUTO HIDE/SHOW TRIGGER LOGIC (ENSURE NO CONFLICTS)
    // =========================================================================
    
    /**
     * Initialize hover trigger - add global mousemove listener for auto-show.
     * ★ IMPORTANT: This runs independently from resize handler
     * @private
     */
    _initHoverTrigger() {
        this._hoverTriggerTime = null; // Track when cursor enters trigger zone
        document.addEventListener('mousemove', this._handleMouseMove, false);
    }
    
    /**
     * Handle global mouse move - open menu when cursor near edge for at least 1s.
     * Only works when NOT pinned and NOT resizing.
     * ★ FIX: Add 1s delay before opening menu to prevent accidental triggers
     * @private
     * @param {MouseEvent} e
     */
    _handleMouseMove(e) {
        // ★ Skip if resizing (don't block other handlers)
        if (!this || !this.state || this.state.isResizing) {
            return;
        }
    
        if (!this.state.isHoverEnabled) {
            return;
        }
    
        try {
            const triggerX = this.state.isRightSide 
                ? window.innerWidth - this.state.triggerWidth 
                : this.state.triggerWidth;
    
            const isInTriggerZone = this.state.isRightSide 
                ? e.clientX >= triggerX
                : e.clientX <= triggerX;
            
            if (isInTriggerZone) {
                // Cursor entered trigger zone
                if (!this._hoverTriggerTime) {
                    // Record time when cursor first enters
                    this._hoverTriggerTime = Date.now();
                    if (this._isClosing) this._isClosing = false; // Cancel any pending close
                } else if (Date.now() - this._hoverTriggerTime >= 1000) {
                    // Cursor has been in zone for at least 1 second
                    this.open();
                }
            } else {
                // Cursor left trigger zone - reset timer
                this._hoverTriggerTime = null;
            }
        } catch (err) {
            console.warn('Hover trigger error (non-fatal):', err.message);
        }
    }
    
    /**
     * Handle mouse leave from menu wrapper - close after delay and reset hover timer.
     * Only works when NOT pinned.
     * @private
     */
    _handleMouseLeave(e) {
        if (!this.state || !this.state.isHoverEnabled) {
            return;
        }
        
        // Reset hover trigger timer khi chuột rời menu
        this._hoverTriggerTime = null;
        this._isClosing = true;
        
        setTimeout(() => {
            if (this._isClosing) {
                this.close();
            }
        }, 1500);
    }
    
    // =========================================================================
    // ★ 6. DISCONNECT - PROPER CLEANUP
    // =========================================================================
    
    disconnectedCallback() {
        try {
            // Remove hover trigger
            document.removeEventListener('mousemove', this._handleMouseMove, false);
            
            // Remove any active resize listeners
            document.removeEventListener('mousemove', this._handleResizing, false);
            document.removeEventListener('mouseup', this._handleResizeEnd, false);
            if (this.hoverTrigger) this.hoverTrigger.remove();
        } catch (err) {
            console.warn('Cleanup error:', err.message);
        }
    }

    // =========================================================================
    // 6. PUBLIC API
    // =========================================================================

    /**
     * Open menu.
     */
    open() {
        this.classList.add('show');
    }

    /**
     * Close menu.
     */
    close() {
        this.classList.remove('show');
    }

    /**
     * Toggle menu visibility.
     */
    toggle() {
        this.classList.toggle('show');
    }

    toggleSide() {
        this._toggleSide();
    }
    togglePin() {
        this._togglePin();
    }

    /**
     * Restore persisted state (pin, side, width).
     * @param {Object} state - {isPinned, isRightSide, menuWidth}
     */
    setState(state) {
        if (state.isPinned !== undefined) {
            this.state.isPinned = state.isPinned;
            this.state.isHoverEnabled = !state.isPinned;
            
            if (state.isPinned) {
                this.dom.btnPin.classList.add('active');
                this.dom.closeBtn.style.display = 'none';
            }
        }

        if (state.isRightSide !== undefined) {
            this.state.isRightSide = state.isRightSide;
            
            if (state.isRightSide) {
                this.classList.add('right-side');
                this.dom.btnToggleSide.classList.add('right-active');
            }
        }

        if (state.menuWidth !== undefined && 
            state.menuWidth >= this.state.minWidth && 
            state.menuWidth <= this.state.maxWidth) {
            this.state.menuWidth = state.menuWidth;
            this.style.setProperty('--w-panel', `${state.menuWidth}px`);
        }
    }
}

// Register Component
if (!customElements.get('offcanvas-menu')) {
    customElements.define('offcanvas-menu', OffcanvasMenu);
}

// AUTO INJECT ON STARTUP
(function() {
    document.addEventListener('DOMContentLoaded', () => {
        const existingMenu = document.querySelector('offcanvas-menu');
        
        if (!existingMenu) {
            const menu = document.createElement('offcanvas-menu');
            document.body.appendChild(menu);
            log('✅ [9Trip System] ERP Left Menu Injected.', 'success');

            menu.addEventListener('pin-changed', (e) => {
                _updateMenuState({ isPinned: e.detail.isPinned });
            });
            menu.addEventListener('side-changed', (e) => {
                _updateMenuState({ isRightSide: e.detail.isRightSide });
            });
            menu.addEventListener('resize-changed', (e) => {
                _updateMenuState({ menuWidth: e.detail.width });
            });
            // menu.toggleSide();
        }        
    });

    function _updateMenuState(updates) {
        const state = JSON.parse(localStorage.getItem('offcanvas-menu-state') || '{}');
        Object.assign(state, updates);
        localStorage.setItem('offcanvas-menu-state', JSON.stringify(state));
    }
})();
