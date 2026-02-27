



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
        const fieldNames = A.DB.schema.getFieldNames(collectionName);

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
        const fieldNames = A.DB.schema.getFieldNames(collectionName);

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
    let detailsSource = role === 'op' ? 'operator_entries' : 'booking_details';
    let detailsSourceData = detailsSource + "_by_booking";


    // ✅ Guard: đảm bảo các sub-collection đã được load
    const bookingsMap = APP_DATA.bookings || {};
    const detailsMap = APP_DATA[detailsSource] || {};
    const detailsByBkMap = APP_DATA[detailsSourceData] || {};

    // ✅ Prefer object format if available
    let bookingData = bookingsMap[bkId];
    let detailsData = detailsByBkMap[bkId] ? Object.values(detailsByBkMap[bkId]) : [];

    // ✅ Nếu không tìm thấy booking, coi bkId là ID của bảng detailsSource/detailsSourceObj
    // -> tìm detail row theo id -> lấy booking_id -> tìm lại booking
    if (!bookingData) {
        const detailHit = detailsMap[bkId];
        const bkIdFromDetail = detailHit ? (detailHit.booking_id || detailHit[1]) : null;
        bookingData = bkIdFromDetail ? bookingsMap[bkIdFromDetail] : null;
        detailsData = (bkIdFromDetail && detailsByBkMap[bkIdFromDetail])
            ? Object.values(detailsByBkMap[bkIdFromDetail])
            : [];
        log("⚠️ Không tìm thấy booking trực tiếp, thử tìm qua details với id: " + bkIdFromDetail);
    }

    if (!bookingData) return null;

    // Xử lý số điện thoại
    let phoneRaw;
    if (typeof bookingData === 'object' && !Array.isArray(bookingData)) {
        phoneRaw = bookingData.customer_phone;
    } else {
        phoneRaw = bookingData[3];
    }
    const phone = phoneRaw ? String(phoneRaw).replace(/^'/, "").trim() : "";

    let custRow = null;

    // 4. Tìm thông tin Customer
    if (phone !== "" && window.APP_DATA) {
        const customersData = Object.values(APP_DATA.customers ?? {});

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
        bookings: bookingData,
        [detailsSource]: detailsData,
        customer: custRow,
        source: 'local'
    };
}

/**
 * Helper: Lấy tất cả giá trị từ một hàng (dùng cho full-table search)
 * @param {Object|Array} row - Dòng dữ liệu
 * @returns {string} - Chuỗi chứa tất cả giá trị, cách nhau bởi khoảng trắng
 */
function getAllCellValues(row) {
    if (typeof row === 'object' && !Array.isArray(row)) {
        // Object format: lấy tất cả values
        return Object.values(row)
            .map(v => String(v ?? ''))
            .join(' ')
            .toLowerCase();
    } else if (Array.isArray(row)) {
        // Array format: lấy tất cả values
        return row
            .map(v => String(v ?? ''))
            .join(' ')
            .toLowerCase();
    }
    return String(row ?? '').toLowerCase();
}

