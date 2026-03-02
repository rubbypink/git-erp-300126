// =========================================================================
// 1. BIẾN & INIT

// =========================================================================
var detailRowCount = 0;

window.loadBookingToUI = function (bkData, customerData, detailsData) {
  if (!bkData) return;
  try {
    // --- NEW LOGIC: TÌM CUSTOMER SOURCE ---
    let custSource = '';

    // Helper: đọc booking theo cả array/object format
    const isBkObj = bkData && typeof bkData === 'object' && !Array.isArray(bkData);
    const bk = (idx) => {
      const field = A.DB?.schema.FIELD_MAP?.bookings?.[idx];
      return isBkObj ? (bkData[field] ?? bkData[idx]) : bkData[idx];
    };

    if (!getE('main-form')) activateTab('tab-form');
    if (isBkObj) HD.setFormData('sub-booking-form', bkData);

    let tbody = getE('detail-tbody');
    if (tbody) {
      tbody.innerHTML = '';
      tbody.style.display = 'none'; // Ẩn tạm thời để tăng tốc render
    } else {
      activateTab('tab-form');
      tbody = getE('detail-tbody');
      if (tbody) {
        tbody.innerHTML = '';
        tbody.style.display = 'none'; // Ẩn tạm thời để tăng tốc render
      } else {
        log('Ko tìm thấy detail-tbody', 'error');
        return;
      }
    }
    if (customerData) {
      findCustByPhone(customerData);
    }

    detailRowCount = 0;

    // Chuẩn hóa detailsData về mảng: hỗ trợ cả Array và Object format {docId: doc}
    let detailsArr = [];
    if (Array.isArray(detailsData)) {
      detailsArr = detailsData;
    } else if (detailsData && typeof detailsData === 'object') {
      detailsArr = Object.values(detailsData);
    }

    if (detailsArr.length > 0) {
      // Sắp xếp chi tiết theo thứ tự service_type và check_in
      const sortedDetails = sortDetailsData(detailsArr);
      sortedDetails.forEach((row) => {
        // Gọi hàm thêm dòng
        addDetailRow(row);
      });
    }

    if (tbody) tbody.style.display = 'table-row-group'; // Hiện lại

    calcGrandTotal();

    // StateProxy v4: clearSession → snapshot baselines → install proxies for all active docs.
    // Must run AFTER detailsArr is normalised but BEFORE user interacts with the form,
    // so baseline reflects the fetched server data (not any in-progress edits).
    if (window.StateProxy) {
      StateProxy.clearSession();
      const isBkObj = typeof bkData === 'object' && !Array.isArray(bkData);
      const bkId = isBkObj ? bkData.id : bkData?.[0];
      if (bkId) StateProxy.beginEdit('bookings', bkId);

      // Customers: beginEdit sử dụng FIELD_ALIAS nên các field có prefix "customer_"
      // trong HTML sẽ tự động map sang schema field tương ứng (full_name, phone, ...).
      // Cần gọi trước khi findCustByPhone() set các giá trị vào form.
      const custId = (() => {
        if (!customerData) return null;
        if (typeof customerData === 'object' && !Array.isArray(customerData))
          return customerData.id ?? null;
        return Array.isArray(customerData) ? (customerData[0] ?? null) : null;
      })();
      if (custId) StateProxy.beginEdit('customers', custId);

      // detailsArr đã được normalize từ detailsData ở trên (hỗ trợ cả Array & Object format)
      detailsArr.forEach((row) => {
        const sid = typeof row === 'object' && !Array.isArray(row) ? row.id : row?.[0];
        if (sid) StateProxy.beginEdit('booking_details', sid);
      });
    }

    // 4. Chuyển Tab về Form (nếu cần thiết)
    try {
      const tabTrigger = document.querySelector('#mainTabs button[data-bs-target="#tab-form"]');
      if (tabTrigger) bootstrap.Tab.getOrCreateInstance(tabTrigger).show();
      toggleContextUI('tab-form');
    } catch (e) {
      logError('LỖI khi chuyển tab về Form', e.message);
    }
  } catch (e) {
    logError('LỖI hàm loadBookingToUI', e.message);
  } finally {
    showLoading(false);
  }
};
// =========================================================================
// 2. LOGIC CHI TIẾT (ROW)
// =========================================================================

function addDetailRow(data = null) {
  detailRowCount++;
  const idx = detailRowCount;
  const lists = APP_DATA.lists;
  // Dropdown Loại DV (NR_LIST_TYPE)
  const optsType = (lists.types || []).map((x) => `<option value="${x}">${x}</option>`).join('');
  // Dropdown Địa điểm (Hotel + Other)
  // Lưu ý: Ta sẽ fill data vào Location sau khi tạo row xong để dễ xử lý logic
  const tr = document.createElement('tr');
  tr.id = `row-${idx}`;
  tr.setAttribute('data-row', idx);
  tr.innerHTML = `
        <td class="text-center text-muted align-middle">${idx} <input type="hidden" class="d-sid" data-field="id"></td>
        <td>
          <select class="form-select form-select-sm d-type" data-field="service_type" onchange="onTypeChange(${idx})">
            <option value="">-</option>${optsType}
          </select>
        </td>
        <td>
          <select class="form-select form-select-sm d-loc" data-field="hotel_name" onchange="onLocationChange(${idx})">
            <option value="">-</option>
          </select>
        </td>
        <td>
          <select class="form-select form-select-sm d-name" data-field="service_name">
            <option value="">-</option>
          </select>
        </td>
        <td><input type="date" class="form-control form-control-sm d-in" data-field="check_in" onchange="autoSetOrCalcDate(this.value, $('.d-out', $('#row-${idx}')))" style="cursor:pointer"></td>
        <td><input type="date" class="form-control form-control-sm d-out" data-field="check_out" onchange="calcRow(${idx})"></td>
        <td><input type="number" class="form-control form-control-sm d-night number bg-light text-center" data-field="nights" readonly></td>
        <td><input type="number" class="form-control form-control-sm d-qty number" data-field="quantity" value="1"></td>
        <td><input type="number" class="form-control form-control-sm d-pri number" data-field="unit_price" placeholder="-"></td>
        <td><input type="number" class="form-control form-control-sm d-qtyC number" data-field="child_qty" placeholder="-"></td>
        <td><input type="number" class="form-control form-control-sm d-priC number" data-field="child_price" placeholder="-"></td>
        <td><input type="number" class="form-control form-control-sm d-sur number" data-field="surcharge" placeholder="-"></td>
        <td><input type="number" class="form-control form-control-sm d-disc number" data-field="discount" placeholder="-"></td>
        <td><input type="text" class="form-control form-control-sm d-total number fw-bold text-end" data-field="total" readonly data-val="0"></td>
        <td><input type="text" class="form-control form-control-sm d-code" data-field="ref_code"></td>
        <td><input type="text" class="form-control form-control-sm d-note" data-field="note"></td>
        <td class="text-center align-middle"><i class="fa-solid fa-times text-danger" style="cursor:pointer" onclick="removeRow(${idx})"></i></td>
            `;
  getE('detail-tbody').appendChild(tr);
  // Init Data cho Row mới
  updateLocationList(idx); // Fill Location List ngay khi tạo
  if (data) {
    const detailId = data.id || '';
    setVal('.d-sid', detailId, tr);
    // Cập nhật data-item với ID thực của detail row
    if (detailId) tr.setAttribute('data-item', detailId);
    setVal('.d-type', data.service_type, tr);
    // Trigger logic sau khi set Type
    onTypeChange(idx, false); // false = không reset con
    setVal('.d-loc', data.hotel_name, tr);
    // Trigger logic sau khi set Location
    onLocationChange(idx, false);
    setVal('.d-name', data.service_name, tr);
    setVal('.d-in', data.check_in, tr);
    setVal('.d-out', data.check_out, tr);
    setVal('.d-qty', data.quantity, tr);
    setVal('.d-pri', data.unit_price, tr);
    setVal('.d-qtyC', data.child_qty, tr);
    setVal('.d-priC', data.child_price, tr);
    setVal('.d-sur', data.surcharge, tr);
    setVal('.d-disc', data.discount, tr);
    setVal('.d-code', data.ref_code, tr);
    setVal('.d-note', data.note, tr);
    calcRow(idx);
    // Snapshot initial values so filterUpdatedData can detect only actual changes.
    // Must run AFTER calcRow() so derived fields (nights, total) are also captured.
    tr.querySelectorAll('input, select').forEach((el) => {
      el.setAttribute('data-initial', el.value);
    });
  }
  if (idx === 1 && !data) {
    setVal('.d-type', 'Phòng', tr);
    tr.querySelector('.d-type').dispatchEvent(new Event('change'));
  }
}

function removeRow(idx) {
  const row = getE(`row-${idx}`);
  if (row) row.remove();
  calcGrandTotal();
}

/**
 * sortDetailsData: Sắp xếp dữ liệu chi tiết theo thứ tự service_type và check_in
 * Thứ tự ưu tiên: Vé MB -> Vé Tàu -> Phòng -> Xe -> Các loại khác
 * Nếu cùng type, sắp xếp theo check_in (ngày sớm trước)
 * @param {Array} detailsData - Dữ liệu chi tiết cần sắp xếp
 * @returns {Array} Mảng đã sắp xếp
 */
function sortDetailsData(detailsData) {
  if (!Array.isArray(detailsData) || detailsData.length === 0) return detailsData;

  const typeOrder = ['Vé MB', 'Vé Tàu', 'Phòng', 'Xe'];

  // Helper: Lấy service_type
  const getServiceType = (row) => row?.service_type || '';

  // Helper: Lấy check_in date
  const getCheckInDate = (row) => {
    const checkIn = row?.check_in || '';
    return checkIn ? new Date(checkIn).getTime() : 0;
  };

  // Helper: Lấy priority của service_type
  const getTypePriority = (serviceType) => {
    const idx = typeOrder.indexOf(serviceType);
    return idx >= 0 ? idx : typeOrder.length; // Các loại khác được priority cao nhất
  };

  return detailsData.sort((a, b) => {
    // 1. Sắp xếp theo type priority
    const aPriority = getTypePriority(getServiceType(a));
    const bPriority = getTypePriority(getServiceType(b));

    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }

    // 2. Nếu cùng type, sắp xếp theo check_in date (sớm trước)
    const aDate = getCheckInDate(a);
    const bDate = getCheckInDate(b);

    return aDate - bDate;
  });
}
/**
 * copyRow: Lấy dữ liệu từ dòng cuối cùng và tạo dòng mới
 * Logic:
 * 1. Tìm dòng cuối cùng trong bảng.
 * 2. Extract giá trị từ các input/select.
 * 3. Reset ID (để tránh trùng lặp khi lưu).
 * 4. Gọi addDetailRow để render.
 */
