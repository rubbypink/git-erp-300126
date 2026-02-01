/**
 * =========================================================================
 * 9 TRIP ERP - OFFCANVAS LEFT MENU COMPONENT
 * Version: 2.1 (Fixed Ghosting Issue)
 * =========================================================================
 */

class OffcanvasLeftMenuComponent extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        
        // State Management
        this.state = {
            selectedStages: new Set(['all']),
            searchQuery: '',
            isHoverEnabled: true,
            triggerWidth: 15 // pixels
        };

        this._handleMouseMove = this._handleMouseMove.bind(this);
        this._handleMouseLeave = this._handleMouseLeave.bind(this);
    }

    connectedCallback() {
        // FIX: Kiểm tra nếu đã render rồi thì không render lại để tránh chồng DOM
        if (this.shadowRoot.querySelector('.offcanvas-wrapper')) return;

        this._render();
        this._setupDOM();
        this._attachEvents();
        this._initHoverTrigger();
        
        // Đảm bảo trạng thái ban đầu là đóng
        this.classList.remove('show');
    }

    disconnectedCallback() {
        document.removeEventListener('mousemove', this._handleMouseMove);
        if (this.hoverTrigger) this.hoverTrigger.remove();
    }

    // =========================================================================
    // 1. CORE RENDERING (UI/UX)
    // =========================================================================

    _render() {
        // FIX: Xóa sạch nội dung cũ trước khi render mới (Tránh duplicate nội dung)
        this.shadowRoot.innerHTML = '';

        const template = document.createElement('template');
        template.innerHTML = `
            ${this._getStyles()}
            <div class="offcanvas-wrapper">
              <div class="header">
                  <div class="header-title">
                      <i class="fas fa-sliders-h"></i> <span>BỘ LỌC & CÔNG CỤ</span>
                  </div>
                  <button class="btn-close"><i class="fas fa-times"></i></button>
              </div>

              <div class="body">
                <div class="section">
                  <div class="section-title">TEST AREA</div>
                  <div class="d-flex justify-content-center align-items-center admin-only">
                    <div class="row" style="width: 100%; margin:0 0 10px 0;">
                      <textarea class="form-control w-100" id="test-input" rows="3" placeholder="Nhập JSON test..."></textarea>
                    </div>
                    <button id="btn-admin-test" class="btn btn-danger m-0" style="width: 100%;">
                      <i class="fa-solid fa-bug"></i> RUN TEST
                    </button>
                  </div>
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
                    <button class="btn-reset" id="btnReset"><i class="fas fa-redo"></i> Đặt lại bộ lọc</button>
                </div>

                <div class="section function-section">
                    <div class="section-title">CHỨC NĂNG HỆ THỐNG</div>
                    <div class="function-grid">
                        ${this._renderFuncBtn('export', 'Xuất Excel', 'file-excel', '#218838')}
                        ${this._renderFuncBtn('import', 'Nhập liệu', 'file-upload', '#007bff')}
                        ${this._renderFuncBtn('report', 'Báo cáo', 'chart-pie', '#dc3545')}
                        ${this._renderFuncBtn('setting', 'Cấu hình', 'cog', '#6c757d')}
                    </div>
                </div>
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

            /* Container transform logic */
            .offcanvas-wrapper {
                width: var(--w-panel);
                height: 100%;
                background: #fff;
                box-shadow: 4px 0 15px rgba(0,0,0,0.1);
                display: flex;
                flex-direction: column;
                
                transform: translateX(-102%);
                transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                pointer-events: auto;
                will-change: transform; /* Tối ưu hiệu suất vẽ */
            }

            :host(.show) .offcanvas-wrapper {
                transform: translateX(0);
            }

            /* Header */
            .header { padding: 15px 20px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; background: #fff; }
            .header-title { font-weight: 700; color: var(--primary); font-size: 14px; display: flex; gap: 8px; align-items: center; }
            .btn-close { border: none; background: none; font-size: 18px; color: #999; cursor: pointer; padding: 5px; }
            .btn-close:hover { color: var(--text); }

            /* Body */
            .body { flex: 1; overflow-y: auto; padding: 20px; background: var(--bg-body); }
            
            .section { background: #fff; padding: 15px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); margin-bottom: 15px; }
            .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #adb5bd; margin-bottom: 12px; letter-spacing: 0.5px; }

            /* Test Area Styles */
            .form-control { display: block; width: 100%; padding: .375rem .75rem; font-size: 1rem; font-weight: 400; line-height: 1.5; color: #212529; background-color: #fff; background-clip: padding-box; border: 1px solid #ced4da; border-radius: .25rem; transition: border-color .15s ease-in-out,box-shadow .15s ease-in-out; }
            .btn { display: inline-block; font-weight: 400; line-height: 1.5; color: #212529; text-align: center; text-decoration: none; vertical-align: middle; cursor: pointer; user-select: none; background-color: transparent; border: 1px solid transparent; padding: .375rem .75rem; font-size: 1rem; border-radius: .25rem; transition: color .15s ease-in-out,background-color .15s ease-in-out,border-color .15s ease-in-out,box-shadow .15s ease-in-out; }
            .btn-danger { color: #fff; background-color: #dc3545; border-color: #dc3545; }
            .btn-danger:hover { background-color: #bb2d3b; border-color: #b02a37; }

            /* Search */
            .search-box { position: relative; }
            .search-box input { width: 100%; padding: 10px 15px 10px 35px; border: 1px solid var(--border); border-radius: 6px; font-size: 13px; box-sizing: border-box; outline: none; transition: border 0.2s; }
            .search-box input:focus { border-color: var(--primary); }
            .search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #adb5bd; font-size: 12px; }

            /* Checkboxes */
            .stage-list { display: flex; flex-direction: column; gap: 8px; }
            .checkbox-item { display: flex; align-items: center; cursor: pointer; user-select: none; }
            .checkbox-item input { display: none; }
            .custom-check { width: 16px; height: 16px; border: 2px solid #ced4da; border-radius: 4px; margin-right: 10px; position: relative; transition: all 0.2s; }
            .checkbox-item input:checked + .custom-check { background: var(--primary); border-color: var(--primary); }
            .checkbox-item input:checked + .custom-check::after { content: '✓'; color: #fff; position: absolute; font-size: 10px; top: 50%; left: 50%; transform: translate(-50%, -50%); }
            
            .badge { padding: 4px 8px; border-radius: 4px; font-size: 13px; font-weight: 500; width: 100%; }
            .all { background: #e9ecef; color: #495057; }
            .planning { background: #fff3cd; color: #856404; }
            .confirmed { background: #d1e7dd; color: #0f5132; }
            .in-progress { background: #cff4fc; color: #055160; }
            .completed { background: #d1e7dd; color: #198754; }
            .canceled { background: #f8d7da; color: #842029; }
            
            .checkbox-item:hover .badge { opacity: 0.8; }
            .checkbox-item input:checked ~ .badge { box-shadow: 0 0 0 1px var(--primary); }

            /* Function Grid */
            .function-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
            .func-btn { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 15px; background: #f8f9fa; border: 1px solid var(--border); border-radius: 6px; cursor: pointer; transition: all 0.2s; }
            .func-btn:hover { background: #fff; transform: translateY(-2px); box-shadow: 0 2px 5px rgba(0,0,0,0.05); border-color: var(--primary); }
            .func-btn i { font-size: 18px; }
            .func-btn span { font-size: 12px; font-weight: 500; color: var(--text); }

            .btn-reset { width: 100%; margin-top: 15px; padding: 8px; background: none; border: 1px dashed var(--primary); color: var(--primary); border-radius: 6px; cursor: pointer; font-size: 12px; }
            .btn-reset:hover { background: rgba(13, 110, 253, 0.05); }

            /* Scrollbar */
            .body::-webkit-scrollbar { width: 5px; }
            .body::-webkit-scrollbar-thumb { background: #ccc; border-radius: 10px; }
        </style>
        `;
    }

    // =========================================================================
    // 2. LOGIC & EVENT HANDLING
    // =========================================================================

    _setupDOM() {
        this.dom = {
            wrapper: this.shadowRoot.querySelector('.offcanvas-wrapper'),
            closeBtn: this.shadowRoot.querySelector('.btn-close'),
            searchInput: this.shadowRoot.querySelector('#searchInput'),
            checkboxes: this.shadowRoot.querySelectorAll('.stage-filter'),
            btnReset: this.shadowRoot.querySelector('#btnReset'),
            funcButtons: this.shadowRoot.querySelectorAll('.func-btn')
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
                this.dispatchEvent(new CustomEvent('menu-action', {
                    detail: { action },
                    bubbles: true,
                    composed: true
                }));
            });
        });

        this.dom.wrapper.addEventListener('mouseleave', this._handleMouseLeave);
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
    // 3. AUTO HIDE/SHOW TRIGGER LOGIC
    // =========================================================================

    _initHoverTrigger() {
        // Chỉ gán sự kiện nếu chưa có
        document.removeEventListener('mousemove', this._handleMouseMove);
        document.addEventListener('mousemove', this._handleMouseMove);
    }

    _handleMouseMove(e) {
        if (!this.state.isHoverEnabled) return;

        // Nếu chuột ở sát mép trái (trong khoảng triggerWidth)
        if (e.clientX <= this.state.triggerWidth) {
            this.open();
        }
    }

    _handleMouseLeave(e) {
        if (!this.state.isHoverEnabled) return;
        
        setTimeout(() => {
            this.close();
        }, 300);
    }

    // =========================================================================
    // 4. PUBLIC API
    // =========================================================================

    open() {
        this.classList.add('show');
    }

    close() {
        this.classList.remove('show');
    }

    toggle() {
        this.classList.toggle('show');
    }
}


