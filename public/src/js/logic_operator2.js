// =========================================================================
// LOGIC_OPERATOR.JS - REFACTORED (CLEAN ARCHITECTURE)
// Sử dụng 100% data-field, loại bỏ mảng (Array), dùng chuẩn Object DB
// Tích hợp Global Helpers: getVal, setVal, getE, $, HD pipeline.
// =========================================================================

let detailRowCount = 0;

// =========================================================================
// 1. INIT & LOAD DATA TO UI
// =========================================================================

/**
 * Tải dữ liệu Booking và Operator Entries lên UI
 * @param {Object} bkData - Object Booking
 * @param {Object|Array} detailsData - Dữ liệu chi tiết (Object key=ID hoặc Array)
 */
window.loadBookingToUI = function (bkData, detailsData) {
  if (!bkData) return;

  if (window.StateProxy) {
    StateProxy.clearSession();
    StateProxy.suppressAutoBinding();
  }

  try {
    L._('Loading Booking...:', bkData.id);

    // 1. Tự động lấy Nguồn Khách qua HD.find siêu nhanh
    let custSource = '';
    const phoneStr = String(bkData.customer_phone || '')
      .replace(/^'/, '')
      .trim();
    if (phoneStr && window.APP_DATA?.customers) {
      const custRow = HD.find(APP_DATA.customers, phoneStr, 'phone');
      if (custRow) custSource = custRow.source || '';
    }

    if (!getE('main-form')) activateTab('tab-form');

    // 2. Đổ dữ liệu vào Booking Header (Gắn cứng ID do layout cũ)
    const headerMap = {
      BK_ID: bkData.id,
      BK_Date: bkData.created_at,
      Cust_Phone: bkData.customer_phone,
      Cust_Name: bkData.customer_full_name,
      Cust_Source: custSource,
      BK_Start: bkData.start_date,
      BK_End: bkData.end_date,
      BK_Adult: bkData.adults,
      BK_Child: bkData.children,
      BK_Total: bkData.total_amount,
      BK_Status: bkData.status,
      BK_PayType: bkData.payment_method,
      BK_PayDue: bkData.payment_due_date,
      BK_Note: bkData.note,
      BK_Staff: bkData.staff_id,
    };
    Object.entries(headerMap).forEach(([elId, val]) => setVal(elId, val));

    // 3. Xử lý Bảng Chi tiết Dịch Vụ
    const tbody = getE('detail-tbody');
    if (tbody) {
      tbody.innerHTML = '';
      tbody.style.display = 'none'; // Tối ưu render DOM
    }

    detailRowCount = 0;

    // Sort bằng custom logic (vì priority của Enum loại DV phức tạp)
    const sortedDetails = _sortDetailsData(detailsData);
    sortedDetails.forEach((row) => addDetailRow(row));

    if (tbody) tbody.style.display = 'table-row-group';
    calcGrandTotal();

    // 4. Chuyển Tab
    const tabTrigger = $('#mainTabs button[data-bs-target="#tab-form"]');
    if (tabTrigger) bootstrap.Tab.getOrCreateInstance(tabTrigger).show();
  } catch (e) {
    L._('ERROR in loadBookingToUI: ' + e.message, 'error');
  } finally {
    if (window.StateProxy) StateProxy.resumeAutoBinding();
  }
};

/**
 * [HELPER NỘI BỘ] Sắp xếp dịch vụ theo độ ưu tiên
 */
function _sortDetailsData(detailsData) {
  const items = Array.isArray(detailsData) ? detailsData : Object.values(detailsData || {});
  if (!items.length) return [];

  const typeOrder = ['Vé MB', 'Vé Tàu', 'Phòng', 'Xe'];
  return items.sort((a, b) => {
    const pA = typeOrder.indexOf(a.service_type);
    const pB = typeOrder.indexOf(b.service_type);
    const priorityA = pA >= 0 ? pA : 99;
    const priorityB = pB >= 0 ? pB : 99;

    if (priorityA !== priorityB) return priorityA - priorityB;

    // Nếu cùng priority -> Xếp theo ngày check_in
    const dA = new Date(a.check_in || 0).getTime();
    const dB = new Date(b.check_in || 0).getTime();
    return dA - dB;
  });
}

window.fillFormFromSearch = function (res) {
  if (!res?.success) return (showLoading(false), logA(res?.message || 'Không tìm thấy dữ liệu!', 'warning'));
  loadBookingToUI(res.bookings, res.operator_entries);
  showLoading(false);
};

/**
 * Tìm kiếm khách hàng theo SĐT hoặc Tên
 */
function findCustByPhone() {
  const phoneVal = getVal('Cust_Phone');
  const nameVal = getVal('Cust_Name');

  if (phoneVal.length < 3 && nameVal.length < 3) {
    return logA('⚠️ Vui lòng nhập ít nhất 3 ký tự (SĐT hoặc Tên)', 'warning');
  }

  const customers = window.APP_DATA?.customers || {};
  let found = null;

  // 1. Ưu tiên tìm theo SĐT trước (Dùng HD.filter includes)
  if (phoneVal.length >= 3) {
    const matched = HD.filter(customers, phoneVal, 'includes', 'phone');
    // Lấy object khách hàng đầu tiên trong danh sách kết quả
    found = Object.values(matched)[0];
  }

  // 2. Nếu SĐT không có, tìm tiếp theo Tên
  if (!found && nameVal.length >= 3) {
    const matched = HD.filter(customers, nameVal, 'includes', 'full_name');
    found = Object.values(matched)[0];
  }

  // 3. Đổ ra UI
  if (found) {
    setVal('Cust_Phone', found.phone || '');
    setVal('Cust_Name', found.full_name || '');
    logA('✅ Đã tìm thấy khách hàng!', 'success');
  } else {
    logA('⚠️ Không tìm thấy khách hàng phù hợp trong hệ thống', 'warning');
  }
}
/**
 * Lọc dữ liệu Operator Entries theo nhóm và khoảng thời gian (Batch Edit)
 */
function handleAggClick(key, filterType) {
  L._(`📂 Mở Batch Edit: [${filterType}] ${key}`);

  // Chuyển ngày từ bộ lọc UI sang timestamp để so sánh nhanh
  const dFrom = new Date(getVal('dash-filter-from')).getTime();
  const dTo = new Date(getVal('dash-filter-to')).setHours(23, 59, 59, 999);

  const source = window.APP_DATA?.operator_entries || {};

  // Lọc kết hợp (Date range + Group Field) bằng JS chuẩn
  const batchData = Object.values(source).filter((row) => {
    if (!row) return false;

    // 1. Kiểm tra lọt khe Ngày (Check-in)
    const checkInTime = new Date(row.check_in || 0).getTime();
    if (checkInTime < dFrom || checkInTime > dTo) return false;

    // 2. Kiểm tra khớp Key (Xử lý fallback logic cũ)
    if (filterType === 'supplier') {
      const supplier = row.supplier || '(Chưa có NCC)';
      return String(supplier) === String(key);
    } else if (filterType === 'type') {
      const type = row.service_type || 'Other';
      return String(type) === String(key);
    }
    return false;
  });

  if (!batchData.length) {
    return logA('Không có dữ liệu phù hợp trong khoảng thời gian này.', 'warning');
  }

  // Gọi Modal Edit hàng loạt
  if (typeof openBatchEdit === 'function') {
    openBatchEdit(batchData, key);
  }
}
// =========================================================================
// 2. DYNAMIC TABLE & CASCADE DROPDOWNS
// =========================================================================

/**
 * Thêm dòng dịch vụ điều hành (Đã fix lỗi Load Service Name)
 * @param {Object|null} data - Object Data dòng chi tiết
 */
function addDetailRow(data = null) {
  detailRowCount++;
  const idx = detailRowCount;
  const lists = window.APP_DATA?.lists || {};

  const optsType = (lists.types || []).map((x) => `<option value="${x}">${x}</option>`).join('');
  const optsSup = (lists.supplier || []).map((s) => `<option value="${s}">${s}</option>`).join('');

  const tr = document.createElement('tr');
  tr.id = `row-${idx}`;
  tr.className = 'align-middle';

  // HTML Template
  tr.innerHTML = `
    <td class="text-center text-muted small">${idx} <input type="hidden" data-field="id"></td>
    <td style="display: none;"><input type="text" data-field="booking_id" readonly tabindex="-1"></td>
    <td style="display: none;"><input type="text" data-field="customer_full_name" readonly tabindex="-1"></td>
    <td style="width:75px"><select class="form-select form-select-sm text-wrap" data-field="service_type" onchange="onTypeChange(${idx})"><option value="">-</option>${optsType}</select></td>
    <td><select class="form-select form-select-sm text-wrap" data-field="hotel_name" onchange="onLocationChange(${idx})"><option value="">-</option></select></td>    
    <td><select class="form-select form-select-sm" data-field="service_name"><option value="">-</option></select></td>
    <td><input type="date" class="form-control form-control-sm p-1" data-field="check_in" onchange="autoSetOrCalcDate(this.value, $('[data-field=\\'check_out\\']', $('#row-${idx}')))"></td>
    <td><input type="date" class="form-control form-control-sm p-1" data-field="check_out" onchange="calcRow(${idx})"></td>
    <td><input type="number" class="form-control form-control-sm bg-light text-center number-only" data-field="nights" readonly value="1"></td>
    <td><input type="number" class="form-control form-control-sm text-center fw-bold number-only" data-field="adults" value="1" onchange="calcRow(${idx})"></td>
    <td><input type="text" class="form-control form-control-sm fw-bold text-end bg-warning bg-opacity-10 number-only" data-field="cost_adult" onchange="calcRow(${idx})" placeholder="0"></td>
    <td><input type="number" class="form-control form-control-sm text-center number-only" data-field="children" value="0" onchange="calcRow(${idx})"></td>
    <td><input type="text" class="form-control form-control-sm text-end bg-warning bg-opacity-10 number-only" data-field="cost_child" onchange="calcRow(${idx})" placeholder="0"></td>
    <td><input type="text" class="form-control form-control-sm text-end small text-muted number-only" data-field="surcharge" onchange="calcRow(${idx})" placeholder="0"></td>
    <td><input type="text" class="form-control form-control-sm text-end small text-muted number-only" data-field="discount" onchange="calcRow(${idx})" placeholder="0"></td>
    <td><input type="text" class="form-control form-control-sm number fw-bold text-end text-primary bg-light" data-field="total_sale" readonly value="0"></td>
    <td><input type="text" class="form-control form-control-sm text-center text-primary font-monospace" data-field="ref_code"></td>
    <td><input type="text" class="form-control form-control-sm number-only fw-bold text-end text-danger bg-danger bg-opacity-10" data-field="total_cost" readonly value="0"></td>
    <td><input type="text" class="form-control form-control-sm number-only text-end text-success fw-bold" data-field="paid_amount" onchange="calcRow(${idx}); typeof syncTransactionForPaidAmount === 'function' && syncTransactionForPaidAmount(${idx})" placeholder="0"></td>
    <td><input type="text" class="form-control form-control-sm number-only text-end text-danger small bg-light" data-field="debt_balance" readonly value="0"></td>
    <td><select class="form-select form-select-sm" data-field="supplier" onchange="onSupplierChange(${idx})" style="width:130px;"><option value="">-Supplier-</option>${optsSup}</select></td>
    <td><input type="text" class="form-control form-control-sm" data-field="operator_note"></td>
    <td class="text-center align-middle"><i class="fa-solid fa-times text-danger" style="cursor:pointer" onclick="removeRow(${idx})"></i></td>
  `;

  getE('detail-tbody').appendChild(tr);

  // Nạp danh sách Khách sạn (Location) vào dropdown
  updateLocationList(idx);

  // 👉 QUY TRÌNH MAPPING DATA TỐI ƯU
  if (data) {
    // BƯỚC 1: Đổ giá trị cha (Type & Location) trước để kích hoạt List Service Name
    if (data.service_type !== undefined) setVal($('[data-field="service_type"]', tr), data.service_type);
    if (data.hotel_name !== undefined) setVal($('[data-field="hotel_name"]', tr), data.hotel_name);

    // BƯỚC 2: Render các thẻ <option> cho ô Service Name dựa trên Type & Location vừa đổ
    updateServiceNameList(idx);

    // BƯỚC 3: Mới bắt đầu loop để đổ toàn bộ dữ liệu (lúc này field service_name đã nhận value an toàn)
    tr.querySelectorAll('[data-field]').forEach((input) => {
      const fName = input.getAttribute('data-field');
      if (data[fName] !== undefined) setVal(input, data[fName]);
    });

    // BƯỚC 4: Trigger tính toán
    calcRow(idx);
  } else {
    // Dòng mới: Gắn cứng mã Booking
    setVal($('[data-field="booking_id"]', tr), getVal('BK_ID'));
    setVal($('[data-field="customer_full_name"]', tr), getVal('Cust_Name'));
  }
}

function removeRow(idx) {
  const row = getE(`row-${idx}`);
  if (row) row.remove();
  calcGrandTotal();
}

// =========================================================================
// 3. CALCULATION & DATA EXTRACTION
// =========================================================================

/**
 * Tính toán 1 dòng: Sử dụng getVal tự động ép kiểu sạch sẽ
 */
function calcRow(idx) {
  const tr = getE(`row-${idx}`);
  if (!tr) return;

  const type = getVal($('[data-field="service_type"]', tr));
  const dIn = getVal($('[data-field="check_in"]', tr));
  const dOut = getVal($('[data-field="check_out"]', tr));

  // Tính số đêm
  let night = 1;
  if (dIn && dOut) {
    const diffDays = (new Date(dOut) - new Date(dIn)) / 86400000;
    night = type === 'Phòng' && diffDays > 0 ? diffDays : 1;
  }
  setVal($('[data-field="nights"]', tr), night);

  // Lấy các tham số (getVal đã ép số an toàn)
  const gV = (field) => Number(getVal($(`[data-field="${field}"]`, tr))) || 0;

  const multiplier = type === 'Phòng' ? night : 1;
  const totalCost = (gV('adults') * gV('cost_adult') + gV('children') * gV('cost_child') + gV('surcharge') - gV('discount')) * multiplier;

  setVal($('[data-field="total_cost"]', tr), totalCost);

  // Tính công nợ
  const remain = totalCost - gV('paid_amount');
  setVal($('[data-field="debt_balance"]', tr), remain);
  tr.style.backgroundColor = remain === 0 ? '#f0fdf4' : ''; // Xanh nhạt nếu thanh toán đủ

  calcGrandTotal();
}

/**
 * Tính tổng toàn cục và Thống kê nâng cao
 */
function calcGrandTotal() {
  const data = window.getBkFormData();
  if (!data) return;

  const entries = data.operator_entries;

  // 1. Dùng HD.agg tính tổng doanh thu/chi phí
  const totalSales = HD.agg(entries, 'total_sale');
  const totalCost = HD.agg(entries, 'total_cost');

  // 2. TÍNH TOÁN THỐNG KÊ (BỔ SUNG THEO YÊU CẦU)
  let transportTotal = 0,
    transportA = 0,
    landChildTotal = 0;

  entries.forEach((row) => {
    const type = row.service_type;
    if (type === 'Vé MB' || type === 'Vé Tàu') {
      transportTotal += row.total_sale || 0;
      transportA += (row.adults || 0) * (row.cost_adult || 0);
    } else {
      const multiplier = type === 'Phòng' ? Math.max(1, row.nights || 1) : 1;
      landChildTotal += (row.children || 0) * (row.cost_child || 0) * multiplier;
    }
  });

  // Gọi UI Update Stats
  if (typeof updateStatsUI === 'function') {
    updateStatsUI(totalSales, transportTotal, transportA, landChildTotal);
  }

  // 3. Update UI tổng quát
  setVal('BK_Total', totalSales);
  setVal('BK_TotalCost', totalCost);

  const profit = totalSales - totalCost;
  const elBal = getE('BK_Balance');
  if (elBal) {
    setVal(elBal, profit);
    elBal.className = `form-control form-control-sm text-end fw-bold bg-light text-${profit >= 0 ? 'success' : 'danger'}`;
  }

  // 4. Update Status tự động
  const adultCount = Number(getVal('BK_Adult')) || 1;
  const curStatus = getVal('BK_Status');
  if (curStatus !== 'Hủy' && curStatus !== 'Xong BK') {
    let newStatus = 'Lỗ';
    if (profit === 0) newStatus = 'Hòa';
    else if (profit / adultCount <= 500) newStatus = 'Lời';
    else if (profit > 0) newStatus = 'LỜI TO';
    setVal('BK_Status', newStatus);
  }
}

function updateStatsUI(grandTotal, transportTotal, transportA, landChildTotal) {
  const countAdult = Number(document.getElementById('BK_Adult').value) || 1;
  const countChild = Number(document.getElementById('BK_Child').value) || 0;

  const landTotal = grandTotal - transportTotal;
  const landAdultTotal = landTotal - landChildTotal;

  const avgAdult = countAdult > 0 ? landAdultTotal / countAdult : 0;
  const avgChild = countChild > 0 ? landChildTotal / countChild : 0;

  if (document.getElementById('Stats_AvgAdult')) {
    document.getElementById('Stats_AvgAdult').innerText = formatNumber(Math.round(avgAdult));
  }
  if (document.getElementById('Stats_AvgChild')) {
    document.getElementById('Stats_AvgChild').innerText = formatNumber(Math.round(avgChild));
  }
}

function autoSetOrCalcDate(start, endEl) {
  if (!start) return;
  if (endEl) {
    setVal(endEl, start);
  } else {
    // Nếu truyền chuỗi (logic cũ)
    const endDate = new Date(endEl);
    if (!isNaN(endDate)) return Math.ceil((endDate - new Date(start)) / 86400000);
  }
}

// =========================================================================
// 4. BATCH SAVING & SYNC
// =========================================================================
/**
 * Tự động trích xuất toàn bộ Form -> Object cực sạch
 * Tạm biệt việc map tay 40 fields như trước!
 */
window.getBkFormData = function () {
  try {
    // 1. Trích xuất Booking Header (Map các id DOM với schema DB)
    const bookings = {
      id: getVal('BK_ID'),
      customer_id: getVal('Cust_Id') || '',
      customer_full_name: getVal('Cust_Name'),
      customer_phone: getVal('Cust_Phone'),
      created_at: getVal('BK_Date'),
      start_date: getVal('BK_Start'),
      end_date: getVal('BK_End'),
      adults: getVal('BK_Adult'),
      children: getVal('BK_Child'),
      total_amount: getVal('BK_Total'),
      deposit_amount: getVal('BK_TotalCost'),
      balance_amount: getVal('BK_Balance'),
      payment_method: getVal('BK_PayType'),
      payment_due_date: getVal('BK_PayDue'),
      note: getVal('BK_Note'),
      staff_id: getVal('BK_Staff'),
      status: getVal('BK_Status'),
    };

    const customer = {
      full_name: getVal('Cust_Name'),
      phone: getVal('Cust_Phone'),
      source: getVal('Cust_Source'),
    };

    // 2. Trích xuất Details bằng vòng lặp data-field
    const operator_entries = [];
    document.querySelectorAll('#detail-tbody tr').forEach((tr) => {
      // Chỉ lấy dòng có tên dịch vụ
      if (!getVal($('[data-field="service_name"]', tr))) return;

      const entry = {};
      tr.querySelectorAll('[data-field]').forEach((input) => {
        const field = input.getAttribute('data-field');
        // Tự parse số cho các trường cấu hình tính toán
        const val = getVal(input);
        entry[field] = ['nights', 'adults', 'children', 'cost_adult', 'cost_child', 'surcharge', 'discount', 'total_sale', 'total_cost', 'paid_amount', 'debt_balance'].includes(field) ? Number(val) || 0 : val;
      });
      operator_entries.push(entry);
    });

    return { bookings, customer, operator_entries };
  } catch (e) {
    Opps('getBkFormData', e);
    return null;
  }
};

async function saveForm() {
  setBtnLoading('btn-save-form', true, 'Saving...');
  try {
    const data = getBkFormData();
    if (!data.operator_entries.length) return logA('Vui lòng nhập ít nhất 1 dòng dịch vụ!', 'warning');

    // Validation
    const invalidRow = data.operator_entries.findIndex((d) => !d.cost_adult && d.total_cost > 0);
    if (invalidRow >= 0) return logA(`Dòng thứ ${invalidRow + 1} có giá trị bất thường!`, 'warning');

    await A.DB.batchSave('operator_entries', data.operator_entries);
    if (window.StateProxy) StateProxy.commitSession();

    // Trigger update components khác
    if (getE('btn-dash-update')) A.Event.trigger(getE('btn-dash-update'), 'click');
    logA('Lưu dữ liệu Điều hành thành công!', 'success');
  } catch (e) {
    if (window.StateProxy) StateProxy.rollbackSession();
    Opps('Lỗi lưu dữ liệu: ' + e.message);
  } finally {
    setBtnLoading('btn-save-form', false);
  }
}

/**
 * 2. Gửi dữ liệu về Server (Full Row)
 */
async function saveBatchDetails() {
  L._('run saveBatchDetails');
  setBtnLoading('btn-save-batch', true);

  const data = await HD.getTableData('tbl-booking-form');

  logA('Đang lưu... Dòng 1: ' + data[0].values, 'info');

  const res = await A.DB.batchSave('operator_entries', data);
  setBtnLoading('btn-save-batch', false);
  if (res) {
    logA('Lưu dữ liệu thành công!');
  }
}

async function syncRow(sourceRow = null) {
  setBtnLoading('btn-sync-row', true);
  try {
    const rows = sourceRow ? [sourceRow] : document.querySelectorAll('#detail-tbody tr:not([style*="display: none"])');
    for (const tr of rows) {
      const sid = getVal($('[data-field="id"]', tr));
      if (!sid) continue;

      const bkDetail = await A.DB.db.collection('booking_details').doc(sid).get();
      if (bkDetail.exists) {
        await A.DB._syncOperatorEntry(bkDetail.data()); // Hàm Core trigger Sync
        const newSnap = await A.DB.db.collection('operator_entries').doc(sid).get();
        if (newSnap.exists) {
          const newData = newSnap.data();
          tr.querySelectorAll('[data-field]').forEach((input) => {
            if (newData[input.dataset.field] !== undefined) {
              setVal(input, newData[input.dataset.field]);
            }
          });
        }
      }
    }
    logA('Đồng bộ thành công!', 'success');
    calcGrandTotal();
  } catch (e) {
    Opps('syncRow', e);
  } finally {
    setBtnLoading('btn-sync-row', false);
  }
}
async function syncTransactionForPaidAmount(idx) {
  try {
    const tr = getE(`row-${idx}`);
    L._('bắt đầu sync');
    if (!tr) return;

    // 1. Phân tích dữ liệu từ UI
    const detailId = getVal('[data-field="id"]', tr);
    if (!detailId) {
      logA('⚠️ Cảnh báo: Dịch vụ này chưa được lưu. Vui lòng Bấm Lưu trước!', 'warning');
      setVal('[data-field="paid_amount"]', 0, tr);
      if (typeof calcRow === 'function') calcRow(idx);
      return;
    }

    const currentPaidAmount = getVal('[data-field="paid_amount"]', tr);
    const currentType = getVal('[data-field="service_type"]', tr);
    const supplier = getVal('[data-field="supplier"]', tr);

    // 2. Tính toán chênh lệch
    const allTransactions = HD.filter(APP_DATA?.transactions, detailId, '==', 'booking_id');
    const existingOutTxs = HD.filter(allTransactions, 'OUT', '==', 'type');
    const totalExistingPaid = HD.agg(existingOutTxs, 'amount');
    const diffAmount = currentPaidAmount * 1000 - totalExistingPaid;
    L._(`Gia tri thuc te: ${diffAmount} = ${currentPaidAmount} * 1000 - ${totalExistingPaid}`);

    if (diffAmount === 0) return;

    // 3. Popup chọn Tài khoản nguồn (Fund Account)
    const fundAccounts = window.APP_DATA?.fund_accounts || {};
    const accountOptions = {};
    Object.values(fundAccounts).forEach((acc) => {
      accountOptions[acc.id] = `${acc.name} (Số dư: ${formatNumber(acc.balance || 0)})`;
    });

    const { value: selectedFundId } = await Swal.fire({
      title: 'Chọn tài khoản thanh toán',
      input: 'select',
      inputOptions: accountOptions,
      inputPlaceholder: '--- Chọn nguồn tiền ---',
      showCancelButton: true,
      confirmButtonText: 'Xác nhận',
      inputValidator: (value) => !value && 'Bạn cần chọn một tài khoản!',
    });

    if (!selectedFundId) return;

    // 4. Thực thi Firestore Transaction (Đảm bảo an toàn Server-side)
    const newTxRef = A.DB.db.collection('transactions').doc();
    const fundRef = A.DB.db.collection('fund_accounts').doc(selectedFundId);

    const result = await A.DB.db.runTransaction(async (transaction) => {
      const fundDoc = await transaction.get(fundRef);
      if (!fundDoc.exists) throw new Error('Tài khoản không tồn tại trên hệ thống!');

      const currentBalance = fundDoc.data().balance || 0;
      const newBalance = currentBalance - diffAmount;

      const newTransaction = {
        id: newTxRef.id,
        booking_id: detailId,
        transaction_date: new Date().toISOString().split('T')[0],
        type: 'OUT',
        category: currentType || 'Khác',
        receiver: supplier || 'Không xác định',
        fund_source: selectedFundId,
        amount: diffAmount,
        updated_at: new Date().toISOString(),
        status: 'Completed',
        description: diffAmount > 0 ? `Chi tự động từ Điều hành: ${formatNumber(diffAmount)}` : `Điều chỉnh giảm chi: ${formatNumber(Math.abs(diffAmount))}`,
        created_by: window.currentUser?.email || 'System',
      };

      transaction.set(newTxRef, newTransaction);
      // transaction.update(fundRef, { balance: newBalance });

      return { newTransaction, newBalance };
    });

    // 5. Cập nhật Local State & IndexedDB qua hàm hệ thống
    if (result) {
      const { newTransaction, newBalance } = result;

      // Cập nhật Giao dịch mới
      A.DB._updateAppDataObj('transactions', newTransaction);

      // Cập nhật Số dư tài khoản mới
      const updatedFundAccount = {
        ...window.APP_DATA.fund_accounts[selectedFundId],
        balance: newBalance,
      };
      A.DB._updateAppDataObj('fund_accounts', updatedFundAccount);

      logA(`✅ Đã cập nhật dòng tiền. Số dư mới: ${formatNumber(newBalance)}`, 'success');

      if (A.NotificationManager) {
        A.NotificationManager.sendToAdmin('Thanh toán tự động', `Tài khoản ${fundAccounts[selectedFundId].name} vừa thay đổi ${formatNumber(diffAmount)}`);
      }
    }
  } catch (error) {
    Opps('❌ Lỗi xử lý tài chính: ' + error.message);
    console.error('[syncTransactionForPaidAmount] Error:', error);
  }
}

/**
 * Partner mail sending module
 */
const PartnerMailModule = (function () {
  async function open() {
    const newModal = await A.UI.renderModal('tmpl-partner-mail', 'Send Partner Proposal', send);
    const hotelEl = getE('pm-name');
    const hotelData = window.APP_DATA.lists?.hotelMatrix || [];

    if (hotelEl) {
      const hotelNames = hotelData.map((r) => r[0]);
      fillSelect(hotelEl, hotelNames, '--Select Hotel--');
    }

    newModal.show();

    setTimeout(() => {
      const inputName = getE('pm-name');
      if (inputName) inputName.focus();
    }, 500);
  }

  async function send() {
    const name = getVal('pm-name') || getVal('pm-name-text');
    const email = getVal('pm-email');
    const cc = getVal('pm-cc');
    const bcc = getVal('pm-bcc');

    const btnSend = getE('btn-save-modal');

    if (!name || !email) {
      return logA('Please enter name and email!', 'warning');
    }

    const originalText = btnSend.innerHTML;
    btnSend.disabled = true;
    btnSend.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Sending...';

    try {
      const res = await requestAPI('sendPartnerProposalAPI', name, email, cc, bcc);

      if (res) {
        logA('Email sent successfully!', 'success');
      }
    } catch (e) {
      Opps(e);
      logA('System error: ' + e.message, 'danger');
    } finally {
      if (btnSend) {
        btnSend.disabled = false;
        btnSend.innerHTML = originalText;
      }
      const modalEl = document.getElementById('dynamic-modal');
      if (modalEl) {
        bootstrap.Modal.getInstance(modalEl)?.hide();
      }
    }
  }

  return { open, send };
})();

// --- CASCADING DROPDOWNS (Đã rút gọn dùng selector cục bộ) ---
function onTypeChange(idx, resetChildren = true) {
  if (resetChildren) setVal($('[data-field="hotel_name"]', getE(`row-${idx}`)), '');
  updateLocationList(idx);
  updateServiceNameList(idx);
}

function onLocationChange(idx, resetName = true) {
  const tr = getE(`row-${idx}`);
  if (getVal($('[data-field="service_type"]', tr)) === 'Phòng') {
    updateServiceNameList(idx);
    if (resetName) setVal($('[data-field="service_name"]', tr), '');
  }
}

function updateLocationList(idx) {
  const lists = window.APP_DATA?.lists || {};
  const hotels = (lists.hotelMatrix || []).map((r) => r[0]);
  const allLocs = [...new Set([...hotels, ...(lists.locOther || [])])];

  const elLoc = $('[data-field="hotel_name"]', getE(`row-${idx}`));
  const currentVal = getVal(elLoc);
  elLoc.innerHTML = '<option value="">-</option>' + allLocs.map((x) => `<option value="${x}">${x}</option>`).join('');
  setVal(elLoc, currentVal);
}

function updateServiceNameList(idx) {
  const tr = getE(`row-${idx}`);
  const type = getVal($('[data-field="service_type"]', tr));
  const loc = getVal($('[data-field="hotel_name"]', tr));
  const elName = $('[data-field="service_name"]', tr);

  let options = [];
  if (type === 'Phòng' && loc) {
    const hotelRow = (window.APP_DATA?.lists?.hotelMatrix || []).find((r) => r[0] === loc);
    if (hotelRow) options = hotelRow.slice(2).filter(Boolean);
  } else if (type) {
    options = (window.APP_DATA?.lists?.serviceMatrix || []).filter((r) => r[0] === type).map((r) => r[1]);
  }

  const currentVal = getVal(elName);
  elName.innerHTML = '<option value="">-</option>' + options.map((x) => `<option value="${x}">${x}</option>`).join('');
  if (options.includes(currentVal)) setVal(elName, currentVal);
}

async function onSupplierChange(idx) {
  const tr = getE(`row-${idx}`);
  const useDate = getVal($('[data-field="check_in"]', tr));
  const service = getVal($('[data-field="service_name"]', tr));
  const type = getVal($('[data-field="service_type"]', tr));

  if (!service || !useDate || !type || !A.PriceManager) return;

  if (type === 'Phòng') {
    const hotel = getVal($('[data-field="hotel_name"]', tr));
    const checkOut = getVal($('[data-field="check_out"]', tr));
    const prices = await A.PriceManager.getHotelPrice(hotel, useDate, checkOut, service);
    if (prices) setVal($('[data-field="cost_adult"]', tr), prices.price);
  } else {
    const prices = await A.PriceManager.getServicePrice(service, useDate);
    if (prices) {
      setVal($('[data-field="cost_adult"]', tr), prices.price.adl);
      setVal($('[data-field="cost_child"]', tr), prices.price.chd);
    }
  }
  calcRow(idx);
}
