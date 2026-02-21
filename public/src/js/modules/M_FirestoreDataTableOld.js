/**
 * 9 TRIP ERP - DYNAMIC FIRESTORE MATRIX COMPONENT
 * Author: 9 Trip ERP Assistant
 * Version: 2.0 (Schema-Driven)
 */

class FirestoreDataTable extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._headers = [];
        this._data = [];
        this._mode = 'collection';
        // Lưu vị trí đang focus: { rowIndex: 0, fieldName: 'name' }
        this._currentFocus = null; 
    }

    // --- SETUP & RENDER ---
    
    setSchema(headers, data = [], mode = 'collection') {
        this._headers = headers;
        this._data = data.length > 0 ? data : [this._createEmptyRow()];
        this._mode = mode;
        this.render();
    }

    _createEmptyRow() {
        const obj = {};
        this._headers.forEach(h => obj[h] = "");
        return obj;
    }

    _handlePaste(e) {
        // Nếu không có ô nào đang focus, thực hiện paste mặc định (thêm hàng) hoặc bỏ qua
        if (!this._currentFocus) return; 

        e.preventDefault();
        const clipboardData = e.clipboardData || window.clipboardData;
        const pastedText = clipboardData.getData('Text');
        
        // 1. Tách dữ liệu Excel thành mảng 2 chiều [hàng][cột]
        const rows = pastedText.split(/\r?\n/).filter(row => row.length > 0);
        const matrix = rows.map(row => row.split('\t'));

        // 2. Lấy dữ liệu hiện tại từ UI để đảm bảo không mất các thay đổi chưa lưu
        const currentData = this.getData();
        
        const startRow = this._currentFocus.rowIndex;
        const startFieldIdx = this._headers.indexOf(this._currentFocus.fieldName);

        // 3. Duyệt qua ma trận dữ liệu vừa paste
        matrix.forEach((rowData, rIdx) => {
            const targetRowIdx = startRow + rIdx;
            
            // Nếu vượt quá số hàng hiện có, thêm hàng mới
            if (!currentData[targetRowIdx]) {
                currentData[targetRowIdx] = this._createEmptyRow();
            }

            rowData.forEach((cellValue, cIdx) => {
                const targetFieldIdx = startFieldIdx + cIdx;
                // Nếu vượt quá số cột hiện có, bỏ qua (hoặc bạn có thể mở rộng headers)
                if (targetFieldIdx < this._headers.length) {
                    const fieldName = this._headers[targetFieldIdx];
                    currentData[targetRowIdx][fieldName] = cellValue;
                }
            });
        });

        // 4. Cập nhật lại state và render
        this._data = currentData;
        this.render();
        
        // (Tùy chọn) Focus lại ô cũ sau khi render
        setTimeout(() => {
            const nextInp = this.shadowRoot.querySelector(
                `tr:nth-child(${startRow + 1}) .inp-${this._headers[startFieldIdx]}`
            );
            if (nextInp) nextInp.focus();
        }, 10);
    }


    // --- DATA CAPTURE ---
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

    render() {
        const style = `
            <style>
                :host { display: block; --primary: #0d6efd; }
                .table-container { overflow-x: auto; border: 1px solid #dee2e6; border-radius: 8px; }
                table { width: 100%; border-collapse: collapse; font-size: 13px; }
                th { background: #f1f3f5; padding: 12px; border: 1px solid #dee2e6; text-transform: uppercase; color: #495057; }
                td { padding: 0; border: 1px solid #dee2e6; }
                input { width: 100%; padding: 10px; border: none; outline: none; box-sizing: border-box; }
                input:focus { background: #e7f1ff; }
                .btn-group { margin-top: 10px; display: flex; gap: 8px; }
                .btn { padding: 6px 12px; border-radius: 4px; cursor: pointer; border: 1px solid #ccc; background: white; }
                .btn-add { background: var(--primary); color: white; border: none; }
                .header-edit { background: #fff3cd; font-style: italic; }
                /* Container bảng cần set layout fixed để resize chính xác */
                #dynamic-modal-full table {
                    table-layout: fixed; /* Rất quan trọng để resize cột */
                    width: 100%;
                }

                #dynamic-modal-full th {
                    position: relative; /* Để đặt thanh resizer vào góc phải */
                }

                /* Thanh Resizer nhỏ nằm ở mép phải mỗi tiêu đề cột */
                .resizer {
                    position: absolute;
                    top: 0;
                    right: 0;
                    width: 5px;
                    cursor: col-resize;
                    user-select: none;
                    height: 100%;
                    z-index: 1;
                }

                .resizer:hover, .resizing {
                    border-right: 3px solid #0d6efd; /* Highlight khi đang kéo */
                }
            </style>
        `;

        const headerHtml = this._headers.map(h => {
            const isSub = h.startsWith('sub:');
            const label = isSub ? h.replace('sub:', '').toUpperCase() : h;
            return `
                <th class="${isSub ? 'header-sub' : ''}">
                    ${label}
                    <div class="resizer"></div>
                </th>`;
        }).join('') + '<th style="width:50px">#</th>';
        
        const bodyHtml = this._data.map((row, idx) => `
            <tr class="data-row">
                ${this._headers.map(h => `
                    <td><input type="text" class="inp-${h}" value="${row[h] || ''}" placeholder="..."></td>
                `).join('')}
                <td style="text-align:center"><button class="btn-del" data-index="${idx}">×</button></td>
            </tr>
        `).join('');

        this.shadowRoot.innerHTML = `
            ${style}
            <div class="table-container" id="paste-zone">
                <table>
                    <thead><tr>${headerHtml}</tr></thead>
                    <tbody>${bodyHtml}</tbody>
                </table>
            </div>
            <div class="btn-group">
                <button class="btn btn-add" id="add-row">+ Thêm dòng</button>

                <small style="color: #666; margin-left: auto;">* Mẹo: Nhấp vào bảng và nhấn Ctrl+V để dán từ Excel</small>
            </div>
        `;

        this._attachEvents();
    }

    _initResizer() {
        const ths = this.shadowRoot.querySelectorAll('th');
        
        ths.forEach(th => {
            const resizer = th.querySelector('.resizer');
            if (!resizer) return;
    
            let startX, startWidth;
    
            resizer.addEventListener('mousedown', (e) => {
                startX = e.pageX;
                startWidth = th.offsetWidth;
                
                resizer.classList.add('resizing');
    
                const onMouseMove = (e) => {
                    // Tính toán độ lệch và set width mới
                    const width = startWidth + (e.pageX - startX);
                    if (width > 50) { // Giới hạn width tối thiểu
                        th.style.width = `${width}px`;
                    }
                };
    
                const onMouseUp = () => {
                    resizer.classList.remove('resizing');
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                };
    
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            });
        });
    }

    _attachEvents() {
        this._initResizer();
        this.shadowRoot.querySelectorAll('input').forEach(inp => {
            inp.addEventListener('focus', (e) => {
                const tr = e.target.closest('tr');
                const fieldName = e.target.className.replace('inp-', '');
                this._currentFocus = {
                    rowIndex: Array.from(tr.parentNode.children).indexOf(tr),
                    fieldName: fieldName
                };
            });
        });
        // Trong phần gắn sự kiện (Event Listeners) của Controller


        this.shadowRoot.getElementById('add-row').addEventListener('click', () => {
            this._data = this.getData();
            this._data.push(this._createEmptyRow());
            this.render();
        });

        this.shadowRoot.querySelectorAll('.btn-del').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = e.target.dataset.index;
                this._data = this.getData();
                this._data.splice(idx, 1);
                this.render();
            });
        });

        // Lắng nghe sự kiện paste trên toàn bộ vùng bảng
        this.shadowRoot.getElementById('paste-zone').addEventListener('paste', (e) => this._handlePaste(e));
        // Highlight ô nếu có tiền tố sub:
        this.shadowRoot.addEventListener('input', (e) => {
            if (e.target.tagName === 'INPUT') {
                const val = e.target.value.trim();
                if (val.toLowerCase().startsWith('sub:')) {
                    e.target.style.background = "#e7f1ff";
                    e.target.style.color = "#0d6efd";
                    e.target.style.fontWeight = "bold";
                } else {
                    e.target.style.background = "";
                    e.target.style.color = "";
                    e.target.style.fontWeight = "";
                }
            }
        });
    }
}
customElements.define('table-db-data', FirestoreDataTable);

