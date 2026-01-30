import { DbService } from '../../core/database-service.js';
import { Renderer } from '../../core/renderer.js';
import { ComponentLoader } from '../../core/loader.js';
import { SALES_CONFIG } from './sales.config.js';

const SalesController = {
    // STATE: Quản lý trạng thái ứng dụng
    state: {
        currentTab: 'bookings', // 'bookings' | 'customers'
        bookings: [],           // Danh sách đơn hàng
        customers: [],          // Danh sách khách hàng
        customerMap: {},        // Hash Map tìm nhanh khách theo SĐT { "09xxxx": Object }
        detailsTemp: [],        // Dữ liệu tạm của bảng chi tiết khi đang mở Form
        editingId: null,        // ID của Booking đang sửa (null nếu tạo mới)
        filterTerm: ''          // Từ khóa tìm kiếm hiện tại
    },

    // =========================================================================
    // 1. KHỞI TẠO & NAVIGATION
    // =========================================================================
    
    async init(containerId) {
        // 1. Load View Dashboard
        await ComponentLoader.render(containerId, 'js/modules/sales/views/dashboard.html', 'replace');
        
        // 2. Load Data (Song song để tối ưu tốc độ)
        await Promise.all([
            this.loadBookings(),
            this.loadCustomers()
        ]);
        
        // 3. Gắn sự kiện & Mặc định vào tab Bookings
        this.bindMainEvents();
        this.switchTab('bookings');
    },

    bindMainEvents() {
        // Tab Switching
        onEvent('.nav-tab-btn', 'click', (e) => {
            // Cần gán class .nav-tab-btn và data-tab="bookings/customers" cho button ở View Dashboard
            const tabName = e.target.dataset.tab; 
            if(tabName) this.switchTab(tabName);
        });

        // Search Box
        onEvent('#sales-search', 'keyup', debounce((e) => {
            this.state.filterTerm = e.target.value.toLowerCase();
            this.renderTable();
        }, 300));

        // Reload Button
        onEvent('#btn-reload', 'click', () => {
            this.state.currentTab === 'bookings' ? this.loadBookings() : this.loadCustomers();
        });

        // Add New Button
        onEvent('#btn-add-new', 'click', () => {
            this.state.currentTab === 'bookings' ? this.openBookingForm() : this.openCustomerForm();
        });
    },

    switchTab(tabName) {
        this.state.currentTab = tabName;
        // Logic đổi màu nút active (nếu view hỗ trợ)
        document.querySelectorAll('.nav-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
            btn.classList.toggle('btn-primary', btn.dataset.tab === tabName);
            btn.classList.toggle('btn-light', btn.dataset.tab !== tabName);
        });
        this.renderTable();
    },

    // =========================================================================
    // 2. DATA LOADING & RENDERING
    // =========================================================================

    async loadBookings() {
        try {
            this.state.bookings = await DbService.getList('bookings', {
                limit: 100,
                orderBy: { field: 'created_at', dir: 'desc' }
            });
            if (this.state.currentTab === 'bookings') this.renderTable();
            this.updateStats();
        } catch (e) { console.error("Load Bookings Error", e); }
    },

    async loadCustomers() {
        try {
            const raw = await DbService.getList('customers', { limit: 500 });
            this.state.customers = raw;
            // Tạo Map phone -> data để lookup cực nhanh khi nhập liệu
            this.state.customerMap = raw.reduce((acc, curr) => {
                if (curr.phone) acc[curr.phone] = curr;
                return acc;
            }, {});
            if (this.state.currentTab === 'customers') this.renderTable();
        } catch (e) { console.error("Load Customers Error", e); }
    },

    renderTable() {
        const isBooking = this.state.currentTab === 'bookings';
        const dataSet = isBooking ? this.state.bookings : this.state.customers;
        const schema = SALES_CONFIG.DASHBOARD_SCHEMA[this.state.currentTab];

        // Client-side Filter
        const term = this.state.filterTerm;
        const filtered = term ? dataSet.filter(item => {
            const str = Object.values(item).join(' ').toLowerCase();
            return str.includes(term);
        }) : dataSet;

        // Render
        const clickFunc = isBooking ? 'SalesController_onBookingClick' : 'SalesController_onCustomerClick';
        Renderer.renderTable(filtered, 'sales-table-container', schema, clickFunc);
    },

    updateStats() {
        // Cập nhật số liệu dashboard nhanh
        const total = this.state.bookings.reduce((sum, b) => sum + (Number(b.total_amount)||0), 0);
        setText('stat-total-count', this.state.bookings.length);
        setText('stat-revenue', formatMoney(total));
    },

    // =========================================================================
    // 3. BOOKING FORM LOGIC (MASTER - DETAIL)
    // =========================================================================

    async openBookingForm(bookingId = null) {
        this.state.editingId = bookingId;
        this.state.detailsTemp = []; // Reset details

        // 1. Render Modal từ Template
        const modalInstance = await Renderer.renderModal(
            bookingId ? 'Cập Nhật Booking' : 'Tạo Booking Mới',
            'js/modules/sales/views/main-form.html', // File View Form đã update ở bước trước
            'booking-modal'
        );

        // 2. Init DataList Phone (Gợi ý số điện thoại khách cũ)
        setDataList('dl-phones', Object.keys(this.state.customerMap));

        // 3. Fill Data
        if (bookingId) {
            const bk = this.state.bookings.find(x => x.id === bookingId);
            if (bk) {
                // Fill Master Fields
                setMany(bk, {
                    customer_phone: 'cust-phone', customer_name: 'cust-name',
                    start_date: 'start-date', end_date: 'end-date',
                    adults: 'adult-qty', children: 'child-qty',
                    status: 'booking-status', note: 'booking-note', staff_id: 'sale-staff',
                    deposit_amount: 'deposit-amount', total_amount: 'total-amount' // Fill tạm, sẽ tính lại
                });

                // Load Details từ DB
                const details = await DbService.getList('booking_details', {
                    where: [{ field: 'booking_id', op: '==', val: bookingId }]
                });
                // Clone ra object mới để tránh reference
                this.state.detailsTemp = details.map(d => ({...d}));
            }
        } else {
            // Mặc định
            setVal('start-date', new Date());
            setVal('booking-status', 'Mới');
            // Thêm 1 dòng trống
            this.addDetailRow();
        }

        // 4. Render Details & Bind Events
        this.renderDetailRows();
        this.bindFormEvents(modalInstance);
        this._updateGrandTotal(); // Tính toán lại lần đầu
    },

    bindFormEvents(modalInstance) {
        // Auto-fill Customer Info
        onEvent('#cust-phone', 'change', (e) => {
            const phone = e.target.value;
            const cust = this.state.customerMap[phone];
            if (cust) {
                setVal('cust-name', cust.full_name);
                // Có thể thêm địa chỉ, email nếu form có field đó
            }
        });

        // Add Row Button
        onEvent('#btn-add-row', 'click', () => this.addDetailRow());

        // Master Inputs change (Deposit...)
        onEvent('#deposit-amount', 'input', () => this._calcBalance());

        // DELEGATION: Xử lý sự kiện trong bảng Details (Input Change & Delete)
        onEvent('#details-table', 'input change click', (e) => {
            const target = e.target;
            const rowEl = target.closest('tr');
            if (!rowEl) return;
            const idx = parseInt(rowEl.dataset.index);

            // Xử lý Xóa dòng
            if (target.closest('.btn-delete-row')) {
                this.removeDetailRow(idx);
                return;
            }

            // Xử lý Input thay đổi
            const field = target.dataset.field;
            if (field) {
                // Update giá trị vào RAM
                let val = target.value;
                if (target.classList.contains('money')) val = getNum(target);
                this.state.detailsTemp[idx][field] = val;

                // Nếu đổi Ngày -> Tính Đêm
                if (field === 'check_in' || field === 'check_out') {
                    this._calcNights(idx);
                }

                // Nếu đổi SL, Giá, Đêm, Phụ, Giảm -> Tính Thành tiền
                const triggers = ['quantity', 'unit_price', 'child_qty', 'child_price', 'surcharge', 'discount', 'nights'];
                if (triggers.includes(field)) {
                    this._calcRowTotal(idx);
                }
            }
        });

        // Submit Form
        onEvent('#booking-form', 'submit', async (e) => {
            e.preventDefault();
            await this.saveBooking(modalInstance);
        });
    },

    // =========================================================================
    // 4. LOGIC TÍNH TOÁN & MATRIX INPUT
    // =========================================================================

    addDetailRow() {
        this.state.detailsTemp.push({
            service_type: 'Tour',
            hotel_name: '', service_name: '',
            check_in: formatDateISO(new Date()), check_out: '',
            nights: 0,
            quantity: 1, unit_price: 0,     // Người lớn
            child_qty: 0, child_price: 0,   // Trẻ em
            surcharge: 0, discount: 0,
            ref_code: '', total: 0
        });
        this.renderDetailRows();
    },

    removeDetailRow(idx) {
        this.state.detailsTemp.splice(idx, 1);
        this.renderDetailRows();
        this._updateGrandTotal();
    },

    renderDetailRows() {
        const tbody = document.getElementById('details-body');
        if (!tbody) return;

        // Render HTML từ state.detailsTemp
        // Lưu ý: Dùng formatMoney cho các input class='money'
        let html = '';
        this.state.detailsTemp.forEach((item, i) => {
            html += `
            <tr data-index="${i}">
                <td class="text-center">${i + 1}</td>
                <td>
                    <select class="form-select form-select-sm border-0 mb-1" data-field="service_type" style="font-size:0.8rem">
                        <option value="Tour" ${item.service_type==='Tour'?'selected':''}>Tour</option>
                        <option value="Hotel" ${item.service_type==='Hotel'?'selected':''}>Hotel</option>
                        <option value="Flight" ${item.service_type==='Flight'?'selected':''}>Vé MB</option>
                        <option value="Other" ${item.service_type==='Other'?'selected':''}>Khác</option>
                    </select>
                    <input type="text" class="form-control form-control-sm" data-field="hotel_name" value="${item.hotel_name||''}" placeholder="Tên Hotel/Hãng">
                </td>
                <td><textarea class="form-control form-control-sm" rows="2" data-field="service_name" placeholder="Tên dịch vụ">${item.service_name||''}</textarea></td>
                
                <td><input type="date" class="form-control form-control-sm" data-field="check_in" value="${item.check_in||''}"></td>
                <td><input type="date" class="form-control form-control-sm" data-field="check_out" value="${item.check_out||''}"></td>
                <td><input type="number" class="form-control form-control-sm text-center fw-bold" data-field="nights" value="${item.nights||0}" readonly tabindex="-1"></td>

                <td class="border-start"><input type="number" class="form-control form-control-sm text-center fw-bold" data-field="quantity" value="${item.quantity||1}"></td>
                <td><input type="text" class="form-control form-control-sm text-end money" data-field="unit_price" value="${formatMoney(item.unit_price)}"></td>

                <td class="border-start bg-light"><input type="number" class="form-control form-control-sm text-center" data-field="child_qty" value="${item.child_qty||0}"></td>
                <td class="bg-light"><input type="text" class="form-control form-control-sm text-end money" data-field="child_price" value="${formatMoney(item.child_price)}"></td>

                <td class="border-start"><input type="text" class="form-control form-control-sm text-end money" data-field="surcharge" value="${formatMoney(item.surcharge)}"></td>
                <td><input type="text" class="form-control form-control-sm text-end money text-danger" data-field="discount" value="${formatMoney(item.discount)}"></td>

                <td class="border-start"><input type="text" class="form-control form-control-sm text-end fw-bold text-primary" readonly value="${formatMoney(item.total)}"></td>
                <td><input type="text" class="form-control form-control-sm text-center" data-field="ref_code" value="${item.ref_code||''}"></td>
                
                <td class="text-center align-middle">
                    <button type="button" class="btn btn-link text-danger btn-sm btn-delete-row"><i class="fa-solid fa-trash-can"></i></button>
                </td>
            </tr>`;
        });
        tbody.innerHTML = html;
    },

    /**
     * TÍNH SỐ ĐÊM (NIGHTS)
     */
    _calcNights(idx) {
        const row = this.state.detailsTemp[idx];
        if (row.check_in && row.check_out) {
            const d1 = new Date(row.check_in);
            const d2 = new Date(row.check_out);
            const diff = d2 - d1;
            const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
            row.nights = days > 0 ? days : 0;
        } else {
            row.nights = 0;
        }
        
        // Update UI ô Nights
        const tr = document.querySelector(`#details-body tr[data-index="${idx}"]`);
        if (tr) {
            tr.querySelector('input[data-field="nights"]').value = row.nights;
        }
        
        // Tính lại tiền luôn sau khi đổi đêm
        this._calcRowTotal(idx);
    },

    /**
     * TÍNH TIỀN 1 DÒNG (CORE LOGIC)
     * Công thức: Total = ((SL * Giá) + (SL_Trẻ * Giá_Trẻ)) * MAX(1, Đêm) + Phụ - Giảm
     */
    _calcRowTotal(idx) {
        const row = this.state.detailsTemp[idx];

        // Lấy giá trị số an toàn
        const qty = Number(row.quantity) || 0;
        const price = Number(row.unit_price) || 0;
        const childQty = Number(row.child_qty) || 0;
        const childPrice = Number(row.child_price) || 0;
        const sur = Number(row.surcharge) || 0;
        const disc = Number(row.discount) || 0;
        
        // Xử lý số đêm: Nếu là Hotel -> tính theo đêm thật. Khác -> Mặc định nhân 1.
        // Tuy nhiên để đơn giản và tránh lỗi chia 0: Nếu nights <= 0 thì coi như là 1 đêm (hoặc 1 lần dịch vụ)
        let multiplier = Number(row.nights);
        if (multiplier <= 0) multiplier = 1;

        // Tính toán
        const baseTotal = (qty * price) + (childQty * childPrice);
        const grandTotal = (baseTotal * multiplier) + sur - disc;

        row.total = grandTotal;

        // Update UI ô Total (Readonly)
        const tr = document.querySelector(`#details-body tr[data-index="${idx}"]`);
        if (tr) {
            // Ô Total nằm ở vị trí thứ 12 input trong row (dựa vào HTML render bên trên)
            // Hoặc query input readonly
             tr.querySelector('input[readonly].text-primary').value = formatMoney(row.total);
        }

        this._updateGrandTotal();
    },

    /**
     * TÍNH TỔNG CỘNG BOOKING & SỐ DƯ
     */
    _updateGrandTotal() {
        const total = this.state.detailsTemp.reduce((sum, item) => sum + (Number(item.total)||0), 0);
        
        // Update vào Master Form
        setNum('total-amount', total);
        setText('services-total-display', formatMoney(total));
        
        this._calcBalance();
    },

    _calcBalance() {
        const total = getNum('total-amount');
        const deposit = getNum('deposit-amount');
        setNum('balance-amount', total - deposit);
    },

    // =========================================================================
    // 5. SAVE & BATCH WRITE
    // =========================================================================

    async saveBooking(modalInstance) {
        try {
            setBtnLoading('#booking-form button[type="submit"]', true);

            // 1. Validate Master
            const custName = getVal('cust-name');
            const custPhone = getVal('cust-phone');
            if (!custName || !custPhone) throw new Error("Vui lòng nhập Tên và SĐT khách hàng");
            if (this.state.detailsTemp.length === 0) throw new Error("Vui lòng nhập ít nhất 1 dịch vụ");

            // 2. Prepare Data
            const timestamp = new Date().toISOString();
            
            // ID: Nếu edit thì lấy ID cũ, không thì tạo mới
            let bookingId = this.state.editingId;
            let isNew = false;
            if (!bookingId) {
                bookingId = 'BK' + Date.now(); // Simple ID gen
                isNew = true;
            }

            const masterData = {
                customer_phone: custPhone,
                customer_name: custName,
                start_date: getVal('start-date'),
                end_date: getVal('end-date'),
                adults: getNum('adult-qty'),
                children: getNum('child-qty'),
                total_amount: getNum('total-amount'),
                deposit_amount: getNum('deposit-amount'),
                balance_amount: getNum('balance-amount'),
                status: getVal('booking-status'),
                note: getVal('booking-note'),
                staff_id: 'CURRENT_USER', // TODO: Lấy từ Auth
                updated_at: timestamp
            };
            if(isNew) {
                masterData.id = bookingId;
                masterData.created_at = timestamp;
            }

            // 3. Batch Operations
            const batchOps = [];
            const db = window.db; // Firestore instance Global

            // OP 1: Booking Master
            batchOps.push({ 
                type: 'set', 
                ref: db.collection('bookings').doc(bookingId), 
                data: masterData 
            });

            // OP 2: Booking Details
            // Note: Đơn giản hóa là ghi đè (Overwrite). Logic nâng cao cần xóa detail cũ ko còn tồn tại.
            this.state.detailsTemp.forEach((d, i) => {
                // Tạo ID cho detail nếu chưa có
                const dId = d.id || `${bookingId}_D${i+1}`;
                const detailData = {
                    ...d,
                    id: dId,
                    booking_id: bookingId,
                    updated_at: timestamp
                };
                batchOps.push({ 
                    type: 'set', 
                    ref: db.collection('booking_details').doc(dId), 
                    data: detailData 
                });
            });

            // OP 3: Customer (Upsert)
            // Kiểm tra khách đã có chưa
            let custId = this.state.customerMap[custPhone] ? this.state.customerMap[custPhone].id : null;
            if (!custId) custId = 'CUST_' + custPhone; // Gen ID khách mới

            const custData = {
                id: custId,
                phone: custPhone,
                full_name: custName,
                updated_at: timestamp,
                // Logic cộng dồn total_spend có thể xử lý bằng Cloud Function hoặc tính toán ở đây
                // Ở đây ta update thông tin cơ bản
            };
            if (!this.state.customerMap[custPhone]) {
                custData.created_at = timestamp;
                custData.source = 'Sales Module';
                custData.total_spend = 0;
            }
            batchOps.push({ 
                type: 'set', 
                ref: db.collection('customers').doc(custId), 
                data: custData 
            });

            // 4. Execute
            await DbService.runBatch(batchOps);

            // 5. Success
            showNotify('Lưu thành công!', 'success');
            modalInstance.hide();
            
            // Reload Data
            await this.loadBookings();
            await this.loadCustomers(); // Reload để cập nhật khách mới vào Map

        } catch (e) {
            console.error(e);
            showNotify(e.message, 'error');
        } finally {
            setBtnLoading('#booking-form button[type="submit"]', false);
        }
    },

    // Helper cho Form Customers
    openCustomerForm() {
        alert("Chức năng thêm khách hàng lẻ đang cập nhật. Vui lòng thêm qua Booking.");
    },

    // EXPORTS CHO HTML CALL (Onclick)
    onBookingClick(id) { this.openBookingForm(id); },
    onCustomerClick(id) { alert("Xem chi tiết khách: " + id); }
};

export default SalesController;

// EXPOSE GLOBAL
window.SalesController_onBookingClick = (id) => SalesController.onBookingClick(id);
window.SalesController_onCustomerClick = (id) => SalesController.onCustomerClick(id);