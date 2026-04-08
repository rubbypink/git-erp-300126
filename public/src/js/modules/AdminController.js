/**
 * 9 TRIP ERP - UNIFIED ADMIN CONTROLLER (v3.2 - DOM Property Fix)
 * Path: public/src/js/modules/AdminController.js
 * Fix: JSON Display Error using DOM Property injection
 */
import { getFirestore, collection, doc, getDoc, getDocs, query, limit, writeBatch } from 'firebase/firestore';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { migrationHelper, runMigrateRooms } from './db/migration-helper.js';
import NavBarMenuController from '/src/js/common/components/M_NavBarResponsive.js';

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
  setSchema(headers, data = [], collectionPath = '') {
    this._headers = headers;
    this._data = data.length > 0 ? data : [this._createEmptyRow()];
    this._collectionPath = collectionPath; // Lưu lại path
    this.render();
  }
  _createEmptyRow() {
    const obj = {};
    this._headers.forEach((h) => (obj[h] = ''));
    return obj;
  }

  getData() {
    const rows = this.shadowRoot.querySelectorAll('tr.data-row');
    return Array.from(rows).map((tr) => {
      const obj = {};
      this._headers.forEach((h) => {
        const inp = tr.querySelector(`.inp-${h}`);
        obj[h] = inp ? inp.value : '';
      });
      return obj;
    });
  }

  _handlePaste(e) {
    if (!this._currentFocus) return;
    e.preventDefault();
    const clipboardData = e.clipboardData || window.clipboardData;
    const pastedText = clipboardData.getData('Text');
    const rows = pastedText.split(/\r?\n/).filter((row) => row.length > 0);
    const matrix = rows.map((row) => row.split('\t'));

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

    const headerHtml = this._headers.map((h) => `<th>${h}<div class="resizer"></div></th>`).join('') + '<th style="width:30px">#</th>';

    // --- KHU VỰC SỬA ĐỔI QUAN TRỌNG ---
    // 1. Tạo HTML Input KHÔNG CÓ value="..."
    // Chúng ta dùng data-row (row index) và data-key để tham chiếu sau này
    const bodyHtml = this._data
      .map(
        (row, idx) => `
            <tr class="data-row" data-id="${row.id || ''}">
                ${this._headers
                  .map((h) => {
                    // Logic check sub để tô màu (chỉ check type string)
                    const rawVal = row[h];
                    const isSub = typeof rawVal === 'string' && rawVal.startsWith('sub:');

                    // Tuyệt đối KHÔNG ĐỂ value="${...}" ở đây
                    return `<td><input type="text" class="inp-${h} ${isSub ? 'inp-sub' : ''}" data-row="${idx}" data-key="${h}" data-field="${h}"></td>`;
                  })
                  .join('')} 
                <td class="text-center"><button class="btn-del" data-index="${idx}">X</button></td>
            </tr>
        `
      )
      .join('');

    this.shadowRoot.innerHTML = `${style}<div class="table-container" id="paste-zone"><table id="tbl-db-data-admin" class="table table-responsive" data-collection="${this._collectionPath || ''}"><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>
            <div class="toolbar"><button class="btn btn-sm btn-primary" id="add-row">+ Thêm</button><small class="text-muted">Click & Ctrl+V để dán</small></div>`;

    // 2. Bơm dữ liệu bằng Javascript (An toàn tuyệt đối với mọi ký tự)
    this.shadowRoot.querySelectorAll('input[data-row]').forEach((inp) => {
      const rIdx = parseInt(inp.getAttribute('data-row'));
      const key = inp.getAttribute('data-key');

      if (this._data[rIdx]) {
        let val = this._data[rIdx][key];

        if (val === undefined || val === null) {
          val = '';
        } else if (typeof val === 'object') {
          // Tự động stringify Object/Array thành JSON để hiển thị
          val = JSON.stringify(val);
        } else if (typeof val === 'number' || !isNaN(val) || key.toLowerCase().includes('amount') || key.toLowerCase().includes('total') || key.toLowerCase().includes('balance')) {
          val = formatNumber(val);
        } else if (typeof val === 'datetime' || val instanceof Date || key.toLowerCase().includes('updated') || key.toLowerCase().includes('created') || key.toLowerCase().includes('date')) {
          val = formatDateVN(val);
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
    this.shadowRoot.querySelectorAll('input').forEach((inp) => {
      inp.addEventListener('focus', (e) => {
        const tr = e.target.closest('tr');
        this._currentFocus = {
          rowIndex: Array.from(tr.parentNode.children).indexOf(tr),
          fieldName: e.target.className.split(' ')[0].replace('inp-', ''),
        };
      });
    });
    this.shadowRoot.getElementById('add-row').addEventListener('click', () => {
      this._data = this.getData();
      this._data.push(this._createEmptyRow());
      this.render();
    });
    this.shadowRoot.querySelectorAll('.btn-del').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        this._data = this.getData();
        this._data.splice(e.target.dataset.index, 1);
        this.render();
      });
    });
    this.shadowRoot.getElementById('paste-zone').addEventListener('paste', (e) => this._handlePaste(e));
    this.shadowRoot.querySelectorAll('.resizer').forEach((r) => {
      r.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const th = e.target.parentElement;
        const startX = e.pageX;
        const startW = th.offsetWidth;
        const mm = (ev) => {
          th.style.width = startW + ev.pageX - startX + 'px';
        };
        const mu = () => {
          document.removeEventListener('mousemove', mm);
          document.removeEventListener('mouseup', mu);
        };
        document.addEventListener('mousemove', mm);
        document.addEventListener('mouseup', mu);
      });
    });
  }
}
if (!customElements.get('table-db-data')) customElements.define('table-db-data', FirestoreDataTable);

