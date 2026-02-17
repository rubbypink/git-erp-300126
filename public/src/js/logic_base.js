



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
 function getRowData(collectionName, rowIdorEl, rootIdOrEl) {
    try {
        // 2. Find the TR element
        let trElement;
        if (rowIdorEl instanceof Element) trElement = rowIdorEl;
        else {
            let root = $(rootIdOrEl);
            if (!root) root = document.body;
            rowId = rowIdorEl;
        
            // Try to find by id first (format: row-{idx})
            trElement = root.querySelector(`tr#row-${rowId}`);
            
            // Fallback: search by data-row-id or similar
            if (!trElement) {
                trElement = root.querySelector(`tr[data-row-id="${rowId}"]`);
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
        const fieldNames = getFieldNames(collectionName);
        
        if (fieldNames.length === 0) {
            console.error(`❌ No field mapping found for collection: ${collectionName}`);
            return {};
        }

        // 4. Extract data from TR using data-field attributes
        const rowData = {};
        
        fieldNames.forEach(fieldName => {
            // Find input/select with data-field attribute matching this fieldName
            const field = trElement.querySelector(`[data-field="${fieldName}"]`);
            
            if (field) {
                rowData[fieldName] = getVal(field);
            } else {
                // Field not found in this row - set empty value
                rowData[fieldName] = "";
            }
        });

        console.log(`✅ Extracted row data from [${collectionName}]:`, rowData);
        return rowData;

    } catch (e) {
        console.error(`❌ Error in getRowDataByField:`, e);
        return {};
    }
}

/**
 * Batch extract multiple rows from container
 * 
 * @param {string} collectionName - Collection name
 * @param {string|Element} rootIdOrEl - Container ID or Element
 * @param {boolean} skipEmpty - Skip rows with empty ID field (default: true)
 * @returns {Array<Object>} - Array of row objects
 * 
 * @example
 * const allRows = getAllRowDataByField('operator_entries', 'detail-tbody', true);
 */
function getAllRowDataByField(collectionName, rootIdOrEl, skipEmpty = true) {
    try {
        // 1. Resolve container
        let container;
        if (typeof rootIdOrEl === 'string') {
            container = $(rootIdOrEl);
        } else if (rootIdOrEl instanceof Element) {
            container = rootIdOrEl;
        } else {
            console.error("❌ Invalid rootIdOrEl parameter");
            return [];
        }

        if (!container) {
            console.error(`❌ Container not found`);
            return [];
        }

        // 2. Get all TR rows
        const trElements = container.querySelectorAll('tr');
        
        if (trElements.length === 0) {
            console.warn(`⚠️ No rows found in container`);
            return [];
        }

        // 3. Extract data from each row
        const allRowsData = [];
        const fieldNames = getFieldNames(collectionName);

        trElements.forEach((trElement, idx) => {
            const rowData = {};
            
            fieldNames.forEach(fieldName => {
                const field = trElement.querySelector(`[data-field="${fieldName}"]`);
                if (field) rowData[fieldName] = getVal(field) || "";
            });

            // Skip empty rows if requested
            if (skipEmpty && !rowData.id) {
                return; // Continue to next iteration
            }

            allRowsData.push(rowData);
        });

        console.log(`✅ Extracted ${allRowsData.length} rows from [${collectionName}]`);
        return allRowsData;

    } catch (e) {
        console.error(`❌ Error in getAllRowDataByField:`, e);
        return [];
    }
}

/**
 * Set row data to form fields using data-field attributes
 * 
 * @param {string} collectionName - Collection name
 * @param {Object} rowData - Object with field names and values
 * @param {string|Element} rootIdOrEl - Container ID or Element containing the TR
 * @param {string} rowId - Row ID to identify which TR to update (optional, uses first TR if not provided)
 * @returns {boolean} - True if successful, false otherwise
 * 
 * @example
 * const data = { id: '123', service_type: 'Phòng', check_in: '2024-01-15' };
 * setRowDataByField('operator_entries', data, 'detail-tbody', 1);
 */
function setRowDataByField(collectionName, rowData, rootIdOrEl, rowId = null) {
    try {
        // 1. Resolve container
        let container;
        if (typeof rootIdOrEl === 'string') {
            container = $(rootIdOrEl);
        } else if (rootIdOrEl instanceof Element) {
            container = rootIdOrEl;
        } else {
            console.error("❌ Invalid rootIdOrEl parameter");
            container = document.body;
        }

        // 2. Find the TR element
        let trElement;
        
        if (rowId !== null) {
            trElement = container.querySelector(`tr#row-${rowId}`);
            if (!trElement) {
                trElement = container.querySelector(`tr[data-row-id="${rowId}"]`);
            }
        } else {
            // Use first TR if rowId not provided
            trElement = container.querySelector('tr');
        }

        if (!trElement) {
            console.warn(`⚠️ Row not found`);
            return false;
        }

        // 3. Set values for each field
        Object.entries(rowData).forEach(([fieldName, value]) => {
            const field = trElement.querySelector(`[data-field="${fieldName}"]`);
            if (field) setVal(field, value);
        });

        console.log(`✅ Set row data for [${collectionName}]`);
        return true;

    } catch (e) {
        console.error(`❌ Error in setRowDataByField:`, e);
        return false;
    }
}
/**
 * Xử lý khi click vào dòng Booking
 * Chiến thuật: Local (RAM) -> Firebase (Fetch) -> Server (GAS)
 */
async function onGridRowClick(bkId) {
    if (!bkId) return;
    log("🖱 Đang tìm Booking ID: " + bkId);
    showLoading(true);

    // --- BƯỚC 1: TÌM TRONG LOCAL (APP_DATA) ---
    const localResult = findBookingInLocal(bkId);
    
    if (localResult) {
        log("✅ Tìm thấy trong APP_DATA (Local Cache)");
        handleSearchResult(localResult);
        return; // Dừng ngay, không gọi Server
    }

    // --- BƯỚC 2: TÌM TRÊN FIREBASE (Nếu Local không thấy) ---
    // (Trường hợp dữ liệu vừa được người khác thêm mà mình chưa F5)
    log("⚠️ Không thấy trong Local, thử tải lại từ Firebase...", "warning");
    
    try {
        // Gọi hàm load lại dữ liệu (hàm bạn đã viết ở bài trước)
        // Lưu ý: Hàm này cần trả về Promise để dùng await
        await loadDataFromFirebase(); 
        
        // Tìm lại lần nữa sau khi đã refresh data
        const retryResult = findBookingInLocal(bkId);
        
        if (retryResult) {
        log("✅ Tìm thấy sau khi đồng bộ Firebase");
        handleSearchResult(retryResult);
        return;
        }
    } catch (e) {
        log("Lỗi kết nối Firebase:", e, "error");
    }
}


/**
 * Hàm hiển thị kết quả lên Form (Dùng chung cho cả Local và Server)
 */
function handleSearchResult(data) {    
    // Kiểm tra Dynamic Dispatch
    if (typeof fillFormFromSearch === 'function') {
    fillFormFromSearch(data);
    } else {
    showLoading(false);
    logError("Lỗi: Chưa có hàm fillFormFromSearch để hiển thị dữ liệu.");
    }
}

/**
 * Hàm Logic tìm kiếm trong biến APP_DATA
 * Trả về cấu trúc object Y HỆT như hàm searchBookingAPI của Server trả về
 * ✅ Support both array and object formats
 */
function findBookingInLocal(bkId) {
    // 1. Guard Clause: Kiểm tra dữ liệu nguồn
        if (!APP_DATA) return null;
    let role = CURRENT_USER.role;
    let detailsSource = ROLE_DATA[role];
    let detailsSourceObj = detailsSource + '_obj'; // Object variant

    // ✅ Prefer object format if available
    let bookingsData = APP_DATA.bookings_obj || APP_DATA.bookings;
    let detailsData = APP_DATA[detailsSourceObj] || APP_DATA[detailsSource];

    if (!Array.isArray(bookingsData) || bookingsData.length === 0) return null;
    if (!Array.isArray(detailsData)) detailsData = [];

    const isObjList = (list) => Array.isArray(list) && list[0] && typeof list[0] === 'object' && !Array.isArray(list[0]);
    const toStr = (v) => String(v ?? '');

    const findBookingRowById = (id) => {
        if (!Array.isArray(bookingsData)) return null;
        if (isObjList(bookingsData)) {
            return bookingsData.find(row => row && toStr(row.id) === toStr(id)) || null;
        }
        return bookingsData.find(row => row && toStr(row[0]) === toStr(id)) || null;
    };

    const findDetailRowById = (id) => {
        if (!Array.isArray(detailsData)) return null;
        if (isObjList(detailsData)) {
            // Object format detail id: `id`
            return detailsData.find(row => row && toStr(row.id) === toStr(id)) || null;
        }
        // Array format: SID at index 0
        return detailsData.find(row => row && toStr(row[0]) === toStr(id)) || null;
    };

    const getBookingIdFromDetail = (detailRow) => {
        if (!detailRow) return null;
        if (typeof detailRow === 'object' && !Array.isArray(detailRow)) return detailRow.booking_id;
        return detailRow[1];
    };
    
    // 2. Tìm dòng Bookings
    let resolvedBkId = bkId;
    let bookingsRow = findBookingRowById(resolvedBkId);

    // ✅ Nếu không tìm thấy booking, coi bkId là ID của bảng detailsSource/detailsSourceObj
    // -> tìm detail row theo id -> lấy booking_id -> tìm lại booking
    if (!bookingsRow) {
        const detailHit = findDetailRowById(bkId);
        const bkIdFromDetail = getBookingIdFromDetail(detailHit);
        if (bkIdFromDetail) {
            resolvedBkId = bkIdFromDetail;
            bookingsRow = findBookingRowById(resolvedBkId);
        }
    }

    if (!bookingsRow) return null;

    // 3. Tìm các dòng Details (lọc theo booking_id)
    let detailsRows;
    if (isObjList(detailsData)) {
        detailsRows = detailsData.filter(row => row && toStr(row.booking_id) === toStr(resolvedBkId));
    } else {
        detailsRows = detailsData.filter(row => row && toStr(row[1]) === toStr(resolvedBkId));
    }
    
    // Xử lý số điện thoại
    let phoneRaw;
    if (typeof bookingsRow === 'object' && !Array.isArray(bookingsRow)) {
        phoneRaw = bookingsRow.customer_phone;
    } else {
        phoneRaw = bookingsRow[3];
    }
    const phone = phoneRaw ? String(phoneRaw).replace(/^'/, "").trim() : "";

    let custRow = null;
    
    // 4. Tìm thông tin Customer
    if (phone !== "" && window.APP_DATA && Array.isArray(window.APP_DATA.customers)) {
        // Check if customers is object format
        let customersData = APP_DATA.customers_obj || APP_DATA.customers;
        
        custRow = customersData.find(r => {
            if (!r) return false;
            
            let custPhone;
            if (typeof r === 'object' && !Array.isArray(r)) {
                custPhone = r.phone;
            } else {
                custPhone = r[6];
            }
            
            if (!custPhone) return false;
            return String(custPhone).includes(phone);
        });
        
        if (!custRow) {
            log("Local search: Không tìm thấy khách theo SĐT");
        }
    }

    // 5. Đóng gói kết quả
    return {
    success: true,
    bookings: bookingsRow,     
    [detailsSource]: detailsRows,  
    customer: custRow,
    source: 'local' 
    };
}

function applyGridFilter() {
    try {
    // --- BƯỚC 1: LẤY DỮ LIỆU ĐẦU VÀO (INPUT) ---
    // Chỉ đọc DOM 1 lần duy nhất ở đây
    const colSelect = document.getElementById('filter-col');
    const valInput = document.getElementById('filter-val');
    const fromInput = document.getElementById('filter-from');
    const toInput = document.getElementById('filter-to');

    // Lấy giá trị thô (Raw Value) để làm Signature
    const rawCol = colSelect ? colSelect.value : '';
    const rawKeyword = valInput ? valInput.value : ''; // Giữ nguyên chữ hoa thường để so sánh chuẩn
    const rawFrom = fromInput ? fromInput.value : '';
    const rawTo = toInput ? toInput.value : '';

    // --- BƯỚC 2: XỬ LÝ LOGIC TOGGLE (RESET) ---
    // Tạo chữ ký từ dữ liệu thô
    const currentSignature = JSON.stringify({
        t: CURRENT_TABLE_KEY, // Kèm table key để tránh nhầm giữa các tab
        c: rawCol,
        k: rawKeyword,
        f: rawFrom,
        to: rawTo
    });

    // ✅ FIX: Check both array and object formats for data
    const hasDataArray = APP_DATA[CURRENT_TABLE_KEY] && Array.isArray(APP_DATA[CURRENT_TABLE_KEY]) && APP_DATA[CURRENT_TABLE_KEY].length > 0;
    const hasDataObj = APP_DATA[CURRENT_TABLE_KEY + '_obj'] && Array.isArray(APP_DATA[CURRENT_TABLE_KEY + '_obj']) && APP_DATA[CURRENT_TABLE_KEY + '_obj'].length > 0;
    
    if (!hasDataArray && !hasDataObj) {
        log('⚠ Không có dữ liệu để lọc', 'warning');
        return;
    }
    
    // Helpers
    const isNumericString = (s) => typeof s === 'string' && /^\d+$/.test(s.trim());
    const stripHeaderIfAny = (arr) => {
        if (!Array.isArray(arr)) return [];
        if (arr.length === 0) return [];
        const first = arr[0];
        // Header row detection: array with string-ish column names
        if (Array.isArray(first) && typeof first[0] === 'string' && (first[0].toLowerCase() === 'id' || first[0].toLowerCase() === 'số thứ tự')) {
            return arr.slice(1);
        }
        return arr;
    };
    const resolveColConfig = (raw) => {
        if (!GRID_COLS || !Array.isArray(GRID_COLS)) return null;
        const rawStr = String(raw ?? '').trim();
        if (!rawStr) return null;
        return GRID_COLS.find(c => String(c?.i) === rawStr || String(c?.key) === rawStr) || null;
    };
    const getCellValue = (row, rawColKey) => {
        const isObjRow = (row && typeof row === 'object' && !Array.isArray(row));
        const colCfg = resolveColConfig(rawColKey);
        if (isObjRow) {
            const field = colCfg?.key || colCfg?.i || rawColKey;
            return row ? row[field] : undefined;
        }
        // Array row
        const idx = isNumericString(String(rawColKey)) ? Number(rawColKey) : (typeof colCfg?.i === 'number' ? colCfg.i : -1);
        if (idx < 0) return undefined;
        return row ? row[idx] : undefined;
    };

    // ✅ FIX: Reset only when explicitly clicking reset with empty input
    if ((!rawKeyword && !rawFrom && !rawTo)) {
        log('⚠ Reset bộ lọc...', 'info');
        LAST_FILTER_SIGNATURE = null; 
        
        // Render lại bảng gốc (Reset Table)
        let originalData;
        if (hasDataArray) {
            originalData = stripHeaderIfAny(APP_DATA[CURRENT_TABLE_KEY].slice());
        } else {
            originalData = APP_DATA[CURRENT_TABLE_KEY + '_obj'];
        }
        
        if (typeof initPagination === 'function') initPagination(originalData);
        if (typeof calculateSummary === 'function') calculateSummary(originalData);
        
        return; // <--- KẾT THÚC HÀM NGAY TẠI ĐÂY
    }

    // Nếu không trùng -> Lưu chữ ký mới và đi tiếp
    LAST_FILTER_SIGNATURE = currentSignature;


    // --- BƯỚC 3: CHUẨN BỊ DỮ LIỆU ĐỂ LỌC (PROCESSING) ---
    // Bây giờ mới xử lý dữ liệu (Lower case, Date Object...) dùng biến raw ở trên
    
    // Config cột ngày (Như đã bàn ở bài trước)
    const definedDateCol = TABLE_DATE_CONFIG[CURRENT_TABLE_KEY];
    const DATE_COL_IDX = definedDateCol !== undefined ? definedDateCol : null;
    
    // Xử lý keyword
    const searchKey = rawKeyword.trim().toLowerCase();
    const searchColKey = rawCol; // can be index string or field name

    // Resolve date field for object format
    let DATE_FIELD_KEY = DATE_COL_IDX;
    if (hasDataObj) {
        // Prefer TABLE_DATE_CONFIG -> header mapping
        if (typeof DATE_COL_IDX === 'number') {
            const headerRow = APP_DATA?.header?.[CURRENT_TABLE_KEY];
            if (Array.isArray(headerRow) && headerRow[DATE_COL_IDX]) DATE_FIELD_KEY = headerRow[DATE_COL_IDX];
        }
        // Fallback: first date column in GRID_COLS
        if (!DATE_FIELD_KEY || typeof DATE_FIELD_KEY === 'number') {
            const dateCol = (GRID_COLS || []).find(c => c && c.fmt === 'date' && !c.hidden) || (GRID_COLS || []).find(c => c && c.fmt === 'date');
            DATE_FIELD_KEY = dateCol?.key || dateCol?.i || DATE_FIELD_KEY;
        }
    }

    // Xử lý Date
    let dStart = null, dEnd = null, isCheckDate = false;
    if (DATE_FIELD_KEY !== null && rawFrom && rawTo) {
        isCheckDate = true;
        dStart = new Date(rawFrom); dStart.setHours(0, 0, 0, 0);
        dEnd = new Date(rawTo); dEnd.setHours(23, 59, 59, 999);
    }

    // --- BƯỚC 4: THỰC HIỆN FILTER (CORE) ---
    // ✅ FIX: Get source data from either array or object format
    let source;
    if (hasDataObj) {
        source = APP_DATA[CURRENT_TABLE_KEY + '_obj'];
    } else if (hasDataArray) {
        source = stripHeaderIfAny(APP_DATA[CURRENT_TABLE_KEY].slice());
    } else return;

    const filtered = source.filter(row => {
        // A. Lọc Keyword
        let matchKeyword = true;
        if (searchKey) {
            const cellData = getCellValue(row, searchColKey);
            const cellValue = (cellData === undefined || cellData === null) ? "" : String(cellData).toLowerCase();
            matchKeyword = cellValue.includes(searchKey);
        }

        // B. Lọc Date
        let matchDate = true;
        if (isCheckDate) {
            let cellDateRaw;
            if (typeof row === 'object' && !Array.isArray(row)) {
                cellDateRaw = row[DATE_FIELD_KEY];
            } else {
                const dateIdx = (typeof DATE_FIELD_KEY === 'number') ? DATE_FIELD_KEY : (isNumericString(String(DATE_FIELD_KEY)) ? Number(DATE_FIELD_KEY) : DATE_COL_IDX);
                cellDateRaw = row[dateIdx];
            }
            
            if (cellDateRaw) {
                const rowDate = new Date(cellDateRaw); 
                if (!isNaN(rowDate.getTime())) {
                    matchDate = (rowDate >= dStart && rowDate <= dEnd);
                } else { matchDate = false; }
            } else { matchDate = false; }
        }

        return matchKeyword && matchDate;
    });

    log(`✅ Đã lọc bảng [${CURRENT_TABLE_KEY}]: ${filtered.length} kết quả`, 'success');

    // --- BƯỚC 5: OUTPUT ---
    if (typeof initPagination === 'function') initPagination(filtered);
    if (typeof calculateSummary === 'function') calculateSummary(filtered);

    } catch (err) {
    log('❌ Lỗi applyGridFilter: ' + err.message, 'error');
    }
}
/**
     * HÀM XỬ LÝ KHI CLICK NÚT "SẮP XẾP" - FIXED
     */

    /**
 * Chuyển đổi ngày tháng sang số (timestamp) để so sánh
 * Hỗ trợ: "dd/mm/yyyy", "yyyy-mm-dd", hoặc Date object
 */
function parseDateVal(input) {
    if (!input) return 0; // Rỗng thì cho về 0

    // 1. Nếu đã là Date object
    if (input instanceof Date) return input.getTime();

    const str = String(input).trim();
    
    // 2. Nếu là format dd/mm/yyyy (Việt Nam)
    if (str.includes('/')) {
    const parts = str.split('/');
    if (parts.length === 3) {
        // new Date(Năm, Tháng - 1, Ngày)
        return new Date(parts[2], parts[1] - 1, parts[0]).getTime();
    }
    }

    // 3. Nếu là format yyyy-mm-dd (ISO/Database)
    if (str.includes('-')) {
    const parts = str.split('-');
    if (parts.length === 3) {
        return new Date(parts[0], parts[1] - 1, parts[2]).getTime();
    }
    }
    // 4. Fallback (thử parse mặc định)
    return new Date(str).getTime() || 0;
}
function applyGridSorter() {
    // 1. Lấy cột & Validate
    const selectEl = document.getElementById('filter-col');
    if (!selectEl) return;
        const rawCol = String(selectEl.value ?? '').trim();
        if (!rawCol) return;
        const isNumericString = (s) => typeof s === 'string' && /^\d+$/.test(s.trim());
        const colIndex = isNumericString(rawCol) ? Number(rawCol) : rawCol;
        const resolveColConfig = (raw) => {
                if (!GRID_COLS || !Array.isArray(GRID_COLS)) return null;
                const rawStr = String(raw ?? '').trim();
                return GRID_COLS.find(c => String(c?.i) === rawStr || String(c?.key) === rawStr) || null;
        };
        const colConfig = resolveColConfig(rawCol);

    // 4. Chuẩn bị Dữ liệu (Theo logic: Clone -> Assign)
    if (!PG_STATE.data || PG_STATE.data.length === 0) {
        
        // ✅ FIX: Try object format first, fallback to array
        let rawData = APP_DATA[CURRENT_TABLE_KEY + '_obj'];
        let isObjectFormat = true;
        
        if (!rawData || rawData.length === 0) {
            rawData = APP_DATA[CURRENT_TABLE_KEY];
            isObjectFormat = false;
        }
        
        // Kiểm tra an toàn đầu vào
        if (rawData && Array.isArray(rawData) && rawData.length > 0) {
            
            // BƯỚC 1: TẠO BẢN SAO (Deep clone level 1)
            const workingCopy = [...rawData];
            
            // BƯỚC 2: CẮT HEADER (chỉ nếu là array format)
            if (!isObjectFormat && workingCopy.length > 0 && Array.isArray(workingCopy[0]) && workingCopy[0][0] && typeof workingCopy[0][0] === 'string') {
                // workingCopy[0] is a header row (contains strings like 'ID', 'Name')
                workingCopy.shift();
            }
            
            // BƯỚC 3: GỌNG RÁC (filter empty rows)
            PG_STATE.data = workingCopy.filter(row => {
                if (!row) return false;
                if (typeof row === 'object' && !Array.isArray(row)) {
                    // Object format - has id field
                    return row.id !== undefined && row.id !== '';
                } else if (Array.isArray(row)) {
                    // Array format - has first element
                    return row[0] !== undefined && row[0] !== '';
                }
                return true;
            });
        } else {
            // Xử lý khi không có dữ liệu
            PG_STATE.data = []; 
            return;
        }
    }
    // ✅ FIX: Don't blindly shift - check if first row is actually a header
    var source = PG_STATE.data;

    if (source && source.length > 0) {
        const firstRow = source[0];
        // Only shift if it's clearly a header row (array with string values)
        if (Array.isArray(firstRow) && typeof firstRow[0] === 'string' && (firstRow[0].toLowerCase() === 'id' || firstRow[0].toLowerCase() === 'số thứ tự')) {
            source.shift();
            PG_STATE.data = source;
        }
        // If object format or data format already clean, don't shift
    } else {
        log("Ko sort được do lỗi PG_STATE.data", 'warning');
        return;
    }
        // 2. Logic đảo chiều (Toggle)
    if (SORT_STATE.col === rawCol) {
        SORT_STATE.dir = (SORT_STATE.dir === 'asc') ? 'desc' : 'asc';
    } else {
        SORT_STATE.col = rawCol;
        log("ko đảo chiều");
        SORT_STATE.dir = 'desc';
    }
    
    // 5. Lấy format (Fix nguyên nhân 3: Dùng == thay vì ===)
    const format = colConfig ? colConfig.fmt : 'text';

    // 6. Thực hiện Sort
    // Hệ số đảo chiều: 1 (asc), -1 (desc)
    const modifier = (SORT_STATE.dir === 'asc') ? 1 : -1;

    source.sort((a, b) => {
        // ✅ NEW: Support both array and object access
        let valA, valB;
        
        if (typeof a === 'object' && !Array.isArray(a)) {
            // Object format - use field name
            const fieldName = colConfig?.key || colConfig?.i || rawCol;
            valA = a[fieldName];
            valB = b[fieldName];
        } else {
            // Array format
            const idx = (typeof colIndex === 'number') ? colIndex : (typeof colConfig?.i === 'number' ? colConfig.i : 0);
            valA = a[idx];
            valB = b[idx];
        }

        // Handle null/undefined
        if (valA === null || valA === undefined) valA = "";
        if (valB === null || valB === undefined) valB = "";

        let result = 0;

        if (format === 'date') {
            // FIX NGUYÊN NHÂN 2: Parse date chuẩn
            const tA = parseDateVal(valA);
            const tB = parseDateVal(valB);
            result = tA - tB;
        } 
        else if (format === 'money' || format === 'number') {
            // Parse số an toàn
            const numA = (typeof getNum === 'function') ? getNum(valA) : (Number(String(valA).replace(/[^0-9.-]+/g, "")) || 0);
            const numB = (typeof getNum === 'function') ? getNum(valB) : (Number(String(valB).replace(/[^0-9.-]+/g, "")) || 0);
            result = numA - numB;
        } 
        else {
            // Sort Text
            result = String(valA).toLowerCase().localeCompare(String(valB).toLowerCase(), 'vi');
        }

        // Áp dụng chiều sort
        return result * modifier;
    });

    // 7. Render lại bảng & Reset về trang 1
    initPagination(source);
    
        log(`Đã sort cột [${rawCol}] - ${SORT_STATE.dir}`, 'success');
    // 3. UI Feedback
    updateSortButtonUI(SORT_STATE.dir);
}

/**
 * Hàm phụ: Đổi icon/text của nút Sort cho sinh động
 */
function updateSortButtonUI(dir) {
    const btn = getE('btn-data-sort');
    if (!btn) return;

    if (dir === 'asc') {
        // Mũi tên lên (Tăng dần - A->Z)
        btn.innerHTML = '<i class="bi bi-sort-alpha-down"></i> Tăng dần';
        btn.classList.remove('btn-secondary');
        btn.classList.add('btn-primary'); // Highlight nút
    } else {
        // Mũi tên xuống (Giảm dần - Z->A)
        btn.innerHTML = '<i class="bi bi-sort-alpha-down-alt"></i> Giảm dần';
        btn.classList.remove('btn-primary'); // Highlight màu khác nếu muốn
        btn.classList.add('btn-secondary');
    }
}
/**
* HÀM XỬ LÝ TAB 2
* Hàm này phải nằm ngoài cùng, không được nằm trong window.onload hay hàm khác
*/
// 
function handleTableChange(key) {
    log("Người dùng đã chọn bảng: " + key);

    // BƯỚC QUAN TRỌNG: LOOKUP DATA (Dùng chìa khóa tìm dữ liệu)
    // APP_DATA là biến toàn cục chúng ta đã khai báo ở đầu file
    const selectedData = APP_DATA[key]; 

    if (selectedData) {
        // Gọi hàm render mà chúng ta đã viết
        renderTableByKey(key);
        initFilterUI();          
        // Hoặc xử lý gì đó với selectedData
        // log("Tìm thấy " + selectedData.length + " dòng dữ liệu.");
    } else {
        log("Không tìm thấy dữ liệu cho key:" + key);
    }
}

/**
 * HÀM TÍNH TOÁN THỐNG KÊ (Sử dụng Index cố định)
 * @param {Array} dataRows - Dữ liệu các dòng cần tính
 */
calculateSummary = function(dataRows) {
    // 1. Guard Clause: Reset về 0 nếu không có dữ liệu
    if (!dataRows || !Array.isArray(dataRows) || dataRows.length === 0) {
        log('calculateSummary lỗi tham số!');
        if (typeof updateStatUI === 'function') updateStatUI(0, 0, 0);
        return;
    }

    // =================================================================
    // TỰ ĐỘNG TÌM INDEX CỘT DỰA VÀO TÊN (GRID_COLS)
    // =================================================================
    let IDX_TOTAL = -1;
    let IDX_QTY = -1;

    if (typeof GRID_COLS !== 'undefined' && Array.isArray(GRID_COLS)) {
        // Tìm cột Tiền (Thành Tiền hoặc Tổng Cộng)
        const colTotal = GRID_COLS.find(c => {
            const t = String(c.t).toLowerCase().trim();
            return t === 'thành tiền' || t === 'tổng cộng' || t === 'tổng cộng' || t === 'tổng chi tiêu';
        });
        if (colTotal) IDX_TOTAL = colTotal.i;
        // Tìm cột Số Lượng (SL hoặc Số Lượng)
        const colQty = GRID_COLS.find(c => {
            const t = String(c.t).toLowerCase().trim();
            return t === 'sl' || t === 'số lượng' || t === 'nl' || t === 'người lớn';
        });            
        if (colQty) IDX_QTY = colQty.i;
    } else {
        log("calculateSummary: Chưa định nghĩa GRID_COLS", 'error');
    }

    // Log cảnh báo nếu không tìm thấy cột (để Dev biết tại sao Stats = 0)
    if (IDX_TOTAL === -1) log("Calc Summary: Không tìm thấy cột [Thành Tiền/Tổng Cộng]", 'error');
    if (IDX_QTY === -1) log("Calc Summary: Không tìm thấy cột [SL/Số Lượng]", 'error');

    // =================================================================
    // TÍNH TOÁN
    // =================================================================
    let sumTotal = 0;
    let sumQty = 0;

    // Helper: resolve key for object rows when IDX_* is numeric
    const resolveObjectKey = (idxOrKey) => {
        if (idxOrKey === null || idxOrKey === undefined || idxOrKey === -1) return null;
        if (typeof idxOrKey === 'string') return idxOrKey;

        // Nếu là number: dùng header để map index -> field name
        if (typeof idxOrKey === 'number') {
            const headerKey = (typeof CURRENT_TABLE_KEY === 'string' && APP_DATA && APP_DATA.header) ? CURRENT_TABLE_KEY : null;
            const headerRow = headerKey ? APP_DATA.header[headerKey] : null;
            if (Array.isArray(headerRow) && headerRow[idxOrKey]) return headerRow[idxOrKey];
        }
        return idxOrKey;
    };

    const parseNumberSafe = (val) => {
        if (typeof getNum === 'function') return getNum(val);
        const clean = String(val ?? '0').replace(/[^0-9.-]+/g, '');
        if (clean === '' || clean === '-') return 0;
        const num = parseFloat(clean);
        return isNaN(num) ? 0 : num;
    };

    // 2. Duyệt mảng để tính tổng (Support both array & object rows)
    for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        if (!row) continue;

        const isObjRow = (typeof row === 'object' && !Array.isArray(row));

        let rawTotal = 0;
        let rawQty = 0;

        if (isObjRow) {
            const keyTotal = resolveObjectKey(IDX_TOTAL);
            const keyQty = resolveObjectKey(IDX_QTY);
            rawTotal = (keyTotal !== null && keyTotal !== -1) ? row[keyTotal] : 0;
            rawQty = (keyQty !== null && keyQty !== -1) ? row[keyQty] : 0;
        } else {
            rawTotal = (IDX_TOTAL !== -1) ? row[IDX_TOTAL] : 0;
            rawQty = (IDX_QTY !== -1) ? row[IDX_QTY] : 0;
        }

        const valTotal = parseNumberSafe(rawTotal);
        const valQty = parseNumberSafe(rawQty);

        sumTotal += valTotal;
        sumQty += valQty;
    }

    // 3. Tính Bình Quân (Tránh chia cho 0)
    const avg = sumQty !== 0 ? (sumTotal / sumQty) : 0;

    // 4. Log kiểm tra
    log(`Stats: Rows=${dataRows.length}, Total=${formatMoney(sumTotal)}, Qty=${sumQty}`);

    // 5. Cập nhật giao diện
    if (typeof updateStatUI === 'function') {
        updateStatUI(sumTotal, sumQty, avg);
    }
};

/**
 * Helper cập nhật HTML (Giữ nguyên)
 */
function updateStatUI(total, qty, avg) {
    const elTotal = getE('stat-total');
    const elQty   = getE('stat-qty');
    const elAvg   = getE('stat-avg');
    // formatMoney là hàm tiện ích dùng chung
    // Nếu chưa load được file utils thì fallback về toLocaleString
    const fmt = (n) => (typeof formatMoney === 'function') ? formatMoney(n) : Number(n).toLocaleString();
    if (elTotal) setVal(elTotal, fmt(total));
    if (elQty) setVal(elQty, Number(qty).toLocaleString()); 
    if (elAvg) setVal(elAvg, fmt(avg));
}

/**
 * =========================================================================
 * SETTINGS MODAL - Theme & General Settings
 * Note: All theme-related logic delegated to THEME_MANAGER class
 * =========================================================================
 */
async function openSettingsModal() {
    try {
        // Render modal template
        await A.UI.renderTemplate('body', 'tmpl-download-library');
        await A.Modal.show(
            getE('tmpl-settings-form'), 
            'Cài Đặt Chung', 
            saveThemeSettings,           // Save callback (calls THEME_MANAGER.saveSettingsFromForm)
            () => THEME_MANAGER.resetToDefault(true)  // Reset callback with confirmation
        );
            
        // --- DELEGATE ALL THEME LOGIC TO THEME_MANAGER ---
        if (!THEME_MANAGER) {
            logError('Theme manager not initialized');
            return;
        }

        // 1. Fill form with current theme colors
        THEME_MANAGER.fillSettingsForm();

        // 2. Setup color sync (color picker ↔ text display sync)
        THEME_MANAGER.setupColorSync();

        // 3. Load keyboard shortcuts (if function exists)
        if (typeof loadShortcutsToForm === 'function') {
            loadShortcutsToForm();
        }

        // 4. Set logo preview
        if (getE('st-logo-preview')) {
            const mainLogo = getE('main-logo');
            getE('st-logo-preview').src = mainLogo ? mainLogo.src : 'https://9tripvietnam.com/wp-content/uploads/2019/05/Logo-9-trip.png.webp';
        }
        
        // Show modal and select theme tab
        // selectTab('tab-theme-content');
        
        log('✅ Settings modal opened - Theme management delegated to THEME_MANAGER', 'info');
    } catch (e) {
        logError("Lỗi mở Cài Đặt:", e);
    }
}

// =========================================================================
// DOWNLOAD MANAGER (FINAL V3)
// Logic: All-in-one, Auto VAT Filter, Dynamic ID Index
// =========================================================================
async function downloadData(type = 'excel') {
    // --- CẤU HÌNH INDEX (HARD-CODED RULES) ---
    // 1. Cột PayType để check VAT: Cột M trong Database -> Index 12 (0-based)
    const IDX_PAY_TYPE = 12; 
    
    // 2. Cột ID dùng để đối chiếu:
    const IDX_BOOKINGS_ID = 0;   // Với Bookings: ID nằm cột đầu tiên
    const IDX_DETAILS_ID = 1;  // Với Details/Admin: ID nằm cột thứ 2

    // ------------------------------------------

    // 1. KIỂM TRA DỮ LIỆU ĐẦU VÀO
    if (typeof PG_STATE === 'undefined' || !PG_STATE.data || PG_STATE.data.length === 0) {
        (typeof showNotify === 'function') ? showNotify("Không có dữ liệu!", false) : alert("Không có dữ liệu!");
        return;
    }

    // 2. CHUẨN BỊ TÊN FILE & NGỮ CẢNH
    const selectEl = document.getElementById('btn-select-datalist');
    let viewType = selectEl ? selectEl.value : 'bookings'; 
    let viewText = selectEl ? selectEl.options[selectEl.selectedIndex].text : 'Export';
    
    const now = new Date();
    const dateStr = `${String(now.getDate()).padStart(2,'0')}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getFullYear()).slice(2)}`;
    let fileName = `${viewText}_${dateStr}`;

    // Clone dữ liệu gốc để xử lý
    let dataToProcess = [...PG_STATE.data]; 

    // 3. LOGIC LỌC VAT (INLINE)
    if (['bookings', 'booking_details', 'operator_entries'].includes(viewType)) {
        if (confirm(`Bạn có muốn lọc danh sách xuất Hóa Đơn (VAT, CK CT...) cho bảng [${viewText}] không?`)) {
            
            if(typeof showNotify === 'function') showNotify("Đang lọc và xử lý dữ liệu...", true);
            await new Promise(r => setTimeout(r, 50)); 

            const vatKeywords = ['CK CT', 'Đã Xuất', 'VAT', 'Chờ Xuất'];
            const isVat = (val) => vatKeywords.some(k => String(val || '').toLowerCase().includes(k.toLowerCase()));

            // --- A. XỬ LÝ LỌC ---
            if (viewType === 'bookings') {
                // BOOKINGS: Lọc trực tiếp cột M (Index 12)
                dataToProcess = dataToProcess.filter(row => isVat(row[IDX_PAY_TYPE]));
            } 
            else {
                // DETAILS: Phải đối chiếu với Bookings gốc
                const bookingsrc = (typeof APP_DATA !== 'undefined') ? APP_DATA.bookings : [];
                
                if (bookingsrc && bookingsrc.length > 0) {
                    // B1: Quét Bookings để lấy danh sách ID hợp lệ
                    const validIds = new Set();
                    bookingsrc.forEach(mRow => {
                        // Check cột M (PayType)
                        if (isVat(mRow[IDX_PAY_TYPE])) {
                            // Lấy ID của Bookings (Cột đầu tiên - Index 0)
                            validIds.add(String(mRow[IDX_BOOKINGS_ID])); 
                        }
                    });

                    // B2: Lọc bảng Details hiện tại
                    dataToProcess = dataToProcess.filter(dRow => {
                        // Lấy ID tham chiếu của Details (Cột thứ 2 - Index 1)
                        const refId = String(dRow[IDX_DETAILS_ID]); 
                        return validIds.has(refId);
                    });
                } else {
                    console.warn("Cảnh báo: Không tìm thấy APP_DATA.bookings để đối chiếu VAT");
                }
            }
            
            if (dataToProcess.length === 0) {
                if(typeof showNotify === 'function') showNotify("Không tìm thấy dữ liệu VAT phù hợp!", false);
                return;
            }
            fileName += "_VAT_ONLY";
        }
    }

    // 4. MAPPING DỮ LIỆU (ARRAY -> OBJECT with HEADERS)
    if (typeof GRID_COLS === 'undefined' || !GRID_COLS.length) {
        alert("Lỗi: Không tìm thấy cấu hình cột (GRID_COLS).");
        return;
    }

    const exportData = dataToProcess.map(row => {
        const rowObj = {};
        GRID_COLS.forEach(col => {
            // Lấy dữ liệu theo index cột đã lưu trong cấu hình (col.i)
            let val = row[col.i]; 

            if (val !== null && val !== undefined && val !== '') {
                if (col.fmt === 'date') {
                    try {
                        const d = new Date(val);
                        if (!isNaN(d.getTime())) val = d.toLocaleDateString('vi-VN');
                    } catch(e){}
                } 
            } else {
                val = '';
            }
            rowObj[col.t] = val;
        });
        return rowObj;
    });

    // 5. THỰC HIỆN TẢI FILE
    try {
        if (type === 'excel') {
            if (typeof XLSX === 'undefined') throw new Error("Thư viện SheetJS chưa được tải.");
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(exportData);
            const wscols = Object.keys(exportData[0] || {}).map(() => ({wch: 15}));
            ws['!cols'] = wscols;
            XLSX.utils.book_append_sheet(wb, ws, "Data");
            XLSX.writeFile(wb, `${fileName}.xlsx`);
        } else {
            if (typeof window.jspdf === 'undefined') throw new Error("Thư viện jsPDF chưa được tải.");
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'landscape' });
            const headers = [Object.keys(exportData[0] || {})];
            const body = exportData.map(obj => Object.values(obj));
            doc.setFontSize(10);
            doc.text(`BÁO CÁO: ${viewText}`, 14, 15);
            doc.text(`Ngày xuất: ${new Date().toLocaleString('vi-VN')}`, 14, 20);
            doc.autoTable({
                head: headers,
                body: body,
                startY: 25,
                theme: 'grid',
                styles: { font: 'helvetica', fontSize: 8 }, 
                headStyles: { fillColor: [44, 62, 80] }
            });
            doc.save(`${fileName}.pdf`);
        }
        if(typeof showNotify === 'function') showNotify("Đã xuất file thành công!", true);
    } catch (err) {
        logError(err);
        alert("Lỗi khi xuất file: " + err.message);
    }
}
// ==========================================
// CẬP NHẬT LOGIC TÌM KIẾM & CLICK (YÊU CẦU 2)
// ==========================================

