/**
 * 9 TRIP ERP - UNIFIED ADMIN CONTROLLER (v3.2 - DOM Property Fix)
 * Path: public/src/js/modules/AdminController.js
 * Fix: JSON Display Error using DOM Property injection
 */

// =============================================================================
// PHẦN 1: WEB COMPONENT (UPDATED RENDER LOGIC)
// =============================================================================
class FirestoreDataTable extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._headers = [];
        this._data = [];
        this._currentFocus = null;
    }

    setSchema(headers, data = []) {
        this._headers = headers;
        this._data = data.length > 0 ? data : [this._createEmptyRow()];
        this.render();
    }

    _createEmptyRow() {
        const obj = {};
        this._headers.forEach(h => obj[h] = "");
        return obj;
    }

    getData() {
        const rows = this.shadowRoot.querySelectorAll('tr.data-row');
        return Array.from(rows).map(tr => {
            const obj = {};
            this._headers.forEach(h => {
                const inp = tr.querySelector(`.inp-${h}`);
                obj[h] = inp ? inp.value : "";
            });
            return obj;
        });
    }

    _handlePaste(e) {
        if (!this._currentFocus) return;
        e.preventDefault();
        const clipboardData = e.clipboardData || window.clipboardData;
        const pastedText = clipboardData.getData('Text');
        const rows = pastedText.split(/\r?\n/).filter(row => row.length > 0);
        const matrix = rows.map(row => row.split('\t'));

        const currentData = this.getData();
        const startRow = this._currentFocus.rowIndex;
        const startFieldIdx = this._headers.indexOf(this._currentFocus.fieldName);

        matrix.forEach((rowData, rIdx) => {
            const targetRowIdx = startRow + rIdx;
            if (!currentData[targetRowIdx]) currentData[targetRowIdx] = this._createEmptyRow();
            rowData.forEach((cellValue, cIdx) => {
                const targetFieldIdx = startFieldIdx + cIdx;
                if (targetFieldIdx < this._headers.length) {
                    const fieldName = this._headers[targetFieldIdx];
                    currentData[targetRowIdx][fieldName] = cellValue;
                }
            });
        });

        this._data = currentData;
        this.render();
    }

    render() {
        // CSS Style giữ nguyên
        const style = `
            <style>
                :host { display: block; --primary: #0d6efd; }
                .table-container { overflow: auto; border: 1px solid #dee2e6; max-height: 60vh; position: relative; }
                table { width: 100%; border-collapse: collapse; font-size: 13px; table-layout: fixed; }
                th { background: #f8f9fa; padding: 8px; border: 1px solid #dee2e6; position: sticky; top: 0; z-index: 10; text-transform: uppercase; font-size: 11px; color: #666; }
                td { border: 1px solid #dee2e6; padding: 0; }
                input { background: #e7f1ff; width: -webkit-fill-available; padding: 8px; border: none; outline: none; font-family: inherit; font-size: 13px; color: #1f1e1e; text-align: center; }
                input:focus { background: #c9cacc; box-shadow: inset 0 0 0 2px #0d6efd; width: -webkit-fill-available; }
                .inp-sub { background: #fff3cd; color: #856404; font-weight: bold; }
                .btn-del { border: none; background: transparent; color: #dc3545; cursor: pointer; font-weight: bold; width: 100%; height: 100%; }
                .resizer { position: absolute; top: 0; right: 0; width: 5px; cursor: col-resize; height: 100%; user-select: none; }
                .toolbar { margin-top: 8px; display: flex; justify-content: space-between; align-items: center; }
            </style>`;

        const headerHtml = this._headers.map(h => `<th>${h}<div class="resizer"></div></th>`).join('') + '<th style="width:30px">#</th>';

        // --- KHU VỰC SỬA ĐỔI QUAN TRỌNG ---
        // 1. Tạo HTML Input KHÔNG CÓ value="..."
        // Chúng ta dùng data-ridx (row index) và data-key để tham chiếu sau này
        const bodyHtml = this._data.map((row, idx) => `
            <tr class="data-row">
                ${this._headers.map(h => {
                    // Logic check sub để tô màu (chỉ check type string)
                    const rawVal = row[h];
                    const isSub = typeof rawVal === 'string' && rawVal.startsWith('sub:');
                    
                    // Tuyệt đối KHÔNG ĐỂ value="${...}" ở đây
                    return `<td><input type="text" class="inp-${h} ${isSub?'inp-sub':''}" data-ridx="${idx}" data-key="${h}"></td>`;
                }).join('')} 
                <td class="text-center"><button class="btn-del" data-index="${idx}">X</button></td>
            </tr>
        `).join('');

        this.shadowRoot.innerHTML = `${style}<div class="table-container" id="paste-zone"><table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>
            <div class="toolbar"><button class="btn btn-sm btn-primary" id="add-row">+ Thêm</button><small class="text-muted">Click & Ctrl+V để dán</small></div>`;

        // 2. Bơm dữ liệu bằng Javascript (An toàn tuyệt đối với mọi ký tự)
        this.shadowRoot.querySelectorAll('input[data-ridx]').forEach(inp => {
            const rIdx = parseInt(inp.getAttribute('data-ridx'));
            const key = inp.getAttribute('data-key');
            
            if (this._data[rIdx]) {
                let val = this._data[rIdx][key];
                
                if (val === undefined || val === null) {
                    val = '';
                } else if (typeof val === 'object') {
                    // Tự động stringify Object/Array thành JSON để hiển thị
                    val = JSON.stringify(val);
                }
                
                // Gán trực tiếp vào thuộc tính value của DOM Element
                // Trình duyệt sẽ hiển thị nguyên văn, không cắt bớt bất cứ gì
                inp.value = val;
            }
        });
        // ----------------------------------

        this._attachEvents();
    }
    _attachEvents() {
        this.shadowRoot.querySelectorAll('input').forEach(inp => {
            inp.addEventListener('focus', (e) => {
                const tr = e.target.closest('tr');
                this._currentFocus = { rowIndex: Array.from(tr.parentNode.children).indexOf(tr), fieldName: e.target.className.split(' ')[0].replace('inp-', '') };
            });
        });
        this.shadowRoot.getElementById('add-row').addEventListener('click', () => { this._data = this.getData(); this._data.push(this._createEmptyRow()); this.render(); });
        this.shadowRoot.querySelectorAll('.btn-del').forEach(btn => { btn.addEventListener('click', (e) => { this._data = this.getData(); this._data.splice(e.target.dataset.index, 1); this.render(); }); });
        this.shadowRoot.getElementById('paste-zone').addEventListener('paste', (e) => this._handlePaste(e));
        this.shadowRoot.querySelectorAll('.resizer').forEach(r => {
            r.addEventListener('mousedown', (e) => {
                e.preventDefault(); const th = e.target.parentElement; const startX = e.pageX; const startW = th.offsetWidth;
                const mm = (ev) => { th.style.width = (startW + ev.pageX - startX) + 'px'; };
                const mu = () => { document.removeEventListener('mousemove', mm); document.removeEventListener('mouseup', mu); };
                document.addEventListener('mousemove', mm); document.addEventListener('mouseup', mu);
            });
        });
    }
}
if (!customElements.get('table-db-data')) customElements.define('table-db-data', FirestoreDataTable);

