/**
 * Module: ASelect (9Trip ERP Core)
 * Version: 1.4.0 (Enhanced Value/Text Fallback & Data-Val Sync)
 * Architecture: Declarative UI + Global Event Delegation + Static State Sync
 */

export default class ASelect {
  static instances = new Map();
  static fetchPromises = new Map(); // Bộ đệm để gộp các request DB trùng lặp

  constructor(selectEl, opts = {}) {
    this.autoInit = false;
    this.originalSelect = selectEl;
    this.opts = opts;

    this.dataSourceStr = opts.source || selectEl.dataset.source;
    this.isSearchable = opts.searchable !== undefined ? opts.searchable : selectEl.dataset.searchable === 'true';
    this.isCreatable = opts.creatable !== undefined ? opts.creatable : selectEl.dataset.creatable === 'true';
    this.onChangeCallback = opts.onChange || selectEl.dataset.onchange;

    // FIX CHỦ LỰC: Chụp ngay giá trị và text khởi tạo trước khi DOM bị thay đổi
    this.initialValue = selectEl.dataset?.val || selectEl.getAttribute('data-selected-value') || selectEl.value || '';
    const initialSelectedOption = selectEl.querySelector('option:checked');
    this.initialText = initialSelectedOption && initialSelectedOption.value !== '' ? initialSelectedOption.textContent : '-- Vui lòng chọn --';

    this.uid = 'smart_' + Math.random().toString(36).substr(2, 9);
    this.data = [];

    // DOM Elements
    this.wrapper = null;
    this.listContainer = null;
    this.toggleText = null;

    this.init(opts);
  }

  async init(opts) {
    try {
      this.originalSelect.setAttribute('data-smart-init', 'true');
      this.originalSelect.setAttribute('data-smart-id', this.uid);
      this.originalSelect.classList.add('d-none');

      this.buildUI();

      // TỐI ƯU 1: FAST-PATH (Đường cao tốc RAM)
      const syncData = this.checkSyncData(this.dataSourceStr);

      if (syncData) {
        this.data = this.mapData(syncData);
        this.renderList(this.data);
        this.updateSelectedUI();
      } else {
        await this.loadAndRenderDataAsync();
      }

      this.listenNativeEvents();
      ASelect.instances.set(this.uid, this);
    } catch (error) {
      console.error(`[ASelect] Lỗi khởi tạo cho ${this.dataSourceStr}:`, error);
    }
  }

  checkSyncData(source) {
    if (typeof source === 'object' && source !== null) return source;
    if (typeof source !== 'string' || !source.trim()) return null;
    try {
      const parts = source.trim().split('.');
      let current = window;
      for (const part of parts) {
        if (current && current[part] !== undefined) current = current[part];
        else return null;
      }
      if (typeof current === 'function' || current instanceof Promise) return null;
      return current;
    } catch (err) {
      return null;
    }
  }

