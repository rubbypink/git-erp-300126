/**
 * Module: ASelect (9Trip ERP Core)
 * Version: 1.6.1 (Enhanced Event Handling & UI Sync)
 * Architecture: Declarative UI + Global Event Delegation + Static State Sync
 *
 * @class ASelect
 * @description Thành phần Select thông minh hỗ trợ tìm kiếm, tạo mới, chỉnh sửa và đồng bộ dữ liệu.
 */
export default class ASelect {
  /** @type {Map<string, ASelect>} Lưu trữ các instance theo UID */
  static instances = new Map();
  /** @type {Map<string, Promise>} Bộ đệm để gộp các request DB trùng lặp */
  static fetchPromises = new Map();

  /**
   * @constructor
   * @param {HTMLSelectElement} selectEl - Thẻ select gốc
   * @param {Object} opts - Cấu hình tùy chọn
   * @param {string|Function} [opts.source] - Nguồn dữ liệu (collection name, path, hoặc function)
   * @param {boolean} [opts.searchable] - Cho phép tìm kiếm
   * @param {boolean} [opts.creatable] - Cho phép tạo mới khi không tìm thấy
   * @param {boolean} [opts.editable] - Cho phép chỉnh sửa text của option đã chọn
   * @param {Function|string} [opts.onChange] - Callback khi thay đổi giá trị
   * @param {Function|string} [opts.onCreate] - Callback khi tạo mới
   * @param {Function|string} [opts.onUpdate] - Callback khi cập nhật
   */
  constructor(selectEl, opts = {}) {
    this.autoInit = false;
    this.originalSelect = selectEl;
    this.opts = opts;

    this.dataSourceStr = opts.source || selectEl.dataset.source;
    this.isSearchable = opts.searchable !== undefined ? opts.searchable : selectEl.dataset.searchable === 'true';
    this.isCreatable = opts.creatable !== undefined ? opts.creatable : selectEl.dataset.creatable === 'true';
    this.isEditable = opts.editable !== undefined ? opts.editable : selectEl.dataset.editable === 'true';

    this.onChangeCallback = opts.onChange || selectEl.dataset.onchange || selectEl.onchange;
    this.onCreateCallback = opts.onCreate || selectEl.dataset.oncreate || selectEl.oncreate;
    this.onUpdateCallback = opts.onUpdate || selectEl.dataset.onupdate || selectEl.onupdate;

    // Flag chống vòng lặp vô hạn khi source là function
    this.isResolving = false;

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

  /**
   * Khởi tạo component
   * @param {Object} opts
   */
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

  /**
   * Kiểm tra xem source có phải là dữ liệu đồng bộ (Object/Array) có sẵn không
   * @param {*} source
   * @returns {Object|Array|null}
   */
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

  /**
   * Xây dựng giao diện người dùng
   */
  buildUI() {
    try {
      this.wrapper = document.createElement('div');

      const inheritedClasses = Array.from(this.originalSelect.classList)
        .filter((c) => !['smart-select', 'd-none', 'form-select'].includes(c))
        .join(' ');

      const isInTable = this.originalSelect.closest('td, th') !== null;

      this.wrapper.className = `smart-select-wrapper w-100 dropdown position-relative d-inline-block ${inheritedClasses}`;
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

      // Icon edit nếu editable
      const editIconHTML = this.isEditable ? `<i class="bi bi-pencil-square ms-2 text-primary smart-edit-icon cursor-pointer" title="Sửa tên"></i>` : '';

      // Input để sửa trực tiếp
      const editInputHTML = this.isEditable ? `<input type="text" class="form-control form-control-sm smart-edit-input d-none" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 5;">` : '';

      if (isInTable) {
        this.wrapper.style.minWidth = 'auto';
        this.wrapper.innerHTML = `
            <div class="smart-toggle-btn d-flex align-items-center justify-content-center w-100 h-100" tabindex="0" style="cursor: pointer; user-select: none; border: none !important; background-color: transparent !important; padding: 0 !important; outline: none; min-height: 24px;">
                <span class="smart-selected-text text-truncate d-block ${textClass} mx-auto" style="max-width: 100%;">${this.initialText}</span> 
                ${editIconHTML}
            </div>
            ${editInputHTML}
            <div class="dropdown-menu shadow p-0 smart-dropdown-menu" data-smart-id="${this.uid}" style="max-height: 250px; overflow-y: auto; overflow-x: hidden; z-index: 1060 !important;">
                ${searchHTML}
                <ul class="list-unstyled mb-0 smart-list-container"></ul>
                ${createHTML}
            </div>`;
      } else {
        this.wrapper.style.minWidth = '120px';
        this.wrapper.innerHTML = `
            <div class="form-select form-select-sm smart-toggle-btn d-flex align-items-center" tabindex="0" style="cursor: pointer; user-select: none;">
                <span class="smart-selected-text text-truncate d-block ${textClass}" style="max-width: 90%;">${this.initialText}</span> 
                ${editIconHTML}
            </div>
            ${editInputHTML}
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

  /**
   * Tải dữ liệu bất đồng bộ và render
   */
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

  /**
   * Phân giải nguồn dữ liệu (Function, Path, hoặc Collection)
   * @param {*} source
   * @returns {Promise<Array>}
   */
  async resolveDataSourceAsync(source) {
    if (this.isResolving) return [];
    this.isResolving = true;

    try {
      // 1. Nếu source là function thực thụ (truyền qua opts)
      if (typeof source === 'function') {
        return (await source()) || [];
      }

      if (typeof source !== 'string' || !source.trim()) return [];
      const sourceStr = source.trim();

      // 2. Nếu source là string trỏ đến function trong window (VD: MyModule.getData)
      const parts = sourceStr.split('.');
      let parent = window,
        current = window,
        found = true;
      for (let p of parts) {
        // Xử lý trường hợp path có mảng: collection[id]
        const arrayMatch = p.match(/^(.+)\[(.+)\]$/);
        if (arrayMatch) {
          const coll = arrayMatch[1];
          const id = arrayMatch[2];
          if (current && current[coll] !== undefined) {
            parent = current[coll];
            current = current[coll][id];
          } else {
            found = false;
            break;
          }
        } else {
          if (current && current[p] !== undefined) {
            parent = current;
            current = current[p];
          } else {
            found = false;
            break;
          }
        }
      }

      if (found && typeof current === 'function') {
        return (await current.call(parent)) || [];
      }

      // 3. Hỗ trợ lấy dữ liệu từ path: collection.field hoặc collection[id].field
      // Nếu found và current không phải function, có thể nó là dữ liệu trực tiếp từ path
      if (found && current !== window && current !== undefined) {
        if (Array.isArray(current)) return current;
        if (typeof current === 'object' && current !== null) return current;
      }

      // 4. Xử lý lấy từ DB (Collection hoặc Path Firestore)
      if (ASelect.fetchPromises.has(sourceStr)) {
        return await ASelect.fetchPromises.get(sourceStr);
      }

      const fetchTask = (async () => {
        try {
          let data = null;
          const db = window.A?.DB;
          if (!db) return [];

          // Phân tích path: collection.field hoặc collection[id].field
          const pathParts = sourceStr.match(/^(.+?)(\[(.+?)\])?\.(.+)$/);
          if (pathParts) {
            const collection = pathParts[1];
            const docId = pathParts[3];
            const field = pathParts[4];

            if (docId) {
              // collection[id].field -> Lấy field từ 1 doc cụ thể
              const doc = await db.getDoc(collection, docId);
              data = doc ? doc[field] : null;
            } else {
              // collection.field -> Lấy field từ tất cả docs trong collection
              const docs = await db.getCollection(collection);
              data = docs ? docs.map((d) => d[field]).filter((v) => v !== undefined) : [];
            }
          } else {
            // Collection đơn giản
            if (db.local && typeof db.local.getCollection === 'function') {
              data = await db.local.getCollection(sourceStr);
            }
            if (!data || (Array.isArray(data) && data.length === 0)) {
              if (typeof db.getCollection === 'function') {
                data = await db.getCollection(sourceStr);
                if (data && data.length > 0 && db.local) db.local.putBatch(sourceStr, data);
              }
            }
          }
          return data || [];
        } catch (dbError) {
          console.error(`[ASelect] DB Error for ${sourceStr}:`, dbError);
          return [];
        } finally {
          ASelect.fetchPromises.delete(sourceStr);
        }
      })();

      ASelect.fetchPromises.set(sourceStr, fetchTask);
      return await fetchTask;
    } catch (err) {
      console.error(`[ASelect] resolveDataSourceAsync Error:`, err);
      return [];
    } finally {
      this.isResolving = false;
    }
  }

  /**
   * Chuẩn hóa dữ liệu về dạng {id, text}
   * @param {*} rawData
   * @returns {Array}
   */
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

  /**
   * Render danh sách options
   * @param {Array} itemsToRender
   */
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
        const matchedItem = itemsToRender.find((i) => String(i.id) === String(valToSet) || String(i.text) === String(valToSet));

        if (matchedItem) {
          const realId = matchedItem.id;
          this.originalSelect.value = realId;
          this.originalSelect.setAttribute('data-val', matchedItem.text);
          this.originalSelect.setAttribute('data-selected-value', realId);
        } else if (this.initialText !== '-- Vui lòng chọn --') {
          const hiddenOpt = document.createElement('option');
          hiddenOpt.value = valToSet;
          hiddenOpt.textContent = this.initialText;
          hiddenOpt.selected = true;
          hiddenOpt.style.display = 'none';

          this.originalSelect.appendChild(hiddenOpt);
          this.originalSelect.value = valToSet;
          this.originalSelect.setAttribute('data-val', this.initialText);
          this.originalSelect.setAttribute('data-selected-value', valToSet);
        }
      }
    } catch (error) {
      console.error('[ASelect] Lỗi render list:', error);
    }
  }

  /**
   * Lắng nghe sự kiện thay đổi trên thẻ select gốc
   */
  listenNativeEvents() {
    try {
      this.originalSelect.addEventListener('change', (e) => {
        // Đồng bộ UI khi giá trị thay đổi (từ người dùng hoặc từ code dispatch)
        this.updateSelectedUI();
        this.triggerOnChange(e.target.value);
      });
    } catch (error) {
      console.error('[ASelect] Lỗi khi gắn listener cho thẻ gốc:', error);
    }
  }

  /**
   * Kích hoạt callback onChange
   * @param {string} value
   */
  async triggerOnChange(value) {
    if (!this.onChangeCallback) return;
    try {
      let funcRef = this.onChangeCallback;
      if (typeof funcRef === 'string' && funcRef.trim() !== '') {
        if (funcRef.includes(';') || funcRef.includes('(') || funcRef.match(/\s/)) {
          try {
            const dynamicScript = new Function('value', 'selectEl', 'instance', funcRef);
            return await dynamicScript(value, this.originalSelect, this);
          } catch (err) {
            if (window.Opps) window.Opps('Lỗi khi chạy script nội tuyến:', err);
            return null;
          }
        }
      }
      if (typeof window.runFn === 'function') {
        await window.runFn(this.onChangeCallback, [value, this.originalSelect], this);
      } else {
        console.warn('[ASelect] Chưa nạp utils.js chứa hàm runFn');
      }
    } catch (error) {
      console.error(`[ASelect] Lỗi gọi hàm onChange:`, error);
    }
  }

  /**
   * Xử lý tìm kiếm trong danh sách
   * @param {string} keyword
   */
  handleSearch(keyword) {
    try {
      keyword = keyword.toLowerCase().trim();
      const filtered = this.data.filter((item) => item.text.toLowerCase().includes(keyword));
      this.renderList(filtered);

      if (this.isCreatable) {
        const createWrapper = this.wrapper.querySelector('.smart-create-wrapper');
        const keywordSpan = this.wrapper.querySelector('.create-keyword');

        // Kiểm tra quyền tạo mới dựa trên manifest hoặc cấu trúc source
        const canCreate = (window.COLL_MANIFEST && Array.isArray(window.COLL_MANIFEST) && window.COLL_MANIFEST.includes(this.dataSourceStr.split('.')[0])) || this.dataSourceStr.includes('.');

        if (keyword.length > 0 && filtered.length === 0 && canCreate) {
          createWrapper.classList.remove('d-none');
          keywordSpan.textContent = keyword;
        } else {
          createWrapper.classList.add('d-none');
        }
      }
    } catch (error) {}
  }

  /**
   * Xử lý tạo mới dữ liệu
   * @param {string} keyword
   */
  async handleCreateNew(keyword) {
    try {
      if (!keyword) return;

      // Ưu tiên 1: Chạy callback onCreate nếu có
      if (this.onCreateCallback) {
        const result = await window.runFn(this.onCreateCallback, [keyword, this.originalSelect, this], this);
        if (result === false) return; // Callback chặn việc tiếp tục
        if (result && typeof result === 'object') {
          // Nếu callback trả về object mới, dùng nó luôn
          await this.loadAndRenderDataAsync();
          this.setValue(result.id || result.uid || keyword);
          return;
        }
      }

      const source = this.dataSourceStr;
      const db = window.A?.DB;

      // Ưu tiên 2: Chạy DB save nếu có source hợp lệ
      if (db && typeof source === 'string' && source.trim()) {
        const pathParts = source.match(/^(.+?)(\[(.+?)\])?\.(.+)$/);
        let actionType = 'saveRecord';
        let collection = source;
        let docId = null;
        let field = null;

        if (pathParts) {
          collection = pathParts[1];
          docId = pathParts[3];
          field = pathParts[4];
          if (docId && field) actionType = 'arrayUnionField';
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
            try {
              if (actionType === 'arrayUnionField') {
                await db.arrayUnionField(collection, docId, field, keyword);
                if (window.logA) window.logA(`Đã thêm "${keyword}" vào ${field}`, 'success');
              } else {
                const prefillData = { name: keyword, title: keyword };
                if (window.A?.UI && typeof window.A.UI.renderForm === 'function') {
                  await window.A.UI.renderForm(collection, prefillData, `Thêm mới ${collection}`, {});
                } else {
                  await db.saveRecord(collection, prefillData);
                  if (window.logA) window.logA(`Đã tạo mới "${keyword}" trong ${collection}`, 'success');
                }
              }
              await this.loadAndRenderDataAsync();
              this.setValue(keyword);
              return;
            } catch (err) {
              if (window.Opps) window.Opps('Lỗi khi tạo mới dữ liệu:', err);
            }
          }
        }
      }

      // Ưu tiên 3: Chỉ thêm vào UI client
      const newItem = { id: keyword, text: keyword };
      this.data.push(newItem);
      this.renderList(this.data);
      this.setValue(keyword);
    } catch (error) {
      console.error('[ASelect] Lỗi thực thi handleCreateNew:', error);
    }
  }

  /**
   * Xử lý cập nhật dữ liệu (Editable)
   * @param {string} newText
   */
  async handleUpdate(newText) {
    try {
      const currentVal = this.originalSelect.value;
      if (!currentVal || !newText) return;

      const selectedItem = this.data.find((i) => String(i.id) === String(currentVal));
      if (!selectedItem || selectedItem.text === newText) return;

      // Ưu tiên 1: Chạy callback onUpdate nếu có
      if (this.onUpdateCallback) {
        const result = await window.runFn(this.onUpdateCallback, [currentVal, newText, this.originalSelect, this], this);
        if (result === false) return;
      }

      const source = this.dataSourceStr;
      const db = window.A?.DB;

      // Ưu tiên 2: Chạy DB update nếu có source hợp lệ
      if (db && typeof source === 'string' && source.trim()) {
        const collection = source.split('.')[0]; // Lấy collection chính

        try {
          // Giả định update field 'name' hoặc 'title' tùy schema
          const updateData = { name: newText, title: newText };
          await db.updateSingle(collection, currentVal, updateData);
          if (window.logA) window.logA(`Đã cập nhật thành "${newText}"`, 'success');

          await this.loadAndRenderDataAsync();
          return;
        } catch (err) {
          console.warn('[ASelect] Không thể update DB tự động, chuyển sang UI update:', err);
        }
      }

      // Ưu tiên 3: Chỉ cập nhật UI client
      selectedItem.text = newText;
      this.renderList(this.data);
      this.updateSelectedUI();
    } catch (error) {
      console.error('[ASelect] Lỗi thực thi handleUpdate:', error);
    }
  }

  /**
   * Cập nhật nguồn dữ liệu hoặc cấu hình mới cho instance
   * @param {string|Function} newSource
   * @param {Object} newOpts
   */
  async updateSource(newSource, newOpts = {}) {
    try {
      this.dataSourceStr = newSource || this.dataSourceStr;
      this.opts = { ...this.opts, ...newOpts };

      if (newOpts.searchable !== undefined) this.isSearchable = newOpts.searchable;
      if (newOpts.creatable !== undefined) this.isCreatable = newOpts.creatable;
      if (newOpts.editable !== undefined) this.isEditable = newOpts.editable;
      if (newOpts.onChange !== undefined) this.onChangeCallback = newOpts.onChange;
      if (newOpts.onCreate !== undefined) this.onCreateCallback = newOpts.onCreate;
      if (newOpts.onUpdate !== undefined) this.onUpdateCallback = newOpts.onUpdate;

      await this.loadAndRenderDataAsync();
    } catch (error) {
      console.error('[ASelect] Lỗi updateSource:', error);
    }
  }

  /**
   * Thiết lập giá trị cho select
   * @param {string} val
   */
  setValue(val) {
    try {
      const matchedItem = this.data.find((item) => String(item.id) === String(val) || String(item.text) === String(val));
      const finalVal = matchedItem ? matchedItem.id : val;

      this.originalSelect.value = finalVal;
      this.originalSelect.setAttribute('data-val', matchedItem ? matchedItem.text : val);
      this.originalSelect.setAttribute('data-selected-value', finalVal);

      // Đồng bộ UI trước khi dispatch event để các listener nhận được UI đã cập nhật
      this.updateSelectedUI();

      // Phát ra sự kiện change chuẩn để các listener bên ngoài (như form validation) nhận biết
      this.originalSelect.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    } catch (error) {
      console.error('[ASelect] Lỗi set value:', error);
    }
  }

  /**
   * Cập nhật giao diện hiển thị dựa trên giá trị hiện tại
   */
  updateSelectedUI() {
    try {
      const val = this.originalSelect.dataset.selected_value || this.originalSelect.value;
      const selectedItem = this.data.find((item) => String(item.id) === String(val) || String(item.text) === String(val));

      if (selectedItem) {
        this.toggleText.textContent = selectedItem.text;
        this.toggleText.classList.remove('text-muted');

        if (String(selectedItem.id) !== String(val)) {
          this.originalSelect.value = selectedItem.id;
          this.originalSelect.setAttribute('data-selected-value', selectedItem.id);
        }
        this.originalSelect.setAttribute('data-val', selectedItem.text);
      } else {
        const nativeOption = this.originalSelect.querySelector(`option[value="${val}"]`);
        if (nativeOption && val !== '') {
          this.toggleText.textContent = nativeOption.textContent;
          this.toggleText.classList.remove('text-muted');
          this.originalSelect.setAttribute('data-val', nativeOption.textContent);
        } else {
          this.toggleText.textContent = '-- Vui lòng chọn --';
          this.toggleText.classList.add('text-muted');
          this.originalSelect.setAttribute('data-val', '');
        }
      }
    } catch (error) {}
  }

  /**
   * Khởi tạo MutationObserver để tự động nạp ASelect cho các thẻ select mới
   */
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

  /**
   * Khởi tạo các sự kiện global cho dropdown
   */
  static initGlobalEvents() {
    try {
      document.body.addEventListener('click', (e) => {
        const target = e.target;

        // 1. Xử lý chọn option
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

        // 2. Xử lý click icon edit
        const editIcon = target.closest('.smart-edit-icon');
        if (editIcon) {
          const wrapper = editIcon.closest('.smart-select-wrapper');
          const instance = ASelect.instances.get(wrapper.getAttribute('data-smart-id'));
          if (instance) {
            const input = wrapper.querySelector('.smart-edit-input');
            const toggleBtn = wrapper.querySelector('.smart-toggle-btn');

            input.value = instance.toggleText.textContent;
            input.classList.remove('d-none');
            toggleBtn.classList.add('invisible');
            setTimeout(() => input.focus(), 50);
          }
          e.stopPropagation();
          return;
        }

        // 3. Xử lý toggle dropdown
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

        // 4. Xử lý nút tạo mới
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

        // 5. Click ra ngoài đóng dropdown và đóng edit mode
        if (!target.closest('.smart-select-wrapper') && !target.closest('.smart-dropdown-menu')) {
          document.querySelectorAll('.smart-dropdown-menu.show').forEach((m) => m.classList.remove('show'));

          // Đóng tất cả edit mode đang mở
          document.querySelectorAll('.smart-edit-input:not(.d-none)').forEach((input) => {
            const wrapper = input.closest('.smart-select-wrapper');
            const toggleBtn = wrapper.querySelector('.smart-toggle-btn');
            input.classList.add('d-none');
            toggleBtn.classList.remove('invisible');
          });
        }
      });

      // Xử lý sự kiện phím cho search và edit
      document.body.addEventListener('keydown', (e) => {
        const target = e.target;

        // Enter trong search input
        if (target.matches('.smart-search-input') && e.key === 'Enter') {
          const menu = target.closest('.smart-dropdown-menu');
          const createBtn = menu.querySelector('.smart-create-btn');
          if (createBtn && !menu.querySelector('.smart-create-wrapper').classList.contains('d-none')) {
            createBtn.click();
          } else {
            const firstOption = menu.querySelector('.smart-option');
            if (firstOption) firstOption.click();
          }
        }

        // Enter/Esc trong edit input
        if (target.matches('.smart-edit-input')) {
          const wrapper = target.closest('.smart-select-wrapper');
          const instance = ASelect.instances.get(wrapper.getAttribute('data-smart-id'));
          const toggleBtn = wrapper.querySelector('.smart-toggle-btn');

          if (e.key === 'Enter') {
            instance.handleUpdate(target.value.trim());
            target.classList.add('d-none');
            toggleBtn.classList.remove('invisible');
          } else if (e.key === 'Escape') {
            target.classList.add('d-none');
            toggleBtn.classList.remove('invisible');
          }
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

  /**
   * Đồng bộ lại dữ liệu cho tất cả các instance cùng source
   * @param {string} collectionName
   */
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