/**
 * Áp dụng bộ lọc cho bảng hiện tại.
 *
 * Luồng xử lý:
 *   1. Đọc giá trị từ filter-val, filter-col, filter-from, filter-to.
 *   2. Mỗi tiêu chí chỉ bỏ qua khi field ĐÓ rỗng (không phải tất cả):
 *      - filter-val rỗng  → bỏ qua lọc keyword.
 *      - filter-from / filter-to thiếu một trong hai → bỏ qua lọc ngày.
 *      - Nếu CẢ BA đều rỗng → gọi resetGridData() (về dữ liệu gốc).
 *   3. Đọc dữ liệu nguồn FRESH từ APP_DATA (KHÔNG dùng PG_DATA) → luôn lọc
 *      trên toàn bộ tập gốc, không bị ảnh hưởng bởi sort trước đó.
 *   4. Lưu kết quả vào PG_DATA, đặt FILTER_ACTIVE = true.
 *   5. Dispatch render qua _renderFromPGData().
*/
function applyGridFilter() {
    try {
        const colSelect = document.getElementById('filter-col');
        const valInput = document.getElementById('filter-val');
        const fromInput = document.getElementById('filter-from');
        const toInput = document.getElementById('filter-to');

        const rawCol = colSelect ? colSelect.value.trim() : '';
        const rawKeyword = valInput ? valInput.value : '';
        const rawFrom = fromInput ? fromInput.value.trim() : '';
        const rawTo = toInput ? toInput.value.trim() : '';

        // Tất cả đều rỗng → reset về dữ liệu gốc
        if (!rawKeyword && !rawFrom && !rawTo) {
            resetGridData();
            return;
        }

        // Read FRESH flat data from APP_DATA (NEVER from PG_DATA)
        const sourceData = (typeof getAppDataFlat === 'function')
            ? getAppDataFlat(CURRENT_TABLE_KEY)
            : Object.values(APP_DATA[CURRENT_TABLE_KEY] ?? {});

        if (!sourceData.length) { log('Không có dữ liệu để lọc', 'warning'); return; }

        const searchKey = rawKeyword.trim().toLowerCase();
        const resolveCC = (raw) => GRID_COLS?.find(c => String(c?.i) === String(raw) || String(c?.key) === String(raw)) || null;
        const colConfig = resolveCC(rawCol);
        const colFieldKey = colConfig?.key || rawCol || '';

        // --- DATE CONFIG ---
        const definedDateCol = TABLE_DATE_CONFIG[CURRENT_TABLE_KEY];
        let DATE_FIELD_KEY = definedDateCol ?? null;
        if (DATE_FIELD_KEY === null || typeof DATE_FIELD_KEY === 'number') {
            const dateCol = (GRID_COLS || []).find(c => c?.fmt === 'date' && !c.hidden)
                || (GRID_COLS || []).find(c => c?.fmt === 'date');
            if (dateCol) DATE_FIELD_KEY = dateCol.key || dateCol.i || DATE_FIELD_KEY;
        }

        let dStart = null, dEnd = null, isCheckDate = false;
        if (DATE_FIELD_KEY !== null && rawFrom && rawTo) {
            isCheckDate = true;
            dStart = new Date(rawFrom); dStart.setHours(0, 0, 0, 0);
            dEnd = new Date(rawTo); dEnd.setHours(23, 59, 59, 999);
        }

        // --- FILTER CORE ---
        const filtered = sourceData.filter(row => {
            let matchKeyword = true;
            if (searchKey) {
                if (!rawCol || rawCol === '') {
                    matchKeyword = getAllCellValues(row).includes(searchKey);
                } else {
                    const cc = resolveCC(rawCol);
                    const field = cc?.key || cc?.i || rawCol;
                    matchKeyword = String(row?.[field] ?? '').toLowerCase().includes(searchKey);
                }
            }

            let matchDate = true;
            if (isCheckDate) {
                const cellDateRaw = row?.[DATE_FIELD_KEY];
                if (cellDateRaw) {
                    const rowDate = new Date(cellDateRaw);
                    matchDate = !isNaN(rowDate) && rowDate >= dStart && rowDate <= dEnd;
                } else { matchDate = false; }
            }

            return matchKeyword && matchDate;
        });

        log(`Đã lọc [${CURRENT_TABLE_KEY}]: ${filtered.length} kết quả`, 'success');

        // Update PG_DATA with filtered result → sorter and renderer will use this
        window.PG_DATA = filtered;
        window.FILTER_ACTIVE = true;
        LAST_FILTER_SIGNATURE = JSON.stringify({ t: CURRENT_TABLE_KEY, c: rawCol, k: rawKeyword, f: rawFrom, to: rawTo });

        _renderFromPGData();
        if (typeof calculateSummary === 'function') calculateSummary(filtered);

    } catch (err) {
        log('Lỗi applyGridFilter: ' + err.message, 'error');
    }
}

/**
 * =========================================================================
 * THROTTLE WRAPPER - Giới hạn chạy filter 1 lần/giây
 * =========================================================================
 */

// Throttle state
window.FILTER_THROTTLE_STATE = window.FILTER_THROTTLE_STATE || {
    lastTime: 0,
    THROTTLE_MS: 1000 // 1 giây
};

/**
 * Wrapper với Throttle - gọi từ event listener filter-val input
 * Giới hạn applyGridFilter chạy tối đa 1 lần mỗi giây
 */
function applyGridFilterThrottled() {
    const now = Date.now();
    const state = window.FILTER_THROTTLE_STATE;

    if (now - state.lastTime >= state.THROTTLE_MS) {
        state.lastTime = now;
        applyGridFilter();
    }
}

// =========================================================================
// HELPERS: RENDER DISPATCH & GRID RESET
// =========================================================================

/**
 * Internal dispatcher: render from PG_DATA to the correct table type.
 * Secondary index → renderSecondaryIndexFromFlat (grouped).
 * Normal collection → initPagination (flat paginated).
 *
 * @param {string} [tblId] - Optional container element ID (default: 'tbl-container-tab2')
 */
