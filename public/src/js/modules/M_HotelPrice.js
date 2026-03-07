import '../common/components/custom_tag.js';

// ============================================================
// 1. UTILS: MATRIX TRANSFORMER (Cập nhật xử lý Config & Status)
// ============================================================
export const MatrixTransformer = {
  /**
   * 1. UI -> Server (Optimize)
   */
  toFirestore_Optimize: (rawData) => {
    try {
      if (!rawData || !rawData.prices || !Array.isArray(rawData.prices)) {
        throw new Error('Dữ liệu đầu vào không hợp lệ');
      }

      const { metadata, prices, viewConfig } = rawData;

      // Tạo ID chuẩn
      const docId = `${metadata.supplierId}_${metadata.hotelId}_${metadata.year}`.toUpperCase();

      // Chuyển mảng giá thành Map
      const priceMap = {};
      prices.forEach((item) => {
        // Đảm bảo giá trị là số (nếu null/undefined/NaN thì cho về 0 hoặc bỏ qua)
        const val = Number(item.value);
        if (!isNaN(val)) {
          priceMap[item.key] = val;
        }
      });

      // Tạo Payload thô
      const payload = {
        _docId: docId,
        info: {
          ...metadata,
          updatedAt: new Date().getTime(),
          updatedBy: 'user_current_id', // Thay bằng ID user thật nếu có
          totalRecords: prices.length,

          // Logic an toàn cho viewConfig:
          // Nếu viewConfig undefined -> gán null (Firestore chịu nhận null)
          // Hoặc để undefined thì bước Clean bên dưới sẽ xóa key này đi (Tiết kiệm DB)
          viewConfig: viewConfig,
        },
        priceData: priceMap,
        searchTags: [metadata.supplierId, metadata.hotelId, metadata.year.toString()],
      };

      // === BƯỚC QUAN TRỌNG NHẤT: CLEAN DATA ===
      // Kỹ thuật này sẽ loại bỏ tất cả các trường có giá trị là undefined
      // Giúp Firestore không bao giờ bị lỗi "Unsupported field value: undefined"
      // Lưu ý: Nó cũng biến Date Object thành string (nhưng ta dùng timestamp number nên ok)
      return JSON.parse(JSON.stringify(payload));
    } catch (error) {
      console.error('Lỗi Transformer [toFirestore]:', error);
      return null;
    }
  },

  /**
   * 2. Server -> UI (Parse)
   */
  toClient_Parse: (firestoreDoc) => {
    try {
      if (!firestoreDoc || !firestoreDoc.priceData) {
        return { values: {} };
      }
      return {
        info: firestoreDoc.info,
        values: firestoreDoc.priceData,
      };
    } catch (error) {
      console.error('Lỗi Transformer [toClient]:', error);
      return { values: {} };
    }
  },
};
// ============================================================
// 2. UI COMPONENT (Giữ nguyên, chỉ cập nhật getData để lấy config)
// ============================================================