function copyRow(sourceRow, addToEnd = true) {
  const tbody = getE('detail-tbody');
  const rows = tbody.querySelectorAll('tr');

  // Guard clause: Nếu chưa có dòng nào thì không copy được -> Thêm mới dòng trắng
  if (rows.length === 0) {
    addDetailRow();
    return;
  }

  // 1. Lấy dòng cuối cùng (Source Row)
  const lastRow = sourceRow ? sourceRow : rows[rows.length - 1];

  // Helper nội bộ: Lấy value an toàn từ row cụ thể
  const getRowVal = (cls) => {
    const el = lastRow.querySelector('.' + cls);
    return el ? el.value : '';
  };

  // 2. Chuẩn bị data object theo field names (object format)
  // SID để rỗng để hệ thống hiểu là dòng mới (Insert)
  const rowData = {
    id: '',
    service_type: getRowVal('d-type'),
    hotel_name: getRowVal('d-loc'),
    service_name: getRowVal('d-name'),
    check_in: getRowVal('d-in'),
    check_out: getRowVal('d-out'),
    quantity: getRowVal('d-qty'),
    unit_price: getRowVal('d-pri'),
    child_qty: getRowVal('d-qtyC'),
    child_price: getRowVal('d-priC'),
    surcharge: getRowVal('d-sur'),
    discount: getRowVal('d-disc'),
    ref_code: getRowVal('d-code'),
    note: getRowVal('d-note'),
  };

  // 3. Gọi hàm tạo dòng với data đã chuẩn bị
  if (addToEnd) {
    addDetailRow(rowData);
  } else {
    return rowData;
  }
}
// =========================================================================
// 3. LOGIC MA TRẬN & PHỤ THUỘC (DEPENDENT DROPDOWN)
// =========================================================================
// A. Khi đổi Loại DV -> Cập nhật list Tên & Tự động điền Số lượng/Ngày
function onTypeChange(idx, resetChildren = true) {
  const tr = getE(`row-${idx}`);
  if (!tr) return;
  // 1. Logic cũ: Reset Location & Name
  if (resetChildren) {
    tr.querySelector('.d-loc').value = '';
    // Gọi hàm updateServiceNameList (như đã làm ở bước trước)
    updateServiceNameList(idx);
    // 2. LOGIC MỚI: Tự động điền dữ liệu thông minh
    autoFillRowData(idx);
  } else {
    updateServiceNameList(idx);
  }
}
function autoFillRowData(idx) {
  const tr = getE(`row-${idx}`);
  const type = tr.querySelector('.d-type').value; // Loại DV
  // Lấy dữ liệu chung từ Header Form
  const mainAdults = Number(getE('BK_Adult').value) || 1;
  const mainChild = Number(getE('BK_Child').value) || 0;
  const mainStart = getE('BK_Start').value || new Date();
  const mainEnd = getE('BK_End').value || new Date();
  // ---------------------------------------------------------
  // 1. XỬ LÝ SỐ LƯỢNG (QTY)
  // ---------------------------------------------------------
  let newQtyA = 0; // SL Lớn
  let newQtyC = 0; // SL Bé
  if (type === 'Phòng') {
    // Phòng = Người lớn / 2 (Làm tròn lên, ví dụ 3 người -> 2 phòng)
    newQtyA = Math.ceil(mainAdults / 2);
    newQtyC = mainChild; // Trẻ em giữ nguyên
  } else if (['Xe', 'HDV'].includes(type)) {
    // Xe, HDV -> Mặc định 1
    newQtyA = 1;
    newQtyC = 0; // Trẻ em = 0
  } else {
    // Các loại khác (Vé, Ăn uống...) -> Bằng số người
    newQtyA = mainAdults;
    newQtyC = mainChild;
  }
  // Gán giá trị vào ô input
  tr.querySelector('.d-qty').value = newQtyA;
  tr.querySelector('.d-qtyC').value = newQtyC;
  // ---------------------------------------------------------
  // 2. XỬ LÝ NGÀY ĐI / NGÀY VỀ (DATE IN/OUT)
  // ---------------------------------------------------------
  let newIn = '';
  let newOut = '';
  // Tìm hàng phía trên (Previous Row) để lấy tham chiếu
  // Dùng previousElementSibling để lấy đúng hàng hiển thị bên trên (bất kể ID là gì)
  const prevRow = tr.previousElementSibling;
  let prevOutDate = '';
  let prevInDate = '';
  let preType = '';
  // Kiểm tra xem hàng trên có phải là data row không (hay là header/trống)
  if (prevRow && prevRow.querySelector('.d-out')) {
    prevOutDate = prevRow.querySelector('.d-out').value;
    prevInDate = prevRow.querySelector('.d-in').value;
    preType = prevRow.querySelector('.d-type').value;
  }
  // Logic ngày tháng
  if (['Vé MB', 'Vé Tàu'].includes(type)) {
    // Giống ngày đi/về chung
    newIn = mainStart;
    newOut = mainEnd;
  } else if (type === 'Phòng') {
    // Check In: Nếu có hàng trên -> lấy ngày Check Out của hàng trên. Nếu không (hàng đầu) -> Lấy ngày đi chung
    newIn = prevOutDate ? prevOutDate : mainStart;
    // Check Out: Luôn bằng ngày về chung (Mặc định check out cuối tour)
    newOut = mainEnd;
  } else {
    // Các dạng khác (Ăn, Tour ngày...):
    // Ngày đi & về = Ngày về hàng trên (nối tiếp).
    // Nếu là hàng đầu -> Bằng ngày đi chung.
    let refDate;
    if (['Phòng', 'Vé MB', 'Vé Tàu'].includes(preType)) {
      refDate = prevInDate ? prevInDate : mainStart;
    } else {
      refDate = prevOutDate ? prevOutDate : mainStart;
    }
    newIn = refDate;
    newOut = refDate;
  }
  // Gán giá trị vào ô input
  if (newIn) setVal($('.d-in', tr), newIn);
  if (newOut) setVal($('.d-out', tr), newOut);
  // ---------------------------------------------------------
  // 3. TÍNH TOÁN LẠI (Trigger Calc)
  // ---------------------------------------------------------
  // Vì số lượng và ngày thay đổi, cần tính lại Đêm và Thành tiền ngay lập tức
  calcRow(idx);
}
// B. Khi đổi Location -> Nếu Type=Phòng -> Cập nhật Hạng Phòng
function onLocationChange(idx, resetName = true) {
  const tr = getE(`row-${idx}`);
  const type = tr.querySelector('.d-type').value;
  if (type === 'Phòng') {
    updateServiceNameList(idx); // Load hạng phòng của KS này
    if (resetName) tr.querySelector('.d-name').value = '';
  }
}
// C. Hàm Fill Location (Gộp Hotel Matrix Col 1 + Other)
function updateLocationList(idx) {
  const lists = window.APP_DATA.lists;
  // Lấy tên các KS từ Matrix (Cột 0)
  const hotels = (lists.hotelMatrix || []).map((r) => r[0]);
  const others = lists.locOther || [];
  // Gộp và loại trùng
  const allLocs = [...new Set([...hotels, ...others])];
  const elLoc = getE(`row-${idx}`).querySelector('.d-loc');
  let currentVal = elLoc.value;
  elLoc.innerHTML =
    '<option value="">-</option>' +
    allLocs.map((x) => `<option value="${x}">${x}</option>`).join('');
  elLoc.value = currentVal;
}
// D. Hàm Fill Service Name / Room Type (CORE LOGIC)
function updateServiceNameList(idx) {
  const tr = getE(`row-${idx}`);
  const type = tr.querySelector('.d-type').value;
  const loc = tr.querySelector('.d-loc').value;
  const elName = tr.querySelector('.d-name');
  let options = [];
  if (type === 'Phòng') {
    // Tra cứu trong Matrix
    const matrix = window.APP_DATA.lists.hotelMatrix || [];
    // Tìm dòng có tên KS khớp với Location
    const hotelRow = matrix.find((r) => r[0] === loc);
    if (hotelRow) {
      // Lấy từ cột 3 đến hết (Index 2 trở đi trong mảng JS - vì JS start 0)
      // Excel: Cột A(0)=Tên. Cột C(2) -> L(11) là hạng phòng.
      // Chú ý: getMatrixData trả về mảng giá trị của row.
      // Ta lấy các ô có dữ liệu từ index 2 trở đi
      options = hotelRow.slice(2).filter((c) => c !== '' && c !== null);
    }
  } else {
    const svcMatrix = window.APP_DATA.lists.serviceMatrix || [];
    options = svcMatrix
      .filter((r) => r[0] === type) // Cột 0 là Loại
      .map((r) => r[1]); // Cột 1 là Tên
  }
  const currentVal = elName.value;
  elName.innerHTML =
    '<option value="">-</option>' +
    options.map((x) => `<option value="${x}">${x}</option>`).join('');
  // Cố gắng giữ lại giá trị cũ nếu có trong list mới
  if (options.includes(currentVal)) elName.value = currentVal;
}
// =========================================================================
// 4. TÍNH TOÁN (CALCULATION)
// =========================================================================
// 1. Cập nhật hàm calcRow (Fix lỗi tính Đêm)
function calcRow(idx) {
  if (getVal('BK_Status') === 'Hủy') return;
  const tr = getE(`row-${idx}`);
  if (!tr) return;
  const dInStr = tr.querySelector('.d-in').value;
  const dOutStr = tr.querySelector('.d-out').value;
  const type = tr.querySelector('.d-type').value;
  // --- FIX LOGIC ĐÊM ---
  let night = 0;
  if (dInStr && dOutStr) {
    const dIn = new Date(dInStr);
    const dOut = new Date(dOutStr);
    const diff = (dOut - dIn) / 86400000;
    // Yêu cầu: Loại khác Phòng HOẶC Ngày đi = Ngày về => Đêm = 1
    if (type !== 'Phòng' || diff <= 0) {
      night = 1;
    } else {
      night = diff;
    }
  }
  tr.querySelector('.d-night').value = night;
  // ---------------------
  // Tính tiền (Giữ nguyên logic nhân night cho 'Phòng')
  const getNum = (cls) => Number(tr.querySelector('.' + cls).value) || 0;
  const qtyA = getNum('d-qty');
  const priA = getNum('d-pri');
  const qtyC = getNum('d-qtyC');
  const priC = getNum('d-priC');
  const sur = getNum('d-sur');
  const disc = getNum('d-disc');
  // Nếu là Phòng thì nhân số đêm, Dịch vụ khác thì night=1 (đã set ở trên) nên nhân 1 cũng đúng
  // Tuy nhiên để an toàn logic hiển thị:
  // Nếu type=Phòng, multiplier = night. Nếu khác, multiplier = 1 (vì bản chất dịch vụ tính theo lượt)
  const multiplier = type === 'Phòng' ? Math.max(1, night) : 1;
  const total = (qtyA * priA + qtyC * priC) * multiplier + sur - disc;
  const elTotal = tr.querySelector('.d-total');
  elTotal.value = formatMoney(total);
  elTotal.dataset.val = total;
  calcGrandTotal();
}