function _renderFromPGData(tblId) {
    const isSecondary = A.DB?.schema?.[CURRENT_TABLE_KEY]?.isSecondaryIndex === true;
    if (isSecondary) {
        if (typeof renderSecondaryIndexFromFlat === 'function') {
            renderSecondaryIndexFromFlat(CURRENT_TABLE_KEY, window.PG_DATA, tblId);
        }
    } else {
        const table = tblId
            ? document.getElementById(tblId)
            : document.getElementById('tbl-container-tab2');
        if (typeof initPagination === 'function') {
            initPagination(window.PG_DATA, table);
        }
    }
}

/**
 * Reset PG_DATA to the full APP_DATA snapshot and re-render the table.
 * Called when: filter input is cleared, or filter button is clicked a second time.
 */
function resetGridData() {
    const freshData = (typeof getAppDataFlat === 'function')
        ? getAppDataFlat(CURRENT_TABLE_KEY)
        : Object.values(APP_DATA[CURRENT_TABLE_KEY] ?? {});

    window.PG_DATA = freshData;
    window.FILTER_ACTIVE = false;
    LAST_FILTER_SIGNATURE = null;
    SORT_STATE.col = -1;
    SORT_STATE.dir = 'asc';

    // Clear filter input
    const valInput = document.getElementById('filter-val');
    if (valInput) valInput.value = '';

    _renderFromPGData();
    if (typeof calculateSummary === 'function') calculateSummary(freshData);
    log('Đã reset bộ lọc về dữ liệu gốc', 'info');
}

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
/**
 * Sắp xếp bảng theo cột được chọn trong filter-col.
 *
 * Luồng xử lý:
 *   1. Đọc ONLY từ PG_DATA (không đụng APP_DATA).
 *   2. Xác định chiều sort:
 *      - Cùng cột với lần trước → toggle asc/desc đơn giản.
 *      - Cột mới → đối chiếu với dữ liệu thực tế trong PG_DATA:
 *          Nếu đang được sắp theo asc  → áp dụng desc.
 *          Nếu đang được sắp theo desc → áp dụng asc.
 *          Chưa sorted / ngẫu nhiên    → mặc định desc.
 *   3. Sort PG_DATA, ghi lại PG_DATA.
 *   4. Dispatch render qua _renderFromPGData().
 */
