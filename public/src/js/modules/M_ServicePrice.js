class ServicePriceTable extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._items = [];
  }

  connectedCallback() {
    // Đảm bảo APP_DATA đã load
    if (!window.APP_DATA) window.APP_DATA = { lists: { types: [], serviceMatrix: [] } };
    this.render();
  }

  setData(data) {
    this._items = Array.isArray(data) ? data : [];
    if (this._items.length === 0) this.addItem();
    this.render();
  }

  getData() {
    // Lấy tất cả, nhưng chỉ trả về những dòng có Tên (để lưu DB cho sạch)
    return this._getSnapshot().filter((item) => item.name && item.name.trim() !== '');
  }
  // Hàm mới: Chụp lại dữ liệu thô trên màn hình (kể cả dòng chưa nhập tên)
  _getSnapshot() {
    const rows = this.shadowRoot.querySelectorAll('tr.data-row');
    const result = [];
    rows.forEach((tr) => {
      result.push({
        type: tr.querySelector('.inp-type').value,
        name: tr.querySelector('.inp-name').value, // Lấy nguyên văn
        from: tr.querySelector('.inp-from').value,
        to: tr.querySelector('.inp-to').value,
        adl: this._parseNumber(tr.querySelector('.inp-adl').value),
        chd: this._parseNumber(tr.querySelector('.inp-chd').value),
        note: tr.querySelector('.inp-note').value,
      });
    });
    return result;
  }

  // --- LOGIC: Lấy danh sách dịch vụ theo Type ---
  _getServiceOptions(type) {
    const svcMatrix = window.APP_DATA.lists.serviceMatrix || [];
    // Logic filter bạn cung cấp
    return svcMatrix
      .filter((r) => r[0] === type) // Cột 0 là Loại
      .map((r) => r[1]); // Cột 1 là Tên
  }

  // --- LOGIC: Update Datalist khi đổi Type ---
  _updateDatalist(type, datalistId) {
    const datalist = this.shadowRoot.getElementById(datalistId);
    if (!datalist) return;

    const options = this._getServiceOptions(type);
    datalist.innerHTML = options.map((name) => `<option value="${name}">`).join('');
  }

  addItem() {
    this._items = this._getSnapshot();

    const defaultType = window.APP_DATA.lists.types && window.APP_DATA.lists.types[3] ? window.APP_DATA.lists.types[3] : 'Vé';
    this._items.push({
      type: defaultType,
      name: '',
      from: '01/01',
      to: '31/12',
      adl: 0,
      chd: 0,
      note: '',
    });

    // BƯỚC 3: Vẽ lại
    this.render();
  }
  copyItem() {
    this._items = this._getSnapshot();
    const lastItem = this._items[this._items.length - 1];
    if (lastItem) {
      this._items.push({ ...lastItem }); // Sao chép nội dung của dòng cuối cùng
    } else {
      const defaultType = window.APP_DATA.lists.types && window.APP_DATA.lists.types[3] ? window.APP_DATA.lists.types[3] : 'Vé';
      this._items.push({
        type: defaultType,
        name: '',
        from: '01/01',
        to: '31/12',
        adl: 0,
        chd: 0,
        note: '',
      });
    }
    // BƯỚC 3: Vẽ lại
    this.render();
  }

  deleteItem(index) {
    // BƯỚC 1: Lưu dữ liệu hiện tại
    this._items = this._getSnapshot();

    // BƯỚC 2: Xóa
    this._items.splice(index, 1);

    // BƯỚC 3: Vẽ lại
    this.render();
  }

  _parseNumber(val) {
    return parseInt(val.replace(/\./g, '')) || 0;
  }
  _formatNumber(num) {
    return num ? num.toLocaleString() : '';
  }

  render() {
    // 1. Chuẩn bị Master Data Types
    const types = window.APP_DATA.lists.types.filter((t) => t && t !== 'Phòng') || ['Tour', 'Vé', 'Xe', 'Other'];

    const style = `
            <style>
                :host { display: block; font-family: system-ui, sans-serif; }
                table { width: 100%; border-collapse: collapse; min-width: 900px; }
                th { background: #f8f9fa; padding: 10px; border: 1px solid #dee2e6; font-size: 0.9rem; text-align:center; }
                td { padding: 5px; border: 1px solid #dee2e6; }
                input, select { width: 100%; padding: 6px; border: 1px solid #ced4da; border-radius: 4px; box-sizing: border-box; color: var(--text-color, #000); background: var(--tbl-row-bg, #fff); }
                input:focus, select:focus { outline: 2px solid #86b7fe; border-color: #86b7fe; }
                .text-end { text-align: right; }
                .text-center { text-align: center; }
                .btn-add { margin: 10px 0; padding: 8px 15px; background: #0d6efd; color: white; border: none; border-radius: 4px; cursor: pointer; }
                .btn-copy { margin: 10px 0; padding: 8px 15px; background: #13125a; color: white; border: none; border-radius: 4px; cursor: pointer; }
                .btn-del { color: red; cursor: pointer; background: none; border: none; font-size: 1.2rem; }
                /* Custom width */
                .col-type { width: 150px; } 
                .col-name { min-width: 250px; }
            </style>
        `;

    let rowsHtml = this._items
      .map((item, index) => {
        const datalistId = `list-svc-${index}`; // Tạo ID unique cho từng dòng

        // Generate Options cho Type Select
        const typeOptions = types.map((t) => `<option value="${t}" ${item.type === t ? 'selected' : ''}>${t}</option>`).join('');

        // Generate Options cho Service Name (Dựa trên Type hiện tại)
        const serviceOptions = this._getServiceOptions(item.type)
          .map((name) => `<option value="${name}">`)
          .join('');

        return `
            <tr class="data-row">
                <td>
                    <select class="inp-type" data-target="${datalistId}">
                        ${typeOptions}
                    </select>
                </td>
                <td>
                    <input type="text" class="inp-name" list="${datalistId}" value="${item.name}" placeholder="Chọn hoặc nhập tên...">
                    <datalist id="${datalistId}">
                        ${serviceOptions}
                    </datalist>
                </td>
                <td><input type="text" class="inp-from text-center" value="${item.from}"></td>
                <td><input type="text" class="inp-to text-center" value="${item.to}"></td>
                <td><input type="text" class="inp-adl text-end" value="${this._formatNumber(item.adl)}" onchange="this.value = this.value.replace(/[^0-9]/g, '').replace(/\\B(?=(\\d{3})+(?!\\d))/g, '.')"></td>
                <td><input type="text" class="inp-chd text-end" value="${this._formatNumber(item.chd)}" onchange="this.value = this.value.replace(/[^0-9]/g, '').replace(/\\B(?=(\\d{3})+(?!\\d))/g, '.')"></td>
                <td><input type="text" class="inp-note" value="${item.note || ''}"></td>
                <td class="text-center"><button class="btn-del" data-index="${index}">×</button></td>
            </tr>
            `;
      })
      .join('');

    this.shadowRoot.innerHTML = `
            ${style}
            <div style="overflow-x: auto;">
                <table>
                    <thead>
                        <tr>
                            <th class="col-type">Loại Dịch Vụ</th>
                            <th class="col-name">Tên Dịch Vụ</th>
                            <th style="width: 70px">Từ</th>
                            <th style="width: 70px">Đến</th>
                            <th style="width: 100px">NL</th>
                            <th style="width: 100px">TE</th>
                            <th>Ghi chú</th>
                            <th style="width: 40px">#</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            </div>
            <button class="btn-add">+ Thêm dòng</button>
            <button class="btn-copy">Copy dòng</button>
        `;

    this.attachEvents();
  }

  attachEvents() {
    this.shadowRoot.querySelector('.btn-add').addEventListener('click', () => this.addItem());
    this.shadowRoot.querySelector('.btn-copy').addEventListener('click', () => this.copyItem());

    this.shadowRoot.querySelectorAll('.btn-del').forEach((btn) => {
      btn.addEventListener('click', (e) => this.deleteItem(e.target.dataset.index));
    });

    // --- SỰ KIỆN QUAN TRỌNG: Change Type -> Update Name List ---
    this.shadowRoot.querySelectorAll('.inp-type').forEach((select) => {
      select.addEventListener('change', (e) => {
        const newType = e.target.value;
        const targetDatalistId = e.target.dataset.target;

        // Gọi hàm update nội dung thẻ <datalist>
        this._updateDatalist(newType, targetDatalistId);

        // (Optional) Có thể clear ô tên dịch vụ nếu muốn user chọn lại
        const row = e.target.closest('tr');
        row.querySelector('.inp-name').value = '';
      });
    });
  }
}
customElements.define('at-tbl-service-price', ServicePriceTable);