/**
 * Xử lý click dòng trên Dashboard
 * @param {string} idVal - Giá trị ID (BookingID hoặc SID)
 * @param {boolean} isServiceId - True nếu idVal là SID
 */
function handleDashClick(idVal, isServiceId) {
    onGridRowClick(idVal);
}
// ==========================================
// MODULE: BATCH EDIT (FULL ROW MODE)
// ==========================================

// Biến lưu trữ dữ liệu gốc của các dòng đang edit
var CURRENT_BATCH_DATA = []; 

/**
 * 1. Đổ dữ liệu vào Form
 */

function openBatchEdit(dataList, title) {
    // A. Lưu bản sao dữ liệu để xử lý sau (Quan trọng)
    // dataList là mảng các dòng (Array) lấy từ APP_DATA.booking_details
    CURRENT_BATCH_DATA = JSON.parse(JSON.stringify(dataList)); 

    // B. Chuyển Tab & UI Footer (Giữ nguyên)
    activateTab('tab-form');
    setClass('btn-save-form', 'd-none', true);
    setClass('btn-save-batch', 'd-none', false);
    refreshForm();
    
    // C. Render giao diện
    const tbody = getE('detail-tbody');
    if (tbody) tbody.innerHTML = ''; 

    // Duyệt qua dữ liệu đễ vẽ form, dùng index để liên kết với CURRENT_BATCH_DATA
    CURRENT_BATCH_DATA.forEach((row, index) => {
        if (typeof addDetailRow === 'function') {
            addDetailRow(row); 
        }
    });
}

