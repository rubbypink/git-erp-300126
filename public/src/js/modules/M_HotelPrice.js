
import '../common/components/modal_full.js';
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
                throw new Error("Dữ liệu đầu vào không hợp lệ");
            }

            const { metadata, prices, viewConfig } = rawData;

            // Tạo ID chuẩn
            const docId = `${metadata.supplierId}_${metadata.hotelId}_${metadata.year}`.toUpperCase();

            // Chuyển mảng giá thành Map
            const priceMap = {};
            prices.forEach(item => {
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
                    viewConfig: viewConfig 
                },
                priceData: priceMap,
                searchTags: [
                    metadata.supplierId, 
                    metadata.hotelId, 
                    metadata.year.toString()
                ]
            };

            // === BƯỚC QUAN TRỌNG NHẤT: CLEAN DATA ===
            // Kỹ thuật này sẽ loại bỏ tất cả các trường có giá trị là undefined
            // Giúp Firestore không bao giờ bị lỗi "Unsupported field value: undefined"
            // Lưu ý: Nó cũng biến Date Object thành string (nhưng ta dùng timestamp number nên ok)
            return JSON.parse(JSON.stringify(payload));

        } catch (error) {
            console.error("Lỗi Transformer [toFirestore]:", error);
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
                values: firestoreDoc.priceData 
            };
        } catch (error) {
            console.error("Lỗi Transformer [toClient]:", error);
            return { values: {} };
        }
    }
};
// ============================================================
// 2. UI COMPONENT (Giữ nguyên, chỉ cập nhật getData để lấy config)
// ============================================================

class HotelMatrixPrice extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._schema = null;  // Cấu trúc khung bảng
        this._values = {};    // Dữ liệu giá (Key-Value)
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
        // console.log("Current Data:", this._values);
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
            alert("Vui lòng click vào một ô nhập giá để bắt đầu dán dữ liệu!");
            return;
        }

        // 3. Phân tích dữ liệu Excel (Tab separated)
        // Split dòng bằng \n, split cột bằng \t
        const rows = clipboardData.trim().split(/\r\n|\n|\r/).map(row => row.split('\t'));

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
        const colsPerMetrics = (this._schema.periods.length * this._schema.packages.length);
        
        rows.forEach((rowValues, rIndex) => {
            rowValues.forEach((val, cIndex) => {
                const targetIndex = startIndex + (rIndex * colsPerMetrics) + cIndex;
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
                    value: value
                });
            }
        }

        const safeInfo = this._schema && this._schema.info ? this._schema.info : {};
        const safeViewConfig = this._schema && this._schema.viewConfig ? this._schema.viewConfig : null;

        const rawPayload = {
            metadata: safeInfo,
            viewConfig: safeViewConfig, // Truyền null thay vì undefined
            prices: rawPrices
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
        const { info, periods, packages, rooms } = this._schema;

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
                --header-bg: #f8f9fa; 
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
                /* Bỏ max-height: 70vh đi nhé! */
            }
            
            table { border-collapse: collapse; width: 100%; min-width: 1200px; font-size: 0.95rem; }
            th, td { border: 1px solid var(--border-color); padding: 8px; text-align: center; }
            
            /* Sticky Headers vẫn giữ nguyên để trượt mượt mà */
            thead th { position: sticky; top: 0; background: var(--header-bg); z-index: 10; }
            thead tr:nth-child(2) th { top: 37px; } 
            tbody th.sticky-col { position: sticky; left: 0; background: #fff; z-index: 5; text-align: left; }
            
            input.price-input { width: 100%; min-width: 80px; text-align: right; }
            .room-header { background-color: #e2e3e5; text-align: left; font-weight: bold; padding-left: 10px; }
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
        periods.forEach(p => { theadRow1 += `<th colspan="${packages.length}">${p.name}<br><small>(${p.from} - ${p.to})</small></th>`; });

        let theadRow2 = `<th></th>`;
        periods.forEach(() => { packages.forEach(pkg => { theadRow2 += `<th>${pkg.name}</th>`; }); });

        let tbody = '';
        rooms.forEach(room => {
            tbody += `<tr class="room-header"><td colspan="${1 + (periods.length * packages.length)}">${room.name}</td></tr>`;
            room.rateTypes.forEach(rate => {
                let rowHtml = `<tr><th class="sticky-col"><span class="rate-name">${rate.name}</span></th>`;
                periods.forEach(period => {
                    packages.forEach(pkg => {
                        const key = `${room.id}_${rate.id}_${period.id}_${pkg.id}`;
                        rowHtml += `<td><input type="text" class="price-input number-only" data-key="${key}" value="${this._findValue(key)}"></td>`;
                    });
                });
                tbody += rowHtml + `</tr>`;
            });
        });

        this.shadowRoot.innerHTML = `${styles}${metaHtml}<div class="table-container"><table><thead><tr>${theadRow1}</tr><tr>${theadRow2}</tr></thead><tbody>${tbody}</tbody></table></div>`;
    }

    _findValue(key) { return (this._values && this._values[key]) ? this._values[key].toLocaleString() : ''; }
    _getStatusLabel(s) { const map = { 'actived': 'Đang hoạt động', 'pending': 'Chờ duyệt', 'canceled': 'Đã hủy', 'stopped': 'Tạm dừng' }; return map[s] || 'Mới tạo'; }
    _getStatusClass(s) { const map = { 'actived': 'bg-success', 'pending': 'bg-warning text-dark', 'canceled': 'bg-danger', 'stopped': 'bg-secondary' }; return map[s] || 'bg-primary'; }
}