// ============================================================
// 2. CONTROLLER: Quản lý logic
// ============================================================
const DB_PATHS = {
  SUPPLIERS: 'suppliers',
  SERVICE_SCHEDULES: 'service_price_schedules', // Collection mới
};

export default class ServicePriceController {
  // =========================================================================
  // INTERNAL VARIABLES (Singleton Instance & Cache Management)
  // =========================================================================
  static _instance = null;
  static autoInit = false;
  static _cacheData = {
    suppliers: null,
    serviceSchedules: {}, // Map {docId: data}
  };

  constructor(containerId) {
    this._initialized = false;
    this.container = document.getElementById(containerId);
    if (!this.container) {
      const modalEl = document.createElement('at-modal-full');
      document.body.appendChild(modalEl);
      this.container = document.getElementById(containerId);
    }
    // ─────────────────────────────────────────────────────────────
    // Store event handler references for cleanup (prevent duplicate)
    // ─────────────────────────────────────────────────────────────
    this._eventHandlers = {
      onSupplierChange: null,
      onYearChange: null,
      onBtnLoadClick: null,
      onBtnSaveClick: null,
    };
  }

  /**
   * Initialize ServicePriceController instance (Singleton Pattern with Force Option)
   * @param {string} containerId - Container element ID
   * @param {boolean} isForce - Force create new instance (default: false)
   * @returns {ServicePriceController} - Instance of controller
   *
   * LOGIC:
   * - Nếu instance đã tồn tại && !isForce -> reuse instance cũ
   * - Nếu chưa có || isForce=true -> tạo instance mới
   * - LUÔN gọi initLayout() mỗi lần (để khôi phục DOM)
   */
  static init(containerId, isForce = false) {
    let instance;
    if (this._initialized && !isForce) {
      console.warn('[EventManager] Đã khởi tạo rồi, bỏ qua...');
      return;
    }
    this._initialized = true;
    // ─────────────────────────────────────────────────────────────
    // STEP 1: Determine instance (reuse old or create new)
    // ─────────────────────────────────────────────────────────────
    if (!isForce && ServicePriceController._instance) {
      instance = ServicePriceController._instance;
    } else {
      instance = new ServicePriceController(containerId);
      ServicePriceController._instance = instance;
    }

    // ─────────────────────────────────────────────────────────────
    // STEP 2: ALWAYS reinitialize layout (restore DOM)
    // ─────────────────────────────────────────────────────────────
    instance.initLayout();

    return instance;
  }

