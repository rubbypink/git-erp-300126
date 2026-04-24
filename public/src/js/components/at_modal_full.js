import { FloatDraggable, Resizable, WindowMinimizer } from '/src/js/libs/ui_helper.js';
// =========================================================================
// MODAL FULL COMPONENT
// =========================================================================
export class ModalFull extends HTMLElement {
    static autoInit = true;
    constructor() {
        super();
        this.modal = null;
        this.isFullscreen = true;
        this.showFooter = false;
    }

    connectedCallback() {
        this.init();
    }

    init() {
        const title = this.getAttribute('title') || 'Modal Title';

        this.innerHTML = `
            <div id="dynamic-modal-full" class="modal fade" tabindex="-1">
                <div class="modal-dialog modal-fullscreen" id="modalFullDialog">
                    <div class="modal-content">
                        <div class="modal-header border-bottom px-3 py-1" style="max-height: max-content;">
                            <h5 class="modal-title" style="font-weight: bold;">${title}</h5>
                            <div style="display: flex; gap: 0.6rem; align-items: center;">
                                <button class="btn btn-sm btn-link text-dark btn-minimize px-1" style="font-size: 1.2rem;"><i class="fa-solid fa-minus"></i></button>
                                <button type="button" class="btn-resize-modal" id="btnResizeModal" title="Chuyển đổi kích thước" style="border: none; background: none; font-size: 1.2rem; color: #999; cursor: pointer; padding: 0.5rem; display: flex; align-items: center; justify-content: center;">
                                    <i class="fas fa-expand"></i>
                                </button>
                                <button type="button" class="btn btn-sm btn-close" data-bs-dismiss="modal" data-bs-target="#modalFullDialog" style="font-size: 1.2rem;"></button>
                            </div>
                        </div>
                        <div id="dynamic-modal-full-body" class="modal-body pt-0 overflow-auto"></div>
                        ${
                            this.showFooter
                                ? `
                            <div class="modal-full-footer flex-center gap-3 p-2">
                                <button type="button" class="btn btn-secondary">Xoá</button>
                                <button type="button" class="btn btn-primary">Lưu</button>
                            </div>
                        `
                                : ''
                        }
                    </div>
                </div>
            </div>
      `;
        this.setupModal();
        this._setupUI();
    }

    getEl() {
        let el = getE('dynamic-modal-full');
        if (el) return el;
        // Không tìm thấy, tạo mới
        const container = document.createElement('at-modal-full');
        document.body.appendChild(container);
        el = getE('dynamic-modal-full');
        if (el) return el;
        return null;
    }

    setupModal() {
        const modalEl = this.getEl();
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
        const btnResize = this.getEl().querySelector('#btnResizeModal');
        if (btnResize) {
            btnResize.addEventListener('click', () => this._toggleModalSize());
        }
        this.getCloseBtn().addEventListener('click', () => this.hide());
    }

    _setupUI() {
        // Guard: Chỉ setup 1 lần để tránh duplicate event listeners
        if (this._uiInitialized) return;
        this._uiInitialized = true;

        const modalEl = this.getEl();
        if (!modalEl) return;

        if (FloatDraggable) {
            new FloatDraggable(modalEl, {
                targetSelector: '.modal-dialog',
                handleSelector: '.modal-header',
            });
        }
        if (Resizable) {
            new Resizable(modalEl, {
                targetSelector: '.modal-content',
                minWidth: 400,
                minHeight: 300,
            });
        }
        if (WindowMinimizer) {
            new WindowMinimizer(modalEl, { title: null, btnSelector: '.btn-minimize' });
        }
    }

