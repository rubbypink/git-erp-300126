import { DraggableSetup, TableResizeManager } from '../libs/ui_helper.js';
import { createFormBySchema, loadFormDataSchema } from './DBSchema.js';

const UI_RENDERER = {
  renderedTemplates: {},
  currentSaveHandler: null,
  COMPONENT_PATH: './src/components/',
  htmlCache: {},

  // Render Dashboard & Load Data
  init: async function (moduleManager) {
    await Promise.all([this.renderMainLayout(), this.renderTemplate('body', 'tpl_all.html', true, '.app-container')]);
    const role = CURRENT_USER.realrole ? CURRENT_USER.realrole : CURRENT_USER.role;
    log('UI: User Role:', role);
    if (!['acc', 'acc_thenice', 'ketoan'].includes(role)) {
      const [headerModule, chromeMenu, footerModule] = await Promise.all([moduleManager.loadModule('ErpHeaderMenu'), moduleManager.loadModule('ChromeMenuController', false), moduleManager.loadModule('ErpFooterMenu')]);
      if (headerModule) new headerModule();
      A.call('ChromeMenuController', 'init', role);
      const mainErpFooter = new footerModule('erp-main-footer');
      mainErpFooter.init();
    } else {
      const [headerModule, chromeMenu] = await Promise.all([moduleManager.loadModule('ErpHeaderMenu'), moduleManager.loadModule('ChromeMenuController', false)]);
      if (headerModule) new headerModule();
      A.call('ChromeMenuController', 'init', role);
    }

    log('[UI MODULE]✅ UI Initialization completed.');
  },
  renderMainLayout: async function (source = 'main_layout.html', containerSelector = '#main-app') {
    let finalSourcePath = source;

    // Nếu là file HTML ngắn gọn (vd: 'tpl_all.html'), tự động thêm path
    if (source.endsWith('.html') && !source.includes('/')) {
      finalSourcePath = this.COMPONENT_PATH + source;
    }
    const container = document.querySelector(containerSelector);
    if (!container) {
      console.error('❌ Không tìm thấy container: ' + containerSelector);
      return;
    }

    try {
      container.innerHTML = ''; // Xóa nội dung cũ nếu có
      // 1. Lấy nội dung template (Sử dụng cache nếu đã tải)
      let html;
      if (this.htmlCache[finalSourcePath]) {
        html = this.htmlCache[finalSourcePath];
      } else {
        const response = await fetch(finalSourcePath);
        if (!response.ok) throw new Error(`Không thể tải template tại ${finalSourcePath}: HTTP ${response.status}`);
        html = await response.text();
        this.htmlCache[finalSourcePath] = html; // Lưu cache
      }

      // 2. Chèn vào đầu container (afterbegin)
      // 'afterbegin' giúp layout chính (Sidebar/Header) luôn nằm trên cùng
      // trước khi các module Sales/Op render dữ liệu vào bên trong.
      container.insertAdjacentHTML('afterbegin', html);

      log('✅ Đã render Main Layout thành công', 'success');
    } catch (error) {
      log('🔥 Lỗi Render Layout: ' + error.message, 'danger');
    } finally {
      showLoading(false);
    }
  },

  /**
   * HÀM RENDER ĐA NĂNG (SMART RENDER)
   * @param {string} targetId - ID của container cha (hoặc 'body')
   * @param {string} source - Có thể là DOM ID ('tmpl-form') HOẶC File Path ('form.html')
   * @param {boolean} force - True: Bắt buộc render lại (xóa cũ)
   * @param {string} positionRef - Selector của phần tử mốc để chèn (dùng khi insertAdjacent)
   * @param {string} mode - 'replace' (ghi đè), 'append' (nối đuôi), 'prepend' (lên đầu)
   */
  renderTemplate: async function (targetId, source, force = false, positionRef = null, mode = 'replace') {
    // 1. CHUẨN HÓA SOURCE KEY (QUAN TRỌNG NHẤT)
    // Phải xác định unique key ngay từ đầu để check và save thống nhất
    let finalSourcePath = source;

    // Nếu là file HTML ngắn gọn (vd: 'tpl_all.html'), tự động thêm path
    if (source.endsWith('.html') && !source.includes('/')) {
      finalSourcePath = this.COMPONENT_PATH + source;
    }

    // 2. Guard Clause: Kiểm tra dựa trên FINAL PATH
    if (this.renderedTemplates[finalSourcePath] && !force && mode === 'replace') {
      return true; // Trả về true giả lập là đã xong
    }

    // 3. Xác định nội dung (Content)
    let contentFragment = null;

    // CASE A: Source là File Path (.html)
    if (finalSourcePath.endsWith('.html')) {
      try {
        let htmlString = '';

        // Kiểm tra Cache RAM (Nội dung file)
        if (this.htmlCache[finalSourcePath]) {
          htmlString = this.htmlCache[finalSourcePath];
        } else {
          // 1. Fetch Network với validations
          const response = await fetch(finalSourcePath);

          // 1a. Kiểm tra HTTP Status
          if (!response.ok) {
            throw new Error(`HTTP ${response.status} - Không tìm thấy file: ${finalSourcePath}`);
          }

          // 1b. Kiểm tra Content-Type (phải là HTML)
          const contentType = response.headers.get('content-type') || '';
          if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
            console.warn(`⚠️ Content-Type không phải HTML: ${contentType} cho file ${finalSourcePath}`);
          }

          htmlString = await response.text();

          // 1c. Xác nhận không phải fallback index.html
          // Note: SPA thường return index.html với status 200 để xử lý routing
          const isIndexFallback = htmlString.includes('id="app-launcher"') || htmlString.includes('id="main-app"') || (htmlString.includes('<!DOCTYPE html>') && !htmlString.includes('<template') && !htmlString.includes('tpl-'));

          if (isIndexFallback) {
            throw new Error(`Fallback index.html (SPA) thay vì template component: ${finalSourcePath}`);
          }

          // 1d. Xác nhận nội dung không rỗng
          if (!htmlString.trim()) {
            throw new Error(`File trống: ${finalSourcePath}`);
          }

          this.htmlCache[finalSourcePath] = htmlString; // Lưu cache nội dung
        }

        // 2. Tạo div ảo để chứa HTML
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlString;

        // 3. Tạo Fragment để chứa kết quả
        contentFragment = document.createDocumentFragment();

        // 4. Chuyển TOÀN BỘ nội dung từ tempDiv sang Fragment
        // Cách này sẽ giữ nguyên mọi thứ: div, span, và cả thẻ <template>
        while (tempDiv.firstChild) {
          contentFragment.appendChild(tempDiv.firstChild);
        }
      } catch (e) {
        console.error(`❌ Lỗi tải file ${finalSourcePath}:`, e.message);
        return false;
      }
    }
    // CASE B: Source là DOM ID (<template id="...">)
    else {
      const templateEl = document.getElementById(source); // ID thì dùng source gốc
      if (!templateEl) {
        return false;
      }
      contentFragment = templateEl.content.cloneNode(true);
      // Với ID, ta dùng ID làm key lưu trữ
      finalSourcePath = source;
    }

    // 4. Security Check & Container Handling
    let container;

    // --- SCENARIO 1: Render vào BODY ---
    if (targetId === 'body') {
      container = document.body;

      if (positionRef) {
        const refElement = container.querySelector(positionRef);
        if (refElement) {
          refElement.parentNode.insertBefore(contentFragment, refElement.nextSibling);
        } else {
          container.appendChild(contentFragment);
        }
      } else {
        // Chèn trước script đầu tiên để tránh lỗi JS loading
        const firstScript = container.querySelector('script');
        container.insertBefore(contentFragment, firstScript || container.lastChild);
      }
    }
    // --- SCENARIO 2: Render vào Container ID ---
    else {
      container = document.getElementById(targetId);
      if (!container) {
        console.warn(`⚠️ Container not found: ${targetId}`);
        return contentFragment;
      }

      if (mode === 'replace') {
        container.innerHTML = '';
        container.appendChild(contentFragment);
      } else if (mode === 'prepend') {
        container.insertBefore(contentFragment, container.firstChild);
      } else {
        // append
        container.appendChild(contentFragment);
      }
    }
    // 5. Đánh dấu Flag (Sử dụng KEY ĐÃ CHUẨN HÓA)
    this.renderedTemplates[finalSourcePath] = true;

    return true;
  },
  // Hàm được gọi khi bấm chuyển Tab (Hoặc Init)
  lazyLoad: function (tabId) {
    const tabEl = getE(tabId);
    if (!tabEl) {
      log(`Không tìm thấy Tab ID: ${tabId}`, 'error');
      return;
    }
    if (tabEl.dataset.isLoaded === 'true' && tabEl.innerHTML.trim() !== '') {
      log(`Tab ${tabId} đã được load trước đó. Bỏ qua.`, 'info');
      return;
    }
    const tmplId = tabId.replace('tab-', 'tmpl-');

    // 1. Luôn đảm bảo HTML được render trước
    this.renderTemplate(tabId, tmplId, false);

    // 2. Logic khởi tạo Component (Chạy ngay cả khi chưa có Data)
    // Ví dụ: Tạo Datepicker, Gán sự kiện click nút update...
    if (tabId === 'tab-dashboard') {
      // Setup tháng, ngày lọc... (Cần chạy ngay để user thấy form lọc)
      if (typeof initDashboard === 'function') initDashboard();
    }
    if (tabId === 'tab-form') {
      setupMainFormUI(APP_DATA.lists);
      const resizer = new TableResizeManager('tbl-booking-form');
      resizer.init();
    }

    if (tabId === 'tab-list') {
      // Vào tab list thì check xem có data chưa để vẽ bảng
      const tbody = document.getElementById('grid-body');
      if (APP_DATA && Object.values(APP_DATA.bookings) && tbody && tbody.innerHTML.trim() === '') {
        renderTableByKey('bookings');
        const resizer = new TableResizeManager('grid-table');
        resizer.init();
      }
    } else if (tabId === 'tab-log') {
      // Khi tab log vừa được render xong -> Lấy dữ liệu từ LS đắp vào
      if (typeof restoreLogsFromStorage === 'function') {
        restoreLogsFromStorage();
      }
    }
    tabEl.dataset.isLoaded = 'true';
  },

  /**
   * Hàm thiết lập hành động cho nút Save của Modal
   * @param {Function} newActionFunc - Hàm logic bạn muốn chạy khi bấm Save
   */
  bindBtnEvent: function (newActionFunc, btnId, btnText = null) {
    let btn = getE(btnId);

    if (!btn) {
      log(`Không tìm thấy nút nào của ${btnId} trong DOM!`, 'error');
      return;
    }

    // Gỡ bỏ event handler cũ nếu có
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    btn = newBtn;
    if (btnText) btn.textContent = btnText;

    // 2. SETUP: Gán hàm mới
    // Lưu ý: Ta nên bọc hàm logic trong 1 khối try-catch để an toàn
    this.currentSaveHandler = async function (e) {
      // Prevent Default nếu nút nằm trong form
      e.preventDefault();

      // Disable nút để tránh bấm liên tục (Double Submit)
      btn.disabled = true;
      const currentBtnHTML = btn.innerHTML;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang xử lý...';

      try {
        // Chạy hàm logic được truyền vào
        await newActionFunc(e);
      } catch (err) {
        Opps('Lỗi hàm bindBtnEvent: ', err);
        logA('Có lỗi xảy ra: ' + err.message);
      } finally {
        // Mở lại nút sau khi xong (hoặc tùy logic đóng modal của bạn)
        btn.disabled = false;
        btn.innerHTML = currentBtnHTML;
      }
    };

    btn.addEventListener('click', this.currentSaveHandler);
    log('Đã gán sự kiện mới cho Btn Save Modal.');
  },
  resetForm: function (e) {
    const form = e.target.closest('form') || $('form', getE('dynamic-modal-body'));
    if (form) {
      form.reset();
    }
  },
  renderModal: async function (tmplId, title, btnSaveHandler = null, btnResetHandler = null) {
    try {
      const modalContent = await this.renderTemplate(null, tmplId);

      A.Modal.render(modalContent, title);
      if (btnSaveHandler) {
        A.Modal.setSaveHandler(btnSaveHandler, 'Lưu');
      }
      if (btnResetHandler) {
        A.Modal.setResetHandler(btnResetHandler);
      } else A.Modal.setResetHandler(this.resetForm, 'Đặt Lại');
      return A.Modal;
    } catch (e) {
      Opps('Lỗi trong renderModal: ', e);
    }
  },
  renderForm: async function (collection, dataorId = null) {
    const html = await createFormBySchema(collection);
    A.Modal.render(html, null); // Có thể tùy chỉnh title theo collection hoặc formId nếu muốn
    A.Modal.show();
    if (dataorId) {
      const formId = `${collection}-schema-form`;
      // Tải dữ liệu vào form trước khi render modal
      await loadFormDataSchema(formId.toString(), dataorId);
    }
    A.Modal.setFooter(false);
  },
  renderBtn(label, action = '', color = 'primary', icon = '', isSmall = true) {
    const sizeClass = isSmall ? 'btn-sm' : '';
    const iconHtml = icon ? `<i class="${icon}" aria-hidden="true"></i> ` : '';

    return `
			<button 
				type="button" 
				class="btn btn-${color} ${sizeClass} d-inline-flex align-items-center gap-2"
				onclick="${action}"
				aria-label="${label}"
			>
				${iconHtml}
				<span>${label}</span>
			</button>`;
  },
  renderFormInput(label, id, type = 'text', value = '', isSmall = true, placeholder = '') {
    const sizeClass = isSmall ? 'form-control-sm' : '';
    return `
		  <div class="mb-2">
			<label for="${id}" class="form-label fw-bold mb-0 ${isSmall ? 'small' : ''}">${label}</label>
			<input 
			  type="${type}" 
			  class="form-control ${sizeClass}" 
			  id="${id}" 
			  value="${value}" 
			  placeholder="${placeholder}"
			>
		  </div>`;
  },
  renderTblInput(fieldName, type = 'text', changeHandler = null, value = '', isSmall = true, placeholder = '') {
    const sizeClass = isSmall ? 'form-control-sm' : '';
    let numberClass;
    if (type === 'number') {
      type = 'text'; // Giữ nguyên text để dễ format số
      numberClass = ' number-only';
    }
    if (changeHandler) {
      changeHandler = `onchange="${changeHandler}(this)"`;
    }
    return (
      `
			<input 
			  type="${type}" 
			  class="form-control ${sizeClass}${numberClass || ''}" 
			  data-field="${fieldName}" 
			  value="${value}" 
			  placeholder="${placeholder}"
			>` + (changeHandler ? ` ${changeHandler}` : '')
    );
  },
};

export default UI_RENDERER;