// =============================================================================
// PHẦN 2: LOGIC XỬ LÝ (Matrix Logic & Form Logic)
// =============================================================================
class MatrixLogic {
  constructor(db) {
    this.db = db || getFirestore(getApp());
  }

  async getHeaders(path, fetchedData = []) {
    let headers = [];

    // 1. LẤY CẤU HÌNH TỪ DBSchema.js (Sắp xếp chuẩn theo index)
    // Sử dụng window.FIELD_MAP (được export từ DBSchema.js)
    if (typeof window.FIELD_MAP !== 'undefined' && window.FIELD_MAP[path]) {
      const config = window.FIELD_MAP[path];

      // Vì config là Object dạng { "0": "id", "1": "full_name" }
      // Object.values() trong Javascript tự động sắp xếp theo key số (index) từ nhỏ đến lớn
      headers = Object.values(config);
      return headers;
    }

    // 2. FALLBACK: Nếu bảng chưa được khai báo trong DBSchema.js thì tự động quét dữ liệu
    if (fetchedData.length > 0) {
      let keySet = new Set();
      fetchedData.forEach((row) => {
        Object.keys(row).forEach((key) => keySet.add(key));
      });

      // Sắp xếp Alphabet để nếu có bảng lạ, cột cũng không bị nhảy lung tung
      let autoHeaders = Array.from(keySet).sort();

      // Luôn ép cột 'id' lên đầu tiên
      if (autoHeaders.includes('id')) {
        autoHeaders = ['id', ...autoHeaders.filter((h) => h !== 'id')];
      }
      return autoHeaders;
    }

    // 3. User Input (Trường hợp DB hoàn toàn trống và chưa có Schema)
    const customInput = prompt(`Collection [${path}] chưa có cấu hình. Nhập các cột (cách nhau dấu phẩy):`, 'id,name,description');
    if (customInput) return customInput.split(',').map((s) => s.trim());

    return ['id', 'name'];
  }

  async render(container, path) {
    container.innerHTML = '<div class="text-center mt-5"><div class="spinner-border text-primary"></div><p>Đang tải Matrix...</p></div>';
    try {
      const q = query(collection(this.db, path), limit(500));
      const snapshot = await getDocs(q);
      let data = [];

      snapshot.forEach((d) => {
        // --- SỬA ĐỔI Ở ĐÂY ---
        // Chỉ lấy dữ liệu thô, KHÔNG JSON.stringify thủ công nữa
        let row = { id: d.id, ...d.data() };

        // (Đã xóa đoạn code Object.keys(row).forEach...)

        data.push(row);
      });

      // Gọi hàm lấy Header
      const headers = await this.getHeaders(path, data);

      container.innerHTML = `<table-db-data id="adm-matrix-table"></table-db-data>`;
      container.querySelector('table-db-data').setSchema(headers, data, path);

      if (path.includes('hotels')) {
        if (AdminConsole.currentStrategy && AdminConsole.currentStrategy.decodeSubCollections) {
          // Tham số 1: Path hiện tại, Tham số 2: Tên field cần decode
          AdminConsole.currentStrategy.decodeSubCollections(AdminConsole.currentPath, 'rooms');
        }
      }

      // Debug: In ra console để kiểm tra dữ liệu gốc có bị lỗi không
      // L._(`✅ Loaded ${data.length} rows from [${path}]`, data);
    } catch (e) {
      console.error(e);
      container.innerHTML = `<div class="alert alert-danger">Lỗi tải dữ liệu: ${e.message}</div>`;
    }
  }

  async decodeSubCollections(path, targetField = 'rooms') {
    const table = document.querySelector('#adm-matrix-table');
    if (!table) return;
    if (!table._headers.includes(targetField)) return logA(`⚠️ Cột [${targetField}] không tồn tại.`, 'warning', 'alert');

    const data = table.getData();
    const btnDecode = document.getElementById('adm-btn-decode');
    if (btnDecode) btnDecode.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Decoding...';

    try {
      const newData = await Promise.all(
        data.map(async (row) => {
          if (!row.id) return row;
          try {
            const subSnap = await getDocs(collection(this.db, path, row.id, targetField));
            if (!subSnap.empty) {
              const subIds = subSnap.docs.map((d) => d.id);
              row[targetField] = `sub: ${subIds.join(', ')}`;
            } else {
              row[targetField] = '';
            }
          } catch (e) {}
          return row;
        })
      );
      table.setSchema(table._headers, newData);
    } catch (e) {
      Opps('Lỗi: ' + e.message);
    } finally {
      if (btnDecode) btnDecode.innerHTML = '<i class="fas fa-network-wired"></i> Decode Sub';
    }
  }