  buildUI() {
    try {
      this.wrapper = document.createElement('div');

      const inheritedClasses = Array.from(this.originalSelect.classList)
        .filter((c) => !['smart-select', 'd-none', 'form-select'].includes(c))
        .join(' ');

      const isInTable = this.originalSelect.closest('td, th') !== null;

      this.wrapper.className = `smart-select-wrapper dropdown position-relative d-inline-block ${inheritedClasses}`;
      this.wrapper.setAttribute('data-smart-id', this.uid);

      const dataField = this.originalSelect.getAttribute('data-field');
      if (dataField) this.wrapper.setAttribute('data-field', dataField);

      let searchHTML = '';
      if (this.isSearchable || this.isCreatable) {
        searchHTML = `
                <div class="p-2 border-bottom sticky-top bg-white z-1">
                    <input type="text" class="form-control form-control-sm smart-search-input" placeholder="Tìm kiếm...">
                </div>`;
      }

      let createHTML = '';
      if (this.isCreatable) {
        createHTML = `
                <div class="p-1 border-top bg-light smart-create-wrapper d-none">
                    <button class="btn btn-sm btn-primary w-auto smart-create-btn" type="button">Tạo mới: <span class="fw-bold create-keyword"></span></button>
                </div>`;
      }

      const textClass = this.initialText === '-- Vui lòng chọn --' ? 'text-muted' : '';

      if (isInTable) {
        this.wrapper.style.minWidth = 'auto';
        this.wrapper.innerHTML = `
            <div class="smart-toggle-btn d-flex align-items-center w-100 h-100" tabindex="0" style="cursor: pointer; user-select: none; border: none !important; background-color: transparent !important; padding: 0 !important; outline: none; min-height: 24px;">
                <span class="smart-selected-text text-truncate d-block ${textClass}" style="max-width: 100%;">${this.initialText}</span> 
            </div>
            <div class="dropdown-menu shadow p-0 smart-dropdown-menu" data-smart-id="${this.uid}" style="max-height: 250px; overflow-y: auto; overflow-x: hidden; z-index: 1060 !important;">
                ${searchHTML}
                <ul class="list-unstyled mb-0 smart-list-container"></ul>
                ${createHTML}
            </div>`;
      } else {
        this.wrapper.style.minWidth = '120px';
        this.wrapper.innerHTML = `
            <div class="form-select form-select-sm smart-toggle-btn d-flex align-items-center" tabindex="0" style="cursor: pointer; user-select: none;">
                <span class="smart-selected-text text-truncate d-block ${textClass}" style="max-width: 95%;">${this.initialText}</span> 
            </div>
            <div class="dropdown-menu shadow p-0 smart-dropdown-menu" data-smart-id="${this.uid}" style="max-height: 250px; overflow-y: auto; overflow-x: hidden; z-index: 1060 !important;">
                ${searchHTML}
                <ul class="list-unstyled mb-0 smart-list-container"></ul>
                ${createHTML}
            </div>`;
      }

      this.listContainer = this.wrapper.querySelector('.smart-list-container');
      this.toggleText = this.wrapper.querySelector('.smart-selected-text');

      this.originalSelect.parentNode.insertBefore(this.wrapper, this.originalSelect.nextSibling);
    } catch (error) {
      console.error('[ASelect] Lỗi build UI:', error);
    }
  }

  async loadAndRenderDataAsync() {
    try {
      if (this.initialText === '-- Vui lòng chọn --') this.toggleText.textContent = 'Đang tải...';
      let rawData = await this.resolveDataSourceAsync(this.dataSourceStr);
      this.data = this.mapData(rawData);
      this.renderList(this.data);
      this.updateSelectedUI();
    } catch (error) {
      if (this.initialText === '-- Vui lòng chọn --') this.toggleText.textContent = 'Lỗi tải dữ liệu';
    }
  }

  async resolveDataSourceAsync(source) {
    if (typeof source === 'function') {
      try {
        return (await source()) || [];
      } catch (err) {
        return [];
      }
    }
    if (typeof source !== 'string' || !source.trim()) return [];

    const sourceStr = source.trim();

    try {
      const parts = sourceStr.split('.');
      let parent = window,
        current = window,
        found = true;
      for (let p of parts) {
        if (current && current[p] !== undefined) {
          parent = current;
          current = current[p];
        } else {
          found = false;
          break;
        }
      }
      if (found && typeof current === 'function') return (await current.call(parent)) || [];
    } catch (err) {}

    if (ASelect.fetchPromises.has(sourceStr)) {
      return await ASelect.fetchPromises.get(sourceStr);
    }

    const fetchTask = (async () => {
      try {
        let data = null;
        if (window.A && window.A.DB && window.A.DB.local && typeof window.A.DB.local.getCollection === 'function') {
          data = await window.A.DB.local.getCollection(sourceStr);
        }
        if (!data || (Array.isArray(data) && data.length === 0)) {
          if (window.A && window.A.DB && typeof window.A.DB.getCollection === 'function') {
            data = await window.A.DB.getCollection(sourceStr);
            if (data && data.length > 0 && window.A.DB.local) window.A.DB.local.putBatch(sourceStr, data);
          }
        }
        return data || [];
      } catch (dbError) {
        return [];
      } finally {
        ASelect.fetchPromises.delete(sourceStr);
      }
    })();

    ASelect.fetchPromises.set(sourceStr, fetchTask);
    return await fetchTask;
  }