  /**
   * Clear singleton instance (Useful for testing or cleanup)
   */
  static clearInstance() {
    ServicePriceController._instance = null;
  }

  /**
   * Clear all cached data
   */
  static clearCache() {
    ServicePriceController._cacheData = {
      suppliers: null,
      serviceSchedules: {},
    };
  }

  initLayout() {
    const rootId = this.container.id;

    // CSS Scope
    this.container.innerHTML = `
            <style>
                #${rootId} .card-header { overflow: visible !important; height: auto !important; max-height: none !important; }
            </style>
            <div class="card shadow-sm h-100 d-flex flex-column">
                <div class="card-header p-3 border-bottom">
                    <div class="d-flex gap-2 align-items-center flex-wrap">
                        <h5 class="m-0 me-auto text-success"><i class="bi bi-ticket-perforated"></i> Bảng giá Dịch vụ</h5>
                        
                        <select id="sp-status" class="form-select form-select-sm fw-bold" style="width:120px">
                            <option value="actived" class="text-success">Actived</option>
                            <option value="pending" class="text-warning">Pending</option>
                            <option value="stopped" class="text-secondary">Stopped</option>
                        </select>

                        <button id="sp-btn-save" class="btn btn-success btn-sm">
                            <i class="bi bi-save"></i> Lưu
                        </button>
                    </div>

                    <div class="d-flex gap-2 mt-2 p-2 border rounded">
                        <select id="sp-supplier" class="form-select form-select-sm" style="max-width:250px"><option>Đang tải NCC...</option></select>
                        <select id="sp-year" class="form-select form-select-sm" style="width:100px">
                            <option value="2026">2026</option><option value="2027">2027</option>
                        </select>
                        <button id="sp-btn-load" class="btn btn-primary btn-sm"><i class="bi bi-download"></i> Load Giá</button>
                    </div>
                </div>

                <div class="card-body p-3 overflow-auto" style="background: var(--tbl-row-bg, #fff); color: var(--text-color, #000);">
                    <at-tbl-service-price id="sp-table"></at-tbl-service-price>
                </div>
            </div>
        `;

    this.table = this.container.querySelector('#sp-table');
    this.selSupplier = this.container.querySelector('#sp-supplier');
    this.selYear = this.container.querySelector('#sp-year');
    this.selStatus = this.container.querySelector('#sp-status');
    this.btnLoad = this.container.querySelector('#sp-btn-load');
    this.btnSave = this.container.querySelector('#sp-btn-save');

    // ─────────────────────────────────────────────────────────────
    // IMPORTANT: Remove old event listeners before attaching new ones
    // This prevents duplicate listeners when initLayout is called again
    // ─────────────────────────────────────────────────────────────
    this.detachEvents();
    this.attachEvents();
    this.initData();
  }