customElements.define('at-tbl-hotel-price', HotelMatrixPrice);

const DB_PATHS = {
    SUPPLIERS: 'suppliers',
    HOTELS: 'hotels',
    PERIODS: 'app_config/lists/price_periods', 
    PACKAGES: 'app_config/lists/pkg_hotel_price',
    TYPES: 'app_config/lists/price_type',
    PRICE_SCHEDULES: 'hotel_price_schedules' 
};

export class PriceController {
    
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) throw new Error(`Không tìm thấy container: #${containerId}`);
        
        this.masterData = { periods: [], packages: [], priceTypes: [] };
        this.initLayout();
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
                <div class="card-header bg-light p-2 flex-shrink-0 border-bottom">              
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
                    
                    <div class="d-flex gap-2 bg-white p-2 border rounded align-items-end flex-wrap">
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
                                <option value="2025">2025</option><option value="2026">2026</option>
                            </select>
                        </div>
                        
                        <button class="btn btn-outline-secondary btn-sm ms-auto" type="button" data-bs-toggle="collapse" data-bs-target="#configPanel">
                            <i class="bi bi-gear"></i> Cấu hình hiển thị
                        </button>
                        
                        <button id="pc-btn-load" class="btn btn-primary btn-sm" disabled>
                            <i class="bi bi-download"></i> Tải dữ liệu
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
                
                <div class="card-body p-0 flex-grow-1 position-relative" style="overflow: hidden;">
                    <div id="pc-loading" class="position-absolute w-100 h-100 bg-white d-flex justify-content-center align-items-center start-0 top-0 d-none" style="z-index:10; opacity:0.9">
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

        this.btnLoad = this.container.querySelector('#pc-btn-load');
        this.btnSave = this.container.querySelector('#pc-btn-save');
        this.loadingOverlay = this.container.querySelector('#pc-loading');

        this.attachEvents();
        this.initMasterData();
    }

    async initMasterData() {
        this.toggleLoading(true);
        try {
            const [suppliers, periods, packages, types] = await Promise.all([
                this._getCollectionData(DB_PATHS.SUPPLIERS),
                this._getCollectionData(DB_PATHS.PERIODS),
                this._getCollectionData(DB_PATHS.PACKAGES),
                this._getCollectionData(DB_PATHS.TYPES)
            ]);

            this.masterData.periods = periods.sort((a,b) => a.from - b.from);
            this.masterData.packages = packages;
            this.masterData.priceTypes = types;

            this.renderOptions(this.selSupplier, suppliers, 'id', 'name', 'Chọn Nhà cung cấp');

            // Render Checkboxes
            this.renderCheckboxGroup(this.chkPeriods, periods, 'chk-period');
            this.renderCheckboxGroup(this.chkPackages, packages, 'chk-package');
            this.renderCheckboxGroup(this.chkTypes, types, 'chk-type');

            // --- FIX 1: Set mặc định (Default Filters) NGAY LÚC KHỞI TẠO ---
            // Chỉ set 1 lần duy nhất khi vào trang, sau đó user tích gì thì giữ nguyên
            this._applyFilters(null); 

        } catch (error) {
            console.error("Lỗi Init:", error);
        } finally {
            this.toggleLoading(false);
        }
    }

    attachEvents() {
        this.selSupplier.addEventListener('change', async () => {
            const supplierId = this.selSupplier.value;
            this.selHotel.innerHTML = '<option value="">-- Đang tải... --</option>';
            this.selHotel.disabled = true;
            this.btnLoad.disabled = true;

            if (supplierId) {
                const lists = APP_DATA.lists;
                // Logic thực tế bạn nên query where supplierId
                const hotels = await this._getCollectionData(DB_PATHS.HOTELS);
                
                this.renderOptions(this.selHotel, hotels, 'id', 'name', 'Chọn Khách sạn');
                this.selHotel.disabled = false;
            } else {
                this.selHotel.innerHTML = '<option value="">-- Chọn Khách sạn --</option>';
            }
        });

        this.selHotel.addEventListener('change', () => { this.btnLoad.disabled = !this.selHotel.value; });
        this.btnLoad.addEventListener('click', async () => await this.loadMatrixData());
        this.btnSave.addEventListener('click', async () => await this.saveMatrixData());
    }

    // --- LOGIC CHECKBOX FILTER ---
    
    // Render HTML Checkbox
    renderCheckboxGroup(container, data, className) {
        container.innerHTML = data.map(item => `
            <div class="form-check">
                <input class="form-check-input ${className}" type="checkbox" value="${item.id}" id="${className}-${item.id}">
                <label class="form-check-label" for="${className}-${item.id}">${item.name}</label>
            </div>
        `).join('');
    }

    // Set trạng thái checked cho checkbox
    // IDs: Mảng id cần check. Nếu null -> Check Default
    // type: 'period' | 'package' | 'rateType'
    _applyFilters(savedConfig = null) {
        // Helper check
        const setCheck = (container, className, conditionFn) => {
            const inputs = container.querySelectorAll(`.${className}`);
            inputs.forEach((input, index) => {
                input.checked = conditionFn(input.value, index);
            });
        };

        if (savedConfig) {
            // CASE 1: LOAD CŨ -> Dùng config đã lưu
            setCheck(this.chkPeriods, 'chk-period', (val) => savedConfig.periodIds.includes(val));
            setCheck(this.chkPackages, 'chk-package', (val) => savedConfig.packageIds.includes(val));
            setCheck(this.chkTypes, 'chk-type', (val) => savedConfig.rateTypeIds.includes(val));
        } else {
            // CASE 2: LOAD MỚI -> Dùng Default Rules
            // Periods: check 'all_year' (Giả sử id là 'all_year' hoặc 'p_all')
            setCheck(this.chkPeriods, 'chk-period', (val) => val === 'all_year' || val === 'p01'); // Fix logic ID của bạn ở đây

            // Packages: check package đầu tiên hoặc id 'base'
            setCheck(this.chkPackages, 'chk-package', (val, idx) => idx === 0 || val === 'base');

            // Rate Types: check id 'base'
            setCheck(this.chkTypes, 'chk-type', (val) => val === 'base' || val === 'bb'); // Fix logic ID
        }
    }

    // Lấy danh sách ID đang được check để lọc Schema
    _getCheckedIds(container, className) {
        const checked = [];
        container.querySelectorAll(`.${className}:checked`).forEach(inp => checked.push(inp.value));
        return checked;
    }

    // --- MAIN LOGIC ---

    async loadMatrixData() {
        const hotelId = this.selHotel.value;
        const supplierId = this.selSupplier.value;
        const year = this.selYear.value;

        if (!hotelId || !supplierId) return;
        
        // --- FIX 3: Tự động ẩn Config Panel khi bấm Load ---
        const configPanel = document.getElementById('configPanel');
        if (configPanel && configPanel.classList.contains('show')) {
            configPanel.classList.remove('show'); // Đóng panel
            // (Optional) Nếu muốn đẹp hơn thì giả lập click vào nút toggle nếu bạn muốn update aria-expanded
        }

        this.toggleLoading(true);
        try {
            // 1. Get Data Saved
            const docId = `${supplierId}_${hotelId}_${year}`.toUpperCase();
            const savedData = await this._getDocData(DB_PATHS.PRICE_SCHEDULES, docId);

            // 2. Apply Filters (XỬ LÝ LOGIC FIX TẠI ĐÂY)
            
            if (savedData && savedData.info && savedData.info.viewConfig) {
                // TRƯỜNG HỢP CÓ DỮ LIỆU CŨ:
                // Hỏi: Bạn muốn ưu tiên Config đã lưu hay Config user vừa tích chọn?
                // Thông thường: Nếu load lại bảng cũ -> Nên hiển thị đúng như lúc lưu.
                this._applyFilters(savedData.info.viewConfig);
            } 
            else {
                // TRƯỜNG HỢP TẠO MỚI (New):
                // --- FIX 2: TUYỆT ĐỐI KHÔNG GỌI this._applyFilters(null) Ở ĐÂY ---
                // Lý do: Nếu gọi, nó sẽ reset hết checkbox user vừa mất công chọn về mặc định.
                // Kệ user, user chọn gì thì dùng nấy.
            }

            // 3. Update Status UI
            if (savedData && savedData.info && savedData.info.status) {
                this.selStatus.value = savedData.info.status;
            } else {
                this.selStatus.value = 'actived'; 
            }

            // 4. Get active IDs from Checkboxes (Lấy giá trị thực tế trên UI hiện tại)
            const activePeriodIds = this._getCheckedIds(this.chkPeriods, 'chk-period');
            const activePackageIds = this._getCheckedIds(this.chkPackages, 'chk-package');
            const activeTypeIds = this._getCheckedIds(this.chkTypes, 'chk-type');

            if (activePeriodIds.length === 0 || activePackageIds.length === 0 || activeTypeIds.length === 0) {
                alert("Cảnh báo: Bộ lọc hiển thị đang rỗng. Bảng giá sẽ không hiển thị cột nào!");
            }

            // 5. Build Schema
            const roomsPath = `${DB_PATHS.HOTELS}/${hotelId}/rooms`;
            const rooms = await this._getCollectionData(roomsPath);

            const formattedRooms = rooms.map(room => ({
                id: room.id,
                name: room.name,
                rateTypes: this.masterData.priceTypes
                    .filter(t => activeTypeIds.includes(t.id))
                    .map(t => ({ id: t.id, name: t.name }))
            }));

            const schema = {
                info: { 
                    supplierId, hotelId, year: parseInt(year),
                    validFrom: `01/01/${year}`, validTo: `31/12/${year}`,
                    status: this.selStatus.value,
                    supplierName: this.selSupplier.options[this.selSupplier.selectedIndex].text,
                    hotelName: this.selHotel.options[this.selHotel.selectedIndex].text,
                    viewConfig: {
                        periodIds: activePeriodIds,
                        packageIds: activePackageIds,
                        rateTypeIds: activeTypeIds
                    }
                },
                periods: this.masterData.periods.filter(p => activePeriodIds.includes(p.id)),
                packages: this.masterData.packages.filter(p => activePackageIds.includes(p.id)),
                rooms: formattedRooms
            };

            this.uiComponent.setData(schema, savedData);

        } catch (error) {
            console.error(error);
            alert("Lỗi tải bảng giá: " + error.message);
        } finally {
            this.toggleLoading(false);
        }
    }
    async saveMatrixData() {
        // 1. Cập nhật lại status và viewConfig mới nhất từ UI vào Component trước khi get data
        // (Phòng trường hợp user thay đổi status/checkbox mà không bấm Load lại)
        const currentStatus = this.selStatus.value;
        const currentConfig = {
            periodIds: this._getCheckedIds(this.chkPeriods, 'chk-period'),
            packageIds: this._getCheckedIds(this.chkPackages, 'chk-package'),
            rateTypeIds: this._getCheckedIds(this.chkTypes, 'chk-type')
        };

        // Hack nhẹ: Update trực tiếp vào _schema của component để khi getData nó lấy đúng cái mới nhất
        if (this.uiComponent._schema) {
            if (!this.uiComponent._schema.info) this.uiComponent._schema.info = {};
            this.uiComponent._schema.info.status = currentStatus;
            this.uiComponent._schema.viewConfig = currentConfig;
            console.log("Cập nhật schema trước khi lưu:", this.uiComponent._schema);
        }

        const dataToSave = this.uiComponent.getData();
        
        if (!dataToSave) {
            // Cho phép lưu kể cả khi giá trống? Tùy nghiệp vụ. Ở đây tôi chặn.
             if(!confirm("Bảng giá đang trống. Bạn có chắc muốn lưu cấu hình rỗng không?")) return;
        }

        this.toggleLoading(true);
        try {
            const docId = dataToSave._docId;
            const payload = { ...dataToSave };
            delete payload._docId;
            await firebase.firestore().collection(DB_PATHS.PRICE_SCHEDULES)
                            .doc(docId)
                            .set(payload, { merge: true });
            alert(`Đã lưu thành công (Trạng thái: ${currentStatus.toUpperCase()})`);
        } catch (error) {
            console.error("Lỗi lưu DB:", error);
            alert("Lỗi hệ thống khi lưu: " + error.message);
        } finally {
            this.toggleLoading(false);
        }
    }

    // --- HELPERS ---
    async _getCollectionData(path) {
        const snapshot = await firebase.firestore().collection(path).get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    async _getDocData(collection, id) {
        try {
            const doc = await firebase.firestore().collection(collection).doc(id).get();
            return doc.exists ? doc.data() : null;
        } catch (e) { return null; }
    }

    renderOptions(selectElement, data, valueField, labelField, defaultLabel) {
        let html = defaultLabel ? `<option value="">-- ${defaultLabel} --</option>` : '';
        data.forEach(item => { html += `<option value="${item[valueField]}">${item[labelField]}</option>`; });
        selectElement.innerHTML = html;
    }

    toggleLoading(show) {
        if (show) this.loadingOverlay.classList.remove('d-none');
        else this.loadingOverlay.classList.add('d-none');
    }
}

window.PriceController = PriceController;