// =========================================================================
// CẬP NHẬT: calcGrandTotal (Tính Tổng & Phân tích giá TB)
// =========================================================================
function calcGrandTotal() {
  if (getVal('BK_Status') === 'Hủy') return;
  let grandTotal = 0;

  // Các biến tích lũy để tính AVG
  let transportTotal = 0; // Tổng tiền Vé MB + Tàu
  let transportA = 0;
  let transportC = 0;
  let landChildTotal = 0; // Tổng tiền Landtour của Trẻ em

  // 1. Quét qua tất cả các ô Thành tiền (.d-total)
  document.querySelectorAll('.d-total').forEach((elTotal) => {
    const rowTotal = Number(elTotal.dataset.val) || 0;
    grandTotal += rowTotal;

    // --- Logic Phân Tách AVG ---
    const tr = elTotal.closest('tr');
    if (tr) {
      const type = tr.querySelector('.d-type').value;

      // Nhóm 1: Vé MB hoặc Vé Tàu -> Gom vào Transport
      if (type === 'Vé MB' || type === 'Vé Tàu') {
        const qtyA = getVal('.d-qty', tr) ? Number(getVal('.d-qty', tr)) : 0;
        const priA = getVal('.d-pri', tr) ? Number(getVal('.d-pri', tr)) : 0;
        const qtyC = getVal('.d-qtyC', tr) ? Number(getVal('.d-qtyC', tr)) : 0;
        const priC = getVal('.d-priC', tr) ? Number(getVal('.d-priC', tr)) : 0;
        const sur = getVal('.d-sur', tr) ? Number(getVal('.d-sur', tr)) : 0;
        const disc = getVal('.d-disc', tr) ? Number(getVal('.d-disc', tr)) : 0;
        transportA += qtyA * priA + sur - disc;
        transportC += priC * qtyC;
        transportTotal += rowTotal;
      }
      // Nhóm 2: Landtour -> Tính tách chi phí Trẻ em
      else {
        const qtyC = getVal('.d-qtyC', tr) ? Number(getVal('.d-qtyC', tr)) : 0;
        const priC = getVal('.d-priC', tr) ? Number(getVal('.d-priC', tr)) : 0;

        // Xác định hệ số nhân (Multiplier) giống logic calcRow
        // Nếu là Phòng thì nhân số đêm, loại khác nhân 1
        const nightVal = getVal('.d-night', tr) || 1;
        const multiplier = type === 'Phòng' ? Math.max(1, nightVal) : 1;

        // Cộng dồn chi phí trẻ em dòng này
        landChildTotal += qtyC * priC * multiplier;
      }
    }
  });

  // 2. Cập nhật UI Tổng tiền Booking
  const elBkTotal = getE('BK_Total');
  if (elBkTotal) {
    elBkTotal.value = formatMoney(grandTotal);
    elBkTotal.dataset.val = grandTotal;
  }

  // 3. Tính toán Giá Bình Quân (AVG Stats)
  const countAdult = getNum('BK_Adult') || 1; // Tránh chia cho 0
  const countChild = getNum('BK_Child') || 1;

  // A. Giá TB Trẻ em (Landtour) = Tổng tiền land TE / Số TE
  // Nếu logic của bạn chỉ cần Tổng tiền thì bỏ đoạn chia countChild
  const avgChildPrice = countChild > 0 ? landChildTotal / countChild : 0;

  // B. Giá TB Người lớn (Landtour)
  // = (Tổng Booking - Tiền Transport - Tiền Land Trẻ em) / Số NL
  const landTotal = grandTotal - transportTotal;
  const landAdultTotal = landTotal - landChildTotal;
  const avgAdultPrice = countAdult > 0 ? landAdultTotal / countAdult : 0;
  const transAdultPrice = countAdult > 0 ? transportA / countAdult : 0;
  const transChildPrice = countChild > 0 ? transportC / countChild : 0;

  // 4. Hiển thị lên thẻ Stats
  const elStatsA = getE('Stats_AvgAdult');
  const elStatsC = getE('Stats_AvgChild');
  const elStatsTA = getE('Stats_TransportAdult');
  const elStatsTC = getE('Stats_TransportChild');

  if (elStatsA) elStatsA.innerText = formatMoney(Math.round(avgAdultPrice)); // Dùng innerText cho thẻ Span/Div
  if (elStatsC) setVal(elStatsC, formatMoney(Math.round(avgChildPrice)));
  if (elStatsTA) setVal(elStatsTA, formatMoney(transAdultPrice));
  if (elStatsTC) setVal(elStatsTC, formatMoney(transChildPrice));

  const balance = grandTotal - getNum('BK_Deposit');
  setNum('BK_Balance', balance);
  updateBkStatus();
}

async function updateDeposit() {
  try {
    const bkId = getVal('BK_ID');
    if (!bkId) {
      log('⚠️ Booking ID trống, không thể tải Deposit', 'warning');
      return 0;
    }

    // Firestore operator: '==' (không phải '=')
    const result = await A.DB?.runQuery('transactions', 'booking_id', '==', bkId);

    if (!result || !Array.isArray(result)) {
      log('⚠️ Không tìm thấy giao dịch cho booking này', 'warning');
      setVal('BK_Deposit', 0);
      return 0;
    }

    const total = result.reduce((sum, tx) => sum + (tx.amount || 0), 0) / 1000;
    setNum('BK_Deposit', total);
    calcGrandTotal(); // Cập nhật lại tổng tiền sau khi có deposit mới
    return total;
  } catch (e) {
    log(`❌ Lỗi cập nhật Deposit: ${e.message}`, 'error');
    return 0;
  }
}

function updateBkStatus() {
  // Auto Status
  let curStatus = getVal('BK_Status');
  let grandTotal = getNum('BK_Total');
  let deposit = getNum('BK_Deposit');
  const startDate = new Date(getVal('BK_Start'));
  const today = new Date(); // YYYY-MM-DD
  let stt;
  if (curStatus !== 'Hủy') {
    if (grandTotal === 0) stt = 'Hủy';
    else if (startDate <= today && deposit === grandTotal) stt = 'Xong BK';
    else if (deposit === grandTotal && grandTotal > 0) stt = 'Thanh Toán';
    else if (startDate < today && deposit < grandTotal) stt = 'Công nợ';
    else if (deposit > 0) stt = 'Đặt Cọc';
    else stt = 'Đặt Lịch';
  }
  setVal('BK_Status', stt);
  return stt;
}

function autoSetOrCalcDate(start, end) {
  // Kiểm tra đầu vào
  if (!start) return;

  // Bước 1: Thử tìm xem end có phải là ID của một element trong DOM không
  const targetElement = getE(end);

  if (targetElement) {
    // --- TRƯỜNG HỢP: end LÀ ID ---
    // Gán giá trị start cho element tìm thấy
    targetElement.value = start;
  } else {
    // --- TRƯỜNG HỢP: end KHÔNG PHẢI ID (Giả định là Ngày tháng) ---
    // Chuyển đổi sang đối tượng Date để tính toán
    const startDate = new Date(start);
    const endDate = new Date(end);

    // Kiểm tra xem end có phải là ngày hợp lệ không
    if (!isNaN(endDate.getTime())) {
      // Tính hiệu số mili-giây
      const diffTime = endDate - startDate;
      // Chuyển mili-giây sang số ngày (chia cho 1000ms * 60s * 60m * 24h)
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays;
    } else {
      log("Tham số 'end' không phải là ID tồn tại, cũng không phải ngày hợp lệ.", 'error');
    }
  }
}
/**
 * HÀM TRÍCH XUẤT DỮ LIỆU: Được BaseForm gọi khi nhấn nút SAVE
 * Nhiệm vụ: Gom toàn bộ dữ liệu trên Form thành JSON để gửi về Server
 *
 * @param {boolean} [update=false]
 *   - false (default): trả về toàn bộ dữ liệu (tạo mới)
 *   - true: chỉ trả về các phần có dữ liệu thực sự thay đổi (cập nhật)
 *           Dùng filterUpdatedData để phát hiện thay đổi.
 *           Trả về null nếu không có gì thay đổi.
 */
window.getFormData = async function (update = false) {
  try {
    // ── 1. Thu thập toàn bộ dữ liệu (dùng cho cả 2 mode) ─────────────

    // Bookings Data
    const bookings = {
      id: getVal('BK_ID'),
      customer_id: getVal('Cust_Id'),
      customer_full_name: getVal('Cust_Name'),
      customer_phone: formatPhone(getVal('Cust_Phone')),
      start_date: getVal('BK_Start'),
      end_date: getVal('BK_End'),
      adults: getVal('BK_Adult'),
      children: getVal('BK_Child'),
      total_amount: getVal('BK_Total'), // Lấy giá trị thô
      deposit_amount: getVal('BK_Deposit'),
      balance_amount: 0, // Sẽ tính lại ở server hoặc dòng dưới
      payment_method: getVal('BK_PayType'),
      payment_due_date: getVal('BK_PayDue'),
      note: getVal('BK_Note'),
      staff_id: getVal('BK_Staff') || CURRENT_USER.name || '',
      status: '',
      created_at: getVal('BK_Date'),
      tour_name: getVal('BK_TourName'), // Thêm Tour Name
    };

    bookings.balance_amount = Number(bookings.total_amount) - Number(bookings.deposit_amount);
    bookings.status = updateBkStatus();

    // Customer Data
    const customer = {
      id: getVal('Cust_Id') || '',
      full_name: getVal('Cust_Name'),
      phone: formatPhone(getVal('Cust_Phone')),
      source: getVal('Cust_Source'),
    };

    // Details Data
    const booking_details = [];
    document.querySelectorAll('#detail-tbody tr').forEach((tr) => {
      booking_details.push({
        sid: getVal('.d-sid', tr),
        booking_id: bookings.id,
        type: getVal('.d-type', tr),
        location: getVal('.d-loc', tr),
        name: getVal('.d-name', tr),
        in: getVal('.d-in', tr),
        out: getVal('.d-out', tr),
        night: getVal('.d-night', tr),
        qtyA: getVal('.d-qty', tr),
        priA: getVal('.d-pri', tr),
        qtyC: getVal('.d-qtyC', tr),
        priC: getVal('.d-priC', tr),
        sur: getVal('.d-sur', tr),
        disc: getVal('.d-disc', tr),
        total: getVal('.d-total', tr),
        code: getVal('.d-code', tr),
        note: getVal('.d-note', tr),
      });
    });

    // ── 2. NON-UPDATE MODE: trả về toàn bộ ───────────────────────────
    if (!update) {
      return { bookings, customer, booking_details };
    }

    // ── 3. UPDATE MODE: dùng filterUpdatedData để phát hiện thay đổi ─

    // 3a. Kiểm tra thay đổi riêng cho booking và customer (2 fieldset khác nhau)
    const bookingChanges = await filterUpdatedData('fs_booking_info');
    const customerChanges = await filterUpdatedData('fs_customer_info');
    const hasBookingChanges = Object.keys(bookingChanges).length > 0;
    const hasCustomerChanges = Object.keys(customerChanges).length > 0;

    // 3b. Kiểm tra từng dòng detail — chỉ giữ row có thay đổi
    const detailRows = [...document.querySelectorAll('#detail-tbody tr')];
    const changedDetails = [];
    for (let i = 0; i < detailRows.length; i++) {
      const tr = detailRows[i];
      if (!tr.id) continue;
      const rowChanges = await filterUpdatedData(tr.id, $('#detail-tbody'));
      if (Object.values(rowChanges).length > 0) {
        changedDetails.push(booking_details[i]);
      }
    }

    // 3c. Không có gì thay đổi → trả về null
    if (!hasBookingChanges && !hasCustomerChanges && changedDetails.length === 0) {
      log('⚠️ Không có dữ liệu nào thay đổi', 'warning');
      return null;
    }

    log('Dữ liệu cập nhật (chỉ thay đổi) trích xuất từ Form OK!');
    return {
      bookings: hasBookingChanges ? bookings : { id: bookings.id }, // Nếu không có thay đổi nào, vẫn trả về ID để server biết update bản ghi nào
      customer: hasCustomerChanges ? customer : { id: customer.id }, // Nếu không có thay đổi nào, vẫn trả về ID để server biết update bản ghi nào
      booking_details: changedDetails,
    };
  } catch (error) {
    logError('Lỗi khi trích xuất dữ liệu từ Form: ' + error.message);
    return null;
  }
};