class HotelMatrixPrice extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._schema = null; // Cấu trúc khung bảng
    this._values = {}; // Dữ liệu giá (Key-Value)
  }

  connectedCallback() {
    this.renderInitialState();
    // Lắng nghe sự kiện Paste toàn cục trong component
    this.addEventListener('paste', this.handlePaste.bind(this));
    this.shadowRoot.addEventListener('input', this.handleInput.bind(this));
  }

  // --- LOGIC MỚI: ĐỒNG BỘ DỮ LIỆU REALTIME ---
  handleInput(e) {
    // Kiểm tra xem có phải đang nhập vào ô giá không
    const input = e.target;
    if (!input.classList.contains('price-input')) return;

    const key = input.dataset.key;
    const rawValue = input.value.replace(/,/g, ''); // Bỏ dấu phẩy

    if (rawValue === '') {
      // Nếu xóa trắng -> Xóa khỏi data
      delete this._values[key];
    } else {
      // Nếu có số -> Lưu ngay vào bộ nhớ
      this._values[key] = parseInt(rawValue);
    }

    // (Optional) Log để kiểm tra xem data đã ăn chưa
    // L._("Current Data:", this._values);
  }
  /**
   * Xử lý sự kiện Paste từ Excel
   * Logic: Lấy vị trí ô đang focus -> Paste đè lên các ô tiếp theo theo chiều ngang/dọc
   */
  handlePaste(e) {
    e.preventDefault();

    // 1. Lấy dữ liệu từ Clipboard
    const clipboardData = (e.clipboardData || window.clipboardData).getData('text');
    if (!clipboardData) return;

    // 2. Xác định ô bắt đầu (User đang đặt chuột ở đâu)
    const startInput = this.shadowRoot.activeElement;
    if (!startInput || !startInput.classList.contains('price-input')) {
      logA('Vui lòng click vào một ô nhập giá để bắt đầu dán dữ liệu!', 'warning', 'alert');
      return;
    }

    // 3. Phân tích dữ liệu Excel (Tab separated)
    // Split dòng bằng \n, split cột bằng \t
    const rows = clipboardData
      .trim()
      .split(/\r\n|\n|\r/)
      .map((row) => row.split('\t'));

    // 4. Lấy tọa độ ô bắt đầu từ dataset
    // Dataset lưu dạng: roomID_rateID_periodID_pkgID
    // Tuy nhiên để paste chuẩn, ta cần duyệt qua DOM
    const allInputs = Array.from(this.shadowRoot.querySelectorAll('input.price-input'));
    const startIndex = allInputs.indexOf(startInput);

    if (startIndex === -1) return;

    // 5. Thuật toán Mapping vào lưới (Grid Mapping)
    // Vì Input trong HTML là danh sách phẳng (1 chiều), ta cần logic dòng/cột của bảng
    // Giả định bảng đã render chuẩn theo thứ tự

    // Tính số lượng cột Input thực tế trong 1 dòng của bảng
    // Công thức: (Số Period * Số Package)
    const colsPerMetrics = this._schema.periods.length * this._schema.packages.length;

    rows.forEach((rowValues, rIndex) => {
      rowValues.forEach((val, cIndex) => {
        const targetIndex = startIndex + rIndex * colsPerMetrics + cIndex;
        if (targetIndex < allInputs.length) {
          const input = allInputs[targetIndex];
          const cleanVal = val.replace(/[^0-9]/g, '');
          if (cleanVal) {
            input.value = parseInt(cleanVal).toLocaleString();
            input.dispatchEvent(new Event('input'));
          }
        }
      });
    });
  }

  /**
   * SMART SET DATA
   * @param {Object} schema - Cấu trúc bảng (Periods, Packages, Rooms...)
   * @param {Object|null} firestoreData - Dữ liệu lấy từ DB (nếu có)
   */
  setData(schema, firestoreData = null) {
    // 1. Lưu schema (Cấu trúc cột/hàng)
    this._schema = schema;

    // 2. Tự động xử lý data từ Server (nếu có)
    if (firestoreData) {
      // Gọi Transformer nội bộ để parse data nén thành data phẳng
      const parsed = MatrixTransformer.toClient_Parse(firestoreData);
      this._values = parsed.values || {};

      // Cập nhật lại thông tin Metadata từ DB nếu cần
      if (parsed.info) {
        this._schema.info = { ...this._schema.info, ...parsed.info };
      }
    } else {
      this._values = {}; // Reset nếu tạo mới
    }

    // 3. Render giao diện
    this.render();
  }

  getData() {
    const rawPrices = [];

    // Duyệt qua bộ nhớ _values
    for (const [key, value] of Object.entries(this._values)) {
      if (value !== null && value !== '' && !isNaN(value)) {
        rawPrices.push({
          key: key,
          value: value,
        });
      }
    }

    const safeInfo = this._schema && this._schema.info ? this._schema.info : {};
    const safeViewConfig = this._schema && this._schema.viewConfig ? this._schema.viewConfig : null;

    const rawPayload = {
      metadata: safeInfo,
      viewConfig: safeViewConfig, // Truyền null thay vì undefined
      prices: rawPrices,
    };

    return MatrixTransformer.toFirestore_Optimize(rawPayload);
  }
  // Render trạng thái chờ
  renderInitialState() {
    this.shadowRoot.innerHTML = `
            <style>
                .placeholder { padding: 20px; text-align: center; margin-top: auto; color: #666; border: 2px dashed #ccc; background: #f9f9f9; }
            </style>
            <div class="placeholder">Vui lòng chọn bộ lọc để hiển thị bảng giá</div>
        `;
  }

  // Render bảng chính
  render() {
    if (!this._schema) return;
    const { info, packages, rooms } = this._schema;

    // ─────────────────────────────────────────────────────────────
    // Optimize period sorting order
    // Display order: Thấp Điểm → Mùa Thường → Cao Điểm → Giá năm
    // ─────────────────────────────────────────────────────────────
    const periodOrder = ['Thấp Điểm', 'Mùa Thường', 'Cao Điểm', 'Giá năm'];
    const periods = [...this._schema.periods].sort((a, b) => {
      const indexA = periodOrder.indexOf(a.name);
      const indexB = periodOrder.indexOf(b.name);

      // Periods in order get priority; others sorted alphabetically at end
      const orderA = indexA >= 0 ? indexA : periodOrder.length + a.name.localeCompare(b.name);
      const orderB = indexB >= 0 ? indexB : periodOrder.length + b.name.localeCompare(a.name);

      return orderA - orderB;
    });

    const styles = `
        <style>
            /* :host chính là thẻ <at-tbl-hotel-price> */
            :host { 
                display: flex; 
                flex-direction: column; 
                height: 100%; /* Chiếm hết chiều cao cha cấp */
                min-height: 50vh;
                font-family: system-ui, -apple-system, sans-serif;
                --border-color: #dee2e6; 
                --header-bg: var(--tbl-head-bg, #f8f9fa); 
                --sticky-col-width: 120px;
            }

            /* Meta Info: Không co giãn */
            .meta-info { 
                flex: 0 0 auto; /* Fixed height */
                margin: 0; padding: 10px; background: #e9ecef; border-bottom: 1px solid var(--border-color);
                display: flex; gap: 1.5rem; flex-wrap: wrap; 
            }
            .meta-item { font-weight: 500; font-size: 0.9rem; }
            .meta-item span { font-weight: normal; }

            /* Table Container: Chiếm phần còn lại và Scroll tại đây */
            .table-container { 
                flex: 1; /* Grow to fill space */
                overflow: auto; /* Scrollbars appear here */
                position: relative; 
            }
            
            table { 
                border-collapse: collapse; 
                width: fit-content; 
                min-width: 1200px; 
                font-size: 0.95rem; 
                justify-self: center;
                table-layout: auto;
            }
            
            th, td { 
                border: 1px solid var(--border-color); 
                padding: 8px; 
                text-align: center;
                box-sizing: border-box;
            }
            
            /* Sticky Headers vẫn giữ nguyên để trượt mượt mà */
            thead th { 
                position: sticky; 
                top: 0; 
                background: var(--tbl-head-bg, #f8f9fa); 
                z-index: 10;
                min-width: 80px;
                white-space: nowrap;
            }
            
            thead tr:nth-child(2) th { 
                top: 37px; 
                background: var(--header-bg, #e9ecef); 
            } 
            
            /* Sticky Column (Loại phòng) - FIX responsive */
            tbody th.sticky-col { 
                position: sticky; 
                left: 0; 
                background: #fff; 
                z-index: 5; 
                text-align: center;
                min-width: var(--sticky-col-width);
                width: var(--sticky-col-width);
                flex-shrink: 0;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            
            /* Đảm bảo header cột đầu tiên cũng sticky */
            thead th:first-child {
                position: sticky;
                left: 0;
                z-index: 11;
                min-width: var(--sticky-col-width);
                width: var(--sticky-col-width);
                flex-shrink: 0;
            }
            
            input.price-input { 
                width: 100%;
                min-width: 70px;
                text-align: right; 
                background: var(--tbl-row-bg, #fff); 
                color: var(--text-color, #000);
                box-sizing: border-box;
                padding: 4px;
            }
            
            .room-header { 
                background-color: var(--tbl-row-bg, #e2e3e5); 
                text-align: center; 
                font-weight: bold; 
                padding-left: 10px;
            }
        </style>
        `;

    // 2. Build Header Info
    const metaHtml = `
        <div class="meta-info justify-content-between">
            <div class="meta-item">NCC: <span>${info.supplierName}</span></div>
            <div class="meta-item">Khách sạn: <span>${info.hotelName}</span></div>
            <div class="meta-item">Hiệu lực: <span>${info.year}</span></div>
            <div class="meta-item">Trạng thái: <span class="badge ${this._getStatusClass(info.status)}">${this._getStatusLabel(info.status)}</span></div>
        </div>
        `;
    let theadRow1 = `<th>Loại phòng / Giá</th>`;
    periods.forEach((p) => {
      theadRow1 += `<th colspan="${packages.length}">${p.name}<br><small>(${p.from} - ${p.to})</small></th>`;
    });

    let theadRow2 = `<th></th>`;
    periods.forEach(() => {
      packages.forEach((pkg) => {
        theadRow2 += `<th>${pkg.name}</th>`;
      });
    });

    let tbody = '';
    rooms.forEach((room) => {
      tbody += `<tr class="room-header"><td colspan="${1 + periods.length * packages.length}">${room.name}</td></tr>`;
      room.rateTypes.forEach((rate) => {
        let rowHtml = `<tr><th class="sticky-col"><span class="rate-name">${rate.name}</span></th>`;
        periods.forEach((period) => {
          packages.forEach((pkg) => {
            const key = `${room.id}_${rate.id}_${period.id}_${pkg.id}`;
            rowHtml += `<td><input type="text" class="price-input number-only" data-key="${key}" value="${this._findValue(key)}"></td>`;
          });
        });
        tbody += rowHtml + `</tr>`;
      });
    });

    this.shadowRoot.innerHTML = `${styles}${metaHtml}<div class="table-container"><table class="table table-bordered table-info"><thead><tr>${theadRow1}</tr><tr>${theadRow2}</tr></thead><tbody>${tbody}</tbody></table></div>`;
  }

  _findValue(key) {
    return this._values && this._values[key] ? this._values[key].toLocaleString() : '';
  }
  _getStatusLabel(s) {
    const map = {
      actived: 'Đang hoạt động',
      pending: 'Chờ duyệt',
      canceled: 'Đã hủy',
      stopped: 'Tạm dừng',
    };
    return map[s] || 'Mới tạo';
  }
  _getStatusClass(s) {
    const map = {
      actived: 'bg-success',
      pending: 'bg-warning text-dark',
      canceled: 'bg-danger',
      stopped: 'bg-secondary',
    };
    return map[s] || 'bg-primary';
  }
}

