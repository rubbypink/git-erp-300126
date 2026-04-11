/**
 * Module: DataUtils
 * Chuyên trách xử lý Form/Table cho ERP ngành du lịch
 */
const HD = {
  /**
   * setFormData: Đổ dữ liệu vào giao diện
   * @param {string|HTMLElement} root - Element cha (ID hoặc Node)
   * @param {Object|Array} data - Dữ liệu nguồn
   * @param {boolean} isNew - Mặc định true (Lưu giá trị vào data-initial)
   * @param {Object} options - { prefix }
   */
  setFormData(root, data, isNew = true, options = {}) {
    if (!data) return 0;
    const rootEl = $(root);
    if (!rootEl) return 0;

    const { prefix = '' } = options;

    try {
      // Trường hợp Mảng: Đổ vào Table/List
      if (Array.isArray(data)) {
        return this._handleArraySet(rootEl, data, isNew, prefix);
      }

      // Trường hợp Object: Đổ vào Form fields
      return this._handleObjectSet(rootEl, data, isNew, prefix);
    } catch (e) {
      Opps('Lỗi setFormData: ', e);
      return 0;
    }
  },

  /**
   * getFormData: Thu thập dữ liệu từ giao diện
   * @param {string|HTMLElement} root - Element cha
   * @param {string} collection - Tên bộ data trong A.DB.schema.FIELD_MAP
   * @param {boolean} onlyNew - Mặc định false (true: chỉ lấy data đã thay đổi)
   * @param {Object} options - { prefix }
   */
  getFormData(root, collectionName, onlyNew = false, options = {}) {
    const rootEl = typeof root === 'string' ? document.querySelector(root) : root;
    if (!rootEl || !collectionName) return {};

    const { prefix = '' } = options;
    const results = {};

    // Truy xuất danh sách field từ Mapping hệ thống
    const fields = window.A.DB.schema.FIELD_MAP && A.DB.schema.FIELD_MAP[collectionName] ? Object.values(A.DB.schema.FIELD_MAP[collectionName]) : [];

    L._(`🔍 [getFormData] Thu thập dữ liệu từ collection: ${collectionName} (fields: ${fields.join(', ')})`, 'info');

    if (fields.length === 0) return results;

    fields.forEach((fieldName) => {
      const selector = `[data-field="${prefix}${fieldName}"], #${prefix}${fieldName}`;
      const el = rootEl.querySelector(selector);
      if (!el) return;

      const currentValue = typeof getFromEl === 'function' ? getFromEl(el) : el.value;
      const initialValue = el.dataset.initial;

      const isPrimaryKey = fieldName === 'id' || fieldName === 'uid';
      const isChanged = String(currentValue) !== String(initialValue);

      if (!onlyNew || isPrimaryKey || isChanged) {
        results[fieldName] = currentValue;
      }
    });

    // Nếu không thu thập được trường dữ liệu nào, trả về object rỗng
    if (Object.keys(results).length === 0) return {};

    // Lấy ID của bản ghi (Ưu tiên 'id', rồi đến 'uid', nếu dòng mới tinh chưa có thì tạo temp ID)
    const recordId = results.id || results.uid || `temp_${Date.now()}`;

    // Trả về cấu trúc Object có key là ID để đồng bộ với hệ thống
    return {
      [recordId]: results,
    };
  },

  // --- Private Methods ---

  /**
   * _handleArraySet: Xử lý đổ dữ liệu mảng vào Table/List
   * @private
   */
  _handleArraySet(rootEl, data, isNew, prefix) {
    const container = rootEl.tagName === 'TABLE' ? rootEl.querySelector('tbody') || rootEl : rootEl;

    // Tìm các dòng mẫu bằng thuộc tính [data-row]
    let rows = container.querySelectorAll('[data-row]');
    if (rows.length === 0) return 0;

    const templateRow = rows[0];
    const targetCount = data.length;
    const currentCount = rows.length;

    // 1. Đồng bộ số lượng dòng
    if (currentCount < targetCount) {
      const fragment = document.createDocumentFragment();
      for (let i = currentCount; i < targetCount; i++) {
        const newRow = templateRow.cloneNode(true);
        // Làm sạch data-initial và data-item của dòng mới clone
        newRow.removeAttribute('data-item');
        newRow.querySelectorAll('[data-field]').forEach((el) => delete el.dataset.initial);
        fragment.appendChild(newRow);
      }
      container.appendChild(fragment);
    } else if (currentCount > targetCount) {
      for (let i = currentCount - 1; i >= targetCount; i--) {
        rows[i].remove();
      }
    }

    // 2. Đổ dữ liệu và gán định danh (Mấu chốt ở đây)
    const finalRows = container.querySelectorAll('[data-row]');
    finalRows.forEach((row, index) => {
      const itemData = data[index];

      // Gán Index vào data-row thay vì dùng ID
      row.setAttribute('data-row', index);

      // Gán ID của object vào data-item (nếu có)
      if (itemData && (itemData.id || itemData.uid)) {
        row.setAttribute('data-item', itemData.id || itemData.uid);
      }

      // Đệ quy đổ dữ liệu vào các field trong dòng
      this.setFormData(row, itemData, isNew, { prefix });
    });

    return targetCount;
  },

  _handleObjectSet(rootEl, data, isNew, prefix) {
    let count = 0;
    for (const [key, value] of Object.entries(data)) {
      // Fix lỗi selector không hợp lệ khi key là số (VD: [data-field="0"], #0)
      // Trong CSS, ID không được bắt đầu bằng số.
      const isNumericKey = !isNaN(key) && /^\d+$/.test(key);
      const selector = isNumericKey ? `[data-field="${prefix}${key}"]` : `[data-field="${prefix}${key}"], #${prefix}${key}`;

      try {
        const els = rootEl.querySelectorAll(selector);
        els.forEach((el) => {
          if (typeof setToEl === 'function' && setToEl(el, value)) {
            if (isNew) el.dataset.initial = value ?? '';
            count++;
          }
        });
      } catch (selError) {
        // Nếu vẫn lỗi selector, bỏ qua field này
        warn('setFormData', `Invalid selector for key "${key}": ${selector}`, selError);
      }
    }
    return count;
  },

  /**
   * =========================================================================
   * FILTER UPDATED DATA - So sánh giá trị input và data-initial
   * =========================================================================
   */
  /**
   * So sánh giá trị hiện tại (value) với giá trị ban đầu (data-initial)
   * và trả về object chứa các field đã thay đổi.
   *
   * @param {string} containerId - ID của container chứa các input
   * @param {Document|HTMLElement} root - Root để tìm container (mặc định document)
   * @param {boolean} isCollection - true: ghi Firestore collection (xử lý record mới)
   * @returns {Promise<object>} - Object chứa các field có giá trị thay đổi thực sự
   *                              Format: { fieldName: newValue, ... }
   *
   * @example
   * // HTML:
   * // <div id="form-container">
   * //   <input data-field="full_name" value="Nguyễn A" data-initial="Nguyễn A">
   * //   <input data-field="phone" value="0909123456" data-initial="0909000000">
   * // </div>
   *
   * // JavaScript:
   * const changes = await filterUpdatedData('form-container');
   * // Returns: [{ phone: "0909123456" }, 1] (chỉ 1 field phone thay đổi)
   */
  async filterUpdatedData(containerId, root = document, isCollection = true) {
    const container = getE(containerId, root);
    if (!container) {
      L._(`⚠️ Container với ID "${containerId}" không tìm thấy`, 'warning');
      return {};
    }

    // Các field hệ thống tự động cập nhật → bỏ qua khi tính hasRealChanges
    const SYSTEM_FIELDS = new Set(['updated_at', 'created_at']);
    const inputs = container.querySelectorAll('input, select, textarea');

    // ── HELPER: Chuẩn hoá giá trị trước khi so sánh ─────────────────────────
    // Mục tiêu: tránh false-positive do null/undefined/khoảng trắng/kiểu dữ liệu
    //
    // Quy tắc chuẩn hoá:
    //  1. null / undefined → chuỗi rỗng ""
    //  2. Boolean → "true" / "false"
    //  3. Cắt khoảng trắng đầu/cuối
    //  4. Số có định dạng ("1,500,000") → "1500000" để so sánh nhất quán
    //     (chỉ áp dụng khi toàn bộ chuỗi sau khi bỏ dấu phẩy là số thuần)
    const _normalize = (val) => {
      if (val === null || val === undefined) return '';
      const str = String(val).trim();
      // Chuẩn hoá số có format dấu phẩy ngàn: "1,500,000" → "1500000"
      let stripped = str.replace(/[,.]/g, '');
      if (stripped?.startsWith("'")) stripped = stripped.slice(1);
      if (stripped !== '' && !isNaN(stripped) && isFinite(stripped)) return stripped;
      return str;
    };

    // ── EARLY EXIT: Phát hiện trường hợp TẠO MỚI ────────────────────────────
    // Chỉ áp dụng khi isCollection = true (ghi collection Firestore).
    // Tìm field 'id' trong container: nếu không có hoặc giá trị rỗng
    // → đây là record mới → trả về toàn bộ data (bỏ qua so sánh data-initial).
    if (isCollection) {
      const idEl = container.querySelector('[data-field="id"]') || container.querySelector('[data-field="customer_id"]') || container.querySelector('[data-field="uid"]');

      const idValue = idEl ? _normalize(getFromEl(idEl)) : '';
      if (!idEl || !idValue || idValue === '0') {
        const allData = {};
        inputs.forEach((el) => {
          const fieldName = el.getAttribute('data-field') || el.id;
          if (!fieldName || SYSTEM_FIELDS.has(fieldName)) return;
          allData[fieldName] = getFromEl(el);
        });
        L._('⚡ [filterUpdatedData] No ID found, treating as new record. Returning all data.', allData);
        return [allData, Object.keys(allData).length];
      }
    }

    // ── NORMAL FLOW: So sánh data-initial để phát hiện thay đổi ─────────────
    const updatedData = {};
    let hasRealChanges = 0;
    let initialAttr;

    inputs.forEach((el) => {
      const rawCurrent = getFromEl(el);
      const fieldName = el.dataset.field || el.id;

      if (!fieldName) return;

      // Bỏ qua hoàn toàn các field hệ thống
      if (SYSTEM_FIELDS.has(fieldName)) return;

      const isExactId = fieldName === 'id';
      const isRelatedId = fieldName.endsWith('_id');

      // ── SO SÁNH CHẶT CHẼ ──────────────────────────────────────────────────
      // FIX: dùng `initialAttr !== undefined` thay vì `!initialAttr`
      //      để tránh false-positive khi data-initial="" (chuỗi rỗng hợp lệ)
      initialAttr = el.dataset.initial; // undefined nếu attribute chưa được set
      const hasInitialSet = initialAttr !== undefined;

      let isChanged;
      if (!hasInitialSet && (rawCurrent || Number(rawCurrent) > 0)) {
        // data-initial chưa được inject → coi là đã thay đổi (an toàn hơn)
        isChanged = true;
      } else if (hasInitialSet) {
        // So sánh sau khi chuẩn hoá cả hai vế
        isChanged = String(_normalize(rawCurrent)) !== String(_normalize(initialAttr));
      }

      // Luôn lấy field id/..._id (làm khoá tham chiếu); các field khác chỉ lấy khi thay đổi
      if (isExactId || isRelatedId || isChanged) {
        updatedData[fieldName] = rawCurrent;
      }

      // Có thay đổi thực sự = field không phải id thuần, và giá trị khác data-initial
      if (isChanged && !isExactId) {
        hasRealChanges++;
        L._(`🔍 [filterUpdatedData] Updated ${hasRealChanges} fields detected: ${fieldName}: ${rawCurrent} - ${initialAttr ? initialAttr : 'Không có'}`);
      }
    });
    // Chỉ trả về dữ liệu khi thực sự có field thay đổi (không tính field id thuần)
    if (!hasRealChanges) return [{}, 0];

    return [updatedData, hasRealChanges];
  },
  /**
   * Helper: Trích xuất dữ liệu từ Table Form dựa trên dataset
   * @param {string} tableId - ID của table cần lấy dữ liệu
   * @returns {Array} - Mảng các object đã được map với Firestore field
   */
  async getTableData(tableId) {
    try {
      const table = document.getElementById(tableId);
      if (!table) throw new Error(`Table với ID ${tableId} không tồn tại.`);

      // Lấy tất cả các hàng trong tbody để tránh lấy header
      const rows = table.querySelectorAll('tbody tr');
      const dataResult = [];

      rows.forEach((row, index) => {
        const rowData = {};
        // Tìm tất cả phần tử có data-field bên trong hàng
        const inputs = row.querySelectorAll('[data-field]');

        let hasData = false;
        inputs.forEach((input) => {
          const fieldName = input.dataset.field; // Lấy tên field từ data-field
          if (!fieldName) return;

          let value = getVal(input); // Sử dụng hàm getVal để lấy giá trị đúng định dạng

          rowData[fieldName] = value;

          // Kiểm tra xem hàng có dữ liệu không (tránh lưu hàng trống)
          if (value !== '' && value !== 0 && value !== false) {
            hasData = true;
          }
        });

        if (hasData) {
          dataResult.push(rowData);
          L._(Object.entries(rowData));
        }
      });

      return dataResult;
    } catch (error) {
      Opps('Lỗi tại Utils.getTableData:', error);
      return [];
    }
  },

  /**
   * Extract row data from HTML form using data-field attributes
   * Supports both object and array formats dynamically
   *
   * @param {string} collectionName - Collection name (e.g., 'operator_entries', 'booking_details')
   * @param {string} rowId - Row ID or row index (for searching the TR element)
   * @param {string|Element} rootIdOrEl - Container ID (e.g., 'detail-tbody') or Element containing the row
   * @returns {Object} - Object with field names as keys mapped from data-field attributes
   *
   * @example
   * // Get data from row with id="row-5" inside container with id="detail-tbody"
   * const rowData = getRowData('operator_entries', 5, 'detail-tbody');
   *
   * @example
   * // Get data using Element reference
   * const container = document.getElementById('detail-tbody');
   * const rowData = getRowData('operator_entries', 1, container);
   */
  getRowData(collectionName, rowIdorEl, rootIdOrEl) {
    try {
      // 2. Find the TR element
      let trElement;
      if (rowIdorEl instanceof Element) trElement = rowIdorEl;
      else {
        let root = $(rootIdOrEl);
        if (!root) root = document.body;
        rowId = rowIdorEl;

        // Try to find by id first (format: row-{idx})
        trElement = root.querySelector(`tr#row-${rowId}`) || root.querySelector(`tr[data-row="${rowId}"]`);

        // Fallback: search by data-row-id or similar
        if (!trElement) {
          trElement = root.querySelector(`tr[data-item="${rowId}"]`);
        }

        // Fallback: if rowId is numeric, use as nth-child
        if (!trElement && !isNaN(rowId)) {
          const childIndex = parseInt(rowId) + 1;
          trElement = container.querySelector(`tr:nth-child(${childIndex})`);
        }

        if (!trElement) {
          console.warn(`⚠️ Row not found with rowId: ${rowId}`);
          return {};
        }
      }

      // 3. Get array field names for this collection
      const fieldNames = A.DB.schema.getFieldNames(collectionName);

      if (fieldNames.length === 0) {
        console.error(`❌ No field mapping found for collection: ${collectionName}`);
        return {};
      }

      // 4. Extract data from TR using data-field attributes
      const rowData = {};

      fieldNames.forEach((fieldName) => {
        // Find input/select with data-field attribute matching this fieldName
        const field = trElement.querySelector(`[data-field="${fieldName}"]`);

        if (field) {
          rowData[fieldName] = getVal(field);
        } else {
          // Field not found in this row - set empty value
          rowData[fieldName] = '';
        }
      });

      return rowData;
    } catch (e) {
      console.error(`❌ Error in getRowDataByField:`, e);
      return {};
    }
  },

  /**
   * 1. Lọc dữ liệu đa năng (Hỗ trợ lọc đơn và lọc nhiều điều kiện)
   * @param {Object|Array} source - Dữ liệu gốc (Object hoặc Array)
   * @param {any} value - Giá trị cần tìm HOẶC Object/Array chứa nhiều điều kiện
   * @param {string} op - Toán tử (==, !=, >, <, >=, <=, includes) mặc định '=='
   * @param {string} field - Tên trường, mặc định 'booking_id'
   * @returns {Object} Dữ liệu đã lọc dạng Object { id: item }
   */
  filter(source, value, op = '==', field = 'booking_id') {
    const result = {};
    if (!source) return result;

    // Xử lý đầu vào: đồng bộ thành mảng [key, item] để giữ nguyên ID gốc
    const entries = Array.isArray(source) ? source.map((item, idx) => [item.id || `temp_${idx}`, item]) : Object.entries(source);
    if (!entries.length) return result;

    // Kiểm tra nếu value là Object hoặc Array (Lọc nhiều điều kiện)
    const isComplex = typeof value === 'object' && value !== null;

    // Tiền xử lý điều kiện để tối ưu hiệu năng
    let conditions = [];
    if (isComplex) {
      if (Array.isArray(value)) {
        // Dạng mảng: [{ field, op, value }, ...]
        conditions = value.map((c) => ({ field: c.field, op: c.op || '==', value: c.value }));
      } else {
        // Dạng Object: { field: value } hoặc { field: { op, value } }
        conditions = Object.entries(value).map(([f, v]) => {
          if (v && typeof v === 'object' && v.op) return { field: f, op: v.op, value: v.value };
          return { field: f, op: '==', value: v };
        });
      }
    } else {
      // Dạng đơn (như code cũ)
      conditions = [{ field, op, value }];
    }

    // Cache các giá trị parse để tránh parse lặp lại trong vòng lặp
    const processedConds = conditions.map((c) => {
      const v = c.value;
      const isNum = v !== '' && v !== null && !isNaN(v);
      const isDate = v instanceof Date || (typeof v === 'string' && isNaN(v) && !isNaN(Date.parse(v)));
      return {
        ...c,
        isNum,
        numVal: isNum ? Number(v) : v,
        isDate,
        dateVal: isDate ? (v instanceof Date ? v.getTime() : new Date(v).getTime()) : NaN,
      };
    });

    entries.forEach(([key, item]) => {
      const isMatch = processedConds.every((c) => {
        const itemVal = item[c.field];
        if (itemVal === undefined || itemVal === null) return false;

        // 1. So sánh Date
        if (c.isDate && (typeof itemVal === 'string' || itemVal instanceof Date)) {
          const itemDate = itemVal instanceof Date ? itemVal.getTime() : new Date(itemVal).getTime();
          if (!isNaN(itemDate) && !isNaN(c.dateVal)) {
            switch (c.op) {
              case '==':
                return itemDate === c.dateVal;
              case '!=':
                return itemDate !== c.dateVal;
              case '>':
                return itemDate > c.dateVal;
              case '<':
                return itemDate < c.dateVal;
              case '>=':
                return itemDate >= c.dateVal;
              case '<=':
                return itemDate <= c.dateVal;
            }
          }
        }

        // 2. So sánh Number
        if (c.isNum) {
          const itemNum = Number(itemVal);
          if (!isNaN(itemNum)) {
            switch (c.op) {
              case '==':
                return itemNum === c.numVal;
              case '!=':
                return itemNum !== c.numVal;
              case '>':
                return itemNum > c.numVal;
              case '<':
                return itemNum < c.numVal;
              case '>=':
                return itemNum >= c.numVal;
              case '<=':
                return itemNum <= c.numVal;
            }
          }
        }

        // 3. So sánh String (Text, includes)
        const sItem = String(itemVal).toLowerCase().trim();
        const sVal = String(c.value).toLowerCase().trim();
        switch (c.op) {
          case '==':
            return sItem === sVal;
          case '!=':
            return sItem !== sVal;
          case 'includes':
            return sItem.includes(sVal);
        }
        return false;
      });

      if (isMatch) result[key] = item;
    });

    return result;
  },

  /**
   * Helper: Lọc dữ liệu với nhiều điều kiện (Hỗ trợ cả Array và Firestore Object)
   * @param {Array|Object} data - Dữ liệu gốc cần lọc.
   * @param {Array} conditions - Mảng các điều kiện: [{ field: 'a', operator: '==', value: 'x' }]
   * @param {String} logic - 'AND' (tất cả điều kiện đúng) hoặc 'OR' (chỉ cần 1 điều kiện đúng). Mặc định là 'AND'.
   * @returns {Array|Object} - Trả về dữ liệu đã lọc (giữ nguyên định dạng đầu vào).
   */
  filters(data, conditions = [], logic = 'AND') {
    try {
      // 1. Kiểm tra tính hợp lệ của dữ liệu đầu vào
      if (!data || conditions.length === 0) return data;

      // 2. Nhận diện cấu trúc dữ liệu: Array hay Object?
      const isObject = !Array.isArray(data) && typeof data === 'object';

      // Chuẩn hóa dữ liệu về dạng mảng Entries [key, value] để dùng chung 1 vòng lặp
      const entries = isObject ? Object.entries(data) : data.map((item, index) => [index, item]);

      // 3. Hàm đánh giá từng điều kiện đơn lẻ
      const evaluateCondition = (item, { field, operator = '==', value }) => {
        // Hỗ trợ dot notation (vd: 'customer.name') nếu cần nâng cấp sau này, hiện tại Sư phụ dùng truy cập trực tiếp
        const itemValue = item[field];

        // Xử lý undefined/null an toàn
        if (itemValue === undefined || itemValue === null) return false;

        switch (operator) {
          case '==':
            return itemValue === value;
          case '!=':
            return itemValue !== value;
          case '>':
            return itemValue > value;
          case '>=':
            return itemValue >= value;
          case '<':
            return itemValue < value;
          case '<=':
            return itemValue <= value;
          case 'includes': // Dành cho chuỗi hoặc mảng con
            return Array.isArray(itemValue) ? itemValue.includes(value) : String(itemValue).toLowerCase().includes(String(value).toLowerCase());
          case 'in': // Dành cho trường hợp value là mảng (vd: field A có nằm trong mảng [x, y, z] không)
            return Array.isArray(value) && value.includes(itemValue);
          default:
            return itemValue === value;
        }
      };

      // 4. Lặp và áp dụng logic filter
      const filteredEntries = entries.filter(([key, item]) => {
        if (logic === 'OR') {
          // OR: Trả về true nếu CÓ ÍT NHẤT 1 điều kiện đúng
          return conditions.some((cond) => evaluateCondition(item, cond));
        }
        // AND (Mặc định): Trả về true nếu TẤT CẢ điều kiện đều đúng
        return conditions.every((cond) => evaluateCondition(item, cond));
      });

      // 5. Build lại dữ liệu đầu ra đúng với định dạng gốc
      if (isObject) {
        return filteredEntries.reduce((acc, [key, val]) => {
          acc[key] = val;
          return acc;
        }, {});
      } else {
        return filteredEntries.map(([key, val]) => val);
      }
    } catch (error) {
      console.error('❌ [Helper Error] multiFilter:', error);
      // Fallback: Trả về dữ liệu gốc để app không bị dừng đột ngột
      return data;
    }
  },

  /**
   * 2. Tính toán tổng hợp (Agg/Sum)
   * @param {Object|Array} source - Dữ liệu gốc
   * @param {string|null} field - Tên trường cần tính (Nếu null sẽ tính tự động)
   * @returns {number|Object} Tổng số tiền (nếu truyền field) HOẶC Object {sum, count, quantity}
   */
  agg(source, field = null) {
    const items = Array.isArray(source) ? source : Object.values(source || {});

    // Trường hợp 1: Có chỉ định field cụ thể -> Trả về thẳng giá trị Number
    if (field) {
      return items.reduce((acc, item) => acc + (Number(String(item[field]).replace(/[^0-9]/g, '')) || 0), 0);
    }

    // Trường hợp 2: Tính toán tự động tổng thể
    let sum = 0;
    let quantity = 0;
    const count = items.length;

    const sumFields = ['total_amount', 'total', 'total_cost', 'amount', 'balance', 'balance_amount'];
    const qtyFields = ['quantity', 'qtt', 'adults', 'adult', 'no_of_guest', 'so_luong'];

    items.forEach((item) => {
      // Ưu tiên tìm field tiền tệ đầu tiên có dữ liệu
      const sField = sumFields.find((f) => item[f] !== undefined && item[f] !== null && item[f] !== '');
      if (sField) sum += Number(String(item[sField]).replace(/[^0-9]/g, '')) || 0;

      // Ưu tiên tìm field số lượng đầu tiên có dữ liệu
      const qField = qtyFields.find((f) => item[f] !== undefined && item[f] !== null && item[f] !== '');
      if (qField) quantity += Number(item[qField]) || 0;
    });

    return { sum, count, quantity };
  },

  /**
   * 3. Gom nhóm (Group)
   * @param {Object|Array} source - Dữ liệu gốc
   * @param {string} field - Tên trường dùng để group
   * @returns {Object} { [group_value]: { [item_id]: item } }
   */
  group(source, field) {
    const result = {};
    if (!source) return result;

    const entries = Array.isArray(source) ? source.map((item, idx) => [item.id || `temp_${idx}`, item]) : Object.entries(source);

    entries.forEach(([key, item]) => {
      const groupVal = item[field] || 'Khác';
      if (!result[groupVal]) result[groupVal] = {};

      result[groupVal][key] = item; // Gắn item vào group bằng chính key ID
    });

    return result;
  },

  /**
   * 4. Sắp xếp (Sort)
   * @param {Object|Array} source - Dữ liệu gốc
   * @param {string} field - Trường cần sắp xếp
   * @param {string} dir - Chiều sắp xếp ('asc' hoặc 'desc')
   * @returns {Object} Object đã được sắp xếp (Giữ nguyên ID làm key)
   */
  sort(source, field, dir = 'asc') {
    if (!source) return {};

    const entries = Array.isArray(source) ? source.map((item, idx) => [item.id || `temp_${idx}`, item]) : Object.entries(source);

    // Sắp xếp mảng entries
    entries.sort((a, b) => {
      let valA = a[1][field];
      let valB = b[1][field];

      if (valA === undefined || valA === null) valA = '';
      if (valB === undefined || valB === null) valB = '';

      // Ưu tiên so sánh số
      const numA = Number(valA);
      const numB = Number(valB);
      if (!isNaN(numA) && !isNaN(numB) && valA !== '' && valB !== '') {
        return dir === 'asc' ? numA - numB : numB - numA;
      }

      // Ưu tiên so sánh Date
      const dateA = new Date(valA).getTime();
      const dateB = new Date(valB).getTime();
      if (!isNaN(dateA) && !isNaN(dateB) && isNaN(valA) && isNaN(valB)) {
        return dir === 'asc' ? dateA - dateB : dateB - dateA;
      }

      // So sánh chuỗi (Fallback)
      const strA = String(valA).toLowerCase();
      const strB = String(valB).toLowerCase();
      if (strA < strB) return dir === 'asc' ? -1 : 1;
      if (strA > strB) return dir === 'asc' ? 1 : -1;
      return 0;
    });

    // Rebuild lại thành Object
    // LƯU Ý JS: Object đảm bảo thứ tự key insertion order nếu key là String (VD: "BK01").
    // Nếu ID key của bạn là số nguyên (như "1", "2"), JS Engine có thể tự sắp xếp lại key.
    const result = {};
    entries.forEach(([key, item]) => {
      result[key] = item;
    });

    return result;
  },

  find(source, value, field) {
    const items = Array.isArray(source) ? source : Object.values(source || {});
    // Tìm thấy là return ngay lập tức, không quét hết mảng
    return items.find((item) => item && String(item[field]).trim() === String(value).trim()) || null;
  },
  /**
   * 5. Lấy giá trị duy nhất (Unique)
   * @param {Object|Array} source - Dữ liệu gốc
   * @param {string} field - Trường cần lấy giá trị duy nhất
   * @returns {Array} Mảng các giá trị duy nhất của trường đã chọn
   */
  unique(source, field) {
    return HD.pluck(source, field, true); // Tận dụng luôn hàm pluck ở trên
  },

  /**
   * Nối dữ liệu từ bảng khác vào bảng hiện tại
   * @param {Object} source - Bảng gốc (VD: danh sách booking)
   * @param {string} localField - Tên trường khóa ngoại ở bảng gốc (VD: 'customer_id')
   * @param {Object} targetData - Dữ liệu bảng đích (VD: APP_DATA.customers)
   * @param {string} asField - Tên trường mới sẽ được tạo ra chứa dữ liệu nối (VD: '_customer')
   */
  join(source, localField, targetData, asField) {
    const result = { ...source }; // Clone shallow tránh ảnh hưởng data gốc

    Object.keys(result).forEach((key) => {
      const item = { ...result[key] };
      const targetId = item[localField];

      // Tìm trong targetData bằng độ phức tạp O(1)
      if (targetId && targetData[targetId]) {
        item[asField] = targetData[targetId];
      } else {
        item[asField] = null;
      }
      result[key] = item;
    });

    return result;
  },
  /**
   * 6. Tạo array loại bỏ các giá trị rỗng
   * @param {Object|Array} source - Dữ liệu gốc
   * @param {string} field - Trường cần sắp xếp
   * @param {boolean} unique - Có loại bỏ giá trị trùng lặp hay không (mặc định: true)
   * @returns {Array} Mảng các giá trị của trường đã chọn
   */
  pluck(source, field, unique = true) {
    const items = Array.isArray(source) ? source : Object.values(source || {});
    const result = items.map((item) => item[field]).filter((val) => val !== undefined && val !== null && val !== '');
    return unique ? [...new Set(result)] : result;
  },

  /**
   * Helper: Kiểm tra một giá trị có khớp với điều kiện hay không
   * @private
   */
  _checkMatch(itemVal, targetVal, op = '==') {
    if (itemVal === undefined || itemVal === null) return false;

    // 1. So sánh Date
    const isDate = targetVal instanceof Date || (typeof targetVal === 'string' && isNaN(targetVal) && !isNaN(Date.parse(targetVal)));
    if (isDate && (typeof itemVal === 'string' || itemVal instanceof Date)) {
      const itemDate = itemVal instanceof Date ? itemVal.getTime() : new Date(itemVal).getTime();
      const dateVal = targetVal instanceof Date ? targetVal.getTime() : new Date(targetVal).getTime();
      if (!isNaN(itemDate) && !isNaN(dateVal)) {
        switch (op) {
          case '==':
            return itemDate === dateVal;
          case '=':
            return itemDate === dateVal;
          case '!=':
            return itemDate !== dateVal;
          case '>':
            return itemDate > dateVal;
          case '<':
            return itemDate < dateVal;
          case '>=':
            return itemDate >= dateVal;
          case '<=':
            return itemDate <= dateVal;
        }
      }
    }

    // 2. So sánh Number
    const isNum = targetVal !== '' && targetVal !== null && !isNaN(targetVal);
    if (isNum) {
      const itemNum = Number(itemVal);
      const numVal = Number(targetVal);
      if (!isNaN(itemNum)) {
        switch (op) {
          case '==':
            return itemNum === numVal;
          case '=':
            return itemNum === numVal;
          case '!=':
            return itemNum !== numVal;
          case '>':
            return itemNum > numVal;
          case '<':
            return itemNum < numVal;
          case '>=':
            return itemNum >= numVal;
          case '<=':
            return itemNum <= numVal;
        }
      }
    }

    // 3. So sánh String
    const sItem = String(itemVal).toLowerCase().trim();
    const sVal = String(targetVal).toLowerCase().trim();
    switch (op) {
      case '==':
        return sItem === sVal;
      case '=':
        return sItem === sVal;
      case '!=':
        return sItem !== sVal;
      case 'includes':
        return sItem.includes(sVal);
    }
    return false;
  },
};
// ============================================================================
// HD DATA PIPELINE HELPERS
// Hỗ trợ xử lý dữ liệu mạnh mẽ, nhận/trả về Object (key là id) theo chuẩn DB
// ============================================================================

