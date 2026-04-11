/**
 * =========================================================================
 * 9TRIP ERP - OPERATOR MODULE (Class-based)
 * Chuyên gia điều hành dịch vụ, quản lý nhà cung cấp và dòng tiền chi tiết.
 * Refactored from logic_operator2.js
 * =========================================================================
 */

import { getFirestore, collection, doc, getDoc, runTransaction, setDoc } from 'firebase/firestore';
import { getApp } from 'firebase/app';

import DB_MANAGER from '/src/js/modules/db/DBManager.js';
import { SupplierPayment } from './OperatorController.js';

class Op {
  // ─── 1. CONFIGURATION ──────────────────────────────────────────────
  static Config = {
    typeOrder: ['Vé MB', 'Vé Tàu', 'Phòng', 'Xe'],
    minRows: 5,
  };
  static autoInit = false;

  // ─── 2. STATE ──────────────────────────────────────────────────────
  static State = {
    detailRowCount: 0,
  };

  // ─── 3. UI RENDERERS ───────────────────────────────────────────────
  static UI = {
    /**
     * Tải dữ liệu Booking và Operator Entries lên UI
     */
    loadBookingToUI: (bkData, detailsData) => {
      if (!bkData) return;

      if (window.StateProxy) {
        StateProxy.clearSession();
        StateProxy.suppressAutoBinding();
      }

      try {
        L._('Op.UI.loadBookingToUI: Loading Booking...', bkData.id);

        // 1. Kiểm tra form đã tồn tại chưa, nếu chưa thì chuyển tab và đợi
        if (!getE('main-form')) {
          L._('Op.UI.loadBookingToUI: Form not found, activating tab...');
          A.UI.activateTab('tab-form');
          // Đợi template render xong (microtask)
          setTimeout(() => Op.UI.loadBookingToUI(bkData, detailsData), 100);
          return;
        }

        // 2. Tự động lấy Nguồn Khách qua HD.find
        let custSource = '';
        const phoneStr = String(bkData.customer_phone || '')
          .replace(/^'/, '')
          .trim();
        if (phoneStr && window.APP_DATA?.customers) {
          const custRow = HD.find(APP_DATA.customers, phoneStr, 'phone');
          if (custRow) custSource = custRow.source || '';
        }

        // 3. Đổ dữ liệu vào Booking Header
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

        L._('Op.UI.loadBookingToUI: Filling header...', headerMap);
        Object.entries(headerMap).forEach(([elId, val]) => setVal(elId, val));

        // 4. Xử lý Bảng Chi tiết Dịch Vụ
        const tbody = getE('detail-tbody');
        if (tbody) {
          tbody.innerHTML = '';
          tbody.style.display = 'none';
        }

        Op.State.detailRowCount = 0;

        const sortedDetails = Op.Logic.sortDetailsData(detailsData);
        L._(`Op.UI.loadBookingToUI: Adding ${sortedDetails.length} detail rows`);
        sortedDetails.forEach((row) => Op.UI.addDetailRow(row));

        if (tbody) tbody.style.display = 'table-row-group';
        Op.Logic.calcGrandTotal();

        // 5. Chuyển Tab (đảm bảo tab được hiển thị)
        const tabTrigger = $('#mainTabs button[data-bs-target="#tab-form"]');
        if (tabTrigger) bootstrap.Tab.getOrCreateInstance(tabTrigger).show();
      } catch (e) {
        Opps('Op.UI.loadBookingToUI Error:', e);
      } finally {
        if (window.StateProxy) StateProxy.resumeAutoBinding();
      }
    },

    /**
     * Thêm dòng dịch vụ điều hành
     */
    addDetailRow: (data = null) => {
      try {
        Op.State.detailRowCount++;
        const idx = Op.State.detailRowCount;
        const lists = window.APP_DATA?.lists || {};

        const optsType = Object.values(lists.types || {})
          .map((s) => `<option value="${s}">${s}</option>`)
          .join('');
        const optsSup = Object.values(lists.suppliers || APP_DATA?.suppliers || {})
          .map((s) => `<option value="${s.id || s}">${s.name || s}</option>`)
          .join('');

        const tr = document.createElement('tr');
        tr.id = `row-${idx}`;
        tr.dataset.row = `${idx}`;
        tr.className = 'align-middle';
        tr.innerHTML = `
          <td class="text-center text-muted small">${idx} <input type="hidden" data-field="id"></td>
          <td style="display: none;"><input type="text" data-field="booking_id" readonly tabindex="-1"></td>
          <td style="display: none;"><input type="text" data-field="customer_full_name" readonly tabindex="-1"></td>
          <td style="width:75px"><select class="form-select form-select-sm text-wrap" data-field="service_type" onchange="Op.Logic.onTypeChange(${idx})"><option value="">-</option>${optsType}</select></td>
          <td><select class="form-select form-select-sm text-wrap" data-field="hotel_name" onchange="Op.Logic.onLocationChange(${idx})"><option value="">-</option></select></td>    
          <td><select class="form-select form-select-sm" data-field="service_name"><option value="">-</option></select></td>
          <td><input type="date" class="form-control form-control-sm p-1" data-field="check_in" onchange="Op.Logic.autoSetOrCalcDate(this.value, ${idx})"></td>
          <td><input type="date" class="form-control form-control-sm p-1" data-field="check_out" onchange="Op.Logic.calcRow(${idx})"></td>
          <td><input type="number" class="form-control form-control-sm bg-light text-center number" data-field="nights" readonly value="1"></td>
          <td><input type="number" class="form-control form-control-sm text-center fw-bold number" data-field="adults" value="1" onchange="Op.Logic.calcRow(${idx})"></td>
          <td><input type="text" class="form-control form-control-sm fw-bold text-end bg-warning bg-opacity-10 number" data-field="cost_adult" onchange="Op.Logic.calcRow(${idx})" placeholder="0"></td>
          <td><input type="number" class="form-control form-control-sm text-center number" data-field="children" value="0" onchange="Op.Logic.calcRow(${idx})"></td>
          <td><input type="text" class="form-control form-control-sm text-end bg-warning bg-opacity-10 number" data-field="cost_child" onchange="Op.Logic.calcRow(${idx})" placeholder="0"></td>
          <td><input type="text" class="form-control form-control-sm text-end small text-muted number" data-field="surcharge" onchange="Op.Logic.calcRow(${idx})" placeholder="0"></td>
          <td><input type="text" class="form-control form-control-sm text-end small text-muted number" data-field="discount" onchange="Op.Logic.calcRow(${idx})" placeholder="0"></td>
          <td><input type="text" class="form-control form-control-sm number fw-bold text-end text-primary bg-light" data-field="total_sale" readonly value="0"></td>
          <td><input type="text" class="form-control form-control-sm text-center text-primary font-monospace" data-field="ref_code"></td>
          <td><input type="text" class="form-control form-control-sm number fw-bold text-end text-danger bg-danger bg-opacity-10" data-field="total_cost" readonly value="0"></td>
          <td><input type="text" class="form-control form-control-sm number text-end text-success fw-bold" data-field="paid_amount" onchange="Op.Logic.calcRow(${idx}); Op.DB.syncTransactionForPaidAmount(${idx})" placeholder="0"></td>
          <td><input type="text" class="form-control form-control-sm number text-end text-danger small bg-light" data-field="debt_balance" readonly value="0"></td>
          <td><select class="form-select form-select-sm" data-field="supplier" onchange="Op.Logic.onSupplierChange(${idx})" style="width:130px;"><option value="">-Supplier-</option>${optsSup}</select></td>
          <td><input type="text" class="form-control form-control-sm" data-field="operator_note"></td>
          <td class="text-center align-middle"><i class="fa-solid fa-times text-danger" style="cursor:pointer" onclick="Op.UI.removeRow(${idx})"></i></td>
        `;

        const tbody = getE('detail-tbody');
        if (tbody) tbody.appendChild(tr);

        Op.UI.updateHotelSelect(idx);

        if (data) {
          if (data.service_type !== undefined) setVal($('[data-field="service_type"]', tr), data.service_type);
          if (data.hotel_name !== undefined) setVal($('[data-field="hotel_name"]', tr), data.hotel_name);

          Op.UI.updateServiceSelect(idx);

          tr.querySelectorAll('[data-field]').forEach((input) => {
            const fName = input.getAttribute('data-field');
            if (data[fName] === 'supplier') {
              const supplier = HD.find(APP_DATA?.suppliers, data[fName], 'id') || HD.find(APP_DATA?.suppliers, data[fName], 'name');
              if (supplier) setVal(input, supplier.id || supplier.name);
            }
            if (data[fName] !== undefined) setVal(input, data[fName]);
          });

          Op.Logic.calcRow(idx);
        } else {
          setVal($('[data-field="booking_id"]', tr), getVal('BK_ID'));
          setVal($('[data-field="customer_full_name"]', tr), getVal('Cust_Name'));
        }
      } catch (e) {
        Opps('Op.UI.addDetailRow Error:', e);
      }
    },

    removeRow: (idx) => {
      try {
        const row = getE(`row-${idx}`);
        if (row) row.remove();
        Op.Logic.calcGrandTotal();
      } catch (e) {
        Opps('Op.UI.removeRow Error:', e);
      }
    },

    updateHotelSelect: (idx) => {
      try {
        const lists = window.APP_DATA?.lists || {};
        const hotels = Object.values(lists.hotelMatrix || {}).map((r) => r[0]);
        const allLocs = [...new Set([...hotels, ...Object.values(lists.locOther || {})])];

        const tr = getE(`row-${idx}`);
        if (!tr) return;
        const elLoc = $('[data-field="hotel_name"]', tr);
        const currentVal = getVal(elLoc);
        elLoc.innerHTML = '<option value="">-</option>' + allLocs.map((x) => `<option value="${x}">${x}</option>`).join('');
        setVal(elLoc, currentVal);
      } catch (e) {
        Opps('Op.UI.updateHotelSelect Error:', e);
      }
    },

    updateServiceSelect: (idx) => {
      try {
        const tr = getE(`row-${idx}`);
        if (!tr) return;
        const type = getVal($('[data-field="service_type"]', tr));
        const loc = getVal($('[data-field="hotel_name"]', tr));
        const elName = $('[data-field="service_name"]', tr);

        let options = [];
        if (type === 'Phòng' && loc) {
          const hotelMatrix = window.APP_DATA?.lists?.hotelMatrix || [];
          L._('Op.UI.updateServiceSelect: hotelMatrix type:', typeof hotelMatrix, hotelMatrix);
          const hotelRow = (Array.isArray(hotelMatrix) ? hotelMatrix : Object.values(hotelMatrix)).find((r) => r[0] === loc);
          if (hotelRow) options = hotelRow.slice(2).filter(Boolean);
        } else if (type) {
          const serviceMatrix = window.APP_DATA?.lists?.serviceMatrix || [];
          options = (Array.isArray(serviceMatrix) ? serviceMatrix : Object.values(serviceMatrix)).filter((r) => r[0] === type).map((r) => r[1]);
        }

        const currentVal = getVal(elName);
        elName.innerHTML = '<option value="">-</option>' + options.map((x) => `<option value="${x}">${x}</option>`).join('');
        if (options.includes(currentVal)) setVal(elName, currentVal);
      } catch (e) {
        Opps('Op.UI.updateServiceSelect Error:', e);
      }
    },

    fillFormFromSearch: (res) => {
      L._('Op.UI.fillFormFromSearch', Object.values(res));
      if (typeof showLoading === 'function') showLoading(false);
      if (!res?.success) {
        logA(res?.message || 'Không tìm thấy dữ liệu!', 'warning');
        return;
      }
      Op.UI.loadBookingToUI(res.bookings, res.operator_entries);
    },
  };

  // ─── 4. LOGIC HANDLERS ─────────────────────────────────────────────
  static Logic = {
    sortDetailsData: (detailsData) => {
      const items = Array.isArray(detailsData) ? detailsData : Object.values(detailsData || {});
      if (!items.length) return [];

      const typeOrder = Op.Config.typeOrder;
      return items.sort((a, b) => {
        const pA = typeOrder.indexOf(a.service_type);
        const pB = typeOrder.indexOf(b.service_type);
        const priorityA = pA >= 0 ? pA : 99;
        const priorityB = pB >= 0 ? pB : 99;

        if (priorityA !== priorityB) return priorityA - priorityB;

        const dA = new Date(a.check_in || 0).getTime();
        const dB = new Date(b.check_in || 0).getTime();
        return dA - dB;
      });
    },

    findCustByPhone: () => {
      try {
        const phoneVal = getVal('Cust_Phone');
        const nameVal = getVal('Cust_Name');

        if (phoneVal.length < 3 && nameVal.length < 3) {
          return logA('⚠️ Vui lòng nhập ít nhất 3 ký tự (SĐT hoặc Tên)', 'warning');
        }

        const customers = window.APP_DATA?.customers || {};
        let found = null;

        if (phoneVal.length >= 3) {
          const matched = HD.filter(customers, phoneVal, 'includes', 'phone');
          found = Object.values(matched)[0];
        }

        if (!found && nameVal.length >= 3) {
          const matched = HD.filter(customers, nameVal, 'includes', 'full_name');
          found = Object.values(matched)[0];
        }

        if (found) {
          setVal('Cust_Phone', found.phone || '');
          setVal('Cust_Name', found.full_name || '');
          logA('✅ Đã tìm thấy khách hàng!', 'success');
        } else {
          logA('⚠️ Không tìm thấy khách hàng phù hợp trong hệ thống', 'warning');
        }
      } catch (e) {
        Opps('Op.Logic.findCustByPhone Error:', e);
      }
    },

    handleAggClick: async (key, filterType) => {
      try {
        L._(`Op.Logic.handleAggClick: 📂 Mở Batch Edit: [${filterType}] ${key}`);

        const dFrom = new Date(getVal('dash-filter-from')).getTime();
        const dTo = new Date(getVal('dash-filter-to')).setHours(23, 59, 59, 999);

        const source = await A.DB.local.findRange('operator_entries', dFrom, dTo, 'check_in');
        if (source.length === 0) return;
        const batchData = source.filter((row) => {
          if (!row) return false;
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

        if (typeof openBatchEdit === 'function') {
          openBatchEdit(batchData, key);
        }
      } catch (e) {
        Opps('Op.Logic.handleAggClick Error:', e);
      }
    },

    calcRow: (idx) => {
      try {
        const tr = getE(`row-${idx}`);
        if (!tr) return;

        const type = getVal($('[data-field="service_type"]', tr));
        const dIn = getVal($('[data-field="check_in"]', tr));
        const dOut = getVal($('[data-field="check_out"]', tr));

        let night = 1;
        if (dIn && dOut) {
          const diffDays = (new Date(dOut) - new Date(dIn)) / 86400000;
          night = type === 'Phòng' && diffDays > 0 ? diffDays : 1;
        }
        setVal($('[data-field="nights"]', tr), night);

        const gV = (field) => Number(getVal($(`[data-field="${field}"]`, tr))) || 0;

        const multiplier = type === 'Phòng' ? night : 1;
        const totalCost = (gV('adults') * gV('cost_adult') + gV('children') * gV('cost_child')) * multiplier + gV('surcharge') - gV('discount');

        setVal($('[data-field="total_cost"]', tr), totalCost);

        const remain = totalCost - gV('paid_amount');
        setVal($('[data-field="debt_balance"]', tr), remain);
        tr.style.backgroundColor = remain === 0 ? '#f0fdf4' : '';

        Op.Logic.calcGrandTotal();
      } catch (e) {
        Opps('Op.Logic.calcRow Error:', e);
      }
    },

    calcGrandTotal: () => {
      try {
        const data = Op.DB.getBkFormData();
        if (!data) return;

        const entries = data.operator_entries;
        const totalSales = HD.agg(entries, 'total_sale');
        const totalCost = HD.agg(entries, 'total_cost');

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

        Op.Logic.updateStatsUI(totalSales, transportTotal, transportA, landChildTotal);

        setVal('BK_Total', totalSales);
        setVal('BK_TotalCost', totalCost);

        const profit = totalSales - totalCost;
        const elBal = getE('BK_Balance');
        if (elBal) {
          setVal(elBal, profit);
          elBal.className = `form-control form-control-sm text-end fw-bold bg-light text-${profit >= 0 ? 'success' : 'danger'}`;
        }

        const adultCount = Number(getVal('BK_Adult')) || 1;
        const curStatus = getVal('BK_Status');
        if (curStatus !== 'Hủy' && curStatus !== 'Xong BK') {
          let newStatus = 'Lỗ';
          if (profit === 0) newStatus = 'Hòa';
          else if (profit / adultCount <= 500) newStatus = 'Lời';
          else if (profit > 0) newStatus = 'LỜI TO';
          setVal('BK_Status', newStatus);
        }
      } catch (e) {
        Opps('Op.Logic.calcGrandTotal Error:', e);
      }
    },

    updateStatsUI: (grandTotal, transportTotal, transportA, landChildTotal) => {
      try {
        const countAdult = Number(getVal('BK_Adult')) || 1;
        const countChild = Number(getVal('BK_Child')) || 0;

        const landTotal = grandTotal - transportTotal;
        const landAdultTotal = landTotal - landChildTotal;

        const avgAdult = countAdult > 0 ? landAdultTotal / countAdult : 0;
        const avgChild = countChild > 0 ? landChildTotal / countChild : 0;

        const elAvgA = getE('Stats_AvgAdult');
        const elAvgC = getE('Stats_AvgChild');
        if (elAvgA) elAvgA.innerText = formatNumber(Math.round(avgAdult));
        if (elAvgC) elAvgC.innerText = formatNumber(Math.round(avgChild));
      } catch (e) {
        Opps('Op.Logic.updateStatsUI Error:', e);
      }
    },

    autoSetOrCalcDate: (start, end) => {
      try {
        if (!start) return;

        // Nếu end là số (idx)
        if (typeof end === 'number' || !isNaN(Number(end))) {
          const idx = Number(end);
          const tr = getE(`row-${idx}`);
          if (tr) {
            const elOut = tr.querySelector('[data-field="check_out"]');
            if (elOut) {
              elOut.value = start;
              Op.Logic.calcRow(idx);
            }
          }
          return;
        }

        if (end && typeof end === 'object') {
          setVal(end, start);
        } else if (end) {
          const endDate = new Date(end);
          if (!isNaN(endDate)) return Math.ceil((endDate - new Date(start)) / 86400000);
        }
      } catch (e) {
        Opps('Op.Logic.autoSetOrCalcDate Error:', e);
      }
    },

    onTypeChange: (idx, resetChildren = true) => {
      try {
        if (resetChildren) setVal($('[data-field="hotel_name"]', getE(`row-${idx}`)), '');
        Op.UI.updateHotelSelect(idx);
        Op.UI.updateServiceSelect(idx);
      } catch (e) {
        L.log('Op.Logic.onTypeChange Error:', e);
      }
    },

    onLocationChange: (idx, resetName = true) => {
      try {
        const tr = getE(`row-${idx}`);
        if (getVal($('[data-field="service_type"]', tr)) === 'Phòng') {
          Op.UI.updateServiceSelect(idx);
          if (resetName) setVal($('[data-field="service_name"]', tr), '');
        }
      } catch (e) {
        Opps('Op.Logic.onLocationChange Error:', e);
      }
    },

    onSupplierChange: async (idx) => {
      try {
        const tr = getE(`row-${idx}`);
        if (!tr) return L._(`Op.Logic.onSupplierChange: Row ${idx} not found`, null, 'warning');

        const useDate = getVal($('[data-field="check_in"]', tr));
        const service = getVal($('[data-field="service_name"]', tr));
        const type = getVal($('[data-field="service_type"]', tr));

        if (!service || !useDate || !type) {
          L._('Op.Logic.onSupplierChange: Missing required fields', { service, useDate, type }, 'info');
          return;
        }

        if (!window.A?.CostManager) {
          logA('Hệ thống quản lý giá (CostManager) chưa sẵn sàng!', 'warning');
          return;
        }

        let newPrices = null;
        let confirmMsg = '';

        if (type === 'Phòng') {
          const hotel = getVal($('[data-field="hotel_name"]', tr));
          const checkOut = getVal($('[data-field="check_out"]', tr));
          if (!hotel || !checkOut) return;

          const res = await A.CostManager?.getHotelPrice(hotel, useDate, checkOut, service);
          if (res?.success) {
            newPrices = { adl: res.price, chd: 0 };
            confirmMsg = `Tìm thấy giá phòng: <b>${formatNumber(res.price)}</b>. Bạn có muốn áp dụng không?`;
          }
        } else {
          const res = await A.CostManager.getServicePrice(service, useDate);
          if (res?.success && res.price) {
            newPrices = res.price;
            confirmMsg = `Tìm thấy giá dịch vụ: Người lớn <b>${formatNumber(res.price.adl)}</b>, Trẻ em <b>${formatNumber(res.price.chd)}</b>. Bạn có muốn áp dụng không?`;
          }
        }

        if (newPrices) {
          L._('Op.Logic.onSupplierChange: Price found', newPrices);

          // Sử dụng logA thay cho Swal.fire trực tiếp để tận dụng fallback và kiến trúc chuẩn
          // logA đã có sẵn fallback window.confirm bên trong nếu Swal chưa load
          const isConfirmed = await logA(confirmMsg, 'question', 'confirm', {
            title: 'Cập nhật giá?',
            confirmText: 'Đồng ý',
            cancelText: 'Bỏ qua',
          });

          if (isConfirmed) {
            setVal($('[data-field="cost_adult"]', tr), newPrices.adl);
            if (type !== 'Phòng') setVal($('[data-field="cost_child"]', tr), newPrices.chd);
            Op.Logic.calcRow(idx);
            logA('Đã cập nhật giá mới!', 'success');
          }
        } else {
          L._('Op.Logic.onSupplierChange: No price found for', { service, useDate });
        }
      } catch (e) {
        Opps('Op.Logic.onSupplierChange Error:', e);
      }
    },
  };

  // ─── 5. DB ACTIONS ───────────────────────────────────────────
  static DB = {
    getBkFormData: () => {
      try {
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

        const operator_entries = [];
        document.querySelectorAll('#detail-tbody tr').forEach((tr) => {
          if (!getVal($('[data-field="service_name"]', tr))) return;

          const entry = {};
          tr.querySelectorAll('[data-field]').forEach((input) => {
            const field = input.getAttribute('data-field');
            const val = getVal(input);
            entry[field] = ['nights', 'adults', 'children', 'cost_adult', 'cost_child', 'surcharge', 'discount', 'total_sale', 'total_cost', 'paid_amount', 'debt_balance'].includes(field) ? Number(val) || 0 : val;
          });
          operator_entries.push(entry);
        });

        return { bookings, customer, operator_entries };
      } catch (e) {
        Opps('Op.DB.getBkFormData Error:', e);
        return null;
      }
    },

    saveForm: async () => {
      if (typeof setBtnLoading === 'function') setBtnLoading('btn-save-group', true, 'Saving...');
      try {
        const data = Op.DB.getBkFormData();
        if (!data.operator_entries.length) return logA('Vui lòng nhập ít nhất 1 dòng dịch vụ!', 'warning');

        const invalidRow = data.operator_entries.findIndex((d) => !d.cost_adult && d.total_cost > 0);
        if (invalidRow >= 0) return logA(`Dòng thứ ${invalidRow + 1} có giá trị bất thường!`, 'warning');

        await DB_MANAGER.batchSave('operator_entries', data.operator_entries);
        if (window.StateProxy) await StateProxy.commitSession();

        if (getE('btn-dash-update') && window.A?.Event) A.Event.trigger(getE('btn-dash-update'), 'click');
        logA('Lưu dữ liệu Điều hành thành công!', 'success');
      } catch (e) {
        if (window.StateProxy) StateProxy.rollbackSession();
        Opps('Op.DB.saveForm Error:', e);
      } finally {
        if (typeof setBtnLoading === 'function') setBtnLoading('btn-save-group', false);
        L._('Op.DB.saveForm: done');
      }
    },

    saveBatchDetails: async () => {
      try {
        L._('Op.DB.saveBatchDetails: run');
        if (typeof setBtnLoading === 'function') setBtnLoading('btn-save-batch', true);

        const data = await HD.getTableData('tbl-booking-form');
        logA('Đang lưu... Dòng 1: ' + (data[0]?.values || ''), 'info');

        const res = await DB_MANAGER.batchSave('operator_entries', data);
        if (res && typeof logA === 'function') logA('Lưu dữ liệu thành công!');
      } catch (e) {
        Opps('Op.DB.saveBatchDetails Error:', e);
      } finally {
        if (typeof setBtnLoading === 'function') setBtnLoading('btn-save-batch', false);
      }
    },

    syncRow: async (sourceRow = null) => {
      if (typeof setBtnLoading === 'function') setBtnLoading('btn-sync-row', true);
      try {
        const db = getFirestore(getApp());
        const rows = sourceRow ? [sourceRow] : document.querySelectorAll('#detail-tbody tr:not([style*="display: none"])');
        for (const tr of rows) {
          const sid = getVal($('[data-field="id"]', tr));
          if (!sid) continue;

          const bkDetailSnap = await getDoc(doc(db, 'booking_details', sid));
          if (bkDetailSnap.exists()) {
            await DB_MANAGER._syncOperatorEntry(bkDetailSnap.data());
            const newSnap = await getDoc(doc(db, 'operator_entries', sid));
            if (newSnap.exists()) {
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
        Op.Logic.calcGrandTotal();
      } catch (e) {
        Opps('Op.DB.syncRow Error:', e);
      } finally {
        if (typeof setBtnLoading === 'function') setBtnLoading('btn-sync-row', false);
      }
    },

    syncTransactionForPaidAmount: async (idx) => {
      try {
        const tr = getE(`row-${idx}`);
        L._('Op.DB.syncTransactionForPaidAmount: bắt đầu sync');
        if (!tr) return;

        const detailId = getVal('[data-field="id"]', tr);
        if (!detailId) {
          logA('⚠️ Cảnh báo: Dịch vụ này chưa được lưu. Vui lòng Bấm Lưu trước!', 'warning');
          setVal('[data-field="paid_amount"]', 0, tr);
          Op.Logic.calcRow(idx);
          return;
        }

        const currentPaidAmount = Number(getVal('[data-field="paid_amount"]', tr) || 0);
        const currentType = getVal('[data-field="service_type"]', tr);
        const supplier = getVal('[data-field="supplier"]', tr);

        const allTransactions = HD.filter(APP_DATA?.transactions, detailId, '==', 'booking_id');
        const existingOutTxs = HD.filter(allTransactions, 'OUT', '==', 'type');
        const totalExistingPaid = HD.agg(existingOutTxs, 'amount');
        const diffAmount = currentPaidAmount * 1000 - totalExistingPaid;

        if (diffAmount === 0) return;

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

        const db = getFirestore(getApp());
        const newTxRef = doc(collection(db, 'transactions'));
        const fundRef = doc(db, 'fund_accounts', selectedFundId);

        const result = await runTransaction(db, async (transaction) => {
          const fundDoc = await transaction.get(fundRef);
          if (!fundDoc.exists()) throw new Error('Tài khoản không tồn tại trên hệ thống!');

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
            description: diffAmount > 0 ? `Tự động Chi: Booking ${getVal(BK_ID)} ${formatNumber(diffAmount)} thanh toán ${getVal('[data-field="service_name"]', tr)} cho NCC: ${supplier}` : `Điều chỉnh giảm chi: ${formatNumber(Math.abs(diffAmount))}`,
            created_by: window.CURRENT_USER?.name || window.CURRENT_USER?.email || 'System',
          };

          transaction.set(newTxRef, newTransaction);
          return { newTransaction }; // Chỉ trả về transaction mới, không trả về balance
        });

        if (result) {
          const { newTransaction } = result;
          DB_MANAGER._updateAppDataObj('transactions', newTransaction);

          logA(`✅ Đã tạo phiếu chi. Số dư tài khoản sẽ được hệ thống cập nhật tự động.`, 'success');

          if (window.A?.NotificationManager) {
            window.NotificationManager.sendToAdmin('Thanh toán tự động', `${newTransaction.description} từ tài khoản ${fundAccounts[selectedFundId].name}`);
          }
        }
      } catch (error) {
        Opps('❌ Lỗi xử lý tài chính: ' + error.message);
      }
    },
  };

  // ─── 6. PARTNER MAIL MODULE ────────────────────────────────────────
  static PartnerMail = {
    open: async () => {
      try {
        const newModal = await window.A?.UI?.renderModal('tmpl-partner-mail', 'Send Partner Proposal', Op.PartnerMail.send);
        const hotelEl = getE('pm-name');
        const hotelData = window.APP_DATA?.lists?.hotelMatrix || [];

        if (hotelEl) {
          const hotelNames = Object.values(hotelData).map((r) => r[0]);
          fillSelect(hotelEl, hotelNames, '--Select Hotel--');
        }

        newModal.show();

        setTimeout(() => {
          const inputName = getE('pm-name');
          if (inputName) inputName.focus();
        }, 500);
      } catch (e) {
        Opps('Op.PartnerMail.open Error:', e);
      }
    },

    send: async () => {
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
        if (res) logA('Email sent successfully!', 'success');
      } catch (e) {
        Opps('Op.PartnerMail.send Error:', e);
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
    },
  };

  static get Supplier() {
    return SupplierPayment;
  }
}

// ─── EXPOSE TO GLOBAL FOR HTML COMPATIBILITY ───────────────────────
window.Op = Op;
window.onTypeChange = Op.Logic.onTypeChange;
window.onLocationChange = Op.Logic.onLocationChange;
window.onSupplierChange = Op.Logic.onSupplierChange;
export default Op;