  async initData() {
    // ─────────────────────────────────────────────────────────────
    // STEP 1: Check cache first before fetching from Firestore
    // ─────────────────────────────────────────────────────────────
    const cache = ServicePriceController._cacheData;
    let suppliers;

    if (cache.suppliers !== null) {
      suppliers = cache.suppliers;
    } else {
      // Load NCC từ Global APP_DATA hoặc Firebase
      try {
        // ─────────────────────────────────────────────────────────────
        // Try to get suppliers from global APP_DATA
        // Object.values(APP_DATA.suppliers) structure: [{id, name, ...}, ...]
        // ─────────────────────────────────────────────────────────────
        suppliers = window.Object.values(APP_DATA.suppliers) || [];

        // Convert to standard format if needed
        suppliers = suppliers.map((s) => ({
          id: s.id,
          name: s.name || s.supplier_name || '',
        }));

        // If no suppliers from APP_DATA, fetch from Firebase
        if (suppliers.length === 0) {
          const snapshot = await firebase.firestore().collection(DB_PATHS.SUPPLIERS).get();
          suppliers = [];
          snapshot.forEach((doc) => {
            suppliers.push({
              id: doc.id,
              name: doc.data().name || doc.data().supplier_name || doc.id,
            });
          });
        }

        // ─────────────────────────────────────────────────────────────
        // Save suppliers to cache for future use
        // ─────────────────────────────────────────────────────────────
        cache.suppliers = suppliers;
      } catch (e) {
        console.error('[ServicePriceController] Lỗi load suppliers:', e);
        suppliers = []; // Fallback to empty array
      }
    }

    // ─────────────────────────────────────────────────────────────
    // STEP 2: Render suppliers into dropdown
    // ─────────────────────────────────────────────────────────────
    let html = '<option value="">-- Chọn Nhà cung cấp --</option>';
    if (suppliers && suppliers.length > 0) {
      suppliers.forEach((supplier) => {
        html += `<option value="${supplier.id}">${supplier.name || supplier.id}</option>`;
      });
    }
    this.selSupplier.innerHTML = html;
  }