/**
 * Chuyển đổi mọi loại dữ liệu (Object, Array, Primitives) về một mảng Object chuẩn mực.
 * @param {any} data - Dữ liệu đầu vào cần chuyển đổi
 * @param {string} [keyField='id'] - Tên trường dùng làm ID (Mặc định là 'id')
 * @param {string} [valField='name'] - Tên trường dùng làm hiển thị (Mặc định là 'name')
 * @returns {Array<Object>} Mảng chứa các object đã chuẩn hóa
 */
HD.toArray = function (data, keyField = 'id', valField = 'name') {
  if (!data) return [];

  // 1. Trường hợp đầu vào là Array
  if (Array.isArray(data)) {
    return data
      .map((item) => {
        // Bỏ qua giá trị rỗng
        if (item === null || item === undefined) return null;

        // Nếu item là mảng con (VD: ['A', 'Apple']), mảng[0] làm id, mảng[1] làm name
        if (Array.isArray(item)) {
          return {
            [keyField]: String(item[0] ?? ''),
            [valField]: String(item[1] ?? item[0]),
          };
        }

        // Nếu item là kiểu nguyên thủy (String, Number) -> tạo object có id và name giống nhau
        if (typeof item !== 'object') {
          return {
            [keyField]: String(item),
            [valField]: String(item),
          };
        }

        // Nếu đã là Object thường, giữ nguyên, nhưng đảm bảo có keyField (nếu chưa có)
        // Fallback tìm các trường tương đương nếu thiếu id/name
        const id = item[keyField] ?? item.uid ?? item.value ?? '';
        const text = item[valField] ?? item.text ?? item.title ?? String(id);

        return { ...item, [keyField]: id, [valField]: text };
      })
      .filter(Boolean); // Lọc bỏ các giá trị null
  }

  // 2. Trường hợp đầu vào là Object
  if (typeof data === 'object') {
    return Object.entries(data).map(([key, value]) => {
      // Dictionary Object (VD: { "USER1": { name: "John", age: 30 } })
      if (value && typeof value === 'object') {
        // Gộp key vào object để không mất id
        return { [keyField]: key, ...value };
      }

      // Flat Object (VD: { "HN": "Hà Nội", "HCM": "Hồ Chí Minh" })
      return {
        [keyField]: key,
        [valField]: String(value),
      };
    });
  }

  return [];
};

/**
 * Chuyển đổi Array hoặc Data bất kỳ về dạng Object Dictionary (Key-Value)
 * @param {any} data - Dữ liệu đầu vào
 * @param {string} [keyField='id'] - Trường lấy làm key cho Object (Mặc định: 'id')
 * @returns {Object} Object format dạng { [id]: { ...item } }
 */
HD.toObject = function (data, keyField = 'id') {
  // Tận dụng chính hàm toArray để chuẩn hóa mọi dữ liệu đầu vào thành mảng phẳng trước
  const standardizedArray = HD.toArray(data, keyField);

  // Reduce mảng thành Object
  return standardizedArray.reduce((acc, item) => {
    const key = item[keyField];
    if (key !== undefined && key !== '') {
      acc[key] = item;
    }
    return acc;
  }, {});
};

export default HD;