/**
 * Hàm này được BaseForm gọi sau khi Server trả về kết quả tìm kiếm
 * @param {Object} res - Kết quả từ server { success, booking, booking_details, message }
 */
function fillFormFromSearch(res) {
  showLoading(false);
  // 1. Kiểm tra lỗi từ Server
  if (!res) {
    logError('Không tìm thấy dữ liệu phù hợp! - Lỗi biến res');
    return;
  }

  try {
    const bkData = res.bookings;
    const detailsData = res.booking_details;
    const customerData = res.customer;

    if (typeof loadBookingToUI === 'function') {
      loadBookingToUI(bkData, customerData, detailsData);
      // Log thông báo
      const sourceMsg = res.source === 'local' ? ' (⚡ Local)' : ' (🐢 Database)';
    } else {
      logA('Lỗi hệ thống: Không thể hiển thị dữ liệu lên Form.', 'error');
    }
    // log("FillForm end");
  } catch (e) {
    logError('Lỗi khi điền dữ liệu vào Form: ' + e.message, e);
  } finally {
    showLoading(false);
  }
}

async function findCustByPhone(customerData = null, e) {
  // 1. Lấy fieldset với name="customers"
  let custFieldset = document.querySelector('fieldset[name="customers"]');
  if (!custFieldset) {
    custFieldset = document.querySelector('fieldset#fs_customer_info');
  }

  if (!custFieldset) {
    log('Không tìm thấy fieldset customers', 'warning');
    return;
  }

  // 2. Lấy giá trị input từ fieldset
  const phoneEl = custFieldset.querySelector('[data-field="customer_phone"]');
  const nameEl = custFieldset.querySelector('[data-field="customer_full_name"]');

  const phoneInput = phoneEl?.value.trim() || '';
  const nameInput = nameEl?.value.trim() || '';

  if (phoneInput.length < 3 && nameInput.length < 3) return;

  const customers = window.APP_DATA ? Object.values(APP_DATA.customers ?? {}) : [];

  let found = null;

  if (!customerData) {
    // --- BƯỚC 1: TÌM THEO SỐ ĐIỆN THOẠI ---
    if (phoneInput.length >= 3) {
      found = customers.find((c) => {
        if (!c) return false;

        // Object format: c.phone hoặc c.customer_phone
        if (typeof c === 'object' && !Array.isArray(c)) {
          const phone = c.phone || c.customer_phone || '';
          return String(phone).includes(phoneInput);
        }

        // Array format: c[6] là phone index
        if (Array.isArray(c)) {
          return c[6] && String(c[6]).includes(phoneInput);
        }

        return false;
      });
    }

    // --- BƯỚC 2: NẾU CHƯA TÌM THẤY => TÌM THEO TÊN ---
    if (!found && nameInput.length >= 3) {
      found = customers.find((c) => {
        if (!c) return false;

        // Object format: c.full_name hoặc c.customer_full_name
        if (typeof c === 'object' && !Array.isArray(c)) {
          const name = c.full_name || c.customer_full_name || '';
          return String(name).toLowerCase().includes(nameInput.toLowerCase());
        }

        // Array format: c[1]
        if (Array.isArray(c)) {
          return c[1] && String(c[1]).toLowerCase().includes(nameInput.toLowerCase());
        }

        return false;
      });
    }
  } else found = customerData; // Nếu đã có data từ search thì dùng luôn, không cần tìm nữa

  if (found) {
    // 3. Trích xuất dữ liệu theo format
    let custData = {};
    if (typeof found === 'object' && !Array.isArray(found)) {
      // Object format
      custData = {
        id: found.id || '', // ← customer_id cho Cust_Id hidden field
        full_name: found.full_name || found.customer_full_name || '',
        phone: found.phone || found.customer_phone || '',
        email: found.email || found.customer_email || '',
        id_card: found.id_card || found.cccd || '',
        id_card_date: found.id_card_date || found.cccd_date || '',
        dob: found.dob || found.date_of_birth || '',
        address: found.address || '',
        source: found.source || found.customer_source || '',
      };
    } else if (Array.isArray(found)) {
      // Array format - adjust theo cấu trúc thực tế
      custData = {
        id: found[0] || '', // ← customer_id cho Cust_Id hidden field
        full_name: found[1] || '',
        phone: found[6] || '',
        email: found[7] || '',
        id_card: found[3] || '',
        id_card_date: found[4] || '',
        dob: found[2] || '',
        address: found[5] || '',
        source: found[8] || '',
      };
    }

    // 4. Cập nhật các element trong fieldset dựa vào data-field
    // Looping qua custData và tìm element tương ứng (với prefix customer_)
    Object.keys(custData).forEach((key) => {
      const fieldName = 'customer_' + key; // Thêm prefix → 'customer_id', 'customer_full_name', ...
      const el = custFieldset.querySelector(`[data-field="${fieldName}"]`);
      if (el && custData[key]) {
        setVal(el, custData[key]);
      }
    });
  }
}

/**
 * CORE LOGIC: Xử lý dữ liệu Template (Tịnh tiến ngày)
 * @param {Array} booking_details - Dữ liệu thô từ template
 * @param {string} anchorDateStr - Ngày gốc của template (YYYY-MM-DD hoặc Date obj)
 * @param {string} newStartStr - Ngày đi mới (YYYY-MM-DD)
 * @param {number} newAdult - Số người lớn mới
 */
function processAndFillTemplate(booking_details, anchorDateStr, newStartStr, newAdult) {
  log('run processAndFillTemplate');
  // A. Tính toán Offset (Độ lệch ngày)
  // Chuyển đổi an toàn sang Date Object
  // Lưu ý: new Date("YYYY-MM-DD") mặc định là UTC. Ta cần xử lý cẩn thận để tránh lệch múi giờ.
  // Cách an toàn nhất: Set giờ về 12:00 trưa để tránh lệch ngày
  const parseDate = (dStr) => {
    if (!dStr) return null;
    if (dStr instanceof Date) return dStr;
    return new Date(dStr);
  };

  const dOld = parseDate(anchorDateStr);
  const dNew = parseDate(newStartStr);
  // Tính độ lệch theo mili-giây
  const diffTime = dNew.getTime() - dOld.getTime();
  // B. Xóa bảng cũ
  getE('detail-tbody').innerHTML = '';
  detailRowCount = 0;
  // C. Duyệt từng dòng và add vào bảng
  booking_details.forEach((row) => {
    // 1. Xử lý Ngày (Date Shifting)
    let shiftedIn = '';
    let shiftedOut = '';
    if (row.in) {
      const rIn = parseDate(row.in);
      const newInDate = new Date(rIn.getTime() + diffTime);
      shiftedIn = newInDate.toISOString().split('T')[0]; // Format YYYY-MM-DD
    }
    if (row.out) {
      const rOut = parseDate(row.out);
      const newOutDate = new Date(rOut.getTime() + diffTime);
      shiftedOut = newOutDate.toISOString().split('T')[0];
    }
    // 2. Xử lý Số lượng (Scale theo người lớn)
    // Logic: Nếu Template set số lượng == 0 hoặc 1 thì giữ nguyên?
    // Hay là override bằng số khách hiện tại?
    // Theo yêu cầu: "Cập nhật ngày... yêu cầu điền thông tin 3 ô (Start, End, Adult)..."
    // => Ngầm hiểu là cần update số lượng theo Adult mới.
    let finalQtyA = row.qtyA;
    let finalQtyC = row.qtyC; // Trẻ em thường giữ nguyên theo template hoặc set 0
    // Logic thông minh:
    // Nếu là Phòng: Có thể giữ nguyên logic chia phòng hoặc lấy từ template
    // Nếu là Ăn/Vé/Tour: Thường bằng số khách.
    // Ở đây ta ưu tiên logic: Sử dụng hàm autoFillRowData có sẵn hoặc gán trực tiếp.
    // Phương án an toàn: Gán theo số người lớn mới nều loại DV không phải là Xe/HDV (thường cố định).
    if (['Xe', 'HDV', 'Tàu', 'Ca nô'].includes(row.type)) {
      // Giữ nguyên số lượng trong template (vì có thể là 1 xe, 1 tàu)
    } else {
      // Các loại khác (Vé, Ăn, Phòng...) -> Update theo số khách mới
      // Tuy nhiên nếu là Phòng, logic chia 2 có thể áp dụng.
      // Để đơn giản và chính xác theo yêu cầu: Ta gán lại row.qtyA = newAdult
      if (row.type === 'Phòng') {
        finalQtyA = Math.ceil(newAdult / 2); // Logic chia đôi
      } else {
        finalQtyA = newAdult;
      }
    }
    // 3. Construct Data Array cho hàm addDetailRow
    // Mapping lại format mảng mà addDetailRow mong đợi:
    // [sid, null, type, loc, name, in, out, null, qty, pri, qtyC, priC, sur, disc, null, code, note]
    const rowData = [
      '', // 0: SID (Mới nên rỗng)
      '', // 1: Blank
      row.type, // 2
      row.location, // 3
      row.name, // 4
      shiftedIn, // 5: Date In (Đã tịnh tiến)
      shiftedOut, // 6: Date Out (Đã tịnh tiến)
      '', // 7: Time/Note
      finalQtyA, // 8: Qty A (Đã update)
      row.priA, // 9: Price A (Giữ nguyên)
      row.qtyC, // 10: Qty C
      row.priC, // 11: Price C
      row.sur, // 12
      row.disc, // 13
      '', // 14: Total (Tự tính lại)
      row.code, // 15
      row.note, // 16
    ];
    // Gọi hàm có sẵn để render lên UI
    addDetailRow(rowData);
  });
  logA('Đã tải Template và cập nhật ngày tháng thành công!', 'success');
}

