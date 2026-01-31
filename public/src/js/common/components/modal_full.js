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