  /**
   * ★ PRIVATE: Fetch table data từ Firestore (với cache checking)
   */
  async _fetchTableData() {
    const supplierId = this.selSupplier.value;
    const year = this.selYear.value;
    if (!supplierId) return;

    // ─────────────────────────────────────────────────────────────
    // Check cache first
    // ─────────────────────────────────────────────────────────────
    const cache = ServicePriceController._cacheData;
    const docId = `${supplierId}_${year}`.toUpperCase();

    if (cache.serviceSchedules[docId]) {
      L._('[ServicePriceController] ⚡ Cache hit! Dùng dữ liệu đã lưu');
      return;
    }

    // ─────────────────────────────────────────────────────────────
    // Fetch from Firestore if not in cache
    // ─────────────────────────────────────────────────────────────
    L._('[ServicePriceController] 🔄 Fetch data từ Firestore...');
    try {
      // Get data từ service_price_schedules
      const doc = await firebase.firestore().collection(DB_PATHS.SERVICE_SCHEDULES).doc(docId).get();

      const tableData = doc.exists ? doc.data() : { items: [], info: { status: 'actived' } };

      // ─────────────────────────────────────────────────────────────
      // Save to cache after successful fetch
      // ─────────────────────────────────────────────────────────────
      cache.serviceSchedules[docId] = tableData;

      L._('[ServicePriceController] ✅ Data fetched & cached');
    } catch (e) {
      console.error('[ServicePriceController] Lỗi tải:', e);
      throw e;
    }
  }

  /**
   * ★ PRIVATE: Render table data từ cache vào UI component
   */
  _renderTableData() {
    const supplierId = this.selSupplier.value;
    const year = this.selYear.value;
    if (!supplierId) return;

    const cache = ServicePriceController._cacheData;
    const docId = `${supplierId}_${year}`.toUpperCase();
    const tableData = cache.serviceSchedules[docId];

    if (!tableData) {
      console.warn('[ServicePriceController] Cache trống, không render');
      return;
    }

    L._('[ServicePriceController] 🎨 Render từ cache...');
    this.table.setData(tableData.items || []);
    this.selStatus.value = tableData.info?.status || 'actived';
  }

  /**
   * ★ PUBLIC: Load Table Data (Fetch + Render)
   * Reset table data first, then fetch and render new data
   */
  async loadTableData() {
    try {
      // ─────────────────────────────────────────────────────────────
      // STEP 1: Reset table to empty before loading new data
      // ─────────────────────────────────────────────────────────────
      L._('[ServicePriceController] 🔄 Reset bảng dữ liệu...');
      this.table.setData([]);
      this.selStatus.value = 'actived';

      // ─────────────────────────────────────────────────────────────
      // STEP 2: Fetch data from cache or Firestore
      // ─────────────────────────────────────────────────────────────
      await this._fetchTableData();

      // ─────────────────────────────────────────────────────────────
      // STEP 3: Render loaded data to table
      // ─────────────────────────────────────────────────────────────
      this._renderTableData();
    } catch (error) {
      Opps('Lỗi tải: ' + error.message);
    }
  }

  // --- EVENT MANAGEMENT ---