  mapData(rawData) {
    try {
      if (!Array.isArray(rawData)) {
        if (typeof rawData === 'object' && rawData !== null) return Object.entries(rawData).map(([k, v]) => ({ id: k, text: String(v) }));
        return [];
      }
      return rawData.map((item) => {
        if (typeof item !== 'object') return { id: String(item), text: String(item) };
        const id = item.id || item.uid || item._id || item.value;
        const text = item.displayName || item.name || item.title || item.user_name || item.text || item.full_name || id;
        return { id: String(id), text: String(text) };
      });
    } catch (error) {
      return [];
    }
  }

  renderList(itemsToRender) {
    try {
      if (!itemsToRender.length) {
        this.listContainer.innerHTML = '<li class="p-2 text-muted text-center small">Không có dữ liệu</li>';
        this.originalSelect.innerHTML = '<option value=""></option>';
      } else {
        let listHtml = '';
        let optionsHtml = '<option value="">-- Vui lòng chọn --</option>';

        itemsToRender.forEach((item) => {
          listHtml += `<li class="px-3 py-2 border-bottom dropdown-item cursor-pointer smart-option text-wrap" data-value="${item.id}">${item.text}</li>`;
          optionsHtml += `<option value="${item.id}">${item.text}</option>`;
        });

        this.listContainer.innerHTML = listHtml;
        this.originalSelect.innerHTML = optionsHtml;
      }

      // BẢO VỆ DỮ LIỆU: Phục hồi giá trị cũ
      const valToSet = this.originalSelect.getAttribute('data-val') || this.originalSelect.getAttribute('data-selected-value') || this.initialValue;

      if (valToSet) {
        // BỔ SUNG MỚI: Kiểm tra xem valToSet có khớp với ID hoặc TEXT trong data không
        const matchedItem = itemsToRender.find((i) => String(i.id) === String(valToSet) || String(i.text) === String(valToSet));

        if (matchedItem) {
          const realId = matchedItem.id;
          this.originalSelect.value = realId;
          this.originalSelect.setAttribute('data-val', matchedItem.text); // YÊU CẦU 1: Lưu text vào data-val
          this.originalSelect.setAttribute('data-selected-value', realId);
        } else if (this.initialText !== '-- Vui lòng chọn --') {
          const hiddenOpt = document.createElement('option');
          hiddenOpt.value = valToSet;
          hiddenOpt.textContent = this.initialText;
          hiddenOpt.selected = true;
          hiddenOpt.style.display = 'none';

          this.originalSelect.appendChild(hiddenOpt);
          this.originalSelect.value = valToSet;
          this.originalSelect.setAttribute('data-val', this.initialText); // YÊU CẦU 1: Lưu text vào data-val
          this.originalSelect.setAttribute('data-selected-value', valToSet);
        }
      }
    } catch (error) {
      console.error('[ASelect] Lỗi render list:', error);
    }
  }

  listenNativeEvents() {
    try {
      this.originalSelect.addEventListener('change', (e) => {
        this.updateSelectedUI();
        this.triggerOnChange(e.target.value);
      });
    } catch (error) {
      console.error('[ASelect] Lỗi khi gắn listener cho thẻ gốc:', error);
    }
  }

  async triggerOnChange(value) {
    if (!this.onChangeCallback) return;
    try {
      if (typeof window.executeDynamicFunction === 'function') {
        await window.executeDynamicFunction(this.onChangeCallback, [value, this.originalSelect, this]);
      } else if (typeof window.runFn === 'function') {
        await window.runFn(this.onChangeCallback, [value, this.originalSelect, this]);
      } else {
        console.warn('[ASelect] Chưa nạp utils.js chứa hàm executeDynamicFunction hoặc runFn');
      }
    } catch (error) {
      console.error(`[ASelect] Lỗi gọi hàm onChange:`, error);
    }
  }