function applyGridSorter() {
    const selectEl = document.getElementById('filter-col');
    if (!selectEl) return;
    const rawCol = String(selectEl.value ?? '').trim();
    if (!rawCol) return;

    const resolveColConfig = (raw) => GRID_COLS?.find(c => String(c?.i) === raw || String(c?.key) === raw) || null;
    const colConfig = resolveColConfig(rawCol);
    const fieldName = colConfig?.key || colConfig?.i || rawCol;
    const format = colConfig?.fmt ?? 'text';

    // Work ONLY on PG_DATA — no fallback to APP_DATA
    const source = (window.PG_DATA || []).filter(r => r?.id != null);

    if (!source.length) {
        log('Không sort được: PG_DATA trống', 'warning');
        return;
    }

    // ── Xác định chiều sort ───────────────────────────────────────────────
    let nextDir;

    if (SORT_STATE.col === rawCol) {
        // Cùng cột: toggle đơn giản
        nextDir = (SORT_STATE.dir === 'asc') ? 'desc' : 'asc';
    } else {
        // Cột mới: đối chiếu với dữ liệu thực tế để không bị nhảy ngược chiều
        const toNum = v => (typeof getNum === 'function') ? getNum(v) : (Number(String(v).replace(/[^0-9.-]+/g, '')) || 0);

        // Lấy mẫu tối đa 8 phần tử ở giữa mảng để giảm bias đầu/cuối
        const sampleSize = Math.min(8, source.length);
        const step = Math.max(1, Math.floor(source.length / sampleSize));
        const sample = [];
        for (let i = 0; i < source.length && sample.length < sampleSize; i += step) {
            sample.push(source[i]);
        }

        // So sánh cặp liên tiếp → đếm cặp tăng dần vs giảm dần
        let cntAsc = 0, cntDesc = 0;
        for (let i = 0; i < sample.length - 1; i++) {
            let va = sample[i]?.[fieldName] ?? '';
            let vb = sample[i + 1]?.[fieldName] ?? '';
            let cmp;
            if (format === 'date') {
                cmp = parseDateVal(va) - parseDateVal(vb);
            } else if (format === 'money' || format === 'number') {
                cmp = toNum(va) - toNum(vb);
            } else {
                cmp = String(va).toLowerCase().localeCompare(String(vb).toLowerCase(), 'vi');
            }
            if (cmp < 0) cntAsc++;
            else if (cmp > 0) cntDesc++;
        }

        // Phát hiện chiều hiện tại → áp dụng chiều ngược lại
        // Nếu không rõ ràng (ngẫu nhiên) → mặc định desc
        if (cntAsc > cntDesc) {
            nextDir = 'desc';  // đang asc → toggle sang desc
        } else if (cntDesc > cntAsc) {
            nextDir = 'asc';   // đang desc → toggle sang asc
        } else {
            nextDir = 'desc';  // ngẫu nhiên → mặc định desc (mới nhất/lớn nhất trước)
        }

        SORT_STATE.col = rawCol;
    }

    SORT_STATE.dir = nextDir;
    const modifier = nextDir === 'asc' ? 1 : -1;

    source.sort((a, b) => {
        const va = a?.[fieldName] ?? '';
        const vb = b?.[fieldName] ?? '';
        let result = 0;
        if (format === 'date') {
            result = parseDateVal(va) - parseDateVal(vb);
        } else if (format === 'money' || format === 'number') {
            const toNum = v => (typeof getNum === 'function') ? getNum(v) : (Number(String(v).replace(/[^0-9.-]+/g, '')) || 0);
            result = toNum(va) - toNum(vb);
        } else {
            result = String(va).toLowerCase().localeCompare(String(vb).toLowerCase(), 'vi');
        }
        return result * modifier;
    });

    // Write sorted result back to PG_DATA
    window.PG_DATA = source;

    // Dispatch render
    _renderFromPGData();

    log(`Đã sort cột [${rawCol}] - ${SORT_STATE.dir}`, 'success');
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
 * Xử lý khi người dùng chọn bảng từ select box.
 * Uỷ toàn bộ xử lý (PG_DATA, GRID_COLS, render) cho renderTableByKey.
 *
 * @param {string} key - Collection key hoặc secondary index key
 */
function handleTableChange(key) {
    log('Người dùng đã chọn bảng: ' + key);
    if (typeof renderTableByKey === 'function') {
        renderTableByKey(key);
    } else {
        log('Không tìm thấy hàm renderTableByKey', 'error');
    }
}

/**
 * HÀM TÍNH TOÁN THỐNG KÊ (Sử dụng Index cố định)
 * @param {Array} dataRows - Dữ liệu các dòng cần tính
 */
calculateSummary = function (dataRows) {
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
    const elQty = getE('stat-qty');
    const elAvg = getE('stat-avg');
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
    const dateStr = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getFullYear()).slice(2)}`;
    let fileName = `${viewText}_${dateStr}`;

    // Clone dữ liệu gốc để xử lý
    let dataToProcess = [...PG_STATE.data];

    // 3. LOGIC LỌC VAT (INLINE)
    if (['bookings', 'booking_details', 'operator_entries'].includes(viewType)) {
        if (confirm(`Bạn có muốn lọc danh sách xuất Hóa Đơn (VAT, CK CT...) cho bảng [${viewText}] không?`)) {

            if (typeof showNotify === 'function') showNotify("Đang lọc và xử lý dữ liệu...", true);
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
                const bookingsrc = (typeof APP_DATA !== 'undefined') ? Object.values(APP_DATA.bookings) : [];

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
                    console.warn("Cảnh báo: Không tìm thấy Object.values(APP_DATA.bookings) để đối chiếu VAT");
                }
            }

            if (dataToProcess.length === 0) {
                if (typeof showNotify === 'function') showNotify("Không tìm thấy dữ liệu VAT phù hợp!", false);
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
                    } catch (e) { }
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
            const wscols = Object.keys(exportData[0] || {}).map(() => ({ wch: 15 }));
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
        if (typeof showNotify === 'function') showNotify("Đã xuất file thành công!", true);
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
    // dataList là mảng các dòng (Array) lấy từ Object.values(APP_DATA.booking_details)
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
        if (firstCell) firstCell.innerText = (i + 1);

        // 3. Cập nhật tham số removeRow(idx) cho icon fa-times ở cuối hàng
        const deleteIcon = rows[i].querySelector('i.fa-times');
        if (deleteIcon) {
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
        A.DB.stopNotificationsListener(); // Hủy tất cả subscription trước khi reload
        // Optional: Tự động reload trang
        setTimeout(() => location.reload(), 1000);
    } catch (error) {
        console.error('❌ Lỗi khi xóa Local Cache:', error);
        logA('❌ Có lỗi xảy ra khi xóa Local Cache', 'error');
    }
}