export default class FirestoreDataTableManager {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.db = firebase.firestore();
        this.allCollections = ['suppliers', 'service_price_schedules', 'bookings', 'booking_details', 'hotels', 'customers', 'counters_id', 'app_config', 'app_config/lists/pkg_hotel_price', 'app_config/lists/price_periods', 'app_config/lists/price_type', 'users', 'transactions', 'fund_accounts', 'transactions_thenice', 'fund_accounts_thenice', 'app_config/general/settings']; // Danh sách mẫu
        this.initLayout();
    }

    initLayout() {
        this.container.innerHTML = `
            <div class="card shadow-sm">
                <div class="card-header bg-dark text-white p-3">
                    <div class="row g-2">
                        <div class="col-md-4">
                            <label class="small">Chọn Collection mẫu:</label>
                            <select id="sel-collection" class="form-select form-select-sm">
                                <option value="">-- Chọn để lấy cấu trúc --</option>
                                ${this.allCollections.map(c => `<option value="${c}">${c}</option>`).join('')}
                            </select>
                        </div>
                        <div class="col-md-4">
                            <label class="small">Firestore Path (Collection hoặc Doc):</label>
                            <div class="input-group input-group-sm">
                                <input type="text" id="ipt-path" class="form-control form-control-sm" placeholder="ví dụ: suppliers hoặc configs/app_settings">
                                <button id="btn-fetch" class="btn btn-primary btn-sm">Tìm & Load</button>
                            </div>
                        </div>
                        <div class="col-md-4 d-flex align-items-end">
                            <div class="btn-group gap-2" role="group" aria-label="Actions">
                                <button id="btn-save-all" class="btn btn-success btn-sm fw-bold">LƯU DATABASE</button>
                                <button id="btn-clear-all" class="btn btn-danger btn-sm fw-bold">🗑️ Xóa tất cả hàng</button>
                                <button id="btn-decode-sub" class="btn btn-info btn-sm fw-bold">📋 Hiển thị Sub-coll (sub:)</button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="card-body p-2">
                    <table-db-data id="main-matrix"></table-db-data>
                </div>
            </div>
        `;

        this.tableComp = this.container.querySelector('#main-matrix');
        this.pathInput = this.container.querySelector('#ipt-path');
        this.collSelect = this.container.querySelector('#sel-collection');
        
        this.attachEvents();
    }

    attachEvents() {
        // Event: Chọn collection mẫu
        this.collSelect.addEventListener('change', (e) => {
            const collName = e.target.value;
            if (!collName) return;
            this.pathInput.value = collName;
            this.loadStructure(collName);
        });
        this.container.querySelector('#btn-clear-all').addEventListener('click', () => {
            if (confirm("Bạn có chắc chắn muốn xóa toàn bộ danh sách hiện tại trên bảng? (Dữ liệu trên Database sẽ không bị ảnh hưởng)")) {
                this.tableComp.setSchema(this.tableComp._headers, [], 'collection'); // Xóa sạch dữ liệu trong component
            }
        });

        this.container.querySelector('#btn-decode-sub').addEventListener('click', async () => {
            const data = this.tableComp.getData();
            const path = this.pathInput.value;
            
            // 1. Xác định field nào là sub-collection (ví dụ dựa trên FIELD_MAP hoặc tên cột)
            // Ở đây ta mặc định cột 'rooms' là sub-collection như bạn yêu cầu
            const targetSubField = 'rooms'; 
        
            const newData = await Promise.all(data.map(async (row) => {
                const rowId = row.id || (Array.isArray(row) ? row[0] : null);
                if (!rowId) return row;
        
                try {
                    // 2. Truy vấn thực tế vào Sub-collection của từng Document
                    const subSnapshot = await firebase.firestore()
                        .collection(path).doc(String(rowId))
                        .collection(targetSubField).get();
        
                    if (!subSnapshot.empty) {
                        // 3. Lấy danh sách ID con và nối lại bằng dấu phẩy
                        const subIds = subSnapshot.docs.map(doc => doc.id);
                        row[targetSubField] = `sub: ${subIds.join(', ')}`;
                    }
                } catch (e) {
                    console.warn(`Không thể load sub-collection cho ${rowId}`, e);
                }
                return row;
            }));
            const headers = this.tableComp._headers || await this.getHeaders(this.pathInput.value);
        
            // 4. Cập nhật lại bảng với dữ liệu đã được gắn tiền tố sub:
            this.tableComp.setSchema(headers, newData, 'collection');
        });
        
        // Event: Tìm kiếm Path
        this.container.querySelector('#btn-fetch').addEventListener('click', () => {
            this.loadStructure(this.pathInput.value);
        });

        // Event: Lưu dữ liệu
        this.container.querySelector('#btn-save-all').addEventListener('click', () => this.handleSave());
    }

    async getHeaders(collectionName) {
        // Xử lý Collection
        
        let headers = [];

        // Lấy header từ FIELD_MAP hoặc từ dữ liệu thực tế
        if (FIELD_MAP[collectionName]) {
            headers = Object.values(FIELD_MAP[collectionName]);
        } else {
            const snapshot = await this.db.collection(collectionName).get();
            if (!snapshot.empty) {
                headers = Object.keys(snapshot.docs[0].data());
            } else {
                const customHeaders = prompt("Collection mới. Nhập các field cách nhau bằng dấu phẩy:", "id,name,note");
                headers = customHeaders ? customHeaders.split(',') : ['id', 'name'];
            }
        }
        return headers;
    }

    async loadStructure(path) {
        if (!path) return alert("Vui lòng nhập Path");
        const pathParts = path.split('/').filter(p => p !== "");
        const isCollection = pathParts.length % 2 !== 0;

        try {
            if (isCollection) {
                const snapshot = await this.db.collection(path).limit(100).get(); // Limit để tránh treo trình duyệt
                let headers = await this.getHeaders(path);
                let data = [];

                snapshot.forEach(doc => {
                    let row = doc.data();
                    row.id = doc.id;
                    
                    // FLATTEN DATA: Chuyển Object/Array thành String để hiển thị trên ô input
                    Object.keys(row).forEach(k => {
                        if (typeof row[k] === 'object' && row[k] !== null) {
                            row[k] = JSON.stringify(row[k]); // Hiển thị JSON String thay vì [object Object]
                        }
                    });
                    data.push(row);
                });
                
                this.tableComp.setSchema(headers, data, 'collection');

            } else {
                // Xử lý Document (Tìm Array)
                const docSnap = await this.db.doc(path).get();
                if (docSnap.exists) {
                    const docData = docSnap.data();
                    // Tìm field nào là array (ưu tiên cái đầu tiên tìm thấy)
                    const arrayField = Object.keys(docData).find(key => Array.isArray(docData[key]));
                    
                    if (arrayField) {
                        const arrayData = docData[arrayField].map(val => ({ [arrayField]: val }));
                        this.tableComp.setSchema([arrayField], arrayData, 'doc-array');
                    } else {
                        alert("Document này không chứa dữ liệu dạng mảng (Array).");
                    }
                } else {
                    alert("Document không tồn tại để lấy cấu trúc mẫu.");
                }
            }
        } catch (e) {
            console.error("Fetch Error:", e);
            alert("Lỗi truy cập Firestore: " + e.message);
        }
    }

    /**
     * [CORE] Xử lý lưu dữ liệu thông minh
     * 1. Tách dữ liệu Sub-collection (sub:...)
     * 2. Tự động Parse JSON String thành Object/Array cho Master Data
     * 3. Gửi Batch Save
     */
    async handleSave() {
        const collName = this.pathInput.value;
        // Lấy dữ liệu thô từ giao diện (Tất cả đều đang là String do thẻ Input)
        const rawData = this.tableComp.getData(); 
        
        if (rawData.length === 0) return alert("Không có dữ liệu để lưu.");
    
        try {
            // --- GIAI ĐOẠN 1: CHUẨN BỊ & LÀM SẠCH MASTER DATA ---
            
            // Xác định các cột là Sub-collection (để loại bỏ khỏi Master)
            const firstRowRaw = rawData[0];
            const subFields = Object.keys(firstRowRaw).filter(key => 
                String(firstRowRaw[key]).trim().startsWith('sub:') || key === 'rooms'
            );
    
            // MAP DATA: Tạo mảng Master sạch & Parse JSON
            const cleanMasterData = rawData.map(row => {
                const newRow = {};
                
                Object.keys(row).forEach(key => {
                    // 1. Bỏ qua field sub-collection
                    if (subFields.includes(key)) return;
                    if (String(row[key]).trim().startsWith('sub:')) return;

                    // 2. Lấy giá trị thô
                    const rawVal = row[key];

                    // 3. SMART PARSE JSON
                    // Nếu là String và bắt đầu bằng { hoặc [, thử parse lại thành Object
                    if (typeof rawVal === 'string') {
                        const trimmed = rawVal.trim();
                        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || 
                            (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
                            try {
                                newRow[key] = JSON.parse(trimmed);
                            } catch (e) {
                                // Parse lỗi (do người dùng nhập sai cú pháp JSON)
                                // -> Giữ nguyên là String để không mất dữ liệu, nhưng Log cảnh báo
                                console.warn(`⚠️ Field [${key}] có vẻ là JSON nhưng lỗi cú pháp. Lưu dạng String.`, rawVal);
                                newRow[key] = rawVal; 
                            }
                        } else {
                            // String bình thường
                            newRow[key] = rawVal;
                        }
                    } else {
                        // Các dạng khác (null, number nếu có)
                        newRow[key] = rawVal;
                    }
                });
                return newRow;
            });
    
            console.log("🚀 Giai đoạn 1: Lưu Master (Đã Parse JSON)...", cleanMasterData);
            
            // Gọi hàm Batch Save của hệ thống (A.DB)
            // cleanMasterData lúc này đã chứa Object chuẩn, không phải String "{...}"
            const result = await A.DB.batchSave(collName, cleanMasterData);
            
            if (!result || !result.success) throw new Error("Lỗi lưu Master: " + (result.message || "Unknown error"));
    
            // Lấy dữ liệu ĐÃ CÓ ID từ Firestore trả về
            const savedMaster = result.data;
    
            // --- GIAI ĐOẠN 2: LƯU SUB-COLLECTION (Giữ nguyên logic cũ của bạn) ---
            console.log("🚀 Giai đoạn 2: Lưu Sub-collections...");
            
            // Lưu ý: Dùng lại firebase.firestore() hoặc A.DB.db tùy biến toàn cục
            const dbInstance = (typeof A !== 'undefined' && A.DB && A.DB.db) ? A.DB.db : firebase.firestore();
            const subBatch = dbInstance.batch();
            let actionCount = 0;
    
            savedMaster.forEach((savedRow, index) => {
                const rowId = savedRow.id || (Array.isArray(savedRow) ? savedRow[0] : null);
                if (!rowId) return;
    
                // Tìm lại dòng dữ liệu gốc (chứa chuỗi sub:...)
                const originalRow = rawData[index]; 
                if (!originalRow) return;
    
                subFields.forEach(field => {
                    const rawVal = String(originalRow[field] || "").trim();
                    
                    // Logic tách chuỗi "sub: id1, id2"
                    if (rawVal.toLowerCase().startsWith('sub:')) {
                        const cleanVal = rawVal.substring(4); // Bỏ chữ "sub:"
                        const subDocNames = cleanVal.split(',').map(s => s.trim()).filter(s => s);
        
                        if (subDocNames.length > 0) {
                            const parentRef = dbInstance.collection(collName).doc(String(rowId));
                            
                            subDocNames.forEach(subNameRaw => {
                                const subDocId = subNameRaw.replace(/\//g, '-').trim();
                                if (subDocId) {
                                    const subDocRef = parentRef.collection(field).doc(subDocId);
                                    subBatch.set(subDocRef, {
                                        id: subDocId,
                                        name: subNameRaw, 
                                        parentId: rowId,
                                        updatedAt: new Date().getTime()
                                    }, { merge: true });
                                    actionCount++;
                                }
                            });
                        }
                    }
                });
            });
    
            if (actionCount > 0) {
                await subBatch.commit();
            }
    
            alert(`✅ Hoàn tất! Đã lưu ${result.count} Document chính và cập nhật ${actionCount} Sub-document.`);
            
            // Reload lại bảng để hiển thị dữ liệu mới nhất (Optional)
            // this.loadStructure(collName); 
    
        } catch (e) {
            console.error("Critical Save Error:", e);
            alert("❌ Lỗi hệ thống: " + e.message);
        }
    }
}








