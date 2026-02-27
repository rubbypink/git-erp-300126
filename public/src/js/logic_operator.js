// =========================================================================
// LOGIC_OPERATOR.JS - OBJECT-BASED FORMAT (Updated to use object format only)
// Handles operator entries form logic using object field names instead of array indices
// =========================================================================

// =========================================================================
// 1. BIẾN & INIT
// =========================================================================
var detailRowCount = 0;

/**
 * Load booking and operator entries data into the UI form
 * @param {Object} bkData - Booking object with field names (object format)
 * @param {Array<Object>} detailsData - Array of operator entry objects
 */
window.loadBookingToUI = function(bkData, detailsData) {
  if (!bkData) return;
  try {
    log("Loading Booking...:", detailsData);

    // --- HANDLE CUSTOMER SOURCE ---
    let custSource = "";
    
    // Get phone from booking (handle both object and array formats for compatibility)
    const phone = typeof bkData === 'object' && !Array.isArray(bkData) 
      ? bkData.customer_phone 
      : bkData[5];
    
    const phoneStr = phone ? String(phone).replace(/^'/, "").trim() : "";

    // Find customer by phone to get source
    if (phoneStr !== "" && window.APP_DATA) {
      const custRow = Object.values(APP_DATA.customers ?? {}).find(c => 
        c && c.phone && String(c.phone).includes(phoneStr)
      );
      if (custRow) {
        custSource = custRow.source || "";
      }
    }

    if (!getE('main-form')) activateTab('tab-form'); 
    
    // --- POPULATE BOOKING HEADER FIELDS ---
    // Using object format field names directly
    const bookingId = typeof bkData === 'object' && !Array.isArray(bkData) 
      ? bkData.id 
      : bkData[0];
    const createdDate = typeof bkData === 'object' && !Array.isArray(bkData) 
      ? bkData.created_at 
      : bkData[16];
    const custName = typeof bkData === 'object' && !Array.isArray(bkData) 
      ? bkData.customer_full_name 
      : bkData[2];
    const custPhone = typeof bkData === 'object' && !Array.isArray(bkData) 
      ? bkData.customer_phone 
      : bkData[3];
    const startDate = typeof bkData === 'object' && !Array.isArray(bkData) 
      ? bkData.start_date 
      : bkData[4];
    const endDate = typeof bkData === 'object' && !Array.isArray(bkData) 
      ? bkData.end_date 
      : bkData[5];
    const adults = typeof bkData === 'object' && !Array.isArray(bkData) 
      ? bkData.adults 
      : bkData[6];
    const children = typeof bkData === 'object' && !Array.isArray(bkData) 
      ? bkData.children 
      : bkData[7];
    const totalAmount = typeof bkData === 'object' && !Array.isArray(bkData) 
      ? bkData.total_amount 
      : bkData[8];
    const status = typeof bkData === 'object' && !Array.isArray(bkData) 
      ? bkData.status 
      : bkData[15];
    const paymentMethod = typeof bkData === 'object' && !Array.isArray(bkData) 
      ? bkData.payment_method 
      : bkData[11];
    const paymentDueDate = typeof bkData === 'object' && !Array.isArray(bkData) 
      ? bkData.payment_due_date 
      : bkData[12];
    const note = typeof bkData === 'object' && !Array.isArray(bkData) 
      ? bkData.note 
      : bkData[13];
    const staffId = typeof bkData === 'object' && !Array.isArray(bkData) 
      ? bkData.staff_id 
      : bkData[14];

    setVal('BK_ID', bookingId);
    setVal('BK_Date', createdDate);
    setVal('Cust_Phone', custPhone);
    setVal('Cust_Name', custName);
    setVal('Cust_Source', custSource);
    setVal('BK_Start', startDate);
    setVal('BK_End', endDate);
    setVal('BK_Adult', adults);
    setVal('BK_Child', children);
    setVal('BK_Total', totalAmount);
    setVal('BK_Status', status);
    setVal('BK_PayType', paymentMethod);
    setVal('BK_PayDue', paymentDueDate);
    setNum('BK_Total', totalAmount);
    setVal('BK_Note', note);
    setVal('BK_Staff', staffId);

    // --- CLEAR AND LOAD DETAIL ROWS ---
    const tbody = document.getElementById('detail-tbody');
    if(tbody) {
      tbody.innerHTML = '';
      tbody.style.display = 'none'; // Hide temporarily for faster rendering
    }
    
    detailRowCount = 0;

    if (Array.isArray(detailsData)) {
      // Sắp xếp chi tiết theo thứ tự service_type và check_in
      const sortedDetails = sortDetailsData(detailsData);
      sortedDetails.forEach(row => {
          // Gọi hàm thêm dòng
          addDetailRow(row);
      });
    }

    if(tbody) tbody.style.display = 'table-row-group'; // Show again
    
    calcGrandTotal();

    // Switch to form tab
    try {
      const tabTrigger = document.querySelector('#mainTabs button[data-bs-target="#tab-form"]');
      if(tabTrigger) bootstrap.Tab.getOrCreateInstance(tabTrigger).show();
      if(typeof toggleContextUI === 'function') toggleContextUI('tab-form');
    } catch(e) {
      log("Tab switch error: " + e.message, "error");
    }
  } catch (e) {
    log("ERROR in loadBookingToUI: " + e.message, "error");
  }
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

  // Helper: Lấy service_type (hỗ trợ cả array và object format)
  const getServiceType = (row) => {
    if (!row) return '';
    if (typeof row === 'object' && !Array.isArray(row)) {
      return row.service_type || row[COL_INDEX.D_TYPE] || '';
    }
    return row[COL_INDEX.D_TYPE] || '';
  };

  // Helper: Lấy check_in date (hỗ trợ cả array và object format)
  const getCheckInDate = (row) => {
    if (!row) return 0;
    let checkIn = '';
    if (typeof row === 'object' && !Array.isArray(row)) {
      checkIn = row.check_in || row[COL_INDEX.D_IN] || '';
    } else {
      checkIn = row[COL_INDEX.D_IN] || '';
    }
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
 * Called by search form when server returns results
 * @param {Object} res - Server response { success, bookings, operator_entries, ... }
 */
window.fillFormFromSearch = function(res) {
  if (!res || !res.success) {
    showLoading(false);
    logA(res?.message || "No matching data found!");
    log("Search failed: " + (res ? res.message : "No Data"), "warning");
    return;
  }
  
  const bkData = res.bookings;
  const detailsData = res.operator_entries;
  
  if (typeof loadBookingToUI === 'function') {
    loadBookingToUI(bkData, detailsData);
    const sourceMsg = res.source === 'local' ? ' (⚡ Local)' : ' (🐢 Database)';
    const bookingId = typeof bkData === 'object' && !Array.isArray(bkData) 
      ? bkData.id 
      : bkData[0];
    const custName = typeof bkData === 'object' && !Array.isArray(bkData) 
      ? bkData.customer_full_name 
      : bkData[2];
    log(`Loaded Booking: ${bookingId} - ${custName}${sourceMsg}`, "success");
  } else {
    logA("System error: Cannot display data in form.", "error");
  }
  showLoading(false);
}


/**
 * Add a detail row to the operator entries table
 * @param {Object|null} data - Operator entry data object, null for blank row
 */
function addDetailRow(data = null) {
  detailRowCount++;
  const idx = detailRowCount;

  // 1. PREPARE DATA LISTS
  const lists = window.APP_DATA.lists || {};
  
  // Options for service types
  const optsType = (lists.types || []).map(x => `<option value="${x}">${x}</option>`).join('');
  
  // Options for suppliers
  const suppliers = lists.supplier || [];
  const optsSupplier = suppliers.length > 0 
    ? suppliers.map(s => `<option value="${s}">${s}</option>`).join('')
    : `<option value="">(No suppliers)</option>`;

  // 2. BUILD HTML TABLE ROW
  const tr = document.createElement('tr');
  tr.id = `row-${idx}`;
  tr.className = "align-middle";
  tr.innerHTML = `
    <td class="text-center text-muted small">${idx} <input type="hidden" class="d-sid" data-field="id"></td>
    
    <td style="display: none;"><input type="text" class="d-idbk" data-field="booking_id" readonly tabindex="-1"></td>
    <td style="display: none;"><input type="text" class="d-cust" data-field="customer_full_name" readonly tabindex="-1"></td>
    
    
    <td style="width:75px"><select class="form-select form-select-sm d-type text-wrap" data-field="service_type"><option value="">-</option>${optsType}</select></td>
    <td><select class="form-select form-select-sm d-loc text-wrap" data-field="hotel_name" onchange="updateServiceNameList(${idx})"><option value="">---Chọn---</option></select></td>    
    <td><select class="form-select form-select-sm d-name" data-field="service_name"><option value="">-</option></select></td>
    
    <td><input type="date" class="form-control form-control-sm d-in p-1" data-field="check_in" onchange="autoSetOrCalcDate(this.value, $('.d-out', $('#row-${idx}')))" style="cursor:pointer"></td>
    <td><input type="date" class="form-control form-control-sm d-out p-1" data-field="check_out" onchange="calcRow(${idx})"></td>
    <td><input type="number" class="form-control form-control-sm d-night bg-light text-center number-only" data-field="nights" readonly value="1"></td>
    <td><input type="number" class="form-control form-control-sm d-qty text-center fw-bold number-only" data-field="adults" value="1"></td>
    <td><input type="text" class="form-control form-control-sm d-costA fw-bold text-end bg-warning bg-opacity-10 number-only" data-field="cost_adult" placeholder="0"></td>
    <td><input type="number" class="form-control form-control-sm d-qtyC text-center number-only" data-field="children" value="0"></td>
    <td><input type="text" class="form-control form-control-sm d-costC text-end bg-warning bg-opacity-10 number-only" data-field="cost_child" placeholder="0"></td>
    
    <td><input type="text" class="form-control form-control-sm d-sur text-end small text-muted number-only" data-field="surcharge" placeholder="0"></td>
    <td><input type="text" class="form-control form-control-sm d-disc text-end small text-muted number-only" data-field="discount" placeholder="0"></td>
    <td><input type="text" class="form-control form-control-sm d-totalSales number fw-bold text-end text-primary bg-light" data-field="total_sale" readonly value="0"></td>
    
    <td><input type="text" class="form-control form-control-sm d-code text-center text-primary font-monospace" data-field="ref_code"></td>
    <td><input type="text" class="form-control form-control-sm d-totalCost number-only fw-bold text-end text-danger bg-danger bg-opacity-10" data-field="total_cost" readonly value="0"></td>
        
    <td><input type="text" class="form-control form-control-sm d-paid number-only text-end text-success fw-bold" data-field="paid_amount" placeholder="0"></td>
    <td><input type="text" class="form-control form-control-sm d-remain number-only text-end text-danger small bg-light" data-field="debt_balance" readonly value="0"></td>
    <td>
      <select class="form-select form-select-sm d-supplier" data-field="supplier" onchange="onSupplierChange(${idx})" style="width:130px;">
        <option value="">--Select supplier--</option>
        ${optsSupplier}
      </select>
    </td>
    
    <td><input type="text" class="form-control form-control-sm d-note" data-field="operator_note"></td>
    <td class="text-center align-middle"><i class="fa-solid fa-times text-danger" style="cursor:pointer" onclick="removeRow(${idx})"></i></td>
  `;
  
  const container = getE('tab-form');
  container.querySelector('tbody').appendChild(tr);
  updateLocationList(idx);
  
  if (data) {
    // Handle both object and array formats for compatibility
    const isObject = typeof data === 'object' && !Array.isArray(data);
    log(`Filling row ${idx} with data:`, data);
    
    // Extract values using object fields
    const id = isObject ? data.id : data[0];
    const bookingId = isObject ? data.booking_id : data[1];
    const customerName = isObject ? data.customer_full_name : data[2];

    const serviceType = isObject ? data.service_type : data[3];
    const hotelName = isObject ? data.hotel_name : data[4];    
    const serviceName = isObject ? data.service_name : data[5];
    const checkIn = isObject ? data.check_in : data[6];
    const checkOut = isObject ? data.check_out : data[7];
    const nights = isObject ? data.nights : data[8] || 1;
    const quantity = isObject ? data.adults : data[9];

    const costAdult = isObject ? data.cost_adult : data[10];
    const childQty = isObject ? data.children : data[11] || 0;    
    const costChild = isObject ? data.cost_child : data[12];
    const surcharge = isObject ? data.surcharge : data[13];
    const discount = isObject ? data.discount : data[14];
    const totalSale = isObject ? data.total_sale : data[15] || 0;
    const refCode = isObject ? data.ref_code : data[16] || "";
    const totalCost = isObject ? data.total_cost : data[17] || 0;
    const paidAmount = isObject ? data.paid_amount : data[18] || 0;
    const supplier = isObject ? data.supplier : data[20] || "";
    const note = isObject ? data.operator_note : data[21] || "";
    
    
    setVal('.d-sid', id, tr);
    setVal('.d-idbk', bookingId, tr);
    setVal('.d-cust', customerName, tr);
    setVal('.d-type', serviceType, tr);
    onTypeChange(idx, false);
    setVal('.d-loc', hotelName, tr);
    onLocationChange(idx, false);
    setVal('.d-name', serviceName, tr);
    setVal('.d-in', checkIn, tr);
    setVal('.d-out', checkOut, tr);
    setVal('.d-night', nights, tr);
    setVal('.d-qty', quantity, tr);
    setVal('.d-costA', costAdult, tr);
    setVal('.d-qtyC', childQty, tr);    
    setVal('.d-costC', costChild, tr);
    setVal('.d-sur', surcharge, tr);
    setVal('.d-disc', discount, tr);
    setVal('.d-totalSales', totalSale, tr);
    setVal('.d-code', refCode || "", tr);
    setVal('.d-paid', paidAmount, tr);
    setVal('.d-supplier', supplier || "", tr);
    setVal('.d-note', note || "", tr);    

    calcRow(idx);
  } else {
    // New row default values
    setVal('.d-idbk', getVal('BK_ID'), tr);
    setVal('.d-cust', getVal('Cust_Name'), tr);
  } 
}

/**
 * Handle service type change - update available services and reset child fields
 * @param {number} idx - Row index
 * @param {boolean} resetChildren - Whether to reset location and service name
 */
function onTypeChange(idx, resetChildren = true) {
  const tr = getE(`row-${idx}`);
  if (!tr) return;
  // 1. Logic cũ: Reset Location & Name
  if (resetChildren) {
    tr.querySelector('.d-loc').value = "";
    // Gọi hàm updateServiceNameList (như đã làm ở bước trước)
    updateLocationList(idx);
  } else {
    updateServiceNameList(idx);
  }
}

async function onSupplierChange(idx) {
  log(`Supplier changed in row ${idx}, updating prices...`);
  const tr = getE(`row-${idx}`, $('#detail-tbody'));
  const useDate = tr.querySelector('input[data-field="check_in"]').value;
  const supplier = tr.querySelector('select[data-field="supplier"]').value;
  const service = tr.querySelector('select[data-field="service_name"]').value;
  const type = tr.querySelector('select[data-field="service_type"]').value;
  log(`Fetching prices for service: ${service}, date: ${useDate}, supplier: ${supplier}, type: ${type}`);
  if(service && useDate && type) {
    if (type === 'Phòng') {
      const hotel = tr.querySelector('select[data-field="hotel_name"]').value;
      const checkOut = tr.querySelector('input[data-field="check_out"]').value;
      const prices = await A.PriceManager.getHotelPrice(hotel, useDate, checkOut, service);
      if (!prices) return;
      setVal($('input[data-field="cost_adult"]'), prices.price, tr);
    } else {
      const prices = await A.PriceManager.getServicePrice(service, useDate);
      if (!prices) return;
      const priceAdult = tr.querySelector('input[data-field="cost_adult"]');
      const priceChild = tr.querySelector('input[data-field="cost_child"]');
      setVal(priceAdult, prices.price.adl);
      setVal(priceChild, prices.price.chd);
    }
  }
}
// B. Khi đổi Location -> Nếu Type=Phòng -> Cập nhật Hạng Phòng
function onLocationChange(idx, resetName = true) {
  const tr = getE(`row-${idx}`);
  const type = getVal('.d-type', tr);
  if (type === 'Phòng') {
    updateServiceNameList(idx); // Load hạng phòng của KS này
    if(resetName) setVal('.d-name', "", tr);
  }
}
// C. Hàm Fill Location (Gộp Hotel Matrix Col 1 + Other)
function updateLocationList(idx) {
  const lists = window.APP_DATA.lists;
  // Lấy tên các KS từ Matrix (Cột 0)
  const hotels = (lists.hotelMatrix || []).map(r => r[0]);
  const others = lists.locOther || [];
  // Gộp và loại trùng
  const allLocs = [...new Set([...hotels, ...others])];
  const elLoc = getE(`row-${idx}`).querySelector('.d-loc');
  let currentVal = getVal('.d-loc', getE(`row-${idx}`));
  elLoc.innerHTML = '<option value="">-</option>' + allLocs.map(x => `<option value="${x}">${x}</option>`).join('');
  setVal('.d-loc', currentVal, getE(`row-${idx}`));
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
      const hotelRow = matrix.find(r => r[0] === loc);
      if (hotelRow) {
        // Lấy từ cột 3 đến hết (Index 2 trở đi trong mảng JS - vì JS start 0)
        // Excel: Cột A(0)=Tên. Cột C(2) -> L(11) là hạng phòng.
        // Chú ý: getMatrixData trả về mảng giá trị của row.
        // Ta lấy các ô có dữ liệu từ index 2 trở đi
        options = hotelRow.slice(2).filter(c => c !== "" && c !== null);
      }
  } else {
      const svcMatrix = window.APP_DATA.lists.serviceMatrix || [];
      options = svcMatrix
          .filter(r => r[0] === type) // Cột 0 là Loại
          .map(r => r[1]);            // Cột 1 là Tên
  }
  const currentVal = elName.value;
  elName.innerHTML = '<option value="">-</option>' + options.map(x => `<option value="${x}">${x}</option>`).join('');
  // Cố gắng giữ lại giá trị cũ nếu có trong list mới
  if(options.includes(currentVal)) elName.value = currentVal;
}


async function syncRow(sourceRow = null) {
  setBtnLoading('btn-sync-row', true);
  try {
    const tbody = getE('detail-tbody');
    let rows = tbody.querySelectorAll('tr');
    if (sourceRow) {
      const sid = sourceRow ? getVal('input[data-field="id"]', sourceRow) : null;
      if (sid) {
        const bkDetail = await db.collection('booking_details').doc(sid).get();
        if (bkDetail.exists) {
          await A.DB._syncOperatorEntry(bkDetail.data());
          const newSnap = await db.collection('operator_entries').doc(sid).get();
          const newData = newSnap.data();
          const inputs = sourceRow.querySelectorAll('[data-field]');
          inputs.forEach(input => {
            const fieldName = input.dataset.field; // Lấy tên field từ data-field
            if (!fieldName) return;
            let value = newData[fieldName];
            setVal(input, value);
          });
          logA('Đã đồng bộ dữ liệu từ server cho dòng: ' + sid, 'success');
          return;
        } else {
          logA('Dòng nguồn không tồn tại trên server: ' + sid, 'error');
          return;
        }
      }
    }
    else {
      rows.forEach(async r => {
        if (r.style.display !== 'none') sourceRow = r;
        const sid = sourceRow ? getVal('input[data-field="id"]', sourceRow) : null;
        if (sid) {
          const bkDetail = await db.collection('booking_details').doc(sid).get();
          if (bkDetail.exists) {
            await A.DB._syncOperatorEntry(bkDetail.data());
            const newSnap = await db.collection('operator_entries').doc(sid).get();
            const newData = newSnap.data();
            const inputs = sourceRow.querySelectorAll('[data-field]');
            inputs.forEach(input => {
              const fieldName = input.dataset.field; // Lấy tên field từ data-field
              if (!fieldName) return;
              let value = newData[fieldName];
              setVal(input, value);
            });
            log('Đã đồng bộ dữ liệu từ server cho dòng: ' + sid, 'success');
            return;
          } else {
            log('Dòng nguồn không tồn tại trên server: ' + sid, 'error');
            return;
          }
        }
      });
    }  
  }
  catch (e) {
    logA("Lỗi đồng bộ dòng: " + e.message, 'error');
  }
  finally {
    setBtnLoading('btn-sync-row', false);
  }
}

function removeRow(idx) {
  const row = getE(`row-${idx}`);
  if(row) row.remove();
  calcGrandTotal();
}
  
// =========================================================================
// 2. CALCULATION FUNCTIONS
// =========================================================================

/**
 * Calculate row totals and costs
 * @param {number} idx - Row index
 */
function calcRow(idx) {
  const tr = getE(`row-${idx}`);
  if (!tr) return;

  // Calculate nights from dates
  const dInStr = tr.querySelector('.d-in').value;
  const dOutStr = tr.querySelector('.d-out').value;
  const type = tr.querySelector('.d-type').value;
  
  let night = 0;
  if (dInStr && dOutStr) {
    const dIn = new Date(dInStr);
    const dOut = new Date(dOutStr);
    const diff = (dOut - dIn) / 86400000;
    night = (type !== 'Phòng' || diff <= 0) ? 1 : diff;
  }
  tr.querySelector('.d-night').value = night;

  // Get quantities and prices
  const qtyA = getVal('.d-qty', tr);
  const qtyC = getVal('.d-qtyC', tr);
  const sur = getVal('.d-sur', tr);
  const disc = getVal('.d-disc', tr);
  
  // Calculate total cost
  const costA = getVal('.d-costA', tr);
  const costC = getVal('.d-costC', tr);
  const multiplier = (type === 'Phòng') ? Math.max(1, night) : 1;
  
  const totalCost = ((qtyA * costA) + (qtyC * costC) + sur - disc) * multiplier;
  setVal('.d-totalCost', totalCost, tr);
  
  // Calculate remaining debt
  const paid = getVal('.d-paid', tr);
  const remain = totalCost - paid;
  setVal('.d-remain', remain, tr);
  if (remain === 0) {
    setStyle(tr, 'backgroundColor: #c0ab4d');
  }
  
  calcGrandTotal();
}

/**
 * Extract and parse numeric values from formatted input
 * @param {string|number} val - Value to parse
 * @returns {number} - Parsed numeric value
 */
function getRawVal(val) {
  if (!val) return 0;
  return Number(String(val).replace(/[^0-9-]/g, '')) || 0;
}

/**
 * Calculate and display grand totals for entire form
 */
function calcGrandTotal() {
  log("🚀 Running calcGrandTotal...");

  let totalSales = 0;
  let totalCost = 0;
  
  // Stats for separate calculations
  let transportTotal = 0;
  let transportA = 0;
  let landChildTotal = 0;

  // Loop through all detail rows
  const rows = document.querySelectorAll('#detail-tbody tr');
  
  rows.forEach((tr) => {
    const elSales = tr.querySelector('.d-totalSales');
    const elCost = tr.querySelector('.d-totalCost');
    const elType = tr.querySelector('.d-type');
    
    const rowSales = elSales ? getRawVal(elSales.value) : 0;
    const rowCost = elCost ? getRawVal(elCost.value) : 0;
    
    totalSales += rowSales;
    totalCost += rowCost;

    // Calculate stats
    const type = elType ? elType.value : "";
    const elQty = tr.querySelector('.d-qty');
    const elQtyC = tr.querySelector('.d-qtyC');
    const elCostA = tr.querySelector('.d-costA');
    const elCostC = tr.querySelector('.d-costC');
    const elNight = tr.querySelector('.d-night');

    const qtyA = elQty ? getRawVal(elQty.value) : 0;
    const qtyC = elQtyC ? getRawVal(elQtyC.value) : 0;
    const priA = elCostA ? getRawVal(elCostA.value) : 0;
    const priC = elCostC ? getRawVal(elCostC.value) : 0;

    if (type === 'Vé MB' || type === 'Vé Tàu') {
      transportA += (qtyA * priA);
      transportTotal += rowSales;
    } else {
      const nightVal = elNight ? Number(elNight.value) || 0 : 0;
      const multiplier = (type === 'Phòng') ? Math.max(1, nightVal) : 1;
      landChildTotal += (qtyC * priC * multiplier);
    }
  });

  log(`📊 Results: Sales=${totalSales}, Cost=${totalCost}`);

  // Update UI
  const elBkTotal = document.getElementById('BK_Total');
  if (elBkTotal) {
    elBkTotal.value = formatMoney(totalSales);
    elBkTotal.dataset.val = totalSales;
  }

  const elBkCost = document.getElementById('BK_TotalCost');
  if (elBkCost) {
    elBkCost.value = formatMoney(totalCost);
    elBkCost.dataset.val = totalCost;
  }

  calcBalanceInternal(totalSales, totalCost);

  // Update stats if function exists
  if (typeof updateStatsUI === "function") {
    updateStatsUI(totalSales, transportTotal, transportA, landChildTotal);
  }
}

/**
 * Calculate balance (profit) and update color
 * @param {number} total - Total sales
 * @param {number} cost - Total cost
 */
function calcBalanceInternal(total, cost) {
  const profit = total - cost;
  const elBkBalance = document.getElementById('BK_Balance');
  
  if (elBkBalance) {
    elBkBalance.value = formatMoney(profit);
    elBkBalance.dataset.val = profit;

    elBkBalance.className = "form-control form-control-sm text-end fw-bold bg-light";
    
    if (profit >= 0) {
      elBkBalance.classList.add("text-success");
      elBkBalance.classList.remove("text-danger");
    } else {
      elBkBalance.classList.add("text-danger");
      elBkBalance.classList.remove("text-success");
    }
  }
}

/**
 * Update stats UI with average prices
 * @param {number} grandTotal - Total sales
 * @param {number} transportTotal - Transport total
 * @param {number} transportA - Transport adult cost
 * @param {number} landChildTotal - Land children cost
 */
function updateStatsUI(grandTotal, transportTotal, transportA, landChildTotal) {
  const countAdult = Number(document.getElementById('BK_Adult').value) || 1;
  const countChild = Number(document.getElementById('BK_Child').value) || 0;

  const landTotal = grandTotal - transportTotal;
  const landAdultTotal = landTotal - landChildTotal;
  
  const avgAdult = (countAdult > 0) ? (landAdultTotal / countAdult) : 0;
  const avgChild = (countChild > 0) ? (landChildTotal / countChild) : 0;
  
  if(document.getElementById('Stats_AvgAdult')) {
    document.getElementById('Stats_AvgAdult').innerText = formatMoney(Math.round(avgAdult));
  }
  if(document.getElementById('Stats_AvgChild')) {
    document.getElementById('Stats_AvgChild').innerText = formatMoney(Math.round(avgChild));
  }
}

/**
 * Update booking status based on profit
 * @returns {string} - Updated status
 */
function updateBkStatus() {
  const curStatus = getVal('BK_Status');
  
  if (curStatus === 'Hủy' || curStatus === 'Xong BK') {
    return curStatus;
  }

  const adult = Number(getVal('BK_Adult')) || 1;
  const profit = getNum('BK_Balance');

  if (profit < 0) {
    setVal('BK_Status', 'Lỗ');
  } else if (profit === 0) {
    setVal('BK_Status', 'Hòa');
  } else if (profit / adult <= 500) {
    setVal('BK_Status', 'Lời');
  } else {
    setVal('BK_Status', 'LỜI TO');
  }
  
  return getVal('BK_Status');
}

/**
 * Set or calculate date values
 * @param {string} start - Start date or target element ID
 * @param {string} end - End date or target element ID
 * @returns {number|null} - Number of days if calculating, null otherwise
 */
function autoSetOrCalcDate(start, end) {
  if (!start) return;

  const targetElement = getE(end);

  if (targetElement) {
    targetElement.value = start;
    log(`Set value ${start} to element id="${end}"`);
  } else {
    const startDate = new Date(start);
    const endDate = new Date(end);

    if (!isNaN(endDate.getTime())) {
      const diffTime = endDate - startDate;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      log(`Date difference: ${diffDays} days`);
      return diffDays;
    } else {
      log("Parameter 'end' is not a valid element ID or date.", 'error');
    }
  }
}

// =========================================================================
// 3. CUSTOMER SEARCH FUNCTIONS
// =========================================================================

/**
 * Find customer by phone or name
 */
function findCustByPhone(e) {
  const phoneInput = getE('Cust_Phone').value.trim();
  const nameInput = getE('Cust_Name').value.trim();
  
  if (phoneInput.length < 3 && nameInput.length < 3) {
    log("⚠️ Please enter at least 3 characters", "warning");
    return;
  }

  const customers = window.APP_DATA ? Object.values(APP_DATA.customers ?? {}) : [];
  
  let found = null;
  
  // Search by phone first
  if (phoneInput.length >= 3) {
    found = customers.find(c => c && c.phone && String(c.phone).includes(phoneInput));
  }
  
  // Search by name if phone search failed
  if (!found && nameInput.length >= 3) {
    found = customers.find(c => c && c.full_name && String(c.full_name).includes(nameInput));
  }

  if (found) {
    getE('Cust_Phone').value = found.phone || "";
    getE('Cust_Name').value = found.full_name || "";
    log("✅ Customer found:", found);
  } else {
    log("⚠️ No matching customer found", "warning");
  }
}

// =========================================================================
// 4. FORM DATA EXTRACTION
// =========================================================================

/**
 * Extract all form data into object format for saving
 * Called when Save button is clicked
 * @returns {Object} - Form data object with bookings, customer, and operator_entries
 */
window.getFormData = function() {
  log("🚀 Starting form data extraction...");

  try {
    // 1. Extract booking data using object field names
    const bookings = {
      id: getVal('BK_ID'),
      customer_id: getVal('BK_CustID') || '',
      customer_full_name: getVal('Cust_Name'),
      customer_phone: getVal('Cust_Phone'),
      created_at: getVal('BK_Date'),
      start_date: getVal('BK_Start'),
      end_date: getVal('BK_End'),
      adults: getVal('BK_Adult'),
      children: getVal('BK_Child'),
      total_amount: getNum('BK_Total'),
      deposit_amount: getNum('BK_TotalCost'),
      balance_amount: getNum('BK_Balance'),
      payment_method: getVal('BK_PayType'),
      payment_due_date: getVal('BK_PayDue'),
      note: getVal('BK_Note'),
      staff_id: getVal('BK_Staff'),
      status: getVal('BK_Status')
    };

    // 2. Extract customer data
    const customer = {
      full_name: getVal('Cust_Name'),
      phone: getVal('Cust_Phone'),
      source: getVal('Cust_Source')
    };

    // 3. Extract operator entries using object format
    const operator_entries = []
    const rows = document.querySelectorAll('#detail-tbody tr');

    rows.forEach((tr) => {
      const getRowVal = (cls) => {
        const el = tr.querySelector('.' + cls);
        return el ? getVal(el) : '';
      };
      
      // Skip empty rows
      if (!getRowVal('d-name')) return;

      // Create object using field names instead of array indices
      const entry = {
        id: getRowVal('d-sid'),
        booking_id: getRowVal('d-idbk'),
        customer_full_name: getRowVal('d-cust'),
        hotel_name: getRowVal('d-loc'),
        service_type: getRowVal('d-type'),
        service_name: getRowVal('d-name'),
        check_in: getRowVal('d-in'),
        check_out: getRowVal('d-out'),
        nights: getRowVal('d-night'),
        adults: getRowVal('d-qty'),
        children: getRowVal('d-qtyC'),
        cost_adult: getRowVal('d-costA'),
        cost_child: getRowVal('d-costC'),
        surcharge: getRowVal('d-sur'),
        discount: getRowVal('d-disc'),
        total_sale: getRowVal('d-totalSales'),
        ref_code: getRowVal('d-code'),
        total_cost: getRowVal('d-totalCost'),
        supplier: getRowVal('d-supplier'),
        operator_note: getRowVal('d-note'),
        paid_amount: getRowVal('d-paid'),
        debt_balance: getRowVal('d-remain')
      };

      operator_entries.push(entry);
    });

    log(`✅ Form data extracted successfully! (${operator_entries.length} detail rows)`);
    return { bookings, customer, operator_entries };

  } catch (e) {
    log("❌ Error extracting form data: " + e.message, "error");
    console.error(e);
    return null;
  }
}

// =========================================================================
// 5. BATCH OPERATIONS & MODALS
// =========================================================================

/**
 * Handle aggregated row click for batch editing
 * @param {string} key - Filter key (supplier name or service type)
 * @param {string} filterType - Type of filter ('supplier' or 'type')
 */
function handleAggClick(key, filterType) {
  log(`📂 Opening Batch Edit: [${filterType}] ${key}`);

  // Filter data by date range
  const dFrom = new Date(getVal('dash-filter-from'));
  dFrom.setHours(0, 0, 0, 0);
  
  const dTo = new Date(getVal('dash-filter-to'));
  dTo.setHours(23, 59, 59, 999);
  
  const source = Object.values(APP_DATA.operator_entries ?? {});
  
  const batchData = source.filter(row => {
    if (!row) return false;

    // Check date
    const checkInStr = row.check_in;
    if (checkInStr) {
      const dIn = new Date(checkInStr);
      if (dIn < dFrom || dIn > dTo) return false;
    }

    // Check filter key
    if (filterType === 'supplier') {
      const supplier = row.supplier || "(No supplier)";
      return String(supplier) === String(key);
    } else if (filterType === 'type') {
      const type = row.service_type || "Other";
      return String(type) === String(key);
    }
    
    return false;
  });

  if (batchData.length === 0) {
    logA("No data found in this date range.", "warning");
    return;
  }

  if (typeof openBatchEdit === 'function') {
    openBatchEdit(batchData, key);
  }
}

/**
 * Partner mail sending module
 */
const PartnerMailModule = (function() {
  
  async function open() {
    const newModal = await A.UI.renderModal('tmpl-partner-mail', "Send Partner Proposal", send);
    const hotelEl = getE('pm-name');
    const hotelData = window.APP_DATA.lists?.hotelMatrix || [];
    
    if (hotelEl) {
      const hotelNames = hotelData.map(r => r[0]);
      fillSelect(hotelEl, hotelNames, "--Select Hotel--");
    }
    
    newModal.show();
    
    setTimeout(() => {
      const inputName = getE('pm-name');
      if(inputName) inputName.focus();
    }, 500);
  }

  async function send() {
    const name = getVal('pm-name') || getVal('pm-name-text');
    const email = getVal('pm-email');
    const cc = getVal('pm-cc');
    const bcc = getVal('pm-bcc');

    const btnSend = getE('btn-save-modal');

    if (!name || !email) {
      return logA("Please enter name and email!", "warning");
    }

    const originalText = btnSend.innerHTML;
    btnSend.disabled = true;
    btnSend.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Sending...';

    try {
      const res = await requestAPI('sendPartnerProposalAPI', name, email, cc, bcc);

      if (res) {
        logA("Email sent successfully!", "success");
      }
    } catch (e) {
      logError(e);
      logA("System error: " + e.message, "danger");
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