  async save(path) {
    const table = document.querySelector('#adm-matrix-table');
    if (!table) return;
    const rawData = table.getData();
    if (rawData.length === 0) return logA('Không có dữ liệu.', 'warning', 'alert');

    try {
      const cleanData = rawData.map((row) => {
        const newRow = {};
        Object.keys(row).forEach((key) => {
          if (String(row[key]).trim().startsWith('sub:')) return;
          let val = row[key];
          let numberFields = ['amount', 'total', 'balance', 'price', 'cost'];
          if (numberFields.some((f) => key.toLowerCase().includes(f))) {
            val = Number(String(val).replace(/[^0-9.-]+/g, '')) || 0;
          }
          if (typeof val === 'string' && (val.trim().startsWith('{') || val.trim().startsWith('['))) {
            try {
              newRow[key] = JSON.parse(val);
            } catch (e) {
              newRow[key] = val;
            }
          } else {
            newRow[key] = val;
          }
        });
        return newRow;
      });

      if (A.DB.batchSave) await A.DB.batchSave(path, cleanData);
      else {
        const batch = writeBatch(this.db);
        cleanData.forEach((item) => {
          const ref = item.id ? doc(this.db, path, item.id) : doc(collection(this.db, path));
          batch.set(ref, item, { merge: true });
        });
        await batch.commit();
      }

      const batchSub = writeBatch(this.db);
      let countSub = 0;
      rawData.forEach((row) => {
        if (!row.id) return;
        Object.keys(row).forEach((key) => {
          const val = String(row[key] || '').trim();
          if (val.startsWith('sub:')) {
            const subIds = val
              .replace('sub:', '')
              .split(',')
              .map((s) => s.trim())
              .filter((s) => s);
            subIds.forEach((subId) => {
              const subRef = doc(this.db, path, row.id, key, subId.replace(/\//g, '-'));
              batchSub.set(subRef, { id: subId, parentId: row.id }, { merge: true });
              countSub++;
            });
          }
        });
      });
      if (countSub > 0) await batchSub.commit();
      logA(`✅ Đã lưu Master và ${countSub} Sub-documents!`, 'warning', 'alert');
    } catch (e) {
      Opps('❌ Lỗi: ' + e.message);
    }
  }
}

class FormLogic {
  constructor(db) {
    this.db = db || getFirestore(getApp());
  }
  async render(container, path) {
    container.innerHTML = '<div class="text-center mt-5"><div class="spinner-border text-warning"></div><p>Đang tải cấu hình...</p></div>';
    try {
      const q = query(collection(this.db, path), limit(1));
      const snapshot = await getDocs(q);
      if (snapshot.empty) throw new Error('Collection trống.');
      const d = snapshot.docs[0];
      const data = d.data();
      const docId = d.id;
      let fieldsHtml = '';
      Object.keys(data).forEach((key) => {
        const val = data[key];
        const isObj = typeof val === 'object' && val !== null;
        const displayVal = isObj ? JSON.stringify(val, null, 4) : val;
        fieldsHtml += `<div class="mb-3"><label class="fw-bold">${key}</label>${isObj ? `<textarea class="form-control font-monospace adm-input" data-key="${key}" rows="8" style="background: #f8f9fa">${displayVal}</textarea>` : `<input type="text" class="form-control adm-input" data-key="${key}" value="${displayVal}">`}</div>`;
      });
      container.innerHTML = `<div class="card shadow-sm mx-auto" style="max-width: 800px;"><div class="card-header bg-warning">Chỉnh sửa: ${docId}</div><div class="card-body"><form id="adm-form-editor" data-doc-id="${docId}">${fieldsHtml}</form></div></div>`;
    } catch (e) {
      container.innerHTML = `<div class="alert alert-danger">Lỗi: ${e.message}</div>`;
    }
  }
  async save(path) {
    const form = document.querySelector('#adm-form-editor');
    if (!form) return;
    const payload = {};
    const inputs = form.querySelectorAll('.adm-input');
    inputs.forEach((inp) => {
      let val = getVal(inp);
      if (val.trim().startsWith('{') || val.trim().startsWith('['))
        try {
          val = JSON.parse(val);
        } catch (e) {}
      payload[inp.dataset.key] = val;
    });
    // ✅ Route qua DBManager để đồng bộ notification
    await A.DB.updateSingle(path, form.dataset.docId, { id: form.dataset.docId, ...payload });
    logA('✅ Đã cập nhật Form!', 'success', 'alert');
  }
}

// =============================================================================
// PHẦN 3: MAIN CONTROLLER (Updated v3.2)
// =============================================================================
class AdminController {
  constructor() {
    this.collections = [
      { name: '📦 Booking', path: 'bookings', type: 'MATRIX' },
      { name: '📋 Chi tiết Booking', path: 'booking_details', type: 'MATRIX' },
      { name: '📋 Chi tiết Booking NCC', path: 'operator_entries', type: 'MATRIX' },
      { name: '👥 DS Khách hàng', path: 'customers', type: 'MATRIX' },
      { name: '👤 Người dùng', path: 'users', type: 'MATRIX' },
      { name: '💸 DS PT/PC', path: 'transactions', type: 'MATRIX' },
      { name: '🏦 DS Tài khoản', path: 'fund_accounts', type: 'MATRIX' },
      { name: '🏨 DS Khách sạn', path: 'hotels', type: 'MATRIX' },
      { name: '💰 Bảng giá DV', path: 'service_price_schedules', type: 'MATRIX' },
      { name: '🏨 Bảng giá Khách sạn', path: 'app_config/lists/pkg_hotel_price', type: 'MATRIX' },
      { name: '📅 List Giai Đoạn Giá', path: 'app_config/lists/price_periods', type: 'MATRIX' },
      { name: '💳 Loại giá', path: 'app_config/lists/price_type', type: 'MATRIX' },
      { name: '🏢 DS Nhà cung cấp', path: 'suppliers', type: 'MATRIX' },
      {
        name: '⚙️ Cấu hình Ngôn ngữ (Settings)',
        path: 'app_config/general/settings',
        type: 'FORM',
      },
      { name: '🔢 Bộ đếm ID', path: 'counters_id', type: 'MATRIX' },
      { name: '⚙️ Cấu hình Ứng dụng', path: 'app_config', type: 'FORM' },
      { name: '💸 DS PT/PC TheNice', path: 'transactions_thenice', type: 'MATRIX' },
      { name: '🏦 DS Tài khoản TheNice', path: 'fund_accounts_thenice', type: 'MATRIX' },
    ];
    this.currentStrategy = null;
    this.modal = null;
    this.currentPath = '';
    this.currentData = [];

    this.isFilterMode = false;
    this.selectedCollectionIndex = null;
    this.migration = migrationHelper;
    this._initialized = false;
  }
  static autoInit = false;

  async init() {
    if (this._initialized || !A.isReady()) {
      console.warn('[AdminController] Đã khởi tạo / App chưa sẵn sàng');
      return;
    }
    this._initialized = true;

    let modal = document.querySelector('at-modal-full');
    if (!modal) {
      const newmodal = document.createElement('at-modal-full');
      document.body.appendChild(newmodal);
      modal = newmodal;
    }

    modal.render(await this._getLayout(), 'Admin Console (v3.2 Full Fix)');
    await this.initSettingsTab();
    this._bindEvents();
    this.modal = modal;
  }

  async _getLayout() {
    const opts = this.collections.map((c, i) => `<option value="${i}">${c.name}</option>`).join('');

    // Gọi Fetch lấy file HTML
    const response = await fetch('/src/components/tpl_admin_settings.html');

    // Kiểm tra nếu đường dẫn sai (báo lỗi 404)
    if (!response.ok) {
      throw new Error(`Lỗi mạng: ${response?.status} - Không tìm thấy file template!`);
    }

    // GIẢI MÃ: Biến response thành chuỗi Text HTML
    const htmlText = await response.text();

    return htmlText.replace('<!-- SELECT_COLLECTION_OPTIONS_PLACEHOLDER -->', opts);
  }

  _bindEvents() {
    const db = getFirestore(getApp());
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
      inputPath.placeholder = 'Nhập path collection...';
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
      const filtered = this.currentData.filter((row) => {
        // Kiểm tra nếu bất kỳ field nào chứa filter value
        return Object.values(row).some((val) => String(val).toLowerCase().includes(filterValue.toLowerCase()));
      });

      // Update table với dữ liệu đã lọc
      const table = document.querySelector('#adm-matrix-table');
      if (table) {
        table.setSchema(table._headers, filtered);
      }
    };

    select.addEventListener('change', (e) => {
      if (e.target.value === '') {
        inputPath.value = '';
        inputPath.placeholder = 'Nhập path collection...';
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
      getE('tbl-db-data-admin')?.setAttribute('data-collection', config.path);
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
        const q = query(collection(db, pathToLoad), limit(300));
        getDocs(q)
          .then((snapshot) => {
            this.currentData = [];
            snapshot.forEach((d) => {
              let row = { id: d.id, ...d.data() };
              this.currentData.push(row);
            });

            // Render dữ liệu đã load
            strategyToUse.render(workspace, pathToLoad);
          })
          .catch((e) => {
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
        if (!path) return logA('Vui lòng nhập Path!', 'warning', 'alert');
        const type = path.includes('settings') ? 'FORM' : 'MATRIX';
        const coll = path.split('/')[0];
        const matchedConfig = this.collections.find((c) => c.path === coll);
        getE('tbl-db-data-admin')?.setAttribute('data-collection', matchedConfig ? matchedConfig.path : path);
        this.isFilterMode = false;

        // Load dữ liệu
        this.currentPath = path;
        if (type === 'MATRIX') {
          const q = query(collection(db, path), limit(300));
          getDocs(q)
            .then((snapshot) => {
              this.currentData = [];
              snapshot.forEach((d) => {
                let row = { id: d.id, ...d.data() };
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
            })
            .catch((e) => {
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
      if (this.currentStrategy && this.currentStrategy instanceof MatrixLogic) {
        const field = prompt('Nhập tên sub-collection cần decode (ví dụ: rooms, details):', 'rooms');
        if (field) this.currentStrategy.decodeSubCollections(this.currentPath, field);
      }
    });

    btnSave.addEventListener('click', () => {
      if (this.currentStrategy) this.currentStrategy.save(this.currentPath);
    });

    btnDelete.addEventListener('click', () => {
      const table = document.querySelector('#adm-matrix-table');
      if (!table) return logA('Không tìm thấy bảng!', 'warning', 'alert');

      const tableData = table.getData();
      if (tableData.length === 0) return logA('Bảng không có dữ liệu!', 'warning', 'alert');

      // Lấy danh sách ID từ bảng
      const listId = tableData.map((row) => row.id).filter((id) => id);

      if (listId.length === 0) return logA('Không tìm thấy ID để xóa!', 'warning', 'alert');

      // Xác nhận xóa
      const confirmMsg = listId.length === 1 ? `Bạn có chắc chắn muốn xóa ID: ${listId[0]}?` : `Bạn có chắc chắn muốn xóa ${listId.length} bản ghi?`;

      if (confirm(confirmMsg)) {
        if (typeof A === 'undefined' || !A.DB) {
          return Opps('❌ A.DB không khả dụng!');
        }

        // Nếu 1 hàng: gọi deleteRecord
        if (listId.length === 1) {
          if (A.DB.deleteRecord) {
            A.DB.deleteRecord(this.currentPath, listId[0])
              .then(() => {
                logA('✅ Đã xóa thành công!', 'success', 'alert');
                // Reload dữ liệu
                if (this.selectedCollectionIndex !== null) {
                  select.dispatchEvent(new Event('change'));
                }
              })
              .catch((e) => {
                Opps('❌ Lỗi xóa: ' + e.message);
              });
          } else {
            Opps('❌ A.DB.deleteRecord không khả dụng!');
          }
        } else {
          // Nếu nhiều hàng: gọi batchDelete
          if (A.DB.batchDelete) {
            A.DB.batchDelete(this.currentPath, listId)
              .then(() => {
                logA('✅ Đã xóa ' + listId.length + ' bản ghi thành công!', 'success', 'alert');
                // Reload dữ liệu
                if (this.selectedCollectionIndex !== null) {
                  select.dispatchEvent(new Event('change'));
                }
              })
              .catch((e) => {
                Opps('❌ Lỗi xóa: ' + e.message);
              });
          } else {
            Opps('❌ A.DB.batchDelete không khả dụng!');
          }
        }
      }
    });

    // =====================================================================
    // 🔧 APP CONFIG MANAGEMENT (Database Control Tab)
    // =====================================================================

    const saveCfgBtn = document.getElementById('save-config-btn');
    const resetCfgBtn = document.getElementById('reset-config-btn');

    if (saveCfgBtn) {
      saveCfgBtn.addEventListener('click', async () => {
        saveCfgBtn.disabled = true;
        saveCfgBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang lưu...';

        const success = await A.saveAppConfig();

        saveCfgBtn.disabled = false;
        saveCfgBtn.innerHTML = '<i class="fas fa-save"></i> Lưu cài đặt';

        if (success) {
          // Reload lần nữa để confirm
          await A.loadAppConfig();
        }
      });
    }

    if (resetCfgBtn) {
      resetCfgBtn.addEventListener('click', () => {
        if (confirm('🔄 Reset tất cả cài đặt về mặc định?')) {
          // Xóa tất cả giá trị input
          document.querySelectorAll('.erp-config-input').forEach((input) => {
            if (input.type === 'checkbox') {
              input.checked = false;
            } else {
              input.value = '';
            }
          });
          logA('✅ Form cài đặt đã được reset', 'success');
        }
      });
    }
  }

  /**
   * 9TRIP HELPER: LAZY LOAD SETTINGS MODAL
   * Tối ưu hiệu năng: Chỉ tải HTML qua mạng khi click lần đầu tiên
   */
  async openAdminSettings() {
    try {
      if (this._initialized && this.modal) {
        // Nếu đã khởi tạo rồi, chỉ cần mở modal và reload config

        await this.modal.render(await this._getLayout(), 'Admin Console (v3.2 Full)');
        await this.initSettingsTab();
        this._bindEvents();
        this.modal.show();
        // Reload config từ Firestore lên form
        await A._syncConfigToForm();

        return;
      } else {
        // Chưa khởi tạo, gọi init để tải HTML và bind sự kiện
        this._initialized = false; // Đảm bảo init sẽ chạy
        await this.init();
        if (this.modal) {
          this.modal.show();
          // Tải config từ Firestore lên form
          await A._syncConfigToForm();
        }
      }
    } catch (error) {
      // Tích hợp thông báo Toast/Alert của hệ thống vào đây
      showAlert('Không thể tải giao diện cài đặt. Vui lòng kiểm tra lại đường dẫn file!', 'warning', 'alert');
    }
  }

  async changeFieldName(path, oldName, newName) {
    try {
      const result = await migrationHelper.migrateField(path, oldName, newName);

      L._('✅ Field migrated successfully:', result.data);
      showAlert('✅ Đã migrate field thành công!', 'success', 'THÀNH CÔNG');
      return result.data;
    } catch (error) {
      console.error('❌ Error migrating field:', error);

      // Chi tiết lỗi
      let errorMsg = 'Lỗi không xác định';
      if (error.code === 'functions/unauthenticated') {
        errorMsg = '❌ Bạn chưa đăng nhập hoặc hết phiên đăng nhập';
      } else if (error.code === 'functions/permission-denied') {
        errorMsg = '❌ Bạn không có quyền thực hiện hành động này';
      } else if (error.code === 'functions/not-found') {
        errorMsg = '❌ Cloud Function không tồn tại hoặc chưa được deploy';
      } else if (error.code === 'functions/unavailable') {
        errorMsg = '❌ Cloud Function tạm thời không khả dụng';
      } else {
        errorMsg = `❌ Lỗi: ${error.message}`;
      }

      showAlert(errorMsg, 'error', '❌ XẢY RA LỖI');
      throw error;
    }
  }
  async runFieldMigration(collectionName = 'operator_entries', oldField = 'customer_name', newField = 'customer_full_name', type = 'move') {
    L._(`[AdminController] Starting migration...`);
    const result = await this.changeFieldName(collectionName, oldField, newField);
    L._(`[AdminController] Migration complete:`, result);
    return result;
  }

  async initSettingsTab() {
    // 1. Định nghĩa Data dựa theo HTML cũ của bạn
    const settingsTabConfig = [
      {
        id: 'tab-adm-config-btn',
        targetId: '#tab-adm-app-config',
        title: 'Cấu Hình Hệ Thống',
        iconHtml: '<i class="fa-solid fa-palette me-2 text-primary"></i>',
        customClass: 'fw-bold small', // Các class thêm cho thẻ button
        onClickAttr: "selectTab('tab-adm-app-config')", // Hàm onclick cũ
        isDefault: true, // Tab kích hoạt đầu tiên
      },
      {
        id: 'tab-adm-firestore-btn',
        targetId: '#tab-adm-database-control',
        title: 'Quản Lý Database',
        iconHtml: '<i class="fa-solid fa-keyboard me-2 text-danger"></i>',
        customClass: 'fw-bold small',
        onClickAttr: "selectTab('tab-adm-database-control')",
      },
      {
        id: 'tab-users-btn',
        targetId: '#tab-adm-users',
        title: 'Quản Lý Người Dùng',
        iconHtml: '<i class="fa-solid fa-users me-2 text-success"></i>',
        customClass: 'fw-bold small',
        liClass: 'admin-only', // Phân quyền ẩn hiện tab (Gắn vào thẻ <li>)
        onClickAttr: "selectTab('tab-adm-users')",
      },
    ];
    new NavBarMenuController('settings-navbar-container', settingsTabConfig);
  }

  // --- QUẢN LÝ USER (ADMIN) ---

  /**
   * Load danh sách users từ Firestore để hiển thị
   */
  async loadUsersData(fromFireStore = false) {
    try {
      let users = APP_DATA.users || {};
      if (fromFireStore || !users || Object.keys(users).length === 0) {
        // ✅ FIRESTORE: Lấy toàn bộ collection users
        users = await A.DB.getCollection('users');
      }
      if (!users || Object.keys(users).length === 0) {
        document.getElementById('users-table-body').innerHTML = '<tr><td colspan="10">Chưa có user nào</td></tr>';
        return;
      }
      let html = '';
      // ✅ FIRESTORE: Duyệt qua từng document
      Object.entries(users).forEach(([uid, user]) => {
        const createdDate = new Date(user.created_at || Date.now()).toLocaleDateString('vi-VN');

        html += `
                    <tr class="text-center" style="cursor: pointer;" onclick="A.AdminConsole.loadUserToForm('${uid}')">
                        <td><small title="${uid}">${uid.substring(0, 5)}...</small></td>
                        <td>${user.account || '-'}</td>
                        <td style="display: none;">${user.password || '-'}</td>
                        <td>${user.user_name || '-'}</td>
                        <td>${user.user_phone || '-'}</td>
                        <td><small>${user.email || '-'}</small></td>
                        <td><span class="badge bg-info">${(user.role || '').toUpperCase()}</span></td>
                        <td>${user.level || 0}</td>
                        <td>${user.group || ''}</td>
                        <td>${createdDate}</td>
                        <td><button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); A.AdminConsole.deleteUser('${uid}')"><i class="fa-solid fa-trash"></i></button></td>
                    </tr>
                `;
      });

      const tbody = document.getElementById('users-table-body');
      if (tbody) tbody.innerHTML = html;
    } catch (e) {
      console.error('Lỗi tải users:', e);
    }
  }

  /**
   * Load chi tiết user vào form để edit
   * Chỉ đọc từ Firestore
   */
  async loadUserToForm(uid) {
    try {
      // ✅ FIRESTORE: Lấy dữ liệu user
      const user = APP_DATA.users?.[uid] || (await A.DB.getCollection('users', uid));
      if (!user) return;

      // Fill form (Giữ nguyên logic cũ)
      getE('form-uid').value = uid;
      getE('form-account').value = user.account || '';
      getE('form-user-name').value = user.user_name || '';
      getE('form-user-password').value = user.password || '';
      getE('form-user-phone').value = user.user_phone || '';
      getE('form-email').value = user.email || '';
      getE('form-role').value = user.role || 'sale';
      getE('form-status').value = user.status || 'true';
      getE('form-level').value = user.level || 0;
      $$('.group-role-checkbox').forEach((checkbox) => {
        checkbox.checked = false; // Reset
      });
      if (user.group) {
        const groups = user.group.split(',').map((g) => g.trim());
        groups.forEach((g) => {
          const checkbox = document.querySelector(`.group-role-checkbox[value="${g}"]`);
          if (checkbox) checkbox.checked = true;
        });
      }

      // Scroll
      getE('users-form').scrollIntoView({ behavior: 'smooth' });
    } catch (e) {
      Opps(e);
    }
  }

  /**
   * Lưu/Cập nhật user vào Firestore
   *
   * Flow mới (Firestore-first):
   * 1. CASE 1 (Update): Save Firestore → Trigger sync sang Auth
   * 2. CASE 2 (Create): Generate UID (role-ddmmyy) → Save Firestore (kèm password)
   *                     → Trigger functions tự động tạo Auth user
   *
   * ⭐ Không còn tạo Auth trực tiếp, toàn bộ do Trigger xử lý
   */
  async saveUser() {
    const userData = {};
    userData.uid = document.getElementById('form-uid').value.trim();
    userData.account = document.getElementById('form-account').value.trim();
    userData.user_name = document.getElementById('form-user-name').value.trim();
    userData.password = document.getElementById('form-user-password').value.trim();
    userData.user_phone = document.getElementById('form-user-phone').value.trim();
    userData.email = document.getElementById('form-email').value.trim();
    userData.role = document.getElementById('form-role').value;
    userData.status = document.getElementById('form-status').value;
    userData.level = parseInt(document.getElementById('form-level').value) || 1;
    userData.created_at = document.getElementById('form-created-at')?.value || new Date().toISOString();

    // Lấy các group roles được check
    const groupRoles = [];
    document.querySelectorAll('.group-role-checkbox:checked').forEach((checkbox) => {
      groupRoles.push(checkbox.value);
    });
    userData.group = groupRoles.join(', ');

    // ─── Validation ───
    if (!userData.email || !userData.role) {
      showAlert('Vui lòng nhập Email/Vai trò', 'warning');
      return;
    }
    if (!userData.account) {
      userData.account = userData.email.split('@')[0];
    }
    if (!userData.password) {
      // Bước 2: Tạo mật khẩu mặc định
      const defaultPassword = userData.email.split('@')[0] + '@2026';
      userData.password = defaultPassword;
    }

    try {
      showLoading(true);
      // CASE 1: Cập nhật user hiện tại
      // Chỉ cần lưu Firestore → Trigger sẽ auto sync sang Auth
      if (userData.uid) {
        userData.updated_at = new Date().toISOString();
        await A.DB.saveRecord('users', userData, { merge: true });
        L._(`✅ User ${userData.uid} updated in Firestore`, 'success');
        this.renderUsersConfig();
        return;
      }

      await A.DB.saveRecord('users', userData);

      // Bước 3: Trigger sẽ tự động đọc dữ liệu từ Firestore và tạo Firebase Auth user
      logA(`✅ Tạo người dùng thành công!\n📧 Email: ${userData.email}\n🔑 Trigger sẽ tạo Auth account\n⏳ Vui lòng đợi...`, 'success');

      this.renderUsersConfig();
    } catch (error) {
      Opps('❌ Lỗi lưu user: ' + error.message);
    } finally {
      showLoading(false);
    }
  }
  /**
   * Xóa user khỏi Firestore
   * Trigger "syncUserAuthDeleteOnDelete" sẽ tự động xóa Firebase Auth account
   */
  async deleteUser(uid) {
    if (!confirm('Chắc chắn xóa user này?\n⚠️ Trigger sẽ tự động xóa Auth account')) return;
    try {
      showLoading(true);
      // ✅ FIRESTORE DELETE → Trigger xóa Auth (route qua DBManager để đồng bộ notification)
      await A.DB.deleteRecord('users', uid);
      L._(`✅ User ${uid} deleted from Firestore`, 'success');
      this.loadUsersData();
    } catch (error) {
      Opps('❌ Lỗi xóa user: ' + error.message);
    } finally {
      showLoading(false);
    }
  }
  async renderUsersConfig() {
    //   $('.modal-footer').style.display = 'none'; // Ẩn footer nếu có
    // Set ngày tạo mặc định là hôm nay
    document.getElementById('users-form').reset();
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('form-created-at').value = today;

    // Load dữ liệu users vào bảng
    await this.loadUsersData();
  }
  /**
   * Hàm gọi API Archive dữ liệu cũ (Dùng Firebase v8)
   * Gọi liên tục cho đến khi Backend báo cáo không còn dữ liệu cần Archive
   */
  async handleArchiveClick() {
    // 1. Xác nhận từ Admin trước khi chạy (Tránh click nhầm)
    const confirm = await Swal.fire({
      title: 'Bắt đầu lưu trữ dữ liệu?',
      text: 'Hệ thống sẽ quét và chuyển các Booking cũ (trước 6 tháng, đã thu đủ tiền) sang kho lưu trữ để tối ưu hệ thống.',
      icon: 'info',
      showCancelButton: true,
      confirmButtonText: 'Bắt đầu dọn dẹp',
      cancelButtonText: 'Hủy',
    });

    if (!confirm.isConfirmed) return;

    try {
      // 2. Khởi tạo kết nối Functions (Trỏ về đúng Region Châu Á)
      const functions = getFunctions(getApp(), 'asia-southeast1');
      const archiveCall = httpsCallable(functions, 'archiveOldData');

      let totalProcessed = 0;
      let isDone = false;

      // 3. Mở Popup Loading chặn tương tác người dùng
      Swal.fire({
        title: 'Đang dọn dẹp hệ thống...',
        html: 'Vui lòng không đóng trình duyệt.<br/>Đã chuyển: <b>0</b> bookings.',
        allowOutsideClick: false,
        allowEscapeKey: false,
        showConfirmButton: false,
        didOpen: () => {
          Swal.showLoading();
        },
      });

      // 4. Chạy vòng lặp dọn dẹp (Mỗi lần 20 bookings từ Backend)
      while (!isDone) {
        const result = await archiveCall();
        const processedThisTurn = result.data.processed;

        if (processedThisTurn > 0) {
          totalProcessed += processedThisTurn;

          // Cập nhật con số trên Popup để Admin nhìn thấy tiến độ
          Swal.update({
            html: `Vui lòng không đóng trình duyệt.<br/>Đã chuyển: <b>${totalProcessed}</b> bookings.`,
          });
        } else {
          // Backend trả về 0 -> Nghĩa là đã quét sạch
          isDone = true;
        }
      }

      // 5. Thông báo hoàn tất
      if (totalProcessed > 0) {
        Swal.fire({
          icon: 'success',
          title: 'Hoàn tất!',
          text: `Đã dọn dẹp và lưu trữ thành công ${totalProcessed} Bookings.`,
        });

        // TÙY CHỌN: Gọi hàm clear/update lại biến APP_DATA và render lại UI ở đây
        // renderTable();
      } else {
        Swal.fire({
          icon: 'info',
          title: 'Hệ thống đã tối ưu',
          text: 'Hiện tại không có dữ liệu cũ nào cần lưu trữ thêm.',
        });
      }
    } catch (error) {
      console.error('❌ Lỗi khi chạy Archive:', error);

      // Bắt và hiển thị lỗi (Ví dụ: Lỗi không phải Admin...)
      Swal.fire({
        icon: 'error',
        title: 'Từ chối thao tác',
        text: error.message || 'Lỗi kết nối máy chủ khi thực hiện lưu trữ.',
      });
    }
  }

  /**
   * 9TRIP: HIỂN THỊ MODAL CHỌN COLLECTION ĐỂ CẬP NHẬT LIST
   * Bước 1: Ẩn menu, lọc role, hiển thị select
   */
  async showUpdateListModal() {
    try {
      // 1. Ẩn menu hiện tại
      if (A.ChromeMenuController) A.ChromeMenuController.hideMenu();

      const role = window.CURRENT_USER?.role || 'sale';
      const allColls = window.COLL_MANIFEST?.[role] || [];

      // 2. Lọc options dựa trên role
      let options = [];

      // hotels, suppliers: admin, op, acc
      if (['admin', 'op', 'acc'].includes(role)) {
        options.push({ id: 'hotels', name: '🏨 Khách sạn' });
        options.push({ id: 'suppliers', name: '🏢 Nhà cung cấp' });
      }

      // users: chỉ admin
      if (role === 'admin') {
        options.push({ id: 'users', name: '👤 Người dùng' });
      }

      // Các options khác từ COLL_MANIFEST
      allColls.forEach((coll) => {
        if (!['hotels', 'suppliers', 'users'].includes(coll)) {
          options.push({ id: coll, name: `📦 ${coll}` });
        }
      });

      if (options.length === 0) return logA('Bạn không có quyền cập nhật bất kỳ danh sách nào.', 'warning');

      // 3. Tạo HTML cho select
      const selectHtml = `
        <div class="p-3">
          <label class="form-label fw-bold">Chọn Collection để cập nhật vào app_config/lists:</label>
          <select id="update-list-select" class="form-select">
            <option value="">-- Chọn danh sách --</option>
            ${options.map((opt) => `<option value="${opt.id}">${opt.name}</option>`).join('')}
          </select>
          <div class="mt-3 text-muted small">
            * Hệ thống sẽ tự động tạo Map (ID - Tên) và cập nhật vào cấu hình hệ thống.
          </div>
        </div>
      `;

      // 4. Hiển thị qua Swal (Popup)
      const { value: collectionName } = await Swal.fire({
        title: 'Cập Nhật Danh Sách Hệ Thống',
        html: selectHtml,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Tiếp tục',
        cancelButtonText: 'Hủy',
        preConfirm: () => {
          const val = document.getElementById('update-list-select').value;
          if (!val) {
            Swal.showValidationMessage('Vui lòng chọn một danh sách');
          }
          return val;
        },
      });

      if (collectionName) {
        await this.processUpdateList(collectionName);
      }
    } catch (e) {
      console.error('[AdminController] showUpdateListModal error:', e);
      Opps(e);
    }
  }

  /**
   * 9TRIP: XỬ LÝ TẠO MAP VÀ CẬP NHẬT FIRESTORE
   * Bước 2 & 3: Tạo Map từ APP_DATA và lưu vào app_config/lists
   */
  async processUpdateList(collectionName) {
    try {
      showLoading(true);
      const data = window.APP_DATA?.[collectionName];

      if (!data || Object.keys(data).length === 0) {
        throw new Error(`Dữ liệu collection [${collectionName}] đang trống hoặc chưa được tải.`);
      }

      // 1. Tạo Map object (key-value)
      const listMap = {};
      Object.values(data).forEach((doc) => {
        const id = doc.id || doc.uid;
        const name = doc.name || doc.user_name || doc.displayName || doc.full_name || id;
        if (id) {
          listMap[id] = name;
        }
      });
      L._(`[AdminController] Generated Map for ${collectionName}:`, listMap);

      // 2. Cập nhật Firestore qua DBManager
      // app_config/lists là một document, mỗi field là một collection list
      await A.DB.updateSingle('app_config', 'lists', {
        [collectionName]: listMap,
      });

      logA(`✅ Đã cập nhật danh sách [${collectionName}] thành công!`, 'success');
    } catch (e) {
      console.error('[AdminController] processUpdateList error:', e);
      Opps(e.message);
    } finally {
      showLoading(false);
    }
  }
}

/**
 * ═════════════════════════════════════════════════════════════════════════
 * MIGRATION HELPER - Client-side Utility
 * ═════════════════════════════════════════════════════════════════════════
 * Helper functions to call the migrateField Cloud Function from the client
 *
 * Usage:
 *   1. Ensure user is logged in
 *   2. Call: migrationHelper.migrateField(...)
 *   3. Monitor progress in console
 * ═════════════════════════════════════════════════════════════════════════
 */

const AdminConsole = new AdminController();
export default AdminConsole;
// window.AdminConsole = AdminConsole;