/**
 * =========================================================================
 * MODAL_FULL.JS - FULLSCREEN MODAL COMPONENT
 * Purpose: Web Component for fullscreen modals with responsive design
 * 
 * USAGE:
 * ------
 * 1. Add component to HTML:
 *    <at-modal-full title="Tiêu đề Modal" data-ft="true"></at-modal-full>
 * 
 * 2. Get reference and show:
 *    const modal = document.querySelector('at-modal-full');
 *    modal.data('<p>Nội dung HTML</p>');
 *    modal.show();
 * 
 * 3. Listen to save button:
 *    modal.querySelector('.btn-primary').addEventListener('click', () => {
 *      console.log('Save clicked');
 *    });
 * 
 * ATTRIBUTES:
 * -----------
 * title            - Modal title (default: 'Modal Title')
 * data-ft          - Show footer buttons (default: 'true', set to 'false' to hide)
 * data-body        - Load content: HTML string or function name (optional)
 *                    Examples: data-body="<p>HTML</p>" or data-body="loadContentFunc"
 * data-at-submit   - Save button handler function name (optional)
 *                    If set, footer is shown. Function called on save click.
 *                    Examples: data-at-submit="onSaveHandler"
 * 
 * METHODS:
 * --------
 * .data(htmlContent)      - Set modal body content
 * .show()                 - Open modal
 * .hide()                 - Close modal
 * .getSaveBtn()           - Get save button element
 * .getCloseBtn()          - Get close button element
 * .setSaveHandler(fn)     - Set save button click handler
 * 
 * EXAMPLE 1 - Static HTML:
 * --------
 * <at-modal-full 
 *   title="Thêm Mới"
 *   data-body="<form><input type='text' id='name'></form>"
 *   data-at-submit="handleSave">
 * </at-modal-full>
 * 
 * EXAMPLE 2 - Dynamic Content:
 * --------
 * window.loadContentFunc = function() {
 *   return '<p>Nội dung động từ hàm</p>';
 * };
 * <at-modal-full title="Chi tiết" data-body="loadContentFunc"></at-modal-full>
 * 
 * EXAMPLE 3 - With Save Handler:
 * --------
 * window.onSaveHandler = async function() {
 *   const data = getFormData();
 *   await requestAPI('saveData', data);
 *   this.hide(); // 'this' refers to modal element
 * };
 * <at-modal-full 
 *   title="Lưu Dữ Liệu"
 *   data-at-submit="onSaveHandler">
 * </at-modal-full>
 * =========================================================================
 */