// /**
//  * Hàm lấy dữ liệu đầy đủ từ Tab này để phục vụ Export
//  */
getCustomerData = function (update = false) {
  try {
    // 1. Lấy fieldset với name="customers" (hoặc fallback id="fs_customer_info")
    let custFieldset = $('fieldset[name="customers"]');
    if (!custFieldset) {
      custFieldset = $('fieldset#fs_customer_info');
    }

    if (!custFieldset) {
      logA('Không tìm thấy fieldset khách hàng!', 'warning');
      return null;
    }

    let hasChange = false; // Flag để kiểm tra có thay đổi nào không
    if (update) {
      const changes = filterUpdatedData(custFieldset);
      hasChange =
        Object.keys(changes || {}).filter((k) => k !== 'id' && k !== 'customer_id').length > 0;
      if (hasChange) {
        // Xóa prefix "customer_" khỏi tên field trước khi trả về
        const normalized = {};
        Object.entries(changes).forEach(([key, val]) => {
          normalized[key.replace(/^customer_/, '')] = val;
        });
        return normalized;
      }
    }

    // 2. Trích xuất dữ liệu từ tất cả input/select/textarea trong fieldset
    const data = {};

    custFieldset.querySelectorAll('input, select, textarea').forEach((el) => {
      if (el.hasAttribute('data-field')) {
        let fieldName = el.getAttribute('data-field');
        // Xóa prefix "customer_" nếu có
        fieldName = fieldName.replace(/^customer_/, '');
        // Lấy value (trim whitespace)
        data[fieldName] = getVal(el); // Sử dụng getVal để đảm bảo lấy giá trị đã được xử lý (nếu có logic đặc biệt)
      }
    });

    // 3. Validation cơ bản
    if (!data.full_name || !data.phone) {
      logA('Vui lòng nhập Tên và Số điện thoại!', 'warning');
      return null;
    }

    return data;
  } catch (e) {
    log('Lỗi hàm getCustomerData', e.message, 'error');
    return null;
  }
};

/**
 * 1. Xử lý khi click vào dòng trong Bảng Tổng hợp (Bảng 3, 4)
 * @param {string} key - Giá trị khóa (Tên Supplier hoặc Tên Type)
 * @param {string} filterType - Loại lọc ('staff' hoặc 'type')
 */
function handleAggClick(key, filterType) {
  // 1. CHỈNH SỬA: Đổi nguồn dữ liệu sang Object.values(APP_DATA.booking_details)
  if (!APP_DATA.booking_details) APP_DATA.booking_details = {};
  const source = Object.values(APP_DATA.booking_details).slice();

  // 2. CHUẨN BỊ DỮ LIỆU TRA CỨU (Lookup Map)
  // Mục đích: Tạo bảng nối nhanh giữa ID Booking và Tên Staff để không phải loop qua bookings nhiều lần
  const staffMap = new Map();

  if (filterType === 'staff') {
    const bookings = Object.values(APP_DATA.bookings).slice();
    bookings.forEach((mRow) => {
      const mId = mRow[COL_INDEX.M_ID]; // ID trong Bookings
      const mStaff = mRow[COL_INDEX.M_STAFF]; // Tên Staff
      // Lưu vào Map: Key là ID (chuyển về string cho chắc chắn), Value là Staff
      staffMap.set(String(mId), mStaff);
    });
  }

  // 3. Lọc dữ liệu
  const dFrom = new Date(getVal('dash-filter-from'));
  dFrom.setHours(0, 0, 0, 0);
  const dTo = new Date(getVal('dash-filter-to'));
  dTo.setHours(23, 59, 59, 999);

  const batchData = source.filter((row) => {
    // A. Check Ngày (Check-in) - Giữ nguyên
    const dIn = row[COL_INDEX.D_IN] ? new Date(row[COL_INDEX.D_IN]) : null;
    if (!dIn || dIn < dFrom || dIn > dTo) return false;

    // B. Check Key theo Staff (Logic Mới)
    if (filterType === 'staff') {
      // Lấy ID booking từ dòng chi tiết hiện tại
      const bkId = row[COL_INDEX.D_BKID];

      // Tìm tên Staff tương ứng từ Map đã tạo ở trên
      // Nếu không tìm thấy trong Map (booking cũ/lỗi data), coi như rỗng
      let staffName = staffMap.get(String(bkId));

      // Xử lý dữ liệu null/undefined để so sánh chính xác với key
      if (staffName === undefined || staffName === null) staffName = '';

      // So sánh
      return String(staffName) === String(key);
    }

    // (Giữ lại logic cũ cho supplier/type nếu bạn vẫn dùng, nếu không có thể xóa đoạn else if này)
    else if (filterType === 'supplier') {
      let v = row[COL_INDEX.D_SUPPLIER];
      if (!v || String(v).trim() === '') v = '(Chưa gán NCC)';
      return String(v) === String(key);
    } else if (filterType === 'type') {
      let t = row[COL_INDEX.D_TYPE] || 'Khác';
      return String(t) === String(key);
    }

    return false;
  });

  if (batchData.length === 0) {
    // logA là hàm thông báo (giả định)
    if (typeof logA === 'function') {
      logA('Không có dữ liệu chi tiết trong khoảng thời gian này.', 'warning');
    } else {
      console.warn('Không có dữ liệu chi tiết trong khoảng thời gian này.');
    }
    return;
  }

  // 4. Mở giao diện Edit
  openBatchEdit(batchData, key);
}

/**
 * MODULE: CONFIRMATION RENDERER
 * Nhiệm vụ: Xử lý logic hiển thị mẫu xác nhận, in ấn và đa ngôn ngữ.
 */