function refreshForm() {
    getE('main-form').reset();
    getE('detail-tbody').innerHTML = '';
    getE('BK_Date').valueAsDate = new Date();
    getE('BK_Start').valueAsDate = new Date();
    getE('BK_End').valueAsDate = new Date();
    detailRowCount = 0;
}

/**
 * UTILS: Đảo ngược thứ tự các dòng trong bảng chi tiết
 * Tác dụng: Hữu ích khi người dùng nhập liệu theo thứ tự ngược hoặc copy từ Excel
 */
function reverseDetailsRows() {
    // 1. Lấy phần thân bảng (Sử dụng getE helper nếu có, hoặc getElementById)
    const tbody = document.getElementById('detail-tbody');
    
    if (!tbody || tbody.rows.length < 2) {
        // Nếu bảng không có hoặc chỉ có 0-1 dòng thì không cần đảo
        return; 
    }

    // 2. Chuyển đổi HTMLCollection sang Array để dùng hàm reverse()
    const rows = Array.from(tbody.rows);
    
    // 3. Đảo ngược mảng
    rows.reverse();

    // 4. Gắn lại vào tbody (Việc appendChild node đã tồn tại sẽ tự động move nó)
    rows.forEach(row => {
        tbody.appendChild(row);
    });

    // 5. QUAN TRỌNG: Đánh lại số thứ tự (STT) cột đầu tiên
    _reindexTableRows(tbody);
    
    // (Optional) Hiệu ứng nháy màu để báo hiệu đã đảo xong
    tbody.classList.add('flash-effect'); 
    setTimeout(() => tbody.classList.remove('flash-effect'), 500);
}