class ModalFull extends HTMLElement {
    constructor() {
        super();
        this.modal = null;
    }

    connectedCallback() {
        this.render();
        this.setupModal();
    }

    render() {
        const title = this.getAttribute('title') || 'Modal Title';
        const showFooter = this.getAttribute('data-ft') !== 'false';

        this.innerHTML = `
            <div id="dynamic-modal-full" class="modal fade" tabindex="-1" aria-hidden="true">
                <div class="modal-dialog modal-fullscreen">
                    <div class="modal-content">
                        <div class="modal-header p-0 border-bottom" style="max-height: 3vh;">
                            <h5 class="modal-title">${title}</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div id="dynamic-modal-full-body" class="modal-body pt-0 overflow-auto"></div>
                        ${showFooter ? `
                            <div class="modal-footer gap-2">
                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Đóng</button>
                                <button type="button" class="btn btn-primary">Lưu</button>
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>

            <style>
                @media (max-width: 575.98px) {
                    at-modal-full .modal-dialog {
                        margin: 0;
                        width: 100%;
                        height: 100vh;
                    }
                    at-modal-full .modal-content {
                        height: 100vh;
                        border-radius: 0;
                    }
                    at-modal-full .modal-body {
                        flex: 1;
                        overflow-y: auto;
                        -webkit-overflow-scrolling: touch;
                    }
                }

                @media (min-width: 576px) {
                    at-modal-full .modal-dialog {
                        max-width: 90%;
                    }
                }

                @media (min-width: 992px) {
                    at-modal-full .modal-dialog {
                        max-width: 100%;
                        max-height: 100%;
                    }
                    at-modal-full .modal-footer {
                        margin: 1rem 3rem;
                        padding: 0.5rem 2rem;
                        background-color: #e9e4a5;
                        border-radius: 2rem !important;
                    }
                }
            </style>
        `;
    }

    setupModal() {
        const modalEl = this.querySelector('#dynamic-modal-full');
        this.modal = new bootstrap.Modal(modalEl);

        // =========================================================================
        // Handle data-body attribute: load HTML content on init
        // =========================================================================
        const dataLoad = this.getAttribute('data-body');
        if (dataLoad) {
            this._loadContent(dataLoad);
        }

        // =========================================================================
        // Handle data-at-submit attribute: bind save button handler
        // =========================================================================
        const dataAtSubmit = this.getAttribute('data-at-submit');
        if (dataAtSubmit && typeof window[dataAtSubmit] === 'function') {
            this.setSaveHandler(window[dataAtSubmit]);
        }
    }

    /**
     * Load content from data-body attribute.
     * Check if it's a function name or HTML string.
     * 
     * @private
     * @param {string} dataLoad - Function name or HTML string
     */
    _loadContent(dataLoad) {
        let content = '';

        // Check if dataLoad is a function name
        if (typeof window[dataLoad] === 'function') {
            try {
                content = window[dataLoad]();
            } catch (error) {
                log(`Error executing function "${dataLoad}": ${error.message}`, 'error');
                return;
            }
        } else {
            // Treat as HTML string
            content = dataLoad;
        }

        // Set content to modal body
        if (content) {
            this.data(content);
        }
    }

    /**
     * Set modal body content.
     * @param {string} htmlContent - HTML content to display
     */
    data(htmlContent) {
        const body = this.querySelector('.modal-body');
        if (body) body.innerHTML = htmlContent;
    }

    /**
     * Open modal.
     */
    show() {
        this.modal?.show();
    }

    /**
     * Close modal.
     */
    hide() {
        this.modal?.hide();
    }

    /**
     * Get save button element.
     * @returns {HTMLElement|null} Save button or null if footer disabled
     */
    getSaveBtn() {
        return this.querySelector('.btn-primary');
    }

    /**
     * Get close button element.
     * @returns {HTMLElement|null} Close button
     */
    getCloseBtn() {
        return this.querySelector('[data-bs-dismiss="modal"]');
    }

    /**
     * Set save button click handler.
     * Removes previous handler and attaches new one.
     * 
     * @param {Function} handler - Callback function, 'this' context is the modal element
     * 
     * @example
     * modal.setSaveHandler(async function() {
     *   const data = getFormData();
     *   await requestAPI('save', data);
     *   this.hide(); // 'this' = modal element
     * });
     */
    setSaveHandler(handler) {
        const saveBtn = this.getSaveBtn();
        if (!saveBtn || typeof handler !== 'function') return;

        // Remove existing click listeners by cloning
        const newBtn = saveBtn.cloneNode(true);
        saveBtn.parentNode.replaceChild(newBtn, saveBtn);

        // Attach new handler with modal context
        newBtn.addEventListener('click', () => {
            handler.call(this);
        });
    }
    setFooter(isVisible) {
        const footer = this.querySelector('.modal-footer');
        if (!footer) return;

        footer.style.display = isVisible ? '' : 'none';
    }
}

customElements.define('at-modal-full', ModalFull);


// Register Component
if (!customElements.get('offcanvas-left-menu')) {
    customElements.define('offcanvas-left-menu', OffcanvasLeftMenuComponent);
}

// AUTO INJECT ON STARTUP (Feature requested)
(function() {
    document.addEventListener('DOMContentLoaded', () => {
        // Kiểm tra kỹ càng xem đã có menu nào chưa
        const existingMenu = document.querySelector('offcanvas-left-menu');
        
        if (!existingMenu) {
            const menu = document.createElement('offcanvas-left-menu');
            document.body.appendChild(menu);
            console.log('✅ [9Trip System] ERP Left Menu Injected (Singleton Mode).');
        } else {
            console.log('ℹ️ [9Trip System] Menu already exists in HTML. Skipping injection.');
        }
        if (!document.querySelector('at-modal-full')) {
          const modalFull = document.createElement('at-modal-full');
          document.body.appendChild(modalFull);
      }        
    });
})();