const ConfirmationModule = (function () {
  // 1. CONFIG & STATE
  let _currentData = null; // Dữ liệu Booking đang xem
  let _lang = 'vi'; // Ngôn ngữ hiện tại
  let _mode = 'service'; // Chế độ xem: 'service' (chi tiết) hoặc 'tour' (rút gọn)
  let _showPrice = true; // Cờ hiển thị giá

  // Từ điển ngôn ngữ
  const DICT = {
    vi: {
      title: 'XÁC NHẬN ĐẶT DỊCH VỤ',
      ref: 'Mã Booking:',
      confirm_date: 'Ngày xác nhận:',
      cust_info: 'THÔNG TIN KHÁCH HÀNG',
      cust_name: 'Khách hàng:',
      cust_email: 'Email:',
      cust_phone: 'Điện thoại:',
      cust_add: 'Địa chỉ:',
      adult: 'Người lớn:',
      child: 'Trẻ em:',
      svc_details: 'CHI TIẾT DỊCH VỤ',
      col_desc: 'Dịch vụ / Diễn giải',
      col_date: 'Ngày sử dụng',
      col_out: 'Ngày về',
      col_qty: 'SL',
      col_price: 'Đơn giá',
      col_total: 'Thành tiền',
      note: 'GHI CHÚ:',
      lbl_total: 'TỔNG CỘNG:',
      lbl_paid: 'ĐÃ THANH TOÁN:',
      lbl_due: 'CÒN LẠI:',
      sign_cust: 'KHÁCH HÀNG',
      sign_comp: 'CÔNG TY TNHH 9 TRIP PHÚ QUỐC',
      signature: '(Ký tên)',
      sign_status: '(Đã xác nhận)',
    },
    en: {
      title: 'SERVICE CONFIRMATION',
      ref: 'Booking ID:',
      confirm_date: 'Date:',
      cust_info: 'CUSTOMER INFORMATION',
      cust_name: 'Customer:',
      cust_email: 'Email:',
      cust_phone: 'Phone:',
      cust_add: 'Address:',
      adult: 'Adults:',
      child: 'Children:',
      svc_details: 'SERVICE DETAILS',
      col_desc: 'Service Name',
      col_date: 'Check-In',
      col_out: 'Check-Out',
      col_qty: 'Qty',
      col_price: 'Price',
      col_total: 'Amount',
      note: 'NOTES / POLICY:',
      lbl_total: 'TOTAL AMOUNT:',
      lbl_paid: 'DEPOSIT / PAID:',
      lbl_due: 'BALANCE DUE:',
      sign_cust: 'CUSTOMER',
      sign_comp: '9 TRIP PHU QUOC CO., LTD',
      signature: '(Signature)',
      sign_status: '(Confirmed)',
    },
  };

  // 2. CORE FUNCTIONS

  // Hàm mở Modal (Entry Point)
  async function openModal(bookingId) {
    if (!bookingId) return logA('Không có mã Booking!', 'warning');

    try {
      // Gọi API lấy dữ liệu chi tiết
      // Sử dụng lại searchBookingAPI của Server để đảm bảo nhất quán
      const res = findBookingInLocal(bookingId);

      if (res && res.success) {
        _currentData = res;
        const formEl = getE('tmpl-confirmation-modal');
        const form = formEl.content.cloneNode(true);
        if (formEl) {
          A.Modal.render(form, `Xác nhận dịch vụ New - Booking ID: ${bookingId}`);
          await _renderUI();
          A.Modal.show();
        }
      } else {
        logA(`Không tìm thấy Booking ID: ${bookingId}`, 'error');
      }
    } catch (e) {
      logError(e);
      logA(`Lỗi: ${e.message}`, 'error');
    }
  }

  // Hàm render giao diện chính
  async function _renderUI() {
    // 1. Load Template
    // A.UI.renderTemplate('dynamic-modal-body', 'tmpl-confirmation-modal', true);

    // 2. Điền dữ liệu Header & Customer
    const m = _currentData.bookings; // [ID, Date, Email, CID, Name, Phone, Start...]
    const c = _currentData.customer; // Thông tin full khách hàng (nếu có)

    setVal('conf-id', m.id || m[0]); // ID Booking
    setVal('conf-date', typeof formatDateVN === 'function' ? formatDateVN(m.created_at) : m[1]); // Ngày đặt
    setVal('print-time', new Date().toLocaleString());
    setVal('conf-cust-adult', m.adults || m[COL_INDEX.M_ADULT]); // Số người lớn
    setVal('conf-cust-child', m.children || m[COL_INDEX.M_CHILD]); // Số trẻ em
    setVal('conf-cust-name', m.customer_full_name || c[1]);
    setVal('conf-cust-phone', m.customer_phone || c[6]);
    setVal('conf-cust-email', c && c.email ? c.email : ''); // Email từ bảng Customer
    setVal('conf-cust-add', c && c.address ? c.address : ''); // Địa chỉ
    setVal('conf-staff', 'Sales Executive'); // Nhân viên

    // 3. Điền bảng dữ liệu (Table)
    await _renderTable();

    // 4. Điền Tổng tiền
    setVal('conf-total', formatMoney(m.total_amount * 1000));
    setVal('conf-paid', formatMoney(m.deposit_amount * 1000));
    setVal('conf-balance', formatMoney(m.balance_amount * 1000));

    // Cập nhật ngôn ngữ và mode
    _applySettings();
    A.UI.renderTemplate('body', 'tmpl-download-pdf');
  }

  // Hàm render bảng chi tiết (Xử lý 2 chế độ: Service & Tour)
  async function _renderTable() {
    const booking_details = _currentData.booking_details || [];
    const tbodySvc = document.getElementById('conf-tbody-service');
    const tbodyTour = document.getElementById('conf-tbody-tour');

    // Reset
    tbodySvc.innerHTML = '';
    tbodyTour.innerHTML = '';

    // ============================================================
    // MODE 1: SERVICE LIST (Chi tiết - Giữ nguyên logic của bạn)
    // ============================================================
    booking_details.forEach((d, i) => {
      // Xử lý cả array và object format
      let serviceName = '';
      let location = '';
      let checkIn = '';
      let checkOut = '';
      let price = 0;
      let total = 0;
      let note = '';

      if (typeof d === 'object' && !Array.isArray(d)) {
        // Object format
        serviceName = d.name || d.service_name || '';
        location = d.location || d.hotel_name || '';
        checkIn = d.in || d.check_in || '';
        checkOut = d.out || d.check_out || '';
        price = Number(d.unit_price || d.price || 0);
        total = Number(d.total || d.total_amount || 0);
        note = d.note || '';
      } else if (Array.isArray(d)) {
        // Array format (legacy)
        serviceName = d[4] || '';
        location = d[3] || '';
        checkIn = d[5] || '';
        checkOut = d[6] || '';
        price = Number(d[9] || 0);
        total = Number(d[14] || 0);
        note = d[16] || '';
      }

      const rowHtml = `
                  <tr>
                    <td class="text-center">${i + 1}</td>
                    <td>
                    <div class="fw-bold">${serviceName}</div>
                    <div class="text-muted fst-italic small">${location}${note ? ' (' + note + ')' : ''}</div>
                    </td>
                    <td class="text-center">${checkIn ? formatDateVN(checkIn) : ''}</td>
                    <td class="text-center">${checkOut ? formatDateVN(checkOut) : ''}</td>
                    <td class="text-end col-price">${formatMoney(price * 1000)}</td>
                    <td class="text-end fw-bold col-price">${formatMoney(total * 1000)}</td>
                  </tr>
                  `;
      tbodySvc.insertAdjacentHTML('beforeend', rowHtml);
    }); // ============================================================
    // MODE 2: TOUR / COMBO (Logic Mới: Dựa trên Stats)
    // ============================================================

    // Lưu ý: _currentData phải có field adults/children. Nếu không có thì lấy từ giao diện.
    const qtyAdult = parseInt(_currentData.bookings[COL_INDEX.M_ADULT]) || getVal('BK_Adult') || 0;
    const qtyChild = parseInt(_currentData.bookings[COL_INDEX.M_CHILD]) || getVal('BK_Child') || 0;
    const priceTourA = getNum(getVal('Stats_AvgAdult')) * 1000; // Giá Tour/Combo NL
    const priceTourC = getNum(getVal('Stats_AvgChild')) * 1000; // Giá Tour/Combo TE
    const priceTransA = getNum(getVal('Stats_TransportAdult')) * 1000; // Giá Vận chuyển NL
    const priceTransC = getNum(getVal('Stats_TransportChild')) * 1000; // Giá Vận chuyển TE

    // 3. Xác định tên loại vận chuyển (Máy bay hay Tàu?)
    // Quét nhẹ qua list detail để xem có từ khóa nào
    let transName = 'Vé vận chuyển';
    const hasFlight = booking_details.some(
      (d) =>
        String(d.service_type).toLowerCase().includes('vé mb') ||
        String(d.service_name).toLowerCase().includes('bay')
    );
    const hasTrain = booking_details.some(
      (d) =>
        String(d.service_type).toLowerCase().includes('vé tàu') ||
        String(d.service_name).toLowerCase().includes('tàu')
    );

    if (hasFlight && !hasTrain) transName = 'Vé máy bay';
    else if (!hasFlight && hasTrain) transName = 'Vé tàu cao tốc';
    else if (hasFlight && hasTrain) transName = 'Vé máy bay & Tàu cao tốc';

    // 4. Tạo mảng các dòng hiển thị
    let tourRows = [];

    // --- Dòng 1: Tour/Combo Người lớn ---
    if (qtyAdult > 0 && priceTourA > 0) {
      tourRows.push({
        name: `Người lớn`,
        qty: qtyAdult,
        price: priceTourA,
        total: qtyAdult * priceTourA,
      });
    }

    // --- Dòng 2: Tour/Combo Trẻ em ---
    if (qtyChild > 0 && priceTourC > 0) {
      tourRows.push({
        name: `Trẻ em`,
        qty: qtyChild,
        price: priceTourC,
        total: qtyChild * priceTourC,
      });
    }

    // --- Dòng 3: Vé vận chuyển Người lớn ---
    if (qtyAdult > 0 && priceTransA > 0) {
      tourRows.push({
        name: `${transName} (Người lớn)`,
        qty: qtyAdult,
        price: priceTransA,
        total: qtyAdult * priceTransA,
      });
    }

    // --- Dòng 4: Vé vận chuyển Trẻ em ---
    if (qtyChild > 0 && priceTransC > 0) {
      tourRows.push({
        name: `${transName} (Trẻ em)`,
        qty: qtyChild,
        price: priceTransC,
        total: qtyChild * priceTransC,
      });
    }
    // 5. Render ra HTML
    // Xóa nội dung cũ
    tbodyTour.innerHTML = '';

    const MIN_ROWS = 5;
    const dataCount = tourRows.length;

    // Bước A: Render dữ liệu thật (nếu có)
    tourRows.forEach((r) => {
      const html = `
                <tr>
                  <td><span class="fw-bold">${r.name}</span></td>
                  <td class="text-center">${r.qty}</td>
                  <td class="text-end col-price">${formatMoney(r.price)}</td>
                  <td class="text-end fw-bold col-price">${formatMoney(r.total)}</td>
                </tr>`;
      tbodyTour.insertAdjacentHTML('beforeend', html);
    });

    // Bước B: Render dòng trống cho đủ 5 dòng
    // Vòng lặp chạy từ số lượng hiện tại đến 5
    for (let i = dataCount; i < MIN_ROWS; i++) {
      let rowContent = '';

      // Tùy chọn: Nếu hoàn toàn không có dữ liệu (i=0), dòng đầu tiên hiện thông báo
      if (i === 0 && dataCount === 0) {
        rowContent = `<td colspan="4" class="text-center text-muted fst-italic">Chưa có dữ liệu tính giá</td>`;
      } else {
        // Các dòng còn lại để trống (dùng &nbsp; để giữ chiều cao dòng không bị xẹp)
        rowContent = `
                      <td><span class="fw-bold">&nbsp;</span></td>
                      <td class="text-center"></td>
                      <td class="text-end col-price"></td>
                      <td class="text-end fw-bold col-price"></td>                      
                  `;
      }

      tbodyTour.insertAdjacentHTML('beforeend', `<tr>${rowContent}</tr>`);
    }
  }

  // 3. ACTIONS & HELPERS

  function setLang(lang) {
    _lang = lang;
    document.getElementById('btn-lang-vn').classList.toggle('active', lang === 'vi');
    document.getElementById('btn-lang-en').classList.toggle('active', lang === 'en');
    _applySettings();
  }

  function togglePrice() {
    const chk = document.getElementById('btn-check-price');
    _showPrice = chk ? chk.checked : true;
    _applySettings();
  }

  function setMode(mode) {
    _mode = mode;
    if (mode === 'service') {
      document.getElementById('tbl-mode-service').classList.remove('d-none');
      document.getElementById('tbl-mode-tour').classList.add('d-none');
    } else {
      document.getElementById('tbl-mode-service').classList.add('d-none');
      document.getElementById('tbl-mode-tour').classList.remove('d-none');
    }
  }
  /**
   * Helper: Lấy HTML sạch để gửi email
   * - Xóa các phần tử ẩn
   * - Inline CSS cho các cột Grid
   */
  function _applySettings() {
    // 1. Translate
    const dict = DICT[_lang];
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.dataset.i18n;
      if (dict[key]) el.textContent = dict[key];
    });

    // 2. Toggle Price Column
    document.querySelectorAll('.col-price').forEach((el) => {
      el.style.display = _showPrice ? '' : 'none';
    });
  }

  async function exportPDF() {
    await loadLibraryAsync('html2pdf');
    const btnExport = event.currentTarget;
    const oldText = btnExport.innerHTML;
    btnExport.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Đang xử lý...';
    btnExport.disabled = true;

    // Lấy vùng in
    const element = document.getElementById('print-area');

    // --- BƯỚC QUAN TRỌNG: KÍCH HOẠT CHẾ ĐỘ COMPACT ---
    // Thêm class để CSS ở trên có tác dụng (thu nhỏ chữ, giảm lề)
    element.classList.add('pdf-compact-mode');

    // Tên file
    const bookingId =
      typeof _currentData !== 'undefined' && _currentData.bookings
        ? _currentData.bookings[0]
        : 'Booking';
    const fileName = `Booking_${bookingId}.pdf`;

    const opt = {
      margin: [5, 5, 5, 5], // Lề cực nhỏ: 5mm
      filename: fileName,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true, // Vẫn giữ, nhưng khuyến khích dùng Base64 cho Logo
        scrollY: 0,
        logging: false,
      },
      jsPDF: {
        unit: 'mm',
        format: 'a4',
        orientation: 'landscape',
      },
      // Tắt ngắt trang tự động để ép dồn (hoặc dùng avoid-all nếu muốn đẹp)
      // Ở đây ta đã thu nhỏ nội dung nên khả năng cao sẽ vừa 1 trang
      pagebreak: { mode: ['css', 'legacy'] },
    };

    try {
      await html2pdf().set(opt).from(element).save();
    } catch (e) {
      console.error(e);
      logA('Lỗi: ' + e.message, 'error', 'alert');
    } finally {
      // --- HOÀN TÁC: TRẢ LẠI GIAO DIỆN CŨ ---
      // Gỡ class compact để trên màn hình web nhìn vẫn to rõ
      element.classList.remove('pdf-compact-mode');

      btnExport.innerHTML = oldText;
      btnExport.disabled = false;
    }
  }

  async function sendEmail() {
    const email =
      document.getElementById('conf-cust-email').textContent || '9tripphuquoc@gmail.com';
    if (!email || email.length < 5) return logA('Booking này chưa có Email khách hàng.', 'warning');

    const subject = `[9 TRIP] XÁC NHẬN ĐẶT DỊCH VỤ - CODE ${document.getElementById('conf-id').textContent}`;
    var data = getFormData();
    data.type = _mode;
    data.showPrice = _showPrice;
    const statVals = {
      avgA: getNum(getVal('Stats_AvgAdult')),
      avgC: getNum(getVal('Stats_AvgChild')),
      transA: getNum(getVal('Stats_TransportAdult')),
      transC: getNum(getVal('Stats_TransportChild')),
    };
    data.stats = statVals;

    // Gọi Server
    const res = await requestAPI('sendConfirmationEmailAPI', email, subject, data);
    if (res) logA('Đã gửi email!', 'success');
  }

  // Public Methods
  return {
    openModal,
    setLang,
    togglePrice,
    setMode,
    exportPDF,
    sendEmail,
  };
})();