// =============================================================================
// PHẦN 2: LOGIC XỬ LÝ (Matrix Logic & Form Logic)
// =============================================================================
class MatrixLogic {
    constructor(db) { this.db = db; }

    async getHeaders(path, fetchedData = []) {
        let headers = [];
        // 1. Config Global
        if (typeof FIELD_MAP !== 'undefined' && FIELD_MAP[path]) {
            const config = FIELD_MAP[path];
            if (Array.isArray(config)) headers = config;
            else if (typeof config === 'object') headers = Object.values(config);
            return headers;
        }
        // 2. Data Scan
        if (fetchedData.length > 0) {
            let autoHeaders = Object.keys(fetchedData[0]);
            if (autoHeaders.includes('id')) autoHeaders = ['id', ...autoHeaders.filter(h => h !== 'id')];
            return autoHeaders;
        }
        // 3. User Input
        const customInput = prompt(`Collection [${path}] chưa có cấu hình. Nhập các cột (cách nhau dấu phẩy):`, "id,name,description");
        if (customInput) return customInput.split(',').map(s => s.trim());
        return ['id', 'name']; 
    }

    async render(container, path) {
        container.innerHTML = '<div class="text-center mt-5"><div class="spinner-border text-primary"></div><p>Đang tải Matrix...</p></div>';
        try {
            const snapshot = await this.db.collection(path).limit(50).get();
            let data = [];
            
            snapshot.forEach(doc => {
                // --- SỬA ĐỔI Ở ĐÂY ---
                // Chỉ lấy dữ liệu thô, KHÔNG JSON.stringify thủ công nữa
                let row = { id: doc.id, ...doc.data() };
                
                // (Đã xóa đoạn code Object.keys(row).forEach...)
                
                data.push(row);
            });

            // Gọi hàm lấy Header
            const headers = await this.getHeaders(path, data);

            container.innerHTML = `<table-db-data id="adm-matrix-table"></table-db-data>`;
            container.querySelector('table-db-data').setSchema(headers, data);

            if (path.includes('hotels')) {
                if (AdminConsole.currentStrategy && AdminConsole.currentStrategy.decodeSubCollections) {
                    // Tham số 1: Path hiện tại, Tham số 2: Tên field cần decode
                    AdminConsole.currentStrategy.decodeSubCollections(AdminConsole.currentPath, 'rooms');
                }
            }
            
            // Debug: In ra console để kiểm tra dữ liệu gốc có bị lỗi không
            // console.log(`✅ Loaded ${data.length} rows from [${path}]`, data);

        } catch (e) {
            console.error(e);
            container.innerHTML = `<div class="alert alert-danger">Lỗi tải dữ liệu: ${e.message}</div>`;
        }
    }

