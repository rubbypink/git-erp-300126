/**
 * =========================================================================
 * 9TRIP ERP - OPERATOR MODULE (Class-based)
 * Chuyên gia điều hành dịch vụ, quản lý nhà cung cấp và dòng tiền chi tiết.
 * Refactored & Standardized
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
                if (typeof L !== 'undefined') L._('Op.UI.loadBookingToUI: Loading Booking...', bkData.id);

                // 1. Kiểm tra form đã tồn tại chưa, nếu chưa thì chuyển tab và đợi
                if (!getE('main-form')) {
                    if (typeof L !== 'undefined') L._('Op.UI.loadBookingToUI: Form not found, activating tab...');
                    if (window.A?.UI) A.UI.activateTab('tab-form');
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
                    const custRow = HD.find(window.APP_DATA.customers, phoneStr, 'phone');
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

                if (typeof L !== 'undefined') L._('Op.UI.loadBookingToUI: Filling header...', headerMap);
                Object.entries(headerMap).forEach(([elId, val]) => setVal(elId, val));

                // 4. Xử lý Bảng Chi tiết Dịch Vụ
                const tbody = getE('detail-tbody');
                if (tbody) {
                    tbody.innerHTML = '';
                    tbody.style.display = 'none';
                }

                Op.State.detailRowCount = 0;

                const sortedDetails = Op.Logic.sortDetailsData(detailsData);
                if (typeof L !== 'undefined') L._(`Op.UI.loadBookingToUI: Adding ${sortedDetails.length} detail rows`);

                sortedDetails.forEach((row) => Op.UI.addDetailRow(row));

                if (tbody) tbody.style.display = 'table-row-group';
                Op.Logic.calcGrandTotal();

                // 5. Chuyển Tab (đảm bảo tab được hiển thị)
                const tabTrigger = document.querySelector('#mainTabs button[data-bs-target="#tab-form"]');
                if (tabTrigger && window.bootstrap) bootstrap.Tab.getOrCreateInstance(tabTrigger).show();
            } catch (e) {
                console.error('Op.UI.loadBookingToUI Error:', e);
                if (typeof L !== 'undefined') L.log('Op.UI.loadBookingToUI Error:', e);
            } finally {
                if (window.StateProxy) StateProxy.resumeAutoBinding();
            }
        },

        /**
         * Thêm dòng dịch vụ điều hành
         * Đã tối ưu bằng DocumentFragment & xử lý mảng để tăng hiệu suất (Batch Render)
         */
        addDetailRow: async (data = null) => {
            try {
                const tbody = getE('detail-tbody');
                if (!tbody) return;

                // Cho phép nhận data dạng mảng hoặc object đơn lẻ
                const isArray = Array.isArray(data);
                const dataList = isArray ? data : [data];

                // Tạo Fragment để render ảo, chỉ append 1 lần vào DOM ở cuối vòng lặp
                const fragment = document.createDocumentFragment();

                // Nạp options sẵn bên ngoài vòng lặp để tránh tính toán lại
                const lists = window.APP_DATA?.lists || {};
                const optsType = Object.values(lists.types || {})
                    .map((s) => `<option value="${s}">${s}</option>`)
                    .join('');

                for (const rowData of dataList) {
                    Op.State.detailRowCount++;
                    const idx = Op.State.detailRowCount;

                    const tr = document.createElement('tr');
                    tr.id = `row-${idx}`;
                    tr.dataset.row = `${idx}`;
                    tr.className = 'align-middle';

                    // Giữ nguyên cấu trúc HTML và Field của bản cũ
                    tr.innerHTML = `
            <td class="text-center text-muted small">${idx} <input type="hidden" data-field="id"></td>
            <td style="display: none;"><input type="text" data-field="booking_id" readonly tabindex="-1"></td>
            <td style="display: none;"><input type="text" data-field="customer_full_name" readonly tabindex="-1"></td>
            <td style="width:75px">
              <select class="form-select form-select-sm text-wrap" data-field="service_type" onchange="Op.Logic.onTypeChange(${idx})">
                <option value="">-</option>${optsType}
              </select>
            </td>
            <td>
            <select 
            class="smart-select form-select form-select-sm" 
            data-source="hotels" 
            data-searchable="true" 
            data-field="hotel_name" 
            data-onchange='Op.Logic.onLocationChange(getE("${tr.id}"));'
        >
            <option value="">- Vui lòng chọn -</option>
        </select>
            </td>    
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
            <td>
              <select class="smart-select form-select form-select-sm" data-source="suppliers" data-searchable="true" data-field="supplier" data-onchange="Op.Logic.onSupplierChange(${idx})" style="width:130px;">
                <option value="">-Supplier-</option>
              </select>
            </td>
            <td><input type="text" class="form-control form-control-sm" data-field="operator_note"></td>
            <td class="text-center align-middle"><i class="fa-solid fa-times text-danger" style="cursor:pointer" onclick="Op.UI.removeRow(${idx})"></i></td>
          `;

                    fragment.appendChild(tr);

                    // GHOST MODE BINDING: Xử lý dữ liệu nạp vào UI
                    if (rowData) {
                        // 1. Gán ID và Type trước để kích hoạt component liên đới
                        setVal('[data-field="id"]', rowData.id || '', tr);
                        setVal('[data-field="service_type"]', rowData.service_type, tr);
                        setVal('[data-field="hotel_name"]', rowData.hotel_name, tr);

                        // 2. Map dữ liệu vào các input sử dụng vòng lặp (giữ logic cũ nhưng loại trừ các trường đặc biệt)
                        tr.querySelectorAll('[data-field]').forEach((input) => {
                            const fName = input.getAttribute('data-field');

                            if (fName === 'supplier' && rowData[fName]) {
                                const supplier = HD.find(window.APP_DATA?.suppliers, rowData[fName], 'id') || HD.find(window.APP_DATA?.suppliers, rowData[fName], 'name');
                                if (supplier) setVal(input, supplier.id || supplier.name);
                            } else if (rowData[fName] !== undefined && !['service_type', 'hotel_name', 'service_name', 'supplier'].includes(fName)) {
                                setVal(input, rowData[fName]);
                            }
                        });

                        // 3. Xử lý Select Dịch vụ phụ thuộc, cần delay nhẹ hoặc await logic nếu component render async
                        if (typeof Op.UI.updateServiceSelect === 'function') {
                            Op.UI.updateServiceSelect(tr, rowData.hotel_name).then(() => {
                                setVal('[data-field="service_name"]', rowData.service_name, tr);
                            });
                        } else {
                            setVal('[data-field="service_name"]', rowData.service_name, tr);
                        }

                        // Gọi logic tính toán lại trên row
                        Op.Logic.calcRow(idx);
                    } else {
                        // Khi tạo dòng mới tinh (data = null) -> Gán mặc định các config từ form cha
                        setVal('[data-field="booking_id"]', getVal('BK_ID'), tr);
                        setVal('[data-field="customer_full_name"]', getVal('Cust_Name'), tr);
                    }
                }

                // Chốt gắn fragment vào DOM (Render 1 lần)
                tbody.appendChild(fragment);
            } catch (e) {
                console.error('Op.UI.addDetailRow Error:', e);
                if (typeof L !== 'undefined') L.log('Op.UI.addDetailRow Error:', e);
            }
        },

        removeRow: (idx) => {
            try {
                const row = getE(`row-${idx}`);
                if (row) row.remove();
                Op.Logic.calcGrandTotal();
            } catch (e) {
                console.error('Op.UI.removeRow Error:', e);
            }
        },

        updateHotelSelect: (idx) => {
            try {
                const lists = window.APP_DATA?.lists || {};
                const hotels = Object.values(lists.hotelMatrix || {}).map((r) => r[0]);
                const allLocs = [...new Set([...hotels, ...Object.values(lists.locOther || {})])];

                const tr = getE(`row-${idx}`);
                if (!tr) return;

                const elLoc = tr.querySelector('[data-field="hotel_name"]');
                if (!elLoc) return;

                const currentVal = getVal(elLoc);
                elLoc.innerHTML = '<option value="">-</option>' + allLocs.map((x) => `<option value="${x}">${x}</option>`).join('');
                setVal(elLoc, currentVal);
            } catch (e) {
                console.error('Op.UI.updateHotelSelect Error:', e);
            }
        },

        updateServiceSelect: async (tr, hotelIdorName) => {
            try {
                if (!tr) return;
                const type = (getVal('[data-field="service_type"]', tr) || '').trim();
                const loc = hotelIdorName ? hotelIdorName : getVal('[data-field="hotel_name"]', tr);
                L._('🔍 updateServiceSelect: hotel:', loc);
                const elName = $('[data-field="service_name"]', tr);
                if (!elName) return;

                let options = [];
                if (type === 'Phòng') {
                    const hotels = Op.State?.hotels || (await A.DB.local.getCollection('hotels')) || [];
                    const hotel = hotels.find((h) => String(h.id) === String(loc) || String(h.name) === String(loc));

                    if (hotel) options = Array.isArray(hotel.rooms) ? hotel.rooms : Object.values(hotel.rooms || {});
                } else {
                    const services = window.APP_DATA?.lists?.services || Op.State.lists?.services || {};
                    options = Object.values(services[type] || {});
                }

                let currentVal = getVal(elName);
                elName.innerHTML = `<option value="">-</option>` + options.map((opt) => `<option value="${opt.id || opt}">${opt.name || opt}</option>`).join('');
                if (currentVal) setVal(elName, currentVal);
            } catch (e) {
                L.log('Op.UI.updateServiceSelect Error:', e);
            }
        },

        fillFormFromSearch: (res) => {
            if (typeof L !== 'undefined') L._('Op.UI.fillFormFromSearch', Object.values(res));
            if (typeof showLoading === 'function') showLoading(false);

            if (!res?.success) {
                if (typeof logA === 'function') logA(res?.message || 'Không tìm thấy dữ liệu!', 'warning');
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
                    return typeof logA === 'function' ? logA('⚠️ Vui lòng nhập ít nhất 3 ký tự (SĐT hoặc Tên)', 'warning') : null;
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
                    if (typeof logA === 'function') logA('✅ Đã tìm thấy khách hàng!', 'success');
                } else {
                    if (typeof logA === 'function') logA('⚠️ Không tìm thấy khách hàng phù hợp trong hệ thống', 'warning');
                }
            } catch (e) {
                console.error('Op.Logic.findCustByPhone Error:', e);
            }
        },

        handleAggClick: async (key, filterType) => {
            try {
                if (typeof L !== 'undefined') L._(`Op.Logic.handleAggClick: 📂 Mở Batch Edit: [${filterType}] ${key}`);

                const dFrom = new Date(getVal('dash-filter-from'));
                const dTo = new Date(getVal('dash-filter-to'));

                const source = (await window.A?.DB?.local?.findRange('operator_entries', dFrom, dTo, 'check_in')) || [];
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
                    return typeof logA === 'function' ? logA('Không có dữ liệu phù hợp trong khoảng thời gian này.', 'warning') : null;
                }

                if (typeof LogicBase.openBatchEdit === 'function') {
                    LogicBase.openBatchEdit(batchData, key);
                }
            } catch (e) {
                console.error('Op.Logic.handleAggClick Error:', e);
            }
        },

        calcRow: (idx) => {
            try {
                const tr = getE(`row-${idx}`);
                if (!tr) return;

                const type = getVal('[data-field="service_type"]', tr);
                const dIn = getVal('[data-field="check_in"]', tr);
                const dOut = getVal('[data-field="check_out"]', tr);

                let night = 1;
                if (dIn && dOut) {
                    const diffDays = (new Date(dOut) - new Date(dIn)) / 86400000;
                    night = type === 'Phòng' && diffDays > 0 ? diffDays : 1;
                }
                setVal('[data-field="nights"]', night, tr);

                const gV = (field) => Number(getVal(`[data-field="${field}"]`, tr)) || 0;

                const multiplier = type === 'Phòng' ? night : 1;
                const totalCost = (gV('adults') * gV('cost_adult') + gV('children') * gV('cost_child')) * multiplier + gV('surcharge') - gV('discount');

                setVal('[data-field="total_cost"]', totalCost, tr);

                const remain = totalCost - gV('paid_amount');
                setVal('[data-field="debt_balance"]', remain, tr);
                tr.style.backgroundColor = remain === 0 ? '#f0fdf4' : '';

                Op.Logic.calcGrandTotal();
            } catch (e) {
                console.error('Op.Logic.calcRow Error:', e);
            }
        },

        calcGrandTotal: () => {
            let grandTotal = 0,
                grandTotalCost = 0;
            $$('[data-field="total_sale"]', getE('detail-tbody')).forEach((el) => (grandTotal += getNum(el)));
            setVal('BK_Total', grandTotal);
            $$('[data-field="total_cost"]', getE('detail-tbody')).forEach((el) => (grandTotalCost += getNum(el)));
            setVal('BK_TotalCost', grandTotalCost);
            setVal('BK_Balance', grandTotal - grandTotalCost);
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
                if (elAvgA) elAvgA.innerText = typeof formatNumber === 'function' ? formatNumber(Math.round(avgAdult)) : Math.round(avgAdult);
                if (elAvgC) elAvgC.innerText = typeof formatNumber === 'function' ? formatNumber(Math.round(avgChild)) : Math.round(avgChild);
            } catch (e) {
                console.error('Op.Logic.updateStatsUI Error:', e);
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
                        setVal('[data-field="check_out"]', start, tr);
                        Op.Logic.calcRow(idx);
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
                console.error('Op.Logic.autoSetOrCalcDate Error:', e);
            }
        },

        onTypeChange: (idx, resetChildren = true) => {
            try {
                const tr = getE(`row-${idx}`);
                if (resetChildren && tr) setVal('[data-field="hotel_name"]', '', tr);
                Op.UI.updateHotelSelect(idx);
                Op.UI.updateServiceSelect(idx);
            } catch (e) {
                console.error('Op.Logic.onTypeChange Error:', e);
            }
        },

        onLocationChange: async (el, resetName = true) => {
            const tr = getE(el)?.closest('tr');
            if (!tr) return false;

            if (resetName) setVal('[data-field="service_name"]', '', tr);
            return await Op.UI.updateServiceSelect(tr, el.value);
        },

        onSupplierChange: async (idx) => {
            try {
                const tr = getE(`row-${idx}`);
                if (!tr) {
                    if (typeof L !== 'undefined') L._(`Op.Logic.onSupplierChange: Row ${idx} not found`, null, 'warning');
                    return;
                }

                const useDate = getVal('[data-field="check_in"]', tr);
                const service = getVal('[data-field="service_name"]', tr);
                const type = getVal('[data-field="service_type"]', tr);

                if (!service || !useDate || !type) {
                    if (typeof L !== 'undefined') L._('Op.Logic.onSupplierChange: Missing required fields', { service, useDate, type }, 'info');
                    return;
                }

                if (!window.A?.CostManager) {
                    if (typeof logA === 'function') logA('Hệ thống quản lý giá (CostManager) chưa sẵn sàng!', 'warning');
                    return;
                }

                let newPrices = null;
                let confirmMsg = '';

                if (type === 'Phòng') {
                    const hotel = getVal('[data-field="hotel_name"]', tr);
                    const checkOut = getVal('[data-field="check_out"]', tr);
                    if (!hotel || !checkOut) return;

                    const res = await window.A.CostManager.getHotelPrice(hotel, useDate, checkOut, service);
                    if (res?.success) {
                        newPrices = { adl: res.price, chd: 0 };
                        confirmMsg = `Tìm thấy giá phòng: <b>${typeof formatNumber === 'function' ? formatNumber(res.price) : res.price}</b>. Bạn có muốn áp dụng không?`;
                    }
                } else {
                    const res = await window.A.CostManager.getServicePrice(service, useDate);
                    if (res?.success && res.price) {
                        newPrices = res.price;
                        confirmMsg = `Tìm thấy giá dịch vụ: Người lớn <b>${typeof formatNumber === 'function' ? formatNumber(res.price.adl) : res.price.adl}</b>, Trẻ em <b>${typeof formatNumber === 'function' ? formatNumber(res.price.chd) : res.price.chd}</b>. Bạn có muốn áp dụng không?`;
                    }
                }

                if (newPrices) {
                    if (typeof L !== 'undefined') L._('Op.Logic.onSupplierChange: Price found', newPrices);

                    const isConfirmed =
                        typeof logA === 'function'
                            ? await logA(confirmMsg, 'question', 'confirm', {
                                  title: 'Cập nhật giá?',
                                  confirmText: 'Đồng ý',
                                  cancelText: 'Bỏ qua',
                              })
                            : window.confirm('Tìm thấy giá hệ thống. Áp dụng giá mới?');

                    if (isConfirmed) {
                        setVal('[data-field="cost_adult"]', newPrices.adl, tr);
                        if (type !== 'Phòng') setVal('[data-field="cost_child"]', newPrices.chd, tr);
                        Op.Logic.calcRow(idx);
                        if (typeof logA === 'function') logA('Đã cập nhật giá mới!', 'success');
                    }
                } else {
                    if (typeof L !== 'undefined') L._('Op.Logic.onSupplierChange: No price found for', { service, useDate });
                }
            } catch (e) {
                console.error('Op.Logic.onSupplierChange Error:', e);
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
                    if (!getVal('[data-field="service_name"]', tr)) return;

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
                console.error('Op.DB.getBkFormData Error:', e);
                return null;
            }
        },

        saveForm: async () => {
            if (typeof setBtnLoading === 'function') setBtnLoading('btn-save-group', true, 'Saving...');
            try {
                const data = Op.DB.getBkFormData();
                if (!data.operator_entries.length) {
                    if (typeof logA === 'function') logA('Vui lòng nhập ít nhất 1 dòng dịch vụ!', 'warning');
                    return;
                }

                const invalidRow = data.operator_entries.findIndex((d) => !d.cost_adult && d.total_cost > 0);
                if (invalidRow >= 0) {
                    if (typeof logA === 'function') logA(`Dòng thứ ${invalidRow + 1} có giá trị bất thường!`, 'warning');
                    return;
                }

                await DB_MANAGER.batchSave('operator_entries', data.operator_entries);
                if (window.StateProxy) await StateProxy.commitSession();

                if (getE('btn-dash-update') && window.A?.Event) window.A.Event.trigger(getE('btn-dash-update'), 'click');
                if (typeof logA === 'function') logA('Lưu dữ liệu Điều hành thành công!', 'success');
            } catch (e) {
                if (window.StateProxy) StateProxy.rollbackSession();
                console.error('Op.DB.saveForm Error:', e);
            } finally {
                if (typeof setBtnLoading === 'function') setBtnLoading('btn-save-group', false);
                if (typeof L !== 'undefined') L._('Op.DB.saveForm: done');
            }
        },

        saveBatchDetails: async () => {
            try {
                if (typeof L !== 'undefined') L._('Op.DB.saveBatchDetails: run');
                if (typeof setBtnLoading === 'function') setBtnLoading('btn-save-batch', true);

                const data = await HD.getTableData('tbl-booking-form');
                if (typeof logA === 'function') logA('Đang lưu... Dòng 1: ' + (data[0]?.values || ''), 'info');

                const res = await DB_MANAGER.batchSave('operator_entries', data);
                if (res && typeof logA === 'function') logA('Lưu dữ liệu thành công!', 'success');
            } catch (e) {
                console.error('Op.DB.saveBatchDetails Error:', e);
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
                    const sid = getVal('[data-field="id"]', tr);
                    if (!sid) continue;

                    const bkDetailSnap = await getDoc(doc(db, 'booking_details', sid));
                    if (bkDetailSnap.exists()) {
                        await DB_MANAGER._syncOperatorEntry(bkDetailSnap.data());
                        const newSnap = await getDoc(doc(db, 'operator_entries', sid));

                        if (newSnap.exists()) {
                            const newData = newSnap.data();
                            tr.querySelectorAll('[data-field]').forEach((input) => {
                                const fieldName = input.dataset.field;
                                if (newData[fieldName] !== undefined) {
                                    setVal(input, newData[fieldName]);
                                }
                            });
                        }
                    }
                }
                if (typeof logA === 'function') logA('Đồng bộ thành công!', 'success');
                Op.Logic.calcGrandTotal();
            } catch (e) {
                console.error('Op.DB.syncRow Error:', e);
            } finally {
                if (typeof setBtnLoading === 'function') setBtnLoading('btn-sync-row', false);
            }
        },

        syncTransactionForPaidAmount: async (idx) => {
            try {
                const tr = getE(`row-${idx}`);
                if (typeof L !== 'undefined') L._('Op.DB.syncTransactionForPaidAmount: bắt đầu sync');
                if (!tr) return;

                const detailId = getVal('[data-field="id"]', tr);
                if (!detailId) {
                    if (typeof logA === 'function') logA('⚠️ Cảnh báo: Dịch vụ này chưa được lưu. Vui lòng Bấm Lưu trước!', 'warning');
                    setVal('[data-field="paid_amount"]', 0, tr);
                    Op.Logic.calcRow(idx);
                    return;
                }

                const currentPaidAmount = Number(getVal('[data-field="paid_amount"]', tr) || 0);
                const currentType = getVal('[data-field="service_type"]', tr);
                const supplier = getVal('[data-field="supplier"]', tr);

                const allTransactions = HD.filter(window.APP_DATA?.transactions, detailId, '==', 'booking_id');
                const existingOutTxs = HD.filter(allTransactions, 'OUT', '==', 'type');
                const totalExistingPaid = HD.agg(existingOutTxs, 'amount');
                const diffAmount = currentPaidAmount * 1000 - totalExistingPaid;

                if (diffAmount === 0) return;

                const fundAccounts = window.APP_DATA?.fund_accounts || {};
                const accountOptions = {};
                Object.values(fundAccounts).forEach((acc) => {
                    accountOptions[acc.id] = `${acc.name} (Số dư: ${typeof formatNumber === 'function' ? formatNumber(acc.balance || 0) : acc.balance})`;
                });

                if (!window.Swal) return;

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
                        description: diffAmount > 0 ? `Tự động Chi: Booking ${getVal('BK_ID')} ${typeof formatNumber === 'function' ? formatNumber(diffAmount) : diffAmount} thanh toán ${getVal('[data-field="service_name"]', tr)} cho NCC: ${supplier}` : `Điều chỉnh giảm chi: ${typeof formatNumber === 'function' ? formatNumber(Math.abs(diffAmount)) : Math.abs(diffAmount)}`,
                        created_by: window.CURRENT_USER?.name || window.CURRENT_USER?.email || 'System',
                    };

                    transaction.set(newTxRef, newTransaction);
                    return { newTransaction };
                });

                if (result) {
                    const { newTransaction } = result;
                    if (DB_MANAGER._updateAppDataObj) DB_MANAGER._updateAppDataObj('transactions', newTransaction);

                    if (typeof logA === 'function') logA(`✅ Đã tạo phiếu chi. Số dư tài khoản sẽ được hệ thống cập nhật tự động.`, 'success');

                    if (window.A?.NotificationManager) {
                        window.NotificationManager.sendToAdmin('Thanh toán tự động', `${newTransaction.description} từ tài khoản ${fundAccounts[selectedFundId].name}`);
                    }
                }
            } catch (error) {
                console.error('❌ Lỗi xử lý tài chính: ', error);
                if (typeof logA === 'function') logA('❌ Lỗi xử lý tài chính: ' + error.message, 'error');
            }
        },
    };

    // ─── 6. PARTNER MAIL MODULE ────────────────────────────────────────
    static PartnerMail = {
        open: async () => {
            try {
                if (!window.A?.UI?.renderModal) return;
                const newModal = await window.A.UI.renderModal('tmpl-partner-mail', 'Send Partner Proposal', Op.PartnerMail.send);

                const hotelEl = getE('pm-name');
                const hotelData = window.APP_DATA?.lists?.hotelMatrix || [];

                if (hotelEl && typeof fillSelect === 'function') {
                    const hotelNames = Object.values(hotelData).map((r) => r[0]);
                    fillSelect(hotelEl, hotelNames, '--Select Hotel--');
                }

                newModal.show();

                setTimeout(() => {
                    const inputName = getE('pm-name');
                    if (inputName) inputName.focus();
                }, 500);
            } catch (e) {
                console.error('Op.PartnerMail.open Error:', e);
            }
        },

        send: async () => {
            const name = getVal('pm-name') || getVal('pm-name-text');
            const email = getVal('pm-email');
            const cc = getVal('pm-cc');
            const bcc = getVal('pm-bcc');

            const btnSend = getE('btn-save-modal');

            if (!name || !email) {
                return typeof logA === 'function' ? logA('Please enter name and email!', 'warning') : null;
            }

            const originalText = btnSend.innerHTML;
            if (btnSend) {
                btnSend.disabled = true;
                btnSend.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Sending...';
            }

            try {
                if (typeof requestAPI === 'function') {
                    const res = await requestAPI('sendPartnerProposalAPI', name, email, cc, bcc);
                    if (res && typeof logA === 'function') logA('Email sent successfully!', 'success');
                }
            } catch (e) {
                console.error('Op.PartnerMail.send Error:', e);
            } finally {
                if (btnSend) {
                    btnSend.disabled = false;
                    btnSend.innerHTML = originalText;
                }
                const modalEl = document.getElementById('dynamic-modal');
                if (modalEl && window.bootstrap) {
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