customElements.define('at-tbl-hotel-price', HotelMatrixPrice);

const DB_PATHS = {
  SUPPLIERS: 'suppliers',
  HOTELS: 'hotels',
  PERIODS: 'app_config/lists/price_periods',
  PACKAGES: 'app_config/lists/pkg_hotel_price',
  TYPES: 'app_config/lists/price_type',
  PRICE_SCHEDULES: 'hotel_price_schedules',
};

export class HotelPriceController {
  // =========================================================================
  // INTERNAL VARIABLES (Singleton Instance & Cache Management)
  // =========================================================================
  static _instance = null;
  static _cacheData = {
    masterData: null,
    suppliers: null,
    periods: null,
    packages: null,
    priceTypes: null,
    hotels: null,
    priceSchedules: {}, // Map {docId: data}
  };

  constructor(containerId) {
    this._initialized = false;
    this.container = document.getElementById(containerId);
    if (!this.container) throw new Error(`Không tìm thấy container: #${containerId}`);

    this.masterData = { periods: [], packages: [], priceTypes: [] };

    // ─────────────────────────────────────────────────────────────
    // Store event handler references for cleanup (prevent duplicate)
    // ─────────────────────────────────────────────────────────────
    this._eventHandlers = {
      onSupplierChange: null,
      onHotelChange: null,
      onBtnViewClick: null,
      onBtnReloadClick: null,
      onBtnSaveClick: null,
    };
  }