  handleSearch(keyword) {
    try {
      keyword = keyword.toLowerCase().trim();
      const filtered = this.data.filter((item) => item.text.toLowerCase().includes(keyword));
      this.renderList(filtered);

      if (this.isCreatable) {
        const createWrapper = this.wrapper.querySelector('.smart-create-wrapper');
        const keywordSpan = this.wrapper.querySelector('.create-keyword');

        const canCreate = window.COLL_MANIFEST && Array.isArray(window.COLL_MANIFEST) && window.COLL_MANIFEST.includes(this.dataSourceStr);

        if (keyword.length > 0 && filtered.length === 0 && canCreate) {
          createWrapper.classList.remove('d-none');
          keywordSpan.textContent = keyword;
        } else {
          createWrapper.classList.add('d-none');
        }
      }
    } catch (error) {}
  }

  async handleCreateNew(keyword) {
    try {
      const source = this.dataSourceStr;
      const hasPermission = window.COLL_MANIFEST && Array.isArray(window.COLL_MANIFEST) && window.COLL_MANIFEST.includes(source);

      if (!hasPermission) {
        if (window.Swal) {
          Swal.fire({
            title: 'Giới hạn quyền hạn',
            text: `Tài khoản của bạn không có quyền thêm dữ liệu vào mục "${source}".`,
            icon: 'warning',
            confirmButtonColor: '#3085d6',
          });
        }
        return;
      }

      if (window.Swal) {
        const confirm = await window.Swal.fire({
          title: 'Xác nhận tạo mới',
          html: `Bạn muốn thêm <b>${keyword}</b> vào danh sách <b>${source}</b>?`,
          icon: 'question',
          showCancelButton: true,
          confirmButtonText: 'Đồng ý',
          cancelButtonText: 'Hủy',
        });

        if (confirm.isConfirmed) {
          if (window.A && window.A.UI && typeof window.A.UI.renderForm === 'function') {
            const prefillData = { name: keyword, title: keyword };
            await window.A.UI.renderForm(source, prefillData, `Thêm mới ${source}`, {});
          }
        }
      }
    } catch (error) {
      console.error('[ASelect] Lỗi thực thi handleCreateNew:', error);
    }
  }

