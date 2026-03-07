import { DraggableSetup, Resizable, WindowMinimizer } from '../../libs/ui_helper.js';
// =========================================================================
// MODAL FULL COMPONENT
// =========================================================================
export class ModalFull extends HTMLElement {
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
                                <button type="button" class="btn-close" data-bs-dismiss="modal" style="font-size: 1.2rem;"></button>
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

  _getEl() {
    return this.querySelector('#dynamic-modal-full');
  }

  setupModal() {
    const modalEl = this._getEl();
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
    const btnResize = this._getEl().querySelector('#btnResizeModal');
    if (btnResize) {
      btnResize.addEventListener('click', () => this._toggleModalSize());
    }
  }

  _setupUI() {
    // Guard: Chỉ setup 1 lần để tránh duplicate event listeners
    if (this._uiInitialized) return;
    this._uiInitialized = true;

    const modalEl = this._getEl();
    if (!modalEl) return;

    if (DraggableSetup) {
      new DraggableSetup(modalEl, {
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
    const modalEl = this._getEl();
    const bst = bootstrap.Modal.getInstance(modalEl);
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
   * 1. Controller render: new A.HotelPriceController('dynamic-modal-full-body')
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
      this._getEl().classList.add(options.customClass);
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