// Gán sự kiện cho nút "Tạo Hợp Đồng" (hoặc tạo nút mới "Xác nhận")
function createConfirmation(bkId) {
  if (!bkId) bkId = getVal('BK_ID');
  if (!bkId) return logA('Vui lòng chọn Booking trước.', 'warning');
  ConfirmationModule.openModal(bkId);
}

async function saveForm() {
  try {
    setBtnLoading('btn-save-form', true, 'Saving...');
    await saveCustomer();
    var data = await getFormData(true);
    const { bookings, booking_details, customer } = data;
    const bookingId = bookings.id;
    // Validate đủ thông tin khách hàng trước khi lưu
    const missingFields = [];
    if (!bookings.customer_id) missingFields.push('customer_id');
    if (!bookings.customer_full_name) missingFields.push('customer_name');
    if (!bookings.customer_phone) missingFields.push('customer_phone');
    if (missingFields.length > 0) {
      const msg = `Thiếu thông tin khách hàng: ${missingFields.join(', ')}`;
      logA(msg, 'error');
      return { success: false, message: msg };
    }

    // Kiểm tra xem có dữ liệu cần lưu không (ngoài field 'id')
    const hasBookingChanges = Object.keys(bookings || {}).filter((k) => k !== 'id').length > 0;

    const hasDetails = Array.isArray(booking_details) && booking_details.length > 0;

    if (!hasBookingChanges && !hasDetails) {
      logA('Không có dữ liệu thay đổi để lưu.', 'warning');
      return;
    }

    try {
      // =========================================================================
      // LƯU BOOKINGS (bỏ qua nếu chỉ chứa field 'id')
      // =========================================================================
      let newBk = null;
      if (hasBookingChanges) {
        // Truyền thẳng object để saveRecord giữ đúng field 'id' (không qua array conversion)
        newBk = await A.DB.saveRecord('bookings', bookings);
        if (newBk && !bookingId) {
          A.NotificationManager.sendToAll(
            'NEW BOOKING',
            `Booking mới đã được tạo với ID: ${newBk.id} - ${newBk.staff_id}`
          );
        }
      }

      // =========================================================================
      // CẬP NHẬT BOOKING_ID CHO TẤT CẢ BOOKING_DETAILS NẾU CHƯA CÓ GIÁ TRỊ
      // =========================================================================
      if (hasDetails) {
        const resolvedBkId = newBk?.id ?? bookings.id;
        const updatedDetails = booking_details.map((detail) => {
          if (!detail.booking_id) {
            detail.booking_id = resolvedBkId;
          }
          return detail;
        });

        var details = updatedDetails.map((d) => Object.values(d));
        await A.DB.batchSave('booking_details', details);
      }
      if (window.StateProxy) StateProxy.commitSession(); // advance baseline, flush history
      const btnDashUpdate = getE('btn-dash-update');
      if (btnDashUpdate) {
        A.Event.trigger(btnDashUpdate, 'click');
      }

      const btnSelectDatalist = getE('btn-select-datalist');
      if (btnSelectDatalist) {
        btnSelectDatalist.dispatchEvent(new Event('change'));
      }
      logA('Lưu dữ liệu thành công!', true);
    } catch (e) {
      if (window.StateProxy) StateProxy.rollbackSession(); // revert to baseline
      logError(e);
      return;
    }
  } catch (e) {
    logError('Lỗi hàm try: ', e);
  } finally {
    setBtnLoading('btn-save-form', false);
  }
}
// =========================================================================
// DELETE / CANCEL BOOKING HANDLER
// =========================================================================
async function deleteForm() {
  // 1. Lấy ID Booking hiện tại
  const bkId = getE('BK_ID')?.value;
  const currentStatus = getE('BK_Status')?.value;
  // 2. Validation cơ bản
  if (!bkId) {
    logA('Vui lòng chọn một Booking để thực hiện thao tác này!');
    return;
  }
  if (currentStatus === 'Hủy') {
    logA('Booking này đã bị hủy trước đó rồi!');
    return;
  }

  // 4. Gọi Server xử lý
  logA(`Đang yêu cầu hủy Booking: ${bkId}...`);
  showLoading(true);
  const res = await requestAPI('cancelBookingHandler', bkId);
  if (res) {
    loadDataFromFirebase();
    // B. Cập nhật giao diện ngay lập tức (Phản hồi tức thì)
    // Không cần load lại form, chỉ cần đổi trạng thái để user thấy
    const elStatus = getE('BK_Status');
    const elTotal = getE('BK_Total');
    const elBalance = getE('BK_Balance');
    const elNote = getE('BK_Note');
    if (elStatus) {
      elStatus.value = 'Hủy';
      elStatus.className =
        'form-control form-control-sm fw-bold text-danger bg-danger bg-opacity-10'; // Đổi màu đỏ
    }
    // Backend đã reset tiền về 0, Frontend cũng nên hiện về 0
    if (elTotal) elTotal.value = '0';
    if (elBalance) elBalance.value = '0'; // Giả định hủy là hoàn cọc hoặc mất cọc tùy nghiệp vụ, ở đây về 0 theo logic backend
    // C. Ghi chú thêm vào Note (Optional)
    if (elNote) {
      const time = new Date().toLocaleTimeString('vi-VN');
      elNote.value = `[Hủy lúc ${time}] ` + elNote.value;
    }
  }
}

async function saveCustomer() {
  try {
    const data = window.getCustomerData(true);

    // Nếu data chưa có id, thử tra cứu trong APP_DATA theo phone
    if (!data.id && data.phone && APP_DATA?.customers) {
      const found = Object.values(APP_DATA.customers).find((c) => {
        if (!c) return false;
        const phone = c.phone || c.customer_phone || '';
        return phone === data.phone;
      });
      if (found?.id) {
        data.id = found.id;
        setVal('Cust_Id', found.id);
      }
    }

    // Lưu vào Firebase
    showLoading(true, 'Đang lưu thông tin khách hàng...');

    const res = await A.DB.saveRecord('customers', data);

    if (res && res.id) {
      const oldId = getE('Cust_Id')?.value;
      if (!oldId || oldId != res.id) {
        logA('New Customer ID: ' + res.id, 'success');
        const bkCustIdEl = getE('Cust_Id');
        if (bkCustIdEl) {
          setVal(bkCustIdEl, res.id);
        }
      }
    } else {
      logA('Lỗi khi lưu khách hàng: ' + (res?.message || 'Vui lòng thử lại'), 'error');
    }
  } catch (e) {
    logError(e);
    logA('Lỗi: ' + e.message, 'error');
  } finally {
    showLoading(false);
  }
}

// =========================================================================
// HELPER: Tính tổng chi tiêu của khách hàng (từ các booking không bị hủy)
// =========================================================================
/**
 * Tính tổng chi tiêu của khách hàng từ tất cả booking không bị hủy.
 *
 * @param {string} custId - ID của khách hàng cần kiểm tra
 * @returns {number} - Tổng giá trị (total) của các booking, trả về 0 nếu không có
 *
 * @example
 * const spend = loadCustSpend('CUST_001'); // Returns 2500000
 */
function loadCustSpend(custId) {
  if (!custId)
    custId = $("[data-field='customer_id']", getE('main-form'))?.value || getVal('Cust_Id');

  const bookings = window.Object.values(APP_DATA.bookings) || [];
  let totalSpend = 0;

  bookings.forEach((booking) => {
    if (booking && booking.customer_id === custId && booking.status !== 'Hủy') {
      const total = booking.total_amount || 0;
      // Xử lý cả string (formatted) và number
      const numValue = typeof total === 'string' ? getRawVal(total) : Number(total);
      totalSpend += numValue;
    }
  });
  setVal('Cust_Total', totalSpend);

  return totalSpend;
}