    async decodeSubCollections(path, targetField = 'rooms') {
        const table = document.querySelector('#adm-matrix-table');
        if (!table) return;
        if (!table._headers.includes(targetField)) return alert(`⚠️ Cột [${targetField}] không tồn tại.`);

        const data = table.getData();
        const btnDecode = document.getElementById('adm-btn-decode');
        if(btnDecode) btnDecode.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Decoding...';

        try {
            const newData = await Promise.all(data.map(async (row) => {
                if (!row.id) return row;
                try {
                    const subSnap = await this.db.collection(path).doc(row.id).collection(targetField).get();
                    if (!subSnap.empty) {
                        const subIds = subSnap.docs.map(d => d.id);
                        row[targetField] = `sub: ${subIds.join(', ')}`;
                    } else { row[targetField] = ''; }
                } catch (e) {}
                return row;
            }));
            table.setSchema(table._headers, newData);
        } catch (e) { alert("Lỗi: " + e.message); } 
        finally { if(btnDecode) btnDecode.innerHTML = '<i class="fas fa-network-wired"></i> Decode Sub'; }
    }

    async save(path) {
        const table = document.querySelector('#adm-matrix-table');
        if (!table) return;
        const rawData = table.getData();
        if (rawData.length === 0) return alert("Không có dữ liệu.");

        try {
            const cleanData = rawData.map(row => {
                const newRow = {};
                Object.keys(row).forEach(key => {
                    if (String(row[key]).trim().startsWith('sub:')) return;
                    let val = row[key];
                    if (typeof val === 'string' && (val.trim().startsWith('{') || val.trim().startsWith('['))) {
                        try { newRow[key] = JSON.parse(val); } catch (e) { newRow[key] = val; }
                    } else { newRow[key] = val; }
                });
                return newRow;
            });

            if (A.DB.batchSave) await A.DB.batchSave(path, cleanData);
            else {
                const batch = this.db.batch();
                cleanData.forEach(item => {
                    const ref = item.id ? this.db.collection(path).doc(item.id) : this.db.collection(path).doc();
                    batch.set(ref, item, {merge: true});
                });
                await batch.commit();
            }

            const batchSub = this.db.batch();
            let countSub = 0;
            rawData.forEach(row => {
                if(!row.id) return;
                Object.keys(row).forEach(key => {
                    const val = String(row[key] || "").trim();
                    if(val.startsWith('sub:')) {
                        const subIds = val.replace('sub:', '').split(',').map(s=>s.trim()).filter(s=>s);
                        subIds.forEach(subId => {
                            const subRef = this.db.collection(path).doc(row.id).collection(key).doc(subId.replace(/\//g, '-'));
                            batchSub.set(subRef, { id: subId, parentId: row.id }, { merge: true });
                            countSub++;
                        });
                    }
                });
            });
            if(countSub > 0) await batchSub.commit();
            alert(`✅ Đã lưu Master và ${countSub} Sub-documents!`);
        } catch (e) { alert("❌ Lỗi: " + e.message); }
    }
}

class FormLogic {
    constructor(db) { this.db = db; }
    async render(container, path) {
        container.innerHTML = '<div class="text-center mt-5"><div class="spinner-border text-warning"></div><p>Đang tải cấu hình...</p></div>';
        try {
            const snapshot = await this.db.collection(path).limit(1).get();
            if (snapshot.empty) throw new Error("Collection trống.");
            const doc = snapshot.docs[0]; const data = doc.data(); const docId = doc.id;
            let fieldsHtml = '';
            Object.keys(data).forEach(key => {
                const val = data[key]; const isObj = typeof val === 'object' && val !== null;
                const displayVal = isObj ? JSON.stringify(val, null, 4) : val;
                fieldsHtml += `<div class="mb-3"><label class="fw-bold">${key}</label>${isObj ? `<textarea class="form-control font-monospace adm-input" data-key="${key}" rows="8" style="background: #f8f9fa">${displayVal}</textarea>` : `<input type="text" class="form-control adm-input" data-key="${key}" value="${displayVal}">`}</div>`;
            });
            container.innerHTML = `<div class="card shadow-sm mx-auto" style="max-width: 800px;"><div class="card-header bg-warning">Chỉnh sửa: ${docId}</div><div class="card-body"><form id="adm-form-editor" data-doc-id="${docId}">${fieldsHtml}</form></div></div>`;
        } catch (e) { container.innerHTML = `<div class="alert alert-danger">Lỗi: ${e.message}</div>`; }
    }
    async save(path) {
        const form = document.querySelector('#adm-form-editor'); if (!form) return;
        const payload = {}; const inputs = form.querySelectorAll('.adm-input');
        inputs.forEach(inp => { let val = inp.value; if (val.trim().startsWith('{')||val.trim().startsWith('[')) try{val=JSON.parse(val)}catch(e){} payload[inp.dataset.key] = val; });
        await this.db.collection(path).doc(form.dataset.docId).update(payload); alert("✅ Đã cập nhật Form!");
    }
}


// =============================================================================
// PHẦN 3: MAIN CONTROLLER (Updated v3.2)
// =============================================================================
class AdminController {
    constructor() {
        this.collections = [
            { name: '⚙️ Cấu hình Ngôn ngữ (Settings)', path: 'app_config/general/settings', type: 'FORM' },
            { name: '👥 DS Khách hàng', path: 'customers', type: 'MATRIX' },
            { name: '🏨 DS Khách sạn', path: 'hotels', type: 'MATRIX' },
            { name: '💰 Bảng giá DV', path: 'service_price_schedules', type: 'MATRIX' },
            { name: '🏨 Bảng giá Khách sạn', path: 'app_config/lists/pkg_hotel_price', type: 'MATRIX' },
            { name: '📅 List Giai Đoạn Giá', path: 'app_config/lists/price_periods', type: 'MATRIX' },
            { name: '💳 Loại giá', path: 'app_config/lists/price_type', type: 'MATRIX' },
            { name: '🏢 DS Nhà cung cấp', path: 'suppliers', type: 'MATRIX' },
            { name: '📦 Booking', path: 'bookings', type: 'MATRIX' },
            { name: '📋 Chi tiết Booking', path: 'booking_details', type: 'MATRIX' },
            { name: '📋 Chi tiết Booking NCC', path: 'operator_entries', type: 'MATRIX' },
            { name: '🔢 Bộ đếm ID', path: 'counters_id', type: 'MATRIX' },
            { name: '⚙️ Cấu hình Ứng dụng', path: 'app_config', type: 'FORM' },

            { name: '👤 Người dùng', path: 'users', type: 'MATRIX' },
            { name: '💸 DS PT/PC', path: 'transactions', type: 'MATRIX' },
            { name: '🏦 DS Tài khoản', path: 'fund_accounts', type: 'MATRIX' },
            { name: '💸 DS PT/PC TheNice', path: 'transactions_thenice', type: 'MATRIX' },
            { name: '🏦 DS Tài khoản TheNice', path: 'fund_accounts_thenice', type: 'MATRIX' }
        ];
        this.currentStrategy = null;
        this.currentPath = '';
        this.currentData = [];
        this.isFilterMode = false;
        this.selectedCollectionIndex = null;
    }

    init() {
        const modal = document.querySelector('at-modal-full');
        if (!modal) return console.error("Missing <at-modal-full>");
        modal.show(this._getLayout(), 'Admin Console (v3.2 Full Fix)');
        modal.setFooter(false);
        this._bindEvents();
    }

    _getLayout() {
        const opts = this.collections.map((c, i) => `<option value="${i}">${c.name}</option>`).join('');
        return `
            <div class="container-fluid h-100 d-flex flex-column p-0">
                <div class="d-flex align-items-center bg-light p-2 border-bottom gap-2 flex-wrap">
                    <select id="adm-select" class="form-select form-select-sm fw-bold" style="width:250px">
                        <option value="">-- Chọn danh mục --</option>
                        ${opts}
                    </select>
                    
                    <div class="input-group input-group-sm" style="width: 300px;">
                        <input type="text" id="adm-input-path" class="form-control" placeholder="Nhập path collection...">
                        <button class="btn btn-outline-secondary" id="adm-btn-fetch"><i class="fas fa-arrow-right"></i> Load</button>
                    </div>

                    <div class="ms-auto d-flex gap-2">
                        <button id="adm-btn-decode" class="btn btn-sm btn-info text-white fw-bold" disabled>
                            <i class="fas fa-network-wired"></i> Decode Sub (rooms)
                        </button>
                        <button id="adm-btn-save" class="btn btn-sm btn-success fw-bold px-3" disabled>
                            <i class="fas fa-save"></i> LƯU
                        </button>
                        <button id="adm-btn-delete" class="btn btn-sm btn-danger fw-bold px-3">
                            <i class="fas fa-trash"></i> XÓA
                        </button>
                    </div>
                </div>

                <div id="adm-workspace" class="flex-grow-1 p-3 bg-white" style="overflow-y:auto">
                    <div class="text-center mt-5 text-secondary">
                        <i class="fas fa-cubes fa-4x mb-3"></i>
                        <p>Chọn collection hoặc nhập Path để bắt đầu.</p>
                    </div>
                </div>
            </div>
        `;
    }

    _bindEvents() {
        const db = (typeof A !== 'undefined' && A.DB && A.DB.db) ? A.DB.db : firebase.firestore();
        const select = document.getElementById('adm-select');
        const inputPath = document.getElementById('adm-input-path');
        const btnFetch = document.getElementById('adm-btn-fetch');
        const btnDecode = document.getElementById('adm-btn-decode');
        const btnSave = document.getElementById('adm-btn-save');
        const btnDelete = document.getElementById('adm-btn-delete');
        const workspace = document.getElementById('adm-workspace');

        const loadView = (path, type) => {
            this.currentPath = path;
            inputPath.value = path;
            inputPath.placeholder = "Nhập path collection...";
            this.isFilterMode = false;
            
            if (type === 'FORM') {
                this.currentStrategy = new FormLogic(db);
                btnDecode.disabled = true; 
            } else {
                this.currentStrategy = new MatrixLogic(db);
                btnDecode.disabled = false;
            }
            btnSave.disabled = false;
            this.currentStrategy.render(workspace, path);
        };

        const applyFilter = (filterValue) => {
            if (!this.currentData.length || !this.currentStrategy) return;
            
            // Lọc dữ liệu từ currentData dựa vào filter value
            const filtered = this.currentData.filter(row => {
                // Kiểm tra nếu bất kỳ field nào chứa filter value
                return Object.values(row).some(val => 
                    String(val).toLowerCase().includes(filterValue.toLowerCase())
                );
            });
            
            // Update table với dữ liệu đã lọc
            const table = document.querySelector('#adm-matrix-table');
            if (table) {
                table.setSchema(table._headers, filtered);
            }
        };

        select.addEventListener('change', (e) => {
            if(e.target.value === "") {
                inputPath.value = '';
                inputPath.placeholder = "Nhập path collection...";
                this.selectedCollectionIndex = null;
                const table = document.querySelector('#adm-matrix-table');
                if (table) {
                    table.setSchema(table._headers, {});
                }
                return;
            }
            this.selectedCollectionIndex = parseInt(e.target.value);
            const config = this.collections[this.selectedCollectionIndex];
            
            // Set placeholder thành filter input
            inputPath.value = '';
            inputPath.placeholder = `Lọc danh sách: ${config.name}`;
            this.isFilterMode = false;
            
            // Load dữ liệu của collection được select
            this.currentPath = config.path;
            if (config.type === 'FORM') {
                this.currentStrategy = new FormLogic(db);
                btnDecode.disabled = true;
            } else {
                this.currentStrategy = new MatrixLogic(db);
                btnDecode.disabled = false;
            }
            btnSave.disabled = false;
            
            // Ghi lại chiến lược để load dữ liệu
            const strategyToUse = this.currentStrategy;
            const pathToLoad = config.path;
            
            // Nếu là MATRIX, load dữ liệu và lưu vào currentData
            if (config.type === 'MATRIX') {
                db.collection(pathToLoad).limit(300).get().then(snapshot => {
                    this.currentData = [];
                    snapshot.forEach(doc => {
                        let row = { id: doc.id, ...doc.data() };
                        this.currentData.push(row);
                    });
                    
                    // Render dữ liệu đã load
                    strategyToUse.render(workspace, pathToLoad);
                }).catch(e => {
                    console.error(e);
                    workspace.innerHTML = `<div class="alert alert-danger">Lỗi tải dữ liệu: ${e.message}</div>`;
                });
            } else {
                // Cho FORM, load bình thường
                strategyToUse.render(workspace, pathToLoad);
            }
        });

        btnFetch.addEventListener('click', () => {
            // Kiểm tra nếu đang ở chế độ select collection (filter mode)
            if (this.selectedCollectionIndex !== null && this.isFilterMode === false) {
                // Chế độ filter: apply filter khi click Load
                this.isFilterMode = true;
                const filterValue = inputPath.value.trim();
                if (!filterValue) {
                    // Nếu input trống, hiển thị toàn bộ dữ liệu
                    const table = document.querySelector('#adm-matrix-table');
                    if (table) {
                        table.setSchema(table._headers, this.currentData);
                    }
                } else {
                    // Apply filter
                    applyFilter(filterValue);
                }
            } else if (!this.selectedCollectionIndex) {
                // Chế độ input path trực tiếp
                const path = inputPath.value.trim();
                if(!path) return alert("Vui lòng nhập Path!");
                const type = path.includes('settings') ? 'FORM' : 'MATRIX';
                this.isFilterMode = false;
                
                // Load dữ liệu
                this.currentPath = path;
                if (type === 'MATRIX') {
                    db.collection(path).limit(300).get().then(snapshot => {
                        this.currentData = [];
                        snapshot.forEach(doc => {
                            let row = { id: doc.id, ...doc.data() };
                            this.currentData.push(row);
                        });
                        
                        if (type === 'FORM') {
                            this.currentStrategy = new FormLogic(db);
                            btnDecode.disabled = true;
                        } else {
                            this.currentStrategy = new MatrixLogic(db);
                            btnDecode.disabled = false;
                        }
                        btnSave.disabled = false;
                        this.currentStrategy.render(workspace, path);
                    }).catch(e => {
                        console.error(e);
                        workspace.innerHTML = `<div class="alert alert-danger">Lỗi tải dữ liệu: ${e.message}</div>`;
                    });
                } else {
                    loadView(path, type);
                }
            }
        });

        // Input path change event - apply filter in real-time
        inputPath.addEventListener('input', (e) => {
            if (this.selectedCollectionIndex !== null && this.isFilterMode) {
                const filterValue = e.target.value.trim();
                if (filterValue) {
                    applyFilter(filterValue);
                } else {
                    // Reset về toàn bộ dữ liệu
                    const table = document.querySelector('#adm-matrix-table');
                    if (table) {
                        table.setSchema(table._headers, this.currentData);
                    }
                }
            }
        });

        btnDecode.addEventListener('click', () => {
            if(this.currentStrategy && this.currentStrategy instanceof MatrixLogic) {
                const field = prompt("Nhập tên sub-collection cần decode (ví dụ: rooms, details):", "rooms");
                if(field) this.currentStrategy.decodeSubCollections(this.currentPath, field);
            }
        });

        btnSave.addEventListener('click', () => {
            if (this.currentStrategy) this.currentStrategy.save(this.currentPath);
        });

        btnDelete.addEventListener('click', () => {
            const table = document.querySelector('#adm-matrix-table');
            if (!table) return alert("Không tìm thấy bảng!");
            
            const tableData = table.getData();
            if (tableData.length === 0) return alert("Bảng không có dữ liệu!");
            
            // Lấy danh sách ID từ bảng
            const listId = tableData.map(row => row.id).filter(id => id);
            
            if (listId.length === 0) return alert("Không tìm thấy ID để xóa!");
            
            // Xác nhận xóa
            const confirmMsg = listId.length === 1 
                ? `Bạn có chắc chắn muốn xóa ID: ${listId[0]}?`
                : `Bạn có chắc chắn muốn xóa ${listId.length} bản ghi?`;
            
            if (confirm(confirmMsg)) {
                if (typeof A === 'undefined' || !A.DB) {
                    return alert("❌ A.DB không khả dụng!");
                }
                
                // Nếu 1 hàng: gọi deleteRecord
                if (listId.length === 1) {
                    if (A.DB.deleteRecord) {
                        A.DB.deleteRecord(this.currentPath, listId[0]).then(() => {
                            alert("✅ Đã xóa thành công!");
                            // Reload dữ liệu
                            if (this.selectedCollectionIndex !== null) {
                                select.dispatchEvent(new Event('change'));
                            }
                        }).catch((e) => {
                            alert("❌ Lỗi xóa: " + e.message);
                        });
                    } else {
                        alert("❌ A.DB.deleteRecord không khả dụng!");
                    }
                } else {
                    // Nếu nhiều hàng: gọi batchDelete
                    if (A.DB.batchDelete) {
                        A.DB.batchDelete(this.currentPath, listId).then(() => {
                            alert("✅ Đã xóa " + listId.length + " bản ghi thành công!");
                            // Reload dữ liệu
                            if (this.selectedCollectionIndex !== null) {
                                select.dispatchEvent(new Event('change'));
                            }
                        }).catch((e) => {
                            alert("❌ Lỗi xóa: " + e.message);
                        });
                    } else {
                        alert("❌ A.DB.batchDelete không khả dụng!");
                    }
                }
            }
        });
    }

    /**
 * 9TRIP HELPER: LAZY LOAD SETTINGS MODAL
 * Tối ưu hiệu năng: Chỉ tải HTML qua mạng khi click lần đầu tiên
 */
async openAdminSettings() {
    const modalId = 'modal-system-settings';
    let modalEl = document.getElementById(modalId);

    try {
        // Bước 1: KIỂM TRA DOM - Nếu chưa có thì mới tiến hành Fetch
        if (!modalEl) {
            console.log("⚙️ Đang tải giao diện Settings lần đầu...");
            
            // Tùy chọn: Bạn có thể bật 1 cái icon xoay xoay (loading) ở đây

            // Gọi Fetch lấy file HTML
            const response = await fetch('/public/src/components/tpl_settings.html');
            
            // Kiểm tra nếu đường dẫn sai (báo lỗi 404)
            if (!response.ok) {
                throw new Error(`Lỗi mạng: ${response.status} - Không tìm thấy file template!`);
            }

            // GIẢI MÃ: Biến response thành chuỗi Text HTML
            const htmlText = await response.text();

            // Nhúng thẳng vào thẻ <body>
            A.Modal.show(htmlText, 'Cài đặt hệ thống');
            
            console.log("✅ Đã render giao diện Settings thành công!");
            
            // [Quan trọng] Gọi hàm bind sự kiện cho các nút bên trong Modal ở đây
            // initSettingsEvents(); 
        }

    } catch (error) {
        console.error("❌ Lỗi khi mở Modal Settings:", error);
        // Tích hợp thông báo Toast/Alert của hệ thống vào đây
        alert("Không thể tải giao diện cài đặt. Vui lòng kiểm tra lại đường dẫn file!");
    }
}
}

export const AdminConsole = new AdminController();
window.AdminConsole = AdminConsole;