    _loadContent(dataLoad) {
        let content = '';

        if (typeof window[dataLoad] === 'function') {
            try {
                content = window[dataLoad]();
            } catch (error) {
                L._(`Error executing function "${dataLoad}": ${error.message}`, 'error');
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
        const modalEl = this.getEl();
        const bst = bootstrap.Modal.instance(modalEl);
        if (bst) {
            bst.dispose(); // Dispose instance để remove event listeners cũ
        }
        this.connectedCallback();
    }

    /**
     * Render nội dung vào modal
     * @param {*} htmlContent - HTML content (string, Element, hoặc DocumentFragment)
     * @param {string} [title='9 Trip Dynamic Form'] - Modal title
     *
     * ★ FLOW CHỦ YẾU:
     * 1. Controller render: new A.HotelPriceManager('dynamic-modal-full-body')
     *    └─ Controller thêm HTML vào #dynamic-modal-full-body
     * 2. Gọi show(): modal.show(null, 'Title')
     *    └─ show() KHÔNG reset (DOM đã sạch từ hide())
     *    └─ show() KHÔNG render nếu htmlContent = null
     *    └─ Chỉ update title → display modal
     * 3. Khi close: hide() → reset() xóa sạch DOM cho lần mở tiếp
     */
    render(htmlContent, title = '9 Trip Dynamic Form', options = {}) {
        if (!this.modal) {
            this.connectedCallback();
        }
        if (options.header === false) {
            const headerEl = this.querySelector('.modal-header');
            if (headerEl) headerEl.style.display = 'none';
        } else {
            const titleEl = this.querySelector('.modal-title');
            if (titleEl) {
                titleEl.textContent = title;
            }
        }
        if (options?.footer === false || !options?.footer) this.setFooter(false);
        else this.setFooter(true);
        if (options?.customClass) {
            this.getEl().classList.add(options.customClass);
        }

        const bodyEl = this.querySelector('.modal-body');

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
        } catch (error) {
            Opps('Error setting modal content:', error);
        }
        this.addEventListener(
            'hidden.bs.modal',
            () => {
                this.reset();
            },
            { once: true }
        );
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
        const footerEl = this.querySelector('.modal-full-footer');
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
                inputEls.forEach((input) => {
                    if (input.type === 'checkbox' || input.type === 'radio') {
                        input.checked = false;
                    } else {
                        input.value = '';
                    }
                });
            });
        }
    }

    setFooter(showFooter = false) {
        this.showFooter = showFooter;
        const footerEl = this.querySelector('.modal-full-footer');
        if (showFooter) {
            if (!footerEl) {
                const footerHTML = `
                    <div class="modal-full-footer flex-center gap-3 p-2">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Đóng</button>
                        <button type="button" class="btn btn-primary">Lưu</button>
                    </div>
                `;
                this.querySelector('.modal-content').insertAdjacentHTML('beforeend', footerHTML);
            } else {
                setClass(footerEl, 'd-none', false);
                footerEl.setAttribute('data-ft', 'true');
            }
        } else {
            if (footerEl) {
                setClass(footerEl, 'd-none', true);
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

/**
 * AModal - Singleton Manager (Chuẩn ERP ERP)
 * Quản lý tất cả các lớp Modal xếp chồng chỉ bằng 1 Instance duy nhất.
 */
class DynamicModal {
    #stack = [];
    #baseId = 'dynamic-modal';

    constructor(appInstance = window.A) {
        this.appInstance = appInstance;
        // Khởi tạo Base Modal (Lớp dưới cùng) vào Stack
        this.#stack.push(this.#createNode(this.#baseId));
    }

    // =====================================================================
    // 1. STACK & NODE MANAGEMENT
    // =====================================================================

    #createNode(id) {
        return {
            id: id,
            isOccupied: false,
            instance: null,
            handlers: {},
            initialStyles: {},
            draggable: null,
            minimizer: null,
            fullscreen: false,
            header: true,
            escKeyHandler: null,
            fullscreenHandler: null,
        };
    }

    // Lấy Modal đang nằm trên cùng của ngăn xếp
    #getActiveNode() {
        return this.#stack[this.#stack.length - 1];
    }

    #getNode(id) {
        return this.#stack.find((n) => n.id === id);
    }

    // Helpers lấy DOM bằng ID của Node
    _getEl(id) {
        if (!id && this.id) id = this.id;
        return document.getElementById(id);
    }
    _getBody(id) {
        return document.getElementById(`${id}-body`);
    }
    _getBtnSave(id) {
        return document.getElementById(id === this.#baseId ? 'btn-save-modal' : `${id}-btn-save`);
    }
    _getBtnReset(id) {
        return document.getElementById(id === this.#baseId ? 'btn-reset-modal' : `${id}-btn-reset`);
    }

    // =====================================================================
    // 2. CORE HTML & BOOTSTRAP INITIALIZATION
    // =====================================================================

    _ensureModalExists(id) {
        if (typeof bootstrap !== 'undefined' && bootstrap.Modal.Default) {
            bootstrap.Modal.Default.keyboard = false;
        }
        if (this._getEl(id)) return;

        const btnSaveId = id === this.#baseId ? 'btn-save-modal' : `${id}-btn-save`;
        const btnResetId = id === this.#baseId ? 'btn-reset-modal' : `${id}-btn-reset`;

        const modalHTML = `
            <div id="${id}" class="modal fade" tabindex="-1" data-bs-backdrop="false">
                <div class="modal-dialog" style="padding-bottom: 5rem;">
                    <div class="modal-content shadow-lg border-0">
                        <div class="modal-header bg-gradient py-2">
                            <h6 class="modal-title fw-bold text-uppercase" style="letter-spacing: 1px; justify-self: center;">
                                <i class="fa-solid fa-sliders me-2"></i>Modal Title
                            </h6>
                            <div class="btn-group gap-2">
                                <button class="btn btn-sm btn-link text-dark btn-center px-1" title="Canh giữa màn hình">
                                    <i class="fa-solid fa-crosshairs"></i>
                                </button>
                                <button class="btn btn-sm btn-link text-dark btn-minimize px-1" title="Minimize"><i class="fa-solid fa-minus"></i></button>
                                <button class="btn btn-sm btn-link text-dark btn-fullscreen px-1" title="Fullscreen"><i class="fa-solid fa-expand"></i></button>
                                <button type="button" class="btn btn-sm btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                            </div>
                        </div>
                        <div id="${id}-body" class="modal-body p-0"></div>
                        <div class="modal-footer bg-gray p-2 m-2 gap-2" data-ft="true" style="display:none;">
                            <button id="${btnResetId}" type="button" class="btn btn-secondary">
                                <i class="fa-solid fa-redo me-2"></i>Đặt lại
                            </button>
                            <button id="${btnSaveId}" type="submit" class="btn btn-primary px-4 fw-bold">
                                <i class="fa-solid fa-check me-2"></i>Lưu
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }

    _getInstance(id) {
        let el = this._getEl(id);
        if (!el) {
            this._ensureModalExists(id);
            el = this._getEl(id);
        }

        const node = this.#getNode(id);
        if (!node) return null;

        if (!node.instance) {
            this._defaultOptions = { backdrop: true, keyboard: false, size: 'modal-xl' }; /* global bootstrap */
            this.fullscreen = false; // Flag kích hoạt handler fullscreen tích hợp sẵn
            node.instance = bootstrap.Modal.getInstance(el) || new bootstrap.Modal(el, this._defaultOptions);

            const dialog = el.querySelector('.modal-dialog');
            if (dialog && Object.keys(node.initialStyles).length === 0) {
                node.initialStyles = {
                    width: dialog.style.width,
                    maxWidth: dialog.style.maxWidth,
                    minWidth: dialog.style.minWidth,
                    maxHeight: dialog.style.maxHeight,
                    height: dialog.style.height,
                    minHeight: dialog.style.minHeight,
                };
            }

            if (typeof FloatDraggable !== 'undefined') node.draggable = new FloatDraggable(el, { targetSelector: '.modal-dialog', handleSelector: '.modal-header' });
            if (typeof Resizable !== 'undefined') new Resizable(el, { targetSelector: '.modal-content', minWidth: 400, minHeight: 300 });
            if (typeof WindowMinimizer !== 'undefined') node.minimizer = new WindowMinimizer(el, { title: null, btnSelector: '.btn-minimize' });

            // Lắng nghe sự kiện Native ẩn Modal để xử lý tự động xóa DOM
            el.addEventListener('hidden.bs.modal', () => {
                if (document.activeElement) document.activeElement.blur();
                this._handleHidden(id);
            });
            el.addEventListener('shown.bs.modal', () => {
                this._initEscListener(id);
                this.adaptAndCenter(id);
            });

            this._setupFullscreenButton(id);
            this._setupCenterButton(id);
        }
        return node.instance;
    }

    _injectContent(id, htmlContent, title) {
        const el = this._getEl(id);
        if (!el) return false;

        const titleEl = el.querySelector('.modal-title');
        const bodyEl = this._getBody(id);
        if (!bodyEl) return false;

        if (titleEl && title) titleEl.innerHTML = title;
        try {
            if (htmlContent instanceof DocumentFragment) {
                bodyEl.innerHTML = '';
                bodyEl.appendChild(htmlContent.cloneNode(true));
            } else if (htmlContent instanceof HTMLElement) {
                bodyEl.innerHTML = '';
                htmlContent.tagName === 'TEMPLATE' ? bodyEl.appendChild(htmlContent.content.cloneNode(true)) : bodyEl.appendChild(htmlContent.cloneNode(true));
            } else if (typeof htmlContent === 'string') {
                bodyEl.innerHTML = htmlContent;
            }
            return true;
        } catch (error) {
            console.error('[AModal] Lỗi Render:', error);
            return false;
        }
    }

    // =====================================================================
    // 3. PUBLIC API (Dành cho App gọi)
    // =====================================================================

    render(htmlContent, title = 'Thông báo', opts = {}) {
        let activeNode = this.#getActiveNode();

        // NẾU MODAL HIỆN TẠI ĐANG BẬN -> TẠO MODAL MỚI VÀ ĐẨY VÀO STACK
        if (activeNode.isOccupied) {
            const nextNum = this.#stack.length + 1;
            const newId = `dynamic-modal-${nextNum}`;

            activeNode = this.#createNode(newId);
            this.id = newId;
            this.#stack.push(activeNode);
        }

        this._ensureModalExists(activeNode.id);
        if (opts && Object.keys(opts).length > 0) this.setOptions(opts); // Cập nhật option cho activeNode
        this._injectContent(activeNode.id, htmlContent, title);

        return this; // Trả về singleton để có thể chain tiếp
    }

    show(htmlContent = null, title = null, saveHandler = null, resetHandler = null) {
        let activeNode = this.#getActiveNode();

        // 1. Kiểm tra ưu tiên: Modal hiện tại có đang bị thu nhỏ (Minimize) không?
        const taskbarBtn = document.querySelector(`#erp-global-taskbar .erp-task-item[data-target-id="${activeNode.id}"]`);

        if (taskbarBtn && activeNode.minimizer) {
            // Đang thu nhỏ -> Bơm nội dung mới vào chính nó và Phóng to
            if (htmlContent || title) {
                this._injectContent(activeNode.id, htmlContent, title);
            }
            activeNode.minimizer.restore();
        } else {
            // 2. Nếu KHÔNG bị thu nhỏ -> Bây giờ mới dùng logic Render (Để xử lý Stacking đẻ form mới)
            if (htmlContent || title) {
                this.render(htmlContent, title);
                // Cập nhật lại activeNode vì hàm render có thể vừa đẻ ra Modal_2, Modal_3
                activeNode = this.#getActiveNode();
            }

            activeNode.isOccupied = true;
            const inst = this._getInstance(activeNode.id);
            if (inst) inst.show();
        }

        // 3. Setup các nút bấm (Sử dụng setTimeout để đợi DOM xuất hiện)
        setTimeout(() => {
            if (saveHandler) {
                this.setSaveHandler(saveHandler);
                if (!resetHandler) this.setResetHandler(() => this.hide(), 'Đóng');
            }
            if (resetHandler) this.setResetHandler(resetHandler);
        }, 50);
    }
    /**
     * Chuyển một Modal cụ thể lên làm Active (Dùng cho WindowMinimizer khi Restore)
     */
    setActive(id) {
        const index = this.#stack.findIndex((n) => n.id === id);
        if (index !== -1) {
            // Đưa node này lên cuối mảng (LIFO - Topmost)
            const [node] = this.#stack.splice(index, 1);
            this.#stack.push(node);
        }
    }

    // =====================================================================
    // ★ PUBLIC API
    // =====================================================================

    setOptions(opts = {}) {
        const node = this.#getActiveNode();
        const inst = this._getInstance(node.id);
        if (!inst || !inst._config) return;

        const el = this._getEl(node.id);

        // Cập nhật Bootstrap Config
        if (typeof opts.keyboard === 'boolean') inst._config.keyboard = opts.keyboard;

        if (opts.backdrop !== undefined) {
            inst._config.backdrop = opts.backdrop;
            // Xử lý logic ẩn/hiện backdrop thủ công nếu modal đang show
            if (el?.classList.contains('show')) {
                el.setAttribute('data-bs-backdrop', opts.backdrop === 'static' ? 'static' : opts.backdrop ? 'true' : 'false');
            }
        }

        // Cập nhật giao diện (Header/Footer/Size)
        if (opts.header !== undefined) {
            node.header = !!opts.header;
            const headerEl = el.querySelector('.modal-header');
            if (headerEl) headerEl.classList.toggle('d-none', !node.header);
        }

        if (opts.size) {
            const dialog = el.querySelector('.modal-dialog');
            if (dialog) {
                dialog.classList.remove('modal-sm', 'modal-lg', 'modal-xl');
                dialog.classList.add(opts.size);
            }
        }

        if (opts.footer !== undefined) this.setFooter(opts.footer);
        return this;
    }

    resetOptions() {
        return this.setOptions(this._defaultOptions);
    }

    hide() {
        const node = this.#getActiveNode();
        // Reset về mặc định trước khi ẩn để lần sau mở lại không bị dính config cũ
        this._resetToDefaults(node.id);
        const inst = this._getInstance(node.id);
        if (inst) inst.hide(); // Bootstrap sẽ trigger event 'hidden.bs.modal' -> gọi _handleHidden
    }

    // =====================================================================
    // 4. CLEANUP & MEMORY MANAGEMENT (Linh hồn của kiến trúc mới)
    // =====================================================================

    _handleHidden(id) {
        const nodeIndex = this.#stack.findIndex((n) => n.id === id);
        if (nodeIndex === -1) return;

        const node = this.#stack[nodeIndex];
        node.isOccupied = false;
        node.handlers = {};

        const bodyEl = this._getBody(id);
        if (bodyEl) bodyEl.innerHTML = '';

        this._resetButton(this._getBtnSave(id));
        this._resetButton(this._getBtnReset(id));

        if (node.escKeyHandler) {
            document.removeEventListener('keydown', node.escKeyHandler);
            node.escKeyHandler = null;
        }

        // NẾU KHÔNG PHẢI GỐC -> TIÊU DIỆT HOÀN TOÀN DOM VÀ RÚT KHỎI STACK
        if (id !== this.#baseId) {
            const el = this._getEl(id);
            if (el) {
                const bsInst = bootstrap.Modal.getInstance(el);
                if (bsInst) bsInst.dispose();
                el.remove(); // Xóa sạch HTML
            }
            this.#stack.splice(nodeIndex, 1);
        }
    }

    // =====================================================================
    // 5. EVENT HANDLERS (Luôn trỏ vào Node đang active)
    // =====================================================================

    setSaveHandler(callback, btnText = 'Lưu') {
        const node = this.#getActiveNode();
        const btn = this._getBtnSave(node.id);
        if (!btn) return;

        this.setFooter(true);

        if (node.handlers.save) btn.removeEventListener('click', node.handlers.save);

        // Khóa đúp (Double-click protection) xịn xò
        node.handlers.save = async (e) => {
            e.preventDefault();
            btn.disabled = true;
            const originalText = btn.innerHTML;
            btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin me-2"></i>Đang xử lý...`;
            try {
                await callback(e);
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        };

        btn.addEventListener('click', node.handlers.save);
        btn.style.display = 'inline-block';
        btn.innerHTML = `<i class="fa-solid fa-check me-2"></i>${btnText}`;
    }

    setResetHandler(callback, btnText = 'Đặt lại') {
        const node = this.#getActiveNode();
        const btn = this._getBtnReset(node.id);
        if (!btn) return;

        this.setFooter(true);

        if (node.handlers.reset) btn.removeEventListener('click', node.handlers.reset);

        node.handlers.reset = (e) => callback(e);
        btn.addEventListener('click', node.handlers.reset);

        btn.style.display = 'inline-block';
        btn.innerHTML = `<i class="fa-solid fa-redo me-2"></i>${btnText}`;
    }

    setFooter(show = true) {
        const el = this._getEl(this.#getActiveNode().id);
        if (el) {
            const footer = el.querySelector('.modal-footer');
            if (footer) footer.style.display = show ? 'flex' : 'none';
        }
    }

    _resetButton(btn) {
        if (btn) {
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            newBtn.style.display = 'none';
        }
    }
    _initEscListener(id) {
        const el = this._getEl(id);
        const node = this.#getNode(id);
        if (!el || !node) return;

        if (node.escKeyHandler) document.removeEventListener('keydown', node.escKeyHandler);

        node.escKeyHandler = (e) => {
            if (e.key !== 'Escape') return;
            const focusedElement = document.activeElement;
            const isFormElement = focusedElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(focusedElement.tagName);
            if (isFormElement) return;

            // Xử lý tự đóng nếu là Node cao nhất
            if (this.#getActiveNode().id === id) this.hide();
        };
        document.addEventListener('keydown', node.escKeyHandler, { once: true });
    }

    _setupFullscreenButton(id) {
        const el = this._getEl(id);
        const node = this.#getNode(id);
        if (!el || !node) return;

        const btn = el.querySelector('.btn-fullscreen');
        const dialog = el.querySelector('.modal-dialog');
        if (!btn || !dialog) return;

        // ★ MỚI VỪA MỞ LÊN -> CANH GIỮA (Không animate để hiện ra là đứng ngay giữa luôn)
        el.addEventListener(
            'shown.bs.modal',
            () => {
                if (!node.fullscreen && !dialog.classList.contains('modal-fullscreen')) {
                    if (node.draggable && typeof node.draggable.resetPosition === 'function') {
                        node.draggable.resetPosition(false);
                    }
                }
            },
            { once: true }
        );

        if (node.fullscreenHandler) btn.removeEventListener('click', node.fullscreenHandler);

        node.fullscreenHandler = () => {
            const isFullscreen = dialog.classList.contains('modal-fullscreen') || node.fullscreen;
            if (node.draggable) {
                node.draggable.xOffset = 0;
                node.draggable.yOffset = 0;
                node.draggable.currentX = 0;
                node.draggable.currentY = 0;
            }

            if (isFullscreen) {
                dialog.classList.remove('modal-fullscreen');
                dialog.style.width = node.initialStyles.width || '';
                dialog.style.height = node.initialStyles.height || '';
                dialog.style.paddingBottom = '';
                dialog.style.transform = '';
                btn.querySelector('i').className = 'fa-solid fa-expand';
            } else {
                dialog.classList.add('modal-fullscreen');
                dialog.style.width = '100vw';
                dialog.style.height = '100vh';
                dialog.style.paddingBottom = '0';
                dialog.style.transform = 'none';
                btn.querySelector('i').className = 'fa-solid fa-compress';
            }
        };
        btn.addEventListener('click', node.fullscreenHandler);
    }

    // Thêm hàm này vào AModal
    _setupCenterButton(id) {
        const el = this._getEl(id);
        const node = this.#getNode(id);
        if (!el || !node) return;

        const btn = el.querySelector('.btn-center');
        const dialog = el.querySelector('.modal-dialog');
        if (!btn || !dialog) return;

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            // Nếu Modal đang Fullscreen thì nút này không có tác dụng
            if (dialog.classList.contains('modal-fullscreen')) return;

            // Gọi Draggable trượt nhẹ nhàng về giữa
            if (node.draggable && typeof node.draggable.resetPosition === 'function') {
                this.adaptAndCenter(id);
            }
        });
    }
    /**
     * Tự động co giãn Modal theo nội dung và đưa về giữa
     */
    adaptAndCenter(id) {
        const el = this._getEl(id);
        const node = this.#getNode(id);
        if (!el || !node) return;

        const dialog = el.querySelector('.modal-dialog');
        const content = el.querySelector('.modal-content');
        const body = this._getBody(id);

        if (!dialog || !content || !body) return;

        // 1. Gỡ bỏ giới hạn tạm thời để đo kích thước thật
        content.style.height = 'auto';

        // 2. Đo kích thước "ngầm" của nội dung (scrollHeight)
        const idealHeight = content.scrollHeight;
        const maxHeight = window.innerHeight * 0.9; // Giới hạn 90% màn hình

        // 3. Áp dụng kích thước mới (Co giãn thông minh)
        const finalHeight = Math.min(idealHeight, maxHeight);
        content.style.height = `${finalHeight}px`;

        // 4. Gọi hàm thần thánh của bạn để đưa nó về tâm màn hình
        if (node.draggable && typeof node.draggable.resetPosition === 'function') {
            // Gọi trượt mượt mà vì đây là thay đổi kích thước lúc đang làm việc
            node.draggable.resetPosition(true);
        }
    }

    _resetToDefaults(id) {
        const el = this._getEl(id);
        const node = this.#getNode(id);
        if (!el || !node) return;

        const dialog = el.querySelector('.modal-dialog');
        if (!dialog) return;

        if (node.draggable) {
            node.draggable.xOffset = 0;
            node.draggable.yOffset = 0;
            node.draggable.currentX = 0;
            node.draggable.currentY = 0;
        }

        dialog.style.transform = '';
        dialog.classList.remove('modal-fullscreen');
    }
}

const AModal = new DynamicModal();
export { AModal };