  /**
   * Initialize HotelPriceController instance (Singleton Pattern with Force Option)
   * @param {string} containerId - Container element ID
   * @param {boolean} isForce - Force create new instance (default: false)
   * @returns {HotelPriceController} - Instance of controller
   *
   * LOGIC:
   * - Nếu instance đã tồn tại && !isForce -> reuse instance cũ
   * - Nếu chưa có || isForce=true -> tạo instance mới
   * - LUÔN gọi initLayout() mỗi lần (để khôi phục DOM)
   *
   * Điều này đảm bảo modal HTML được tạo lại khi modal đóng/mở
   */
  static init(containerId, isForce = false) {
    let instance;
    if (this._initialized) {
      console.warn('[EventManager] Đã khởi tạo rồi, bỏ qua...');
      return;
    }
    // ─────────────────────────────────────────────────────────────
    // STEP 1: Determine instance (reuse old or create new)
    // ─────────────────────────────────────────────────────────────
    if (!isForce && HotelPriceController._instance) {
      // Reuse existing instance
      instance = HotelPriceController._instance;
    } else {
      // Create new instance
      instance = new HotelPriceController(containerId);
      HotelPriceController._instance = instance;
    }

    // ─────────────────────────────────────────────────────────────
    // STEP 2: ALWAYS reinitialize layout (restore DOM)
    // ─────────────────────────────────────────────────────────────
    instance.initLayout();
    this._initialized = true;
    return instance;
  }

  /**
   * Clear singleton instance (Useful for testing or cleanup)
   */
  static clearInstance() {
    HotelPriceController._instance = null;
  }

  /**
   * Clear all cached data
   */
  static clearCache() {
    HotelPriceController._cacheData = {
      masterData: null,
      suppliers: null,
      periods: null,
      packages: null,
      priceTypes: null,
      hotels: null,
      priceSchedules: {},
    };
  }

