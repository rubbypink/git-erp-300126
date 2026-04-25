import { getFirestore, collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { getApp } from 'firebase/app';
import ATable from '../core/ATable.js';
import { PriceCalculator } from './PriceCalculator.js';

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
        this.cdm = null; // Sẽ được PriceManager gán
        this.table = null;

        if (!this.container) {
            L._(`[ServicePriceController] Container #${containerId} not found.`, null, 'warning');
        }
        // ─────────────────────────────────────────────────────────────
        // Store event handler references for cleanup (prevent duplicate)
        // ─────────────────────────────────────────────────────────────
        this._eventHandlers = {
            onSupplierChange: null,
            onYearChange: null,
            onBtnLoadClick: null,
            onBtnSaveClick: null,
            onBtnAddRowClick: null,
        };
    }

    /**
     * Initialize ServicePriceController instance (Singleton Pattern with Force Option)
     */
    static init(containerId, isForce = false) {
        let instance;
        if (this._initialized && !isForce) {
            console.warn('[EventManager] Đã khởi tạo rồi, bỏ qua...');
            return;
        }
        this._initialized = true;

        if (!isForce && ServicePriceController._instance) {
            instance = ServicePriceController._instance;
        } else {
            instance = new ServicePriceController(containerId);
            ServicePriceController._instance = instance;
        }

        if (instance.container) {
            instance.initLayout();
        }

        if (instance.modal) instance.modal.show();
        return instance;
    }

    static clearInstance() {
        ServicePriceController._instance = null;
    }

    static clearCache() {
        ServicePriceController._cacheData = {
            suppliers: null,
            serviceSchedules: {},
        };
    }

    async initLayout() {
        try {
            if (!this.container) return;

            const rootId = this.container.id;
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
                              <option value="2025">2025</option>
                              <option value="2026" selected>2026</option>
                              <option value="2027">2027</option>
                          </select>
                          <button id="sp-btn-load" class="btn btn-primary btn-sm"><i class="bi bi-download"></i> Load Giá</button>
                          <button id="sp-btn-add-row" class="btn btn-outline-primary btn-sm"><i class="bi bi-plus-lg"></i> Thêm dòng</button>
                      </div>
                  </div>
  
                  <div class="card-body p-0 flex-grow-1 overflow-hidden" style="background: var(--tbl-row-bg, #fff); color: var(--text-color, #000);">
                      <div id="sp-table-container" class="h-100 w-100"></div>
                  </div>
              </div>
          `;

            this.selSupplier = this.container.querySelector('#sp-supplier');
            this.selYear = this.container.querySelector('#sp-year');
            this.selStatus = this.container.querySelector('#sp-status');
            this.btnLoad = this.container.querySelector('#sp-btn-load');
            this.btnSave = this.container.querySelector('#sp-btn-save');
            this.btnAddRow = this.container.querySelector('#sp-btn-add-row');

            this.detachEvents();
            this.attachEvents();
            await this.initData();

            this._initialized = true;
        } catch (error) {
            Opps('[ServicePriceController] initLayout error:', error);
        }
    }

    initTable(data) {
        // Sử dụng container nội bộ sp-table-container thay vì container cha
        this.table = new ATable('sp-table-container', {
            colName: 'service_price_schedules',
            data: data,
            editable: true,
            header: false,
            pageSize: 30,
            customfieldConfigs: {
                id: { name: 'id', displayName: 'ID', type: 'text', attr: ['readonly'] },
                type: { name: 'type', displayName: 'Loại DV', type: 'text' },
                name: { name: 'name', displayName: 'Tên DV', type: 'text' },
                from: { name: 'from', displayName: 'Từ ngày', type: 'text' },
                to: { name: 'to', displayName: 'Đến ngày', type: 'text' },
                adl: { name: 'adl', displayName: 'Giá NL', type: 'number', class: 'number' },
                chd: { name: 'chd', displayName: 'Giá TE', type: 'number', class: 'number' },
                sell_adl: { name: 'sell_adl', displayName: 'Giá Bán NL', type: 'number', class: 'number' },
                sell_chd: { name: 'sell_adl', displayName: 'Giá Bán TE', type: 'number', class: 'number' },
                note: { name: 'note', displayName: 'Ghi chú', type: 'text' },
            },
        });
    }

    async initData() {
        try {
            const cache = ServicePriceController._cacheData;
            let suppliers;

            if (this.cdm && this.cdm.state.masterData.suppliers.length > 0) {
                suppliers = this.cdm.state.masterData.suppliers;
            } else if (cache.suppliers !== null) {
                suppliers = cache.suppliers;
            } else {
                suppliers = await A.DB.getCollection(DB_PATHS.SUPPLIERS);
                cache.suppliers = suppliers;
            }

            let html = '<option value="">-- Chọn Nhà cung cấp --</option>';
            const normalized = normalizeList(suppliers);
            if (normalized.length > 0) {
                normalized.forEach((supplier) => {
                    html += `<option value="${supplier.id}">${supplier.name || supplier.id}</option>`;
                });
            }
            this.selSupplier.innerHTML = html;
        } catch (e) {
            Opps('[ServicePriceController] initData error:', e);
        }
    }

    async loadTableData() {
        const supplierId = this.selSupplier.value;
        const year = this.selYear.value;
        if (!supplierId) return;

        try {
            this.toggleLoading(true);
            L._('[ServicePriceController] 🔄 Đang tải dữ liệu bảng giá...');

            const cache = ServicePriceController._cacheData;
            const docId = `${supplierId}_${year}`.toUpperCase();

            let tableData = null;
            if (cache.serviceSchedules[docId]) {
                tableData = cache.serviceSchedules[docId];
            } else {
                tableData = await A.DB.getCollection(DB_PATHS.SERVICE_SCHEDULES, docId);
                if (tableData) cache.serviceSchedules[docId] = tableData;
            }

            if (tableData && tableData.items) {
                this.initTable(tableData.items);
                this.selStatus.value = tableData.info?.status || 'actived';
                L._(`[ServicePriceController] ✅ Đã load ${tableData.items.length} dịch vụ.`);
            } else if (this.table) {
                this.table.updateData([]);
                this.selStatus.value = 'actived';
                L._('[ServicePriceController] ℹ️ Không có dữ liệu cho NCC/Năm này. Bảng đã được reset.');
            } else logA('Không có dữ liệu để hiển thị!');
        } catch (error) {
            Opps('[ServicePriceController] loadTableData error:', error);
        } finally {
            this.toggleLoading(false);
        }
    }

    toggleLoading(show) {
        if (this.cdm && typeof this.cdm.toggleLoading === 'function') {
            this.cdm.toggleLoading(show);
        } else {
            const container = this.container;
            if (container) {
                if (show) container.classList.add('opacity-50');
                else container.classList.remove('opacity-50');
            }
        }
    }

    detachEvents() {
        if (!this._eventHandlers) return;
        if (this._eventHandlers.onSupplierChange && this.selSupplier) this.selSupplier.removeEventListener('change', this._eventHandlers.onSupplierChange);
        if (this._eventHandlers.onYearChange && this.selYear) this.selYear.removeEventListener('change', this._eventHandlers.onYearChange);
        if (this._eventHandlers.onBtnLoadClick && this.btnLoad) this.btnLoad.removeEventListener('click', this._eventHandlers.onBtnLoadClick);
        if (this._eventHandlers.onBtnSaveClick && this.btnSave) this.btnSave.removeEventListener('click', this._eventHandlers.onBtnSaveClick);
        if (this._eventHandlers.onBtnAddRowClick && this.btnAddRow) this.btnAddRow.removeEventListener('click', this._eventHandlers.onBtnAddRowClick);
    }

    attachEvents() {
        this._eventHandlers.onSupplierChange = () => {
            this.btnLoad.disabled = !this.selSupplier.value;
        };
        this.selSupplier.addEventListener('change', this._eventHandlers.onSupplierChange);

        this._eventHandlers.onYearChange = () => {
            this.btnLoad.disabled = !this.selSupplier.value;
        };
        this.selYear.addEventListener('change', this._eventHandlers.onYearChange);

        this._eventHandlers.onBtnLoadClick = async () => {
            if (!this.selSupplier.value) {
                logA('Chưa chọn NCC', 'warning', 'alert');
                return;
            }
            await this.loadTableData();
        };
        this.btnLoad.addEventListener('click', this._eventHandlers.onBtnLoadClick);

        this._eventHandlers.onBtnAddRowClick = () => {
            const currentData = this.table.getData();
            const newRow = {
                id: 'new-' + Date.now(),
                type: 'Vé',
                name: '',
                from: '01/01',
                to: '31/12',
                adl: 0,
                chd: 0,
                note: '',
            };
            this.table.updateData([...currentData, newRow]);
        };
        this.btnAddRow.addEventListener('click', this._eventHandlers.onBtnAddRowClick);

        this._eventHandlers.onBtnSaveClick = async () => {
            const supplierId = this.selSupplier.value;
            const year = this.selYear.value;

            if (!supplierId) {
                logA('Chưa chọn NCC', 'warning', 'alert');
                return;
            }

            let items = this.table.getData().filter((item) => item.name && item.name.trim() !== '');
            if (items.length === 0) {
                logA('Chưa có dịch vụ nào để lưu', 'warning', 'alert');
                return;
            }

            // --- LOGIC TÍNH GIÁ BÁN TỰ ĐỘNG ---
            items = PriceCalculator.recalculateServiceItems(items);
            L._('[ServicePrice] Đã tự động tính toán giá bán cho danh sách dịch vụ');

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
                await A.DB.saveRecord(DB_PATHS.SERVICE_SCHEDULES, { ...payload, id: docId });
                const cache = ServicePriceController._cacheData;
                cache.serviceSchedules[docId] = payload;

                if (this.cdm) {
                    await this.cdm.onPriceChanged('service', payload);
                }

                logA('Đã lưu thành công!', 'success', 'toast');
            } catch (e) {
                Opps('[ServicePriceController] save error:', e);
            }
        };
        this.btnSave.addEventListener('click', this._eventHandlers.onBtnSaveClick);
    }

    async fillDataFromAI(aiData, metadata) {
        try {
            if (!this.table) throw new Error('Bảng giá dịch vụ chưa được khởi tạo.');

            L._('[ServicePrice] Đang mapping dữ liệu từ AI vào bảng...', aiData);

            const currentItems = this.table.getData().filter((item) => item.name);

            const newItems = aiData.map((item) => ({
                id: 'ai-' + Date.now() + Math.random(),
                type: item.type || item.service_type || 'Vé',
                name: item.name || item.service_name || '',
                from: item.from || item.start_date || '01/01',
                to: item.to || item.end_date || '31/12',
                adl: getNum(item.adl || item.price || item.net_adl || 0),
                chd: getNum(item.chd || item.net_chd || 0),
                note: item.note || 'Imported from AI',
            }));

            const combinedItems = [...currentItems, ...newItems];
            this.table.updateData(combinedItems);

            L._(`[ServicePrice] Đã thêm ${newItems.length} dòng dịch vụ từ AI.`);
            logA(`Đã thêm ${newItems.length} dòng dịch vụ từ dữ liệu AI.`, 'success', 'toast');
        } catch (error) {
            Opps('[ServicePriceController] fillDataFromAI error:', error);
            throw error;
        }
    }
}