/**
 * HELPER INTERNAL: Đánh lại số thứ tự cho bảng
 * Giả định: Cột STT luôn nằm ở ô đầu tiên (cells[0])
 * Cập nhật: Icon fa-times cuối hàng với giá trị idx mới
 */
function _reindexTableRows(tbodyObj) {
    const rows = tbodyObj.rows;
    for (let i = 0; i < rows.length; i++) {
        // 1. Cập nhật ID của thẻ tr
        rows[i].id = `row-${i + 1}`;
        
        // 2. Cập nhật ô STT (thường là td đầu tiên)
        const firstCell = rows[i].cells[0];
        if(firstCell) firstCell.innerText = (i + 1);
        
        // 3. Cập nhật tham số removeRow(idx) cho icon fa-times ở cuối hàng
        const deleteIcon = rows[i].querySelector('i.fa-times');
        if(deleteIcon) {
            // Cập nhật onclick attribute với giá trị idx mới
            deleteIcon.setAttribute('onclick', `removeRow(${i})`);
        }
        
        // Nếu STT nằm trong input (trường hợp input hidden lưu order)
        // const inputOrder = rows[i].querySelector('.input-order');
        // if(inputOrder) inputOrder.value = i + 1;
    }
}

// Hàm xóa Local Cache
function clearLocalCache() {
    const confirm_clear = confirm('Bạn có chắc chắn muốn xóa Local Cache?\n\nTẤT CẢ dữ liệu trong localStorage sẽ bị xóa vĩnh viễn.');
    if (!confirm_clear) return;

    try {
        // Xóa tất cả dữ liệu localStorage
        localStorage.clear();

        log('✅ Local Cache đã được xóa thành công');
        logA('✅ Tất cả dữ liệu Local Cache đã được xóa!\n\nVui lòng reload trang để áp dụng thay đổi.');
        
        // Optional: Tự động reload trang
        // setTimeout(() => location.reload(), 1000);
    } catch (error) {
        console.error('❌ Lỗi khi xóa Local Cache:', error);
        logA('❌ Có lỗi xảy ra khi xóa Local Cache', 'error');
    }
}  