  /**
   * Remove all event listeners to prevent duplicate listeners
   * Called before attachEvents() when reinitializing layout
   */
  detachEvents() {
    if (!this._eventHandlers) return;

    if (this._eventHandlers.onSupplierChange && this.selSupplier) {
      this.selSupplier.removeEventListener('change', this._eventHandlers.onSupplierChange);
    }

    if (this._eventHandlers.onYearChange && this.selYear) {
      this.selYear.removeEventListener('change', this._eventHandlers.onYearChange);
    }

    if (this._eventHandlers.onBtnLoadClick && this.btnLoad) {
      this.btnLoad.removeEventListener('click', this._eventHandlers.onBtnLoadClick);
    }

    if (this._eventHandlers.onBtnSaveClick && this.btnSave) {
      this.btnSave.removeEventListener('click', this._eventHandlers.onBtnSaveClick);
    }

    // Reset all handlers to null
    this._eventHandlers = {
      onSupplierChange: null,
      onYearChange: null,
      onBtnLoadClick: null,
      onBtnSaveClick: null,
    };
  }

  /**
   * Attach all event listeners
   * Store references to handlers for cleanup later
   */
  attachEvents() {
    // ─────────────────────────────────────────────────────────────
    // SUPPLIER CHANGE EVENT
    // ─────────────────────────────────────────────────────────────
    this._eventHandlers.onSupplierChange = () => {
      // Enable/disable load button based on supplier selection
      this.btnLoad.disabled = !this.selSupplier.value;
    };

    this.selSupplier.addEventListener('change', this._eventHandlers.onSupplierChange);

    // ─────────────────────────────────────────────────────────────
    // YEAR CHANGE EVENT (Optional: could be used for cache invalidation)
    // ─────────────────────────────────────────────────────────────
    this._eventHandlers.onYearChange = () => {
      this.btnLoad.disabled = !this.selSupplier.value;
    };

    this.selYear.addEventListener('change', this._eventHandlers.onYearChange);

    // ─────────────────────────────────────────────────────────────
    // LOAD DATA BUTTON CLICK
    // ─────────────────────────────────────────────────────────────
    this._eventHandlers.onBtnLoadClick = async () => {
      if (!this.selSupplier.value) {
        logA('Chưa chọn NCC', 'warning', 'alert');
        return;
      }
      await this.loadTableData();
    };

    this.btnLoad.addEventListener('click', this._eventHandlers.onBtnLoadClick);

    // ─────────────────────────────────────────────────────────────
    // SAVE DATA BUTTON CLICK
    // ─────────────────────────────────────────────────────────────
    this._eventHandlers.onBtnSaveClick = async () => {
      const supplierId = this.selSupplier.value;
      const year = this.selYear.value;

      if (!supplierId) {
        logA('Chưa chọn NCC', 'warning', 'alert');
        return;
      }

      const items = this.table.getData();
      if (items.length === 0) {
        logA('Chưa có dịch vụ nào để lưu', 'warning', 'alert');
        return;
      }

      // ─────────────────────────────────────────────────────────────
      // Prepare payload and save to Firestore
      // ─────────────────────────────────────────────────────────────
      const docId = `${supplierId}_${year}`.toUpperCase();
      const payload = {
        info: {
          supplierId,
          supplierName: this.selSupplier.options[this.selSupplier.selectedIndex].text,
          year: parseInt(year),
          status: this.selStatus.value,
          updatedAt: new Date().getTime(),
        },
        items: items,
        searchTags: [supplierId, year.toString()],
      };

      try {
        // ✅ Route qua DBManager để đồng bộ notification thay vì gọi Firestore trực tiếp
        await A.DB.saveRecord(DB_PATHS.SERVICE_SCHEDULES, { ...payload, id: docId });

        // ─────────────────────────────────────────────────────────────
        // Update cache after successful save
        // ─────────────────────────────────────────────────────────────
        const cache = ServicePriceController._cacheData;
        cache.serviceSchedules[docId] = payload;

        logA('Đã lưu thành công!', 'warning', 'alert');
      } catch (e) {
        Opps('Lỗi lưu: ' + e.message);
      }
    };

    this.btnSave.addEventListener('click', this._eventHandlers.onBtnSaveClick);
  }
}