// =========================================================================
// EXPORT FORM HANDLER
async function createContract() {
  try {
    // 1. Kiểm tra dữ liệu cơ bản
    if (typeof getFormData !== 'function') return;

    const { bookings, customer, booking_details } = await getFormData();

    // 2. Lấy dữ liệu mở rộng từ Tab Customer
    let extendedCust = null;

    if (typeof getCustomerData === 'function') {
      extendedCust = getCustomerData();
    }

    // Guard: nếu không lấy được dữ liệu khách hàng, không thể tạo hợp đồng
    if (!extendedCust) {
      logA(
        'Vui lòng điền đầy đủ thông tin khách hàng (Tên, SĐT) trước khi tạo hợp đồng!',
        'warning'
      );
      return;
    }

    // 3. Xác định Tab hiện tại
    // Tìm nút Tab đang có class 'active' để biết người dùng đang đứng ở đâu
    const activeTabEl = document.querySelector('#mainTabs button.nav-link.active');
    const activeTarget = activeTabEl ? activeTabEl.getAttribute('data-bs-target') : '';

    const payload = {
      bookings: bookings,
      booking_details: booking_details,
      customer: extendedCust,
    };
    setBtnLoading('btn-create-contract', true, 'Creating...');
    // showLoading(true);
    const res = await requestAPI('createBookingContract', payload);
    if (res) {
      // HTML nội dung (Giữ nguyên logic cũ của bạn)
      const htmlContent =
        `
            <div class="text-center p-2">
              <div class="mb-3 text-success"><i class="fa-solid ${res.docUrl ? 'fa-circle-check' : 'fa-circle-exclamation'} fa-3x"></i></div>
              <h5 class="fw-bold text-success">${res.message ? res.message : 'Có lỗi xảy ra'}</h5>
            ` +
        (res.docUrl
          ? `
              <p class="small text-muted">File đã lưu vào Drive.</p>
              <div class="d-grid gap-2 col-10 mx-auto mt-4">
                  <a href="${res.docUrl}" target="_blank" class="btn btn-primary">
                    <i class="fa-solid fa-file-word"></i> Mở Hợp Đồng
                  </a>
                  <a href="${res.pdfUrl}" target="_blank" class="btn btn-outline-danger">
                    <i class="fa-solid fa-file-pdf"></i> Tải PDF
                  </a>
                  <hr class="my-2">
                  <button class="btn btn-sm btn-link text-secondary text-decoration-none"
                          onclick="requestDeleteFile('${res.docId}')">
                    <i class="fa-solid fa-trash"></i> Xóa file này
                  </button>
              </div>
              `
          : `
            </div>
          `);
      // GỌI HÀM MỚI TẠI ĐÂY:
      logA(htmlContent, 'success', 'alert');
    } else {
      logA('Lỗi: ' + (res?.message || 'Không thể tạo hợp đồng. Vui lòng thử lại.'), 'error');
    }
    setBtnLoading('btn-create-contract', false);
  } catch (e) {
    logError('Catch Lỗi: ' + e.message, e);
  } finally {
    setBtnLoading('btn-create-contract', false);
  }
}
// Hàm xử lý xóa file (Nằm riêng ở client)
async function requestDeleteFile(fileId) {
  showConfirm('Bạn chắc chắn muốn xóa file hợp đồng vừa tạo khỏi Google Drive?', async () => {
    // Đổi nút bấm thành đang xóa...
    showLoading(true);
    const res = await requestAPI('deleteGeneratedFile', fileId);

    showLoading(false);
    if (res) {
      logA(res.message || 'Done', 'success');
      closeSubModal(); // Đóng modal sau khi xóa
    } else {
      logA('Lỗi: ' + (res?.message || 'Không thể xóa file. Vui lòng thử lại.'), 'error');
    }
  });
}
// =========================================================================
// 6. TEMPLATE LOGIC (NEW)
// =========================================================================
/**
 * Action: Lưu Template hiện tại
 */
async function saveCurrentTemplate() {
  log('run saveCurrentTemplate');
  const tempName = getVal('BK_TourName');
  const newDate = getVal('BK_Start');
  try {
    if (!tempName) {
      logA('Vui lòng nhập Tên Tour trước khi lưu Template.');
      return;
    }
    if (!newDate) {
      logA('Vui lòng chọn Ngày Đi để làm mốc thời gian.');
      return;
    }

    // 3. Details Data
    var booking_details = [];
    document.querySelectorAll('#detail-tbody tr').forEach((tr) => {
      const getRowVal = (cls) => tr.querySelector('.' + cls)?.value || '';
      const getRowRaw = (cls) => tr.querySelector('.' + cls)?.dataset.val || getRowVal(cls); // Ưu tiên lấy raw data nếu có
      booking_details.push({
        sid: tr.querySelector('.d-sid').value,
        type: getRowVal('d-type'),
        location: getRowVal('d-loc'),
        name: getRowVal('d-name'),
        in: getRowVal('d-in'),
        out: getRowVal('d-out'),
        night: getRowVal('d-night'),
        qtyA: getRowVal('d-qty'),
        priA: getRowVal('d-pri'),
        qtyC: getRowVal('d-qtyC'),
        priC: getRowVal('d-priC'),
        sur: getRowVal('d-sur'),
        disc: getRowVal('d-disc'),
        total: tr.querySelector('.d-total').dataset.val || 0,
        code: getRowVal('d-code'),
        note: getRowVal('d-note'),
      });
    });

    if (booking_details.length === 0) {
      logA('Bảng chi tiết đang trống. Không có gì để lưu!');
      return;
    }

    // if (!confirm(`Bạn muốn lưu chi tiết hiện tại thành Template cho tour: "${tempName}"?\n(Dữ liệu cũ của template này sẽ bị ghi đè)`)) return;

    showLoading(true, 'Đang lưu Template...');
  } catch (e) {
    logError(e?.message ?? String(e), e);
  }

  try {
    const res = await requestAPI('saveBookingTemplateAPI', tempName, booking_details, newDate);
    logA(res?.message ?? 'Đã lưu.', 'success');
  } catch (err) {
    logError(err?.message ?? String(err), err);
  } finally {
    showLoading(false);
  }
}

/**
 * Action: Trigger khi đổi tên Tour -> Hỏi load Template
 */
async function checkAndLoadTemplate() {
  try {
    const tempName = getVal('BK_TourName');
    if (!tempName) {
      logA('Lỗi Tour Name');
      return;
    }

    const template = await requestAPI('getBookingTemplateAPI', tempName);

    if (!template) {
      log('Server trả về null/undefined', 'error');
      return;
    }

    if (template && template.found) {
      askToLoadTemplate(template, tempName);
    } else {
      logA(template.message || 'Không có template', 'info');
    }
  } catch (e) {
    logError(e?.message ?? String(e), e);
  }
}

function askToLoadTemplate(res, tempName) {
  try {
    const msg = `Hệ thống tìm thấy Template mẫu cho tour "${tempName}".\nBạn có muốn tải dữ liệu mẫu vào không?`;
    // Sử dụng Confirm chuẩn hoặc Custom Overlay. Ở đây dùng confirm cho nhanh gọn
    if (confirm(msg)) {
      // 1. Kiểm tra điều kiện đầu vào bắt buộc
      const startDate = getE('BK_Start').value;
      const endDate = getE('BK_End').value;
      const adult = getE('BK_Adult').value;
      if (!startDate || !endDate || !adult) {
        logA(
          'Vui lòng điền đầy đủ: Ngày Đi, Ngày Về và Số người lớn trước khi load Template!',
          'warning'
        );
        // Focus vào ô còn thiếu
        if (!startDate) getE('BK_Start').focus();
        else if (!endDate) getE('BK_End').focus();
        else getE('BK_Adult').focus();
        return;
      }
      // 2. Tiến hành Load và Transform dữ liệu
      processAndFillTemplate(res.booking_details, res.anchorDate, startDate, adult);
    }
  } catch (e) {
    logError(e?.message ?? String(e), e);
  }
}
/**
 * 2. XỬ LÝ LƯU KHÁCH HÀNG (Gọi Server)
 */
window.handleSaveCustomer = async function () {
  try {
    const data = window.getCustomerData();

    // Validate Front-end
    if (!data.full_name || !data.phone) {
      logA('Vui lòng nhập Tên và Số điện thoại!');
      return;
    }
    showLoading(true, 'Đang lưu thông tin khách hàng...');

    const res = await A.DB.saveRecord('customers', data);
    if (res) {
      const newCust = res.customer;

      setVal('Cust_Name', newCust.full_name);
      setVal('Cust_Phone', newCust.phone);
      setVal('Cust_Source', newCust.source);

      // 3. Chuyển người dùng về lại Tab Booking để làm việc tiếp
      const tab1Btn = document.querySelector('button[data-bs-target="#tab-form"]');
      if (tab1Btn) bootstrap.Tab.getOrCreateInstance(tab1Btn).show();
    }
  } catch (e) {
    logError(e?.message ?? String(e), e);
  } finally {
    showLoading(false);
  }
};

/**
 * 2. Gửi dữ liệu về Server (Full Row)
 */
async function saveBatchDetails() {
  // --- HELPER 1: Lấy Text an toàn (Giữ nguyên logic của bạn) ---
  const getValSafe = (id) => {
    const el = document.getElementById(id);
    if (!el) {
      console.warn(`⚠️ Cảnh báo: Không tìm thấy ID HTML: "${id}"`);
      return '';
    }
    return el.value.trim(); // Thêm trim() để cắt khoảng trắng thừa
  };

  // --- HELPER 2: Lấy Số an toàn (FIX LỖI 1.000 -> 1 TẠI ĐÂY) ---
  // Hàm này sẽ ưu tiên lấy dataset.val, nếu không có thì lọc sạch dấu chấm phẩy
  const getNumSafe = (idOrEl) => {
    let el = idOrEl;
    // Nếu truyền vào là ID string thì tìm element
    if (typeof idOrEl === 'string') {
      el = document.getElementById(idOrEl);
    }

    if (!el) return 0;

    // Ưu tiên 1: Lấy từ dataset (SSOT) nếu đã lưu chuẩn
    if (el.dataset && el.dataset.val !== undefined && el.dataset.val !== '') {
      return Number(el.dataset.val);
    }

    // Ưu tiên 2: Parse từ value hiển thị (Quan trọng nhất bước này)
    // Regex: /[^0-9-]/g -> Xóa TẤT CẢ ký tự KHÔNG phải là số hoặc dấu trừ
    // Ví dụ: "1.200.000" -> "1200000"
    const cleanStr = String(el.value).replace(/[^0-9-]/g, '');
    return Number(cleanStr) || 0;
  };

  // 3. Details
  const booking_details = [];
  const currentTab = getE('tab-form');
  const rows = currentTab.querySelectorAll('#detail-tbody tr');

  rows.forEach((tr, index) => {
    // Helper cục bộ: Lấy số theo class trong dòng
    const getRowNum = (cls) => {
      const el = tr.querySelector('.' + cls);
      return getNumSafe(el); // Gọi lại hàm chuẩn ở trên
    };

    // Helper cục bộ: Lấy text theo class trong dòng
    const getRowVal = (cls) => {
      const el = tr.querySelector('.' + cls);
      return el ? el.value : '';
    };

    booking_details.push([
      getRowVal('.d-sid').value,
      getRowVal('d-type'),
      getRowVal('d-loc'),
      getRowVal('d-name'),
      getRowVal('d-in'),
      getRowVal('d-out'),
      getRowNum('d-night'),
      getRowNum('d-qty'),
      getRowNum('d-pri'),
      getRowNum('d-qtyC'),
      getRowNum('d-priC'),
      getRowNum('d-sur'),
      getRowNum('d-disc'),
      getRowNum('.d-total'),
      getRowVal('d-code'),
      getRowVal('d-note'),
    ]);
  });

  setBtnLoading('btn-save-batch', true);
  const res = await A.DB.batchSave('booking_details', booking_details);

  setBtnLoading('btn-save-batch', false);
  if (res) {
    logA('Lưu thành công!', 'success');
    // Quan trọng: Load lại data để đồng bộ
    loadDataFromFirebase();
    refreshForm();
    activateTab('tab-form');
  } else {
    logA('Lỗi: ' + res.message, 'error');
  }
}