  initLayout() {
    const rootId = this.container.id;
    this.container.innerHTML = `
        <style>
            /* Dùng ID (#${rootId}) để đảm bảo độ ưu tiên cao hơn class thông thường ở file CSS chính */
            #${rootId} .card-header {
                max-height: none !important;  /* GỠ BỎ giới hạn chiều cao */
                height: auto !important;      /* Tự động dãn theo nội dung bên trong */
                overflow: visible !important; /* QUAN TRỌNG: Để dropdown status/hotel không bị che */
                
                /* Giữ nguyên các thuộc tính Flexbox cần thiết */
                flex-shrink: 0;
            }

            /* Bổ sung: Đảm bảo body chiếm hết phần còn lại */
            #${rootId} .card-body {
                overflow: hidden !important; /* Để scroll nằm trong component con, không phải body */
            }
        </style>      
        <div class="card shadow-sm d-flex flex-column" style="height: 100%;">
                <div class="card-header p-2 flex-shrink-0 border-bottom">              
                    <div class="d-flex gap-2 align-items-center flex-wrap mb-3">
                        <h5 class="m-0 me-auto text-primary"><i class="bi bi-grid-3x3"></i> Thiết lập Bảng giá</h5>
                        <select id="pc-status" class="form-select form-select-sm fw-bold" style="width:150px">
                            <option value="actived" class="text-success">Actived</option>
                            <option value="pending" class="text-warning">Pending</option>
                            <option value="stopped" class="text-secondary">Stopped</option>
                            <option value="canceled" class="text-danger">Canceled</option>
                        </select>

                        <button id="pc-btn-save" class="btn btn-success btn-sm">
                            <i class="bi bi-cloud-upload"></i> Lưu Bảng giá
                        </button>
                    </div>
                    
                    <div class="d-flex gap-2  p-2 border rounded align-items-end flex-wrap">
                        <div>
                            <label class="form-label small mb-1 fw-bold">Nhà cung cấp</label>
                            <select id="pc-supplier" class="form-select form-select-sm" style="min-width: 150px"><option value="">-- Chọn NCC --</option></select>
                        </div>
                        <div>
                            <label class="form-label small mb-1 fw-bold">Khách sạn</label>
                            <select id="pc-hotel" class="form-select form-select-sm" style="min-width: 200px" disabled><option value="">-- Chọn KS --</option></select>
                        </div>
                        <div>
                            <label class="form-label small mb-1 fw-bold">Năm</label>
                            <select id="pc-year" class="form-select form-select-sm" style="width:90px">
                                <option value="2026">2026</option><option value="2027">2027</option>
                            </select>
                        </div>
                        
                        <button class="btn btn-outline-secondary btn-sm ms-auto" type="button" data-bs-toggle="collapse" data-bs-target="#configPanel">
                            <i class="bi bi-gear"></i> Cấu hình hiển thị
                        </button>
                        
                        <button id="pc-btn-view" class="btn btn-primary btn-sm" disabled>
                            <i class="bi bi-eye"></i> Xem Bảng Giá
                        </button>
                        
                        <button id="pc-btn-reload" class="btn btn-warning btn-sm" disabled>
                            <i class="bi bi-arrow-clockwise"></i> Reload Data
                        </button>
                    </div>

                    <div class="collapse mt-2 border-top pt-2" id="configPanel">
                        <div class="row g-3 small">
                            <div class="col-md-4 border-end">
                                <strong class="d-block mb-2 text-primary">Giai đoạn</strong>
                                <div id="chk-group-periods" class="d-flex flex-column gap-1" style="max-height:150px;overflow-y:auto"></div>
                            </div>
                            <div class="col-md-4 border-end">
                                <strong class="d-block mb-2 text-primary">Gói giá</strong>
                                <div id="chk-group-packages" class="d-flex flex-column gap-1" style="max-height:150px;overflow-y:auto"></div>
                            </div>
                            <div class="col-md-4">
                                <strong class="d-block mb-2 text-primary">Loại giá</strong>
                                <div id="chk-group-types" class="d-flex flex-column gap-1" style="max-height:150px;overflow-y:auto"></div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="card-body p-0 flex-grow-1 position-relative mt-2" style="overflow: hidden;">
                    <div id="pc-loading" class="position-absolute w-100 h-100 d-flex justify-content-center align-items-center start-0 top-0 d-none" style="z-index:10; opacity:0.9">
                        <div class="spinner-border text-primary" role="status"></div>
                    </div>
                    <at-tbl-hotel-price id="pc-matrix-ui"></at-tbl-hotel-price>
                </div>
            </div>
        `;

    // ... (Phần còn lại giữ nguyên) ...
    this.uiComponent = this.container.querySelector('#pc-matrix-ui');
    this.selSupplier = this.container.querySelector('#pc-supplier');
    this.selHotel = this.container.querySelector('#pc-hotel');
    this.selYear = this.container.querySelector('#pc-year');
    this.selStatus = this.container.querySelector('#pc-status');

    this.chkPeriods = this.container.querySelector('#chk-group-periods');
    this.chkPackages = this.container.querySelector('#chk-group-packages');
    this.chkTypes = this.container.querySelector('#chk-group-types');

    this.btnView = this.container.querySelector('#pc-btn-view');
    this.btnReload = this.container.querySelector('#pc-btn-reload');
    this.btnSave = this.container.querySelector('#pc-btn-save');
    this.loadingOverlay = this.container.querySelector('#pc-loading');

    // ─────────────────────────────────────────────────────────────
    // IMPORTANT: Remove old event listeners before attaching new ones
    // This prevents duplicate listeners when initLayout is called again
    // ─────────────────────────────────────────────────────────────
    this.detachEvents();
    this.attachEvents();
    this.initMasterData();
  }