  setValue(val) {
    try {
      // YÊU CẦU 2: Xử lý fallback tìm theo text nếu không tìm thấy value
      const matchedItem = this.data.find((item) => String(item.id) === String(val) || String(item.text) === String(val));
      const finalVal = matchedItem ? matchedItem.id : val;

      this.originalSelect.value = finalVal;
      this.originalSelect.setAttribute('data-val', matchedItem ? matchedItem.text : val); // YÊU CẦU 1
      this.originalSelect.setAttribute('data-selected-value', finalVal);
      this.originalSelect.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (error) {
      console.error('[ASelect] Lỗi set value:', error);
    }
  }

  updateSelectedUI() {
    try {
      const val = this.originalSelect.value;

      // YÊU CẦU 2: Tìm theo id, NẾU KHÔNG CÓ thì tìm tiếp theo text
      const selectedItem = this.data.find((item) => String(item.id) === String(val) || String(item.text) === String(val));

      if (selectedItem) {
        this.toggleText.textContent = selectedItem.text;
        this.toggleText.classList.remove('text-muted');

        // AUTO-CORRECTION: Nếu giá trị gốc đang là Text, hãy tự động sửa lại thành ID chuẩn cho thẻ select
        if (String(selectedItem.id) !== String(val)) {
          this.originalSelect.value = selectedItem.id;
          this.originalSelect.setAttribute('data-selected-value', selectedItem.id);
        }
        this.originalSelect.setAttribute('data-val', selectedItem.text); // YÊU CẦU 1
      } else {
        const nativeOption = this.originalSelect.querySelector(`option[value="${val}"]`);
        if (nativeOption && val !== '') {
          this.toggleText.textContent = nativeOption.textContent;
          this.toggleText.classList.remove('text-muted');
          this.originalSelect.setAttribute('data-val', nativeOption.textContent); // YÊU CẦU 1
        } else {
          this.toggleText.textContent = '-- Vui lòng chọn --';
          this.toggleText.classList.add('text-muted');
          this.originalSelect.setAttribute('data-val', ''); // YÊU CẦU 1
        }
      }
    } catch (error) {}
  }

  static initDOMWatcher() {
    try {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((m) =>
          m.addedNodes.forEach((node) => {
            if (node.nodeType === 1) {
              if (node.matches('select.smart-select:not([data-smart-init])')) new ASelect(node);
              node.querySelectorAll('select.smart-select:not([data-smart-init])').forEach((el) => new ASelect(el));
            }
          })
        );
      });
      observer.observe(document.body, { childList: true, subtree: true });
      document.querySelectorAll('select.smart-select:not([data-smart-init])').forEach((el) => new ASelect(el));
    } catch (error) {}
  }

  static initGlobalEvents() {
    try {
      document.body.addEventListener('click', (e) => {
        const target = e.target;
        const optionEl = target.closest('.smart-option');
        if (optionEl) {
          const menu = optionEl.closest('.smart-dropdown-menu');
          const instance = ASelect.instances.get(menu.getAttribute('data-smart-id'));
          if (instance) {
            instance.setValue(optionEl.getAttribute('data-value'));
            menu.classList.remove('show');
          }
          return;
        }

        const toggleBtn = target.closest('.smart-toggle-btn');
        if (toggleBtn) {
          const wrapper = toggleBtn.closest('.smart-select-wrapper');
          const uid = wrapper.getAttribute('data-smart-id');
          let menu = document.querySelector(`.smart-dropdown-menu[data-smart-id="${uid}"]`);
          const isShowing = menu.classList.contains('show');

          document.querySelectorAll('.smart-dropdown-menu.show').forEach((m) => m.classList.remove('show'));

          if (!isShowing) {
            if (menu.parentNode !== document.body) document.body.appendChild(menu);
            const rect = wrapper.getBoundingClientRect();
            menu.style.position = 'absolute';
            menu.style.top = `${rect.bottom + window.scrollY}px`;
            menu.style.left = `${rect.left + window.scrollX}px`;
            menu.style.width = `${rect.width}px`;
            menu.classList.add('show');

            const searchInput = menu.querySelector('.smart-search-input');
            if (searchInput) {
              searchInput.value = '';
              setTimeout(() => searchInput.focus(), 50);
            }
          }
          return;
        }

        const createBtn = target.closest('.smart-create-btn');
        if (createBtn) {
          const menu = createBtn.closest('.smart-dropdown-menu');
          const instance = ASelect.instances.get(menu.getAttribute('data-smart-id'));
          if (instance) {
            const keyword = menu.querySelector('.smart-search-input').value.trim();
            menu.classList.remove('show');
            instance.handleCreateNew(keyword);
          }
          return;
        }

        if (!target.closest('.smart-select-wrapper') && !target.closest('.smart-dropdown-menu')) {
          document.querySelectorAll('.smart-dropdown-menu.show').forEach((m) => m.classList.remove('show'));
        }
      });

      document.body.addEventListener('input', (e) => {
        if (e.target.matches('.smart-search-input')) {
          const menu = e.target.closest('.smart-dropdown-menu');
          const instance = ASelect.instances.get(menu.getAttribute('data-smart-id'));
          if (instance) instance.handleSearch(e.target.value);
        }
      });

      window.addEventListener(
        'scroll',
        (e) => {
          if (e.target && e.target.nodeType === 1 && e.target.closest('.smart-dropdown-menu')) {
            return;
          }
          document.querySelectorAll('.smart-dropdown-menu.show').forEach((m) => m.classList.remove('show'));
        },
        { passive: true, capture: true }
      );
    } catch (error) {}
  }

  static syncData(collectionName) {
    try {
      if (!collectionName) return;
      ASelect.instances.forEach((instance, uid) => {
        if (!document.body.contains(instance.originalSelect)) {
          ASelect.instances.delete(uid);
          return;
        }
        if (instance.dataSourceStr === collectionName) {
          instance.loadAndRenderDataAsync();
          updateCount++;
        }
      });
    } catch (error) {}
  }
}

document.addEventListener('DOMContentLoaded', () => {
  ASelect.initDOMWatcher();
  ASelect.initGlobalEvents();
});

window.ASelect = ASelect;