  async initMasterData() {
    this.toggleLoading(true);
    try {
      // ─────────────────────────────────────────────────────────────
      // STEP 1: Check cache first before fetching from Firestore
      // ─────────────────────────────────────────────────────────────
      const cache = HotelPriceController._cacheData;
      let suppliers, periods, packages, types;

      // Check and use cached data or fetch from firebase
      if (cache.suppliers !== null) {
        suppliers = cache.suppliers;
      } else {
        suppliers = await this._getCollectionData(DB_PATHS.SUPPLIERS);
        cache.suppliers = suppliers;
      }

      if (cache.periods !== null) {
        periods = cache.periods;
      } else {
        periods = await this._getCollectionData(DB_PATHS.PERIODS);
        cache.periods = periods;
      }

      if (cache.packages !== null) {
        packages = cache.packages;
      } else {
        packages = await this._getCollectionData(DB_PATHS.PACKAGES);
        cache.packages = packages;
      }

      if (cache.priceTypes !== null) {
        types = cache.priceTypes;
      } else {
        types = await this._getCollectionData(DB_PATHS.TYPES);
        cache.priceTypes = types;
      }

      // ─────────────────────────────────────────────────────────────
      // STEP 2: Update local masterData
      // ─────────────────────────────────────────────────────────────
      this.masterData.periods = periods.sort((a, b) => a.from - b.from);
      this.masterData.packages = packages;
      this.masterData.priceTypes = types;

      // ─────────────────────────────────────────────────────────────
      // STEP 3: Render UI with loaded data
      // ─────────────────────────────────────────────────────────────
      this.renderOptions(this.selSupplier, suppliers, 'id', 'name', 'Chọn Nhà cung cấp');

      // Render Checkboxes
      this.renderCheckboxGroup(this.chkPeriods, periods, 'chk-period');
      this.renderCheckboxGroup(this.chkPackages, packages, 'chk-package');
      this.renderCheckboxGroup(this.chkTypes, types, 'chk-type');

      // ─────────────────────────────────────────────────────────────
      // STEP 4: Save masterData to cache for future use
      // ─────────────────────────────────────────────────────────────
      cache.masterData = this.masterData;
    } catch (error) {
      console.error('Lỗi Init:', error);
    } finally {
      this.toggleLoading(false);
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

    if (this._eventHandlers.onHotelChange && this.selHotel) {
      this.selHotel.removeEventListener('change', this._eventHandlers.onHotelChange);
    }

    if (this._eventHandlers.onBtnViewClick && this.btnView) {
      this.btnView.removeEventListener('click', this._eventHandlers.onBtnViewClick);
    }

    if (this._eventHandlers.onBtnReloadClick && this.btnReload) {
      this.btnReload.removeEventListener('click', this._eventHandlers.onBtnReloadClick);
    }

    if (this._eventHandlers.onBtnSaveClick && this.btnSave) {
      this.btnSave.removeEventListener('click', this._eventHandlers.onBtnSaveClick);
    }

    // Reset all handlers to null
    this._eventHandlers = {
      onSupplierChange: null,
      onHotelChange: null,
      onBtnViewClick: null,
      onBtnReloadClick: null,
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
    this._eventHandlers.onSupplierChange = async () => {
      const supplierId = this.selSupplier.value;
      this.selHotel.innerHTML = '<option value="">-- Đang tải... --</option>';
      this.selHotel.disabled = true;
      this.btnView.disabled = true;
      this.btnReload.disabled = true;

      if (supplierId) {
        // ─────────────────────────────────────────────────────────────
        // Check cache first before fetching hotels data
        // ─────────────────────────────────────────────────────────────
        const cache = HotelPriceController._cacheData;
        let hotels;

        if (cache.hotels !== null) {
          hotels = cache.hotels;
        } else {
          hotels = await this._getCollectionData(DB_PATHS.HOTELS);
          cache.hotels = hotels;
        }

        this.renderOptions(this.selHotel, hotels, 'id', 'name', 'Chọn Khách sạn');
        this.selHotel.disabled = false;
      } else {
        this.selHotel.innerHTML = '<option value="">-- Chọn Khách sạn --</option>';
      }
    };

    this.selSupplier.addEventListener('change', this._eventHandlers.onSupplierChange);

    // ─────────────────────────────────────────────────────────────
    // HOTEL CHANGE EVENT
    // ─────────────────────────────────────────────────────────────
    this._eventHandlers.onHotelChange = () => {
      const isHotelSelected = !!this.selHotel.value;
      this.btnView.disabled = !isHotelSelected;
      this.btnReload.disabled = !isHotelSelected;
    };

    this.selHotel.addEventListener('change', this._eventHandlers.onHotelChange);

    // ─────────────────────────────────────────────────────────────
    // VIEW DATA BUTTON CLICK (Uses Cache)
    // ─────────────────────────────────────────────────────────────
    this._eventHandlers.onBtnViewClick = async () => await this.loadMatrixData();
    this.btnView.addEventListener('click', this._eventHandlers.onBtnViewClick);

    // ─────────────────────────────────────────────────────────────
    // RELOAD DATA BUTTON CLICK (Forces Fresh Fetch)
    // ─────────────────────────────────────────────────────────────
    this._eventHandlers.onBtnReloadClick = async () => {
      this._cacheData = {
        masterData: null,
        periods: null,
        packages: null,
        priceTypes: null,
        priceSchedules: {},
      };
      this.masterData = { periods: [], packages: [], priceTypes: [] };
      await this.loadMatrixData();
    };
    this.btnReload.addEventListener('click', this._eventHandlers.onBtnReloadClick);

    // ─────────────────────────────────────────────────────────────
    // SAVE DATA BUTTON CLICK
    // ─────────────────────────────────────────────────────────────
    this._eventHandlers.onBtnSaveClick = async () => await this.saveMatrixData();
    this.btnSave.addEventListener('click', this._eventHandlers.onBtnSaveClick);
  }

  // --- LOGIC CHECKBOX FILTER ---

  // Render HTML Checkbox
  renderCheckboxGroup(container, data, className) {
    container.innerHTML = data
      .map(
        (item) => `
            <div class="form-check">
                <input class="form-check-input ${className}" type="checkbox" value="${item.id}" id="${className}-${item.id}">
                <label class="form-check-label" for="${className}-${item.id}">${item.name}</label>
            </div>
        `
      )
      .join('');
  }

  // Lấy danh sách ID đang được check để lọc Schema
  _getCheckedIds(container, className) {
    const checked = [];
    container.querySelectorAll(`.${className}:checked`).forEach((inp) => checked.push(inp.value));
    return checked;
  }

  // --- MAIN LOGIC ---

  async loadMatrixData() {
    const hotelId = this.selHotel.value;
    const supplierId = this.selSupplier.value;
    const year = this.selYear.value;

    if (!hotelId || !supplierId) return;

    // ─────────────────────────────────────────────────────────────
    // Auto hide config panel when clicking Load
    // ─────────────────────────────────────────────────────────────
    const configPanel = document.getElementById('configPanel');
    if (configPanel && configPanel.classList.contains('show')) {
      configPanel.classList.remove('show');
    }

    this.toggleLoading(true);
    try {
      // ─────────────────────────────────────────────────────────────
      // STEP 1: Get Data from Cache or Firestore
      // ─────────────────────────────────────────────────────────────
      const docId = `${supplierId}_${hotelId}_${year}`.toUpperCase();
      const cache = HotelPriceController._cacheData;

      let savedData = null;
      if (cache.priceSchedules[docId]) {
        savedData = cache.priceSchedules[docId];
      } else {
        savedData = await this._getDocData(DB_PATHS.PRICE_SCHEDULES, docId);
        if (savedData) {
          cache.priceSchedules[docId] = savedData;
        }
      }

      // ─────────────────────────────────────────────────────────────
      // STEP 2: Determine filter IDs (from saved viewConfig or current checkboxes)
      // Pure logic: use viewConfig if exists, else use user's current checkbox selections
      // ─────────────────────────────────────────────────────────────
      let activePeriodIds, activePackageIds, activeTypeIds;

      if (savedData?.info?.viewConfig) {
        // CASE A: Restore from saved viewConfig (existing price table)
        activePeriodIds = savedData.info.viewConfig.periodIds || [];
        activePackageIds = savedData.info.viewConfig.packageIds || [];
        activeTypeIds = savedData.info.viewConfig.rateTypeIds || [];
        L._('[HotelPriceController] 💾 Sử dụng viewConfig từ bảng giá cũ');
      } else {
        // CASE B: Use current checkbox selections (new price table)
        activePeriodIds = this._getCheckedIds(this.chkPeriods, 'chk-period');
        activePackageIds = this._getCheckedIds(this.chkPackages, 'chk-package');
        activeTypeIds = this._getCheckedIds(this.chkTypes, 'chk-type');
        L._('[HotelPriceController] 🔘 Sử dụng lựa chọn checkbox hiện tại');
      }

      // ─────────────────────────────────────────────────────────────
      // STEP 3: Update Status UI
      // ─────────────────────────────────────────────────────────────
      if (savedData && savedData.info && savedData.info.status) {
        this.selStatus.value = savedData.info.status;
      } else {
        this.selStatus.value = 'actived';
      }

      // ─────────────────────────────────────────────────────────────
      // STEP 5: Build Schema from matrix data
      // ─────────────────────────────────────────────────────────────
      const roomsPath = `${DB_PATHS.HOTELS}/${hotelId}/rooms`;
      let rooms = null;

      // Check cache for rooms data
      if (cache.hotels && cache.hotels.length > 0) {
        const hotelData = cache.hotels.find((h) => h.id === hotelId);
        if (hotelData && hotelData._cachedRooms) {
          rooms = hotelData._cachedRooms;
        }
      }

      // Fetch if not in cache
      if (!rooms) {
        rooms = await this._getCollectionData(roomsPath);
        // Cache rooms in hotel data if available
        if (cache.hotels) {
          const hotelData = cache.hotels.find((h) => h.id === hotelId);
          if (hotelData) {
            hotelData._cachedRooms = rooms;
          }
        }
      }

      // ─────────────────────────────────────────────────────────────
      // Format rooms with filtered rate types based on matrix
      // ─────────────────────────────────────────────────────────────
      const formattedRooms = rooms.map((room) => ({
        id: room.id,
        name: room.name,
        rateTypes: this.masterData.priceTypes.filter((t) => activeTypeIds.includes(t.id)).map((t) => ({ id: t.id, name: t.name })),
      }));

      // ─────────────────────────────────────────────────────────────
      // STEP 6: Build complete schema and render
      // ─────────────────────────────────────────────────────────────
      const schema = {
        info: {
          supplierId,
          hotelId,
          year: parseInt(year),
          validFrom: `01/01/${year}`,
          validTo: `31/12/${year}`,
          status: this.selStatus.value,
          supplierName: this.selSupplier.options[this.selSupplier.selectedIndex].text,
          hotelName: this.selHotel.options[this.selHotel.selectedIndex].text,
          viewConfig: {
            periodIds: activePeriodIds,
            packageIds: activePackageIds,
            rateTypeIds: activeTypeIds,
          },
        },
        periods: this.masterData.periods.filter((p) => activePeriodIds.includes(p.id)),
        packages: this.masterData.packages.filter((p) => activePackageIds.includes(p.id)),
        rooms: formattedRooms,
      };

      // Render UI component with schema and existing data (if any)
      this.uiComponent.setData(schema, savedData);
    } catch (error) {
      console.error(error);
      Opps('Lỗi tải bảng giá: ' + error.message);
    } finally {
      this.toggleLoading(false);
    }
  }
  async saveMatrixData() {
    // ─────────────────────────────────────────────────────────────
    // STEP 1: Update only status (NOT config/checkboxes)
    // Keep existing viewConfig from schema - DO NOT override
    // ─────────────────────────────────────────────────────────────
    const currentStatus = this.selStatus.value;

    // Update ONLY status in component schema before getData
    if (this.uiComponent._schema) {
      if (!this.uiComponent._schema.info) this.uiComponent._schema.info = {};
      this.uiComponent._schema.info.status = currentStatus;
      // ⚠️ DO NOT update viewConfig here - keep original filters
    }

    const dataToSave = this.uiComponent.getData();

    if (!dataToSave) {
      if (!confirm('Bảng giá đang trống. Bạn có chắc muốn lưu không?')) return;
    }

    this.toggleLoading(true);
    try {
      // ─────────────────────────────────────────────────────────────
      // STEP 2: Save to Firestore
      // ─────────────────────────────────────────────────────────────
      const docId = dataToSave._docId;
      const payload = { ...dataToSave };
      delete payload._docId;

      await firebase.firestore().collection(DB_PATHS.PRICE_SCHEDULES).doc(docId).set(payload, { merge: true });

      // ─────────────────────────────────────────────────────────────
      // STEP 3: Update cache data after successful save
      // ─────────────────────────────────────────────────────────────
      const cache = HotelPriceController._cacheData;
      cache.priceSchedules[docId] = {
        ...payload,
        _docId: docId,
      };

      logA(`Đã lưu thành công (Trạng thái: ${currentStatus.toUpperCase()})`);
    } catch (error) {
      console.error('Lỗi lưu DB:', error);
      Opps('Lỗi hệ thống khi lưu: ', error.message);
    } finally {
      this.toggleLoading(false);
    }
  }

  // --- HELPERS ---
  async _getCollectionData(path) {
    const snapshot = await firebase.firestore().collection(path).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }

  async _getDocData(collection, id) {
    try {
      const doc = await firebase.firestore().collection(collection).doc(id).get();
      return doc.exists ? doc.data() : null;
    } catch (e) {
      return null;
    }
  }

  renderOptions(selectElement, data, valueField, labelField, defaultLabel) {
    let html = defaultLabel ? `<option value="">-- ${defaultLabel} --</option>` : '';
    data.forEach((item) => {
      html += `<option value="${item[valueField]}">${item[labelField]}</option>`;
    });
    selectElement.innerHTML = html;
  }

  toggleLoading(show) {
    if (show) this.loadingOverlay.classList.remove('d-none');
    else this.loadingOverlay.classList.add('d-none');
  }
}
