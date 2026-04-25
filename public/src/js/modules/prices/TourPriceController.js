/**
 * TourPriceController - Quản lý Bảng giá Tour/Combo (V2)
 * Refactored for Clean Code, Performance, and Complex Pricing Rules.
 *
 * @author 9Trip Tech Lead
 */

import PricingEngine from './PricingEngine.js';

export default class TourPrice {
    constructor() {
        this.initialized = false;
        this.autoInit = false;
        this.containerId = 'tab-tour-price';
        this.templateId = 'tmpl-tour-price';
        this.modalTemplateId = 'tmpl-tp-modal-base';
        this.currentData = this._getEmptyData();
        this.zoomLevel = 1.0;
    }

    /**
     * Khởi tạo module
     */
    async init() {
        try {
            if (this.initialized || !A.isReady()) return;
            L._('🔍 TourPrice: init');
            if (typeof window.loadHtmlFile === 'function') window.loadHtmlFile('tpl_tour_price.html', { containerId: document.body });

            // 1. Render UI từ template
            await A.UI.renderTemplate(this.containerId, this.templateId, false);

            // 3. Phân quyền hiển thị nút Quản lý Giá Gốc
            this._checkPermissions();

            // 4. Load danh sách tour vào select
            this._updateTourSelect();

            // 5. Khởi tạo DataLists
            this._initDataLists();
            // 2. Đăng ký sự kiện

            // 6. Khởi tạo Zoom UI
            this.updateZoomUI();

            this.initialized = true;
            this._attachEvents();
            L._('✅ TourPrice initialized', 'success');
        } catch (error) {
            Opps('TourPrice.init error:', error);
        }
    }

    /**
     * Kiểm tra quyền hạn người dùng
     */
    _checkPermissions() {
        const role = window.CURRENT_USER?.role;
        const isAdminOrOp = role === 'admin' || role === 'op';
        setDisplay('tp-btn-open-base', isAdminOrOp);
    }

    /**
     * Mở Modal thiết lập giá gốc sử dụng A.Modal
     */
    openBasePriceModal() {
        try {
            const template = getE(this.modalTemplateId);
            if (!template) return Opps('Không tìm thấy template modal giá gốc');

            // 1. Render nội dung vào ModalFull (Tắt footer mặc định)
            A.Modal.render(template.content.cloneNode(true), 'THIẾT LẬP CẤU THÀNH GIÁ GỐC', {
                footer: false,
            });
            A.Modal.show();

            // 2. Khởi tạo các bảng trong Modal
            this._initModalTables();

            // 3. Điền dữ liệu hiện tại (nếu có)
            if (this.currentData && this.currentData.id) {
                this._fillModalData(this.currentData);
                this.calculatePrices();
            }

            // 4. Đăng ký sự kiện cho các input trong modal
            this._attachModalEvents();
        } catch (error) {
            Opps('TourPrice.openBasePriceModal error:', error);
        }
    }

    /**
     * Đăng ký các sự kiện UI chính
     */
    _attachEvents() {
        // Nút mở Modal
        A.Event.on(
            '#tp-btn-open-base',
            'click',
            () => {
                this.openBasePriceModal();
            },
            true
        );

        // Nút Xuất PDF
        A.Event.on(
            '#tp-btn-export',
            'click',
            () => {
                this.exportPDF();
            },
            true
        );
        A.Event.on(
            '#tp-btn-export-image',
            'click',
            () => {
                this.exportImage();
            },
            true
        );
        A.Event.on(
            '#tp-logo-toggle',
            'click',
            () => {
                this.toggleFormat();
            },
            true
        );
        A.Event.on(
            '#tp-btn-zoom-in',
            'click',
            () => {
                this.changeZoom(0.05);
            },
            true
        );
        A.Event.on(
            '#tp-btn-zoom-out',
            'click',
            () => {
                this.changeZoom(-0.05);
            },
            true
        );
        A.Event.on(
            '#tp-zoom-text',
            'click',
            () => {
                this.changeZoom(0, true);
            },
            true
        );
    }

    /**
     * Khởi tạo các hàng cho bảng trong Modal
     */
    _initModalTables() {
        // Bảng Khách sạn (4 hàng)
        this._generateTableRows('tp-table-hotel-body', 4, [
            { field: 'name', type: 'text', list: 'dl-hotels' },
            { field: 'price', type: 'number' },
            { field: 'nights', type: 'number' },
            { field: 'child', type: 'number' },
            { field: 'extrabed', type: 'number' },
            { field: 'peak', type: 'number' },
            { field: 'holiday', type: 'number' },
        ]);

        // Bảng Dịch vụ Riêng (10 hàng)
        this._generateTableRows('tp-table-private-body', 10, [
            { field: 'type', type: 'text', list: 'dl-service-types' },
            { field: 'name', type: 'text', list: 'dl-service-names' },
            { field: 'adult', type: 'number' },
            { field: 'child', type: 'number' },
            { field: 'peak', type: 'number' },
            { field: 'holiday', type: 'number' },
        ]);

        // Bảng Dịch vụ Chung (4 hàng)
        this._generateTableRows('tp-table-common-body', 4, [
            { field: 'type', type: 'text', list: 'dl-service-types' },
            { field: 'name', type: 'text', list: 'dl-service-names' },
            { field: 'adult', type: 'number' },
            { field: 'child', type: 'number' },
        ]);

        // Bảng Xe (8 hàng)
        this._generateTableRows('tp-table-car-body', 8, [
            { field: 'name', type: 'text' },
            { field: 'p7', type: 'number' },
            { field: 'p16', type: 'number' },
            { field: 'p29', type: 'number' },
            { field: 'p35', type: 'number' },
            { field: 'p45', type: 'number' },
        ]);
    }

    /**
     * Helper tạo hàng cho bảng
     */
    _generateTableRows(tbodyId, rowCount, cols) {
        const tbody = getE(tbodyId);
        if (!tbody) return;

        let html = '';
        for (let i = 0; i < rowCount; i++) {
            html += this._getRowHtml(cols, i);
        }
        tbody.innerHTML = html;
    }

    /**
     * Helper lấy HTML cho 1 hàng
     */
    _getRowHtml(cols, index) {
        let html = `<tr data-index="${index}">`;
        cols.forEach((col) => {
            const inputClass = col.type === 'number' ? 'form-control form-control-sm border-0 text-center number tp-input' : 'form-control form-control-sm border-0 tp-input';
            const listAttr = col.list ? `list="${col.list}"` : '';
            html += `<td class="p-0"><input type="text" class="${inputClass}" data-field="${col.field}" ${listAttr}></td>`;
        });
        html += `<td class="p-0"><button class="btn btn-link text-danger p-0 tp-btn-remove px-1" title="Xóa hàng"><i class="fa-solid fa-times"></i></button></td>`;
        html += '</tr>';
        return html;
    }

    /**
     * Thêm hàng mới vào bảng
     */
    addRow(type) {
        try {
            const tbodyId = `tp-table-${type}-body`;
            const tbody = getE(tbodyId);
            if (!tbody) return;

            let cols = [];
            switch (type) {
                case 'hotel':
                    cols = [
                        { field: 'name', type: 'text', list: 'dl-hotels' },
                        { field: 'price', type: 'number' },
                        { field: 'nights', type: 'number' },
                        { field: 'child', type: 'number' },
                        { field: 'extrabed', type: 'number' },
                        { field: 'peak', type: 'number' },
                        { field: 'holiday', type: 'number' },
                    ];
                    break;
                case 'private':
                    cols = [
                        { field: 'type', type: 'text', list: 'dl-service-types' },
                        { field: 'name', type: 'text', list: 'dl-service-names' },
                        { field: 'adult', type: 'number' },
                        { field: 'child', type: 'number' },
                        { field: 'peak', type: 'number' },
                        { field: 'holiday', type: 'number' },
                    ];
                    break;
                case 'common':
                    cols = [
                        { field: 'type', type: 'text', list: 'dl-service-types' },
                        { field: 'name', type: 'text', list: 'dl-service-names' },
                        { field: 'price', type: 'number' },
                        { field: 'qty', type: 'number' },
                    ];
                    break;
                case 'car':
                    cols = [
                        { field: 'name', type: 'text' },
                        { field: 'p7', type: 'number' },
                        { field: 'p16', type: 'number' },
                        { field: 'p29', type: 'number' },
                        { field: 'p35', type: 'number' },
                        { field: 'p45', type: 'number' },
                    ];
                    break;
            }

            const index = tbody.querySelectorAll('tr').length;
            const tr = document.createElement('tr');
            tr.dataset.index = index;
            tr.innerHTML = this._getRowHtml(cols, index).replace(/<tr.*?>|<\/tr>/g, '');
            tbody.appendChild(tr);
            this.calcFooter(type);
        } catch (error) {
            Opps('TourPrice.addRow error:', error);
        }
    }

    /**
     * Xóa hàng khỏi bảng
     */
    removeRow(btn) {
        try {
            const tr = btn.closest('tr');
            const tbody = btn.closest('tbody');
            if (tr && tbody) {
                const type = tbody.id.split('-')[2];
                tr.remove();
                this.calcFooter(type);
            }
        } catch (error) {
            Opps('TourPrice.removeRow error:', error);
        }
    }

    /**
     * Thay đổi mức zoom cho tài liệu A4
     * @param {number} delta - Mức thay đổi (0.1, -0.1)
     * @param {boolean} reset - Reset về 100%
     */
    changeZoom(delta, reset = false) {
        try {
            if (reset) {
                this.zoomLevel = 1.0;
            } else {
                this.zoomLevel = Math.min(Math.max(0.5, this.zoomLevel + delta), 2.0);
            }
            this.updateZoomUI();
        } catch (error) {
            console.error('TourPrice.changeZoom error:', error);
        }
    }

    /**
     * Cập nhật giao diện zoom
     */
    updateZoomUI() {
        const wrapper = document.querySelector('.a4-zoom-wrapper');
        const text = getE('tp-zoom-text');
        if (wrapper) {
            wrapper.style.setProperty('--tp-zoom', this.zoomLevel);
        }
        if (text) {
            text.innerText = `${Math.round(this.zoomLevel * 100)}%`;
        }
    }

    /**
     * Chuyển đổi định dạng hiển thị (Format 1 <-> Format 2)
     */
    toggleFormat() {
        try {
            const doc = getE('tp-a4-document');
            if (!doc) return;

            const currentMode = doc.dataset.viewMode || '1';
            const nextMode = currentMode === '1' ? '2' : '1';
            doc.dataset.viewMode = nextMode;

            L._(`🔄 TourPrice: Toggle Format to ${nextMode}`);

            if (nextMode === '2') {
                this._renderFormat2();
            }
        } catch (error) {
            Opps('TourPrice.toggleFormat error:', error);
        }
    }

    /**
     * Render dữ liệu cho Format 2 (Chi tiết dịch vụ & Bảng giá đồng bộ)
     */
    _renderFormat2() {
        try {
            const data = this.currentData;
            const results = data.results;
            const info = data.info;
            if (!results || !info) return;

            // 1. Tiêu đề & Thông tin chung (Đồng bộ Format 1)
            setText('tp-doc-title-f2', `[ƯU ĐÃI] TOUR "${data.tour_name || 'CHƯA ĐẶT TÊN'}"`);
            setText('tp-doc-duration-f2', info.duration ? `(${info.duration})` : '');

            // Lấy giá bán "Chỉ từ" (thường là giá thấp nhất trong bảng giá bán người lớn)
            const minSelling = results.selling_adult.length > 0 ? Math.min(...results.selling_adult.map((s) => s.price)) : 0;
            setText('tp-doc-selling-price-f2', minSelling ? formatNumber(minSelling) : '-');

            // 2. Bảng giá bán người lớn (2-10 pax) - Đồng bộ Format 1
            const adultBody = getE('tp-doc-adult-body-f2');
            if (adultBody) {
                adultBody.innerHTML = results.selling_adult
                    .filter((item) => item.pax >= 2 && item.pax <= 10)
                    .map(
                        (item) => `
          <tr>
            <td class="fw-bold">${item.pax}</td>
            <td class="text-danger">-${formatNumber(item.discount)}</td>
            <td class="fw-bold text-primary fs-5">${formatNumber(item.price)}</td>
          </tr>
        `
                    )
                    .join('');
            }

            // 3. Bảng giá bán trẻ em (Matrix) - Đồng bộ Format 1
            const childBody = getE('tp-doc-child-body-f2');
            if (childBody) {
                childBody.innerHTML = results.base_child
                    .map((row) => {
                        const pricesHtml = row.prices
                            .map((p) => {
                                const val = p.selling > 0 ? formatNumber(p.selling) : '0';
                                return `<td>${val}</td>`;
                            })
                            .join('');

                        // Cột cuối cùng (Từ 12 tuổi) mặc định là giá người lớn
                        const adultPriceHtml = `<td>Người Lớn</td>`;

                        return `
            <tr>
              <td class="fw-bold bkg-light">${row.label}</td>
              ${pricesHtml}
              ${adultPriceHtml}
            </tr>
          `;
                    })
                    .join('');
            }

            // 4. Quy định & Lưu ý (Đồng bộ Format 1)
            const notes = info.notes || '';
            const regulations = info.regulations || '';
            const surcharges = results.surcharges;

            // Cột trái: Ghi chú & Quy định
            let notesHtml = '<ul class="ps-3 mb-0">';
            if (notes) notesHtml += `<li>${notes.replace(/\n/g, '</li><li>')}</li>`;
            if (regulations) notesHtml += `<li>${regulations.replace(/\n/g, '</li><li>')}</li>`;
            notesHtml += '</ul>';
            setHTML('tp-doc-notes-f2', notesHtml || '<p class="text-muted italic mb-0">Chưa có thông tin.</p>');

            // Cột phải: Phụ thu
            let surchargesHtml = '<ul class="ps-3 mb-0">';
            if (surcharges) {
                surchargesHtml += `<li class="fw-bold text-danger">Cao Điểm: ${formatNumber(surcharges.adult.peak)}/NL</li>`;
                surchargesHtml += `<li class="fw-bold text-danger">Lễ Tết: ${formatNumber(surcharges.adult.holiday)}/NL</li>`;
                surchargesHtml += `<li class="text-muted mt-1">Trẻ em: ${formatNumber(surcharges.child.peak)} (CĐ) / ${formatNumber(surcharges.child.holiday)} (Lễ)</li>`;
            }
            surchargesHtml += '</ul>';
            setHTML('tp-doc-surcharges-f2', surchargesHtml);

            // 5. Render Chi tiết dịch vụ (Nếu có ID tương ứng trong template)
            // Bảng Khách sạn
            const hotelBody = getE('tp-doc-hotel-body-f2');
            if (hotelBody && data.services?.hotels) {
                hotelBody.innerHTML = data.services.hotels
                    .map(
                        (h) => `
          <tr>
            <td class="text-start fw-bold">${h.name || '-'}</td>
            <td>${h.nights || 0}</td>
            <td>${formatNumber(h.child)}</td>
            <td>${formatNumber(h.extrabed)}</td>
            <td class="text-danger fw-bold">${formatNumber(h.holiday)}</td>
          </tr>
        `
                    )
                    .join('');
            }

            // Bảng Dịch vụ Riêng
            const privateBody = getE('tp-doc-private-body-f2');
            if (privateBody && data.services?.private) {
                privateBody.innerHTML = data.services.private
                    .map(
                        (s) => `
          <tr>
            <td class="small">${s.type || '-'}</td>
            <td class="text-start">${s.name || '-'}</td>
            <td class="fw-bold text-primary">${formatNumber(s.adult)}</td>
            <td class="text-success">${formatNumber(s.child)}</td>
          </tr>
        `
                    )
                    .join('');
            }

            // Bảng Dịch vụ Chung
            const commonBody = getE('tp-doc-common-body-f2');
            if (commonBody && data.services?.common) {
                commonBody.innerHTML = data.services.common
                    .map(
                        (s) => `
          <tr>
            <td class="text-start">${s.name || '-'}</td>
            <td class="fw-bold text-primary">${formatNumber(s.price)}</td>
          </tr>
        `
                    )
                    .join('');
            }

            // Bảng Xe
            const carBody = getE('tp-doc-car-body-f2');
            if (carBody && data.services?.cars) {
                carBody.innerHTML = data.services.cars
                    .map(
                        (c) => `
          <tr>
            <td class="text-start">${c.name || '-'}</td>
            <td class="fw-bold text-primary">${formatNumber(c.p7)}</td>
          </tr>
        `
                    )
                    .join('');
            }
        } catch (error) {
            Opps('TourPrice._renderFormat2 error:', error);
        }
    }

    /**
     * Đăng ký sự kiện cho các input trong Modal sử dụng EventManager (Delegate)
     */
    _attachModalEvents() {
        const tables = ['hotel', 'private', 'common', 'car'];

        // 1. Gán sự kiện cho 4 bảng (4 event)
        tables.forEach((type) => {
            const tbodyId = `tp-table-${type}-body`;
            A.Event.on(
                `#${tbodyId}`,
                'change click',
                (e) => {
                    if (e.type === 'change') {
                        if (e.target.classList.contains('tp-input')) {
                            this.calcFooter(type);
                            // this.calculatePrices();
                        }
                    } else if (e.type === 'click') {
                        const btn = e.target.closest('.tp-btn-remove');
                        if (btn) {
                            this.removeRow(btn);
                        }
                    }
                },
                true
            );
        });
    }

    /**
     * Tính toán và cập nhật Footer cho các bảng
     * @param {string|null} type - Loại bảng cần tính (hotel, private, common, car). Nếu null sẽ tính tất cả.
     */
    calcFooter(type = null) {
        try {
            const types = type ? [type] : ['hotel', 'private', 'common', 'car'];
            if (!this.currentData?.footers) this.currentData.footers = this._getEmptyData().footers;
            types.forEach((t) => {
                const data = this._getTableData(`tp-table-${t}-body`);

                switch (t) {
                    case 'hotel':
                        const hAdult = data.reduce((sum, h) => sum + (h.price * h.nights || 0), 0) / 2;
                        const hChild = data.reduce((sum, h) => sum + (h.child * h.nights || 0), 0);
                        const hSingle = data.reduce((sum, h) => sum + (h.extrabed * h.nights || 0), 0);
                        const hPeak = data.reduce((sum, h) => sum + (h.peak * h.nights || 0), 0);
                        const hHoliday = data.reduce((sum, h) => sum + (h.holiday * h.nights || 0), 0);

                        setNum('tp-foot-hotel-adult', hAdult);
                        setNum('tp-foot-hotel-child', hChild);
                        setNum('tp-foot-hotel-single', hSingle);
                        setNum('tp-foot-hotel-peak', hPeak);
                        setNum('tp-foot-hotel-holiday', hHoliday);

                        this.currentData.footers.hotels = { adult: hAdult, child: hChild, single: hSingle, peak: hPeak, holiday: hHoliday };
                        break;

                    case 'private':
                        const pAdult = data.reduce((sum, s) => sum + (s.adult || 0), 0);
                        const pChild = data.reduce((sum, s) => sum + (s.child || 0), 0);
                        const pPeak = data.reduce((sum, s) => sum + (s.peak || 0), 0);
                        const pHoliday = data.reduce((sum, s) => sum + (s.holiday || 0), 0);

                        setNum('tp-foot-private-adult', pAdult);
                        setNum('tp-foot-private-child', pChild);
                        setNum('tp-foot-private-peak', pPeak);
                        setNum('tp-foot-private-holiday', pHoliday);

                        this.currentData.footers.private = { adult: pAdult, child: pChild, peak: pPeak, holiday: pHoliday };
                        break;

                    case 'common':
                        const cTotal = data.reduce((sum, s) => sum + (s.price * s.qty || 0), 0);
                        setNum('tp-foot-common-total', cTotal);
                        this.currentData.footers.common = { adult: cTotal };
                        break;

                    case 'car':
                        const car7 = data.reduce((sum, c) => sum + (c.p7 || 0), 0);
                        const car16 = data.reduce((sum, c) => sum + (c.p16 || 0), 0);
                        const car29 = data.reduce((sum, c) => sum + (c.p29 || 0), 0);
                        const car35 = data.reduce((sum, c) => sum + (c.p35 || 0), 0);
                        const car45 = data.reduce((sum, c) => sum + (c.p45 || 0), 0);

                        setNum('tp-foot-car-7', car7);
                        setNum('tp-foot-car-16', car16);
                        setNum('tp-foot-car-29', car29);
                        setNum('tp-foot-car-35', car35);
                        setNum('tp-foot-car-45', car45);

                        this.currentData.footers.cars = { p7: car7, p16: car16, p29: car29, p35: car35, p45: car45 };
                        break;
                }
            });
        } catch (error) {
            console.error('TourPrice.calcFooter error:', error);
        }
    }

    /**
     * Thu thập dữ liệu từ UI Modal
     */
    _collectData() {
        const bodyId = 'dynamic-modal-body';
        const root = bodyId || getE('dynamic-modal');

        const data = {
            id: getVal('tp-base-id', root),
            tour_id: getVal('tp-base-id', root),
            tour_name: getVal('tp-base-name', root),
            status: getVal('tp-base-status', root),
            info: {
                duration: getVal('tp-base-duration', root),
                list_price: getVal('tp-base-list-price', root),
                hook: getVal('tp-base-hook', root),
                profit_adult: getVal('tp-base-profit-adult', root),
                profit_child: getVal('tp-base-profit-child', root),
                notes: getVal('tp-base-notes', root),
                regulations: getVal('tp-base-regulations', root),
            },
            services: {
                hotels: this._getTableData('tp-table-hotel-body'),
                private: this._getTableData('tp-table-private-body'),
                common: this._getTableData('tp-table-common-body'),
                cars: this._getTableData('tp-table-car-body'),
            },
        };

        // Fallback nếu root không tìm thấy ID (do modal context)
        if (!data.id) {
            const globalId = getVal('tp-base-id');
            if (globalId) {
                data.id = globalId;
                data.tour_id = globalId;
            }
        }

        return data;
    }

    /**
     * Helper lấy dữ liệu từ bảng
     */
    _getTableData(tbodyId) {
        const tbody = getE(tbodyId);
        if (!tbody) return [];
        const rows = Array.from(tbody.querySelectorAll('tr'));
        return rows
            .map((row) => {
                const rowData = {};
                row.querySelectorAll('.tp-input').forEach((input) => {
                    const field = input.dataset.field;
                    rowData[field] = input.classList.contains('number') ? getNum(input) : getVal(input);
                });
                return rowData;
            })
            .filter((item) => Object.values(item).some((v) => v !== '' && v !== 0));
    }

    /**
     * Logic tính toán giá
     */
    calculatePrices() {
        try {
            this.calcFooter();
            const data = this._collectData();

            data.footers = this.currentData?.footers;
            const results = PricingEngine.calculateAll(data.services, data.info, data.footers);
            if (results) {
                let { footers, ...rest } = results;
                this.currentData = { ...data, footers };
                this.currentData.results = rest;
                this._renderResults(rest);
            }
        } catch (error) {
            console.error('TourPrice.calculatePrices error:', error);
        }
    }

    /**
     * Xóa dữ liệu hiện tại trong Modal
     */
    clearData() {
        try {
            this.currentData = this._getEmptyData();
            this._fillModalData(this.currentData);
            // this.calculatePrices();
            logA('Đã xóa dữ liệu hiện tại.', 'info');
        } catch (error) {
            Opps('TourPrice.clearData error:', error);
        }
    }

    /**
     * Khởi tạo DataLists từ APP_DATA
     */
    _initDataLists() {
        // Khách sạn
        const hotels = Object.values(APP_DATA.hotels || {}).map((h) => h.name);
        setDataList('dl-hotels', hotels);

        // Tên dịch vụ (từ các bảng giá dịch vụ hiện có)
        const serviceNames = new Set();
        Object.values(APP_DATA.service_price_schedules || {}).forEach((s) => {
            if (s.items) s.items.forEach((item) => serviceNames.add(item.name));
        });
        setDataList('dl-service-names', Array.from(serviceNames));

        // Loại dịch vụ
        setDataList('dl-service-types', ['Vé MB', 'Vé Tàu', 'Tour', 'Ăn', 'Vé', 'HDV', 'Xe', 'DV Khác']);
    }

    /**
     * Render kết quả tính toán vào Modal
     */
    _renderResults(results) {
        // 1. Bảng giá gốc người lớn
        const adultBody = getE('tp-table-base-adult-body');
        if (adultBody) {
            adultBody.innerHTML = results.base_adult
                .map((item) => {
                    const selling = results.selling_adult.find((s) => s.pax === item.pax);
                    return `
          <tr>
            <td class="fw-bold">${item.pax} NL</td>
            <td class="text-muted small">${formatNumber(item.price)}</td>
            <td class="fw-bold text-primary">${selling ? formatNumber(selling.price) : '-'}</td>
          </tr>
        `;
                })
                .join('');
        }

        // 2. Bảng giá gốc trẻ em
        const childBody = getE('tp-table-base-child-body');
        if (childBody) {
            childBody.innerHTML = results.base_child
                .map(
                    (row) => `
        <tr>
          <td class=" fw-bold small">${row.label}</td>
          ${row.prices.map((p) => `<td><div class="small text-muted" style="font-size:0.65rem">${formatNumber(p.price)}</div><div class="fw-bold text-success">${formatNumber(p.selling)}</div></td>`).join('')}
        </tr>
      `
                )
                .join('');
        }

        // 3. Bảng phụ thu
        const surchargeBody = getE('tp-table-surcharge-body');
        if (surchargeBody) {
            surchargeBody.innerHTML = `
        <tr>
          <td class="small">Người Lớn</td>
          <td class="fw-bold text-danger">${formatNumber(results.surcharges.adult.peak)}</td>
          <td class="fw-bold text-danger">${formatNumber(results.surcharges.adult.holiday)}</td>
        </tr>
        <tr>
          <td class="small">Trẻ Em</td>
          <td class="fw-bold text-danger">${formatNumber(results.surcharges.child.peak)}</td>
          <td class="fw-bold text-danger">${formatNumber(results.surcharges.child.holiday)}</td>
        </tr>
      `;
        }
    }

    /**
     * Render giao diện chính (Bảng giá bán cho Sales - Chuẩn A4)
     */
    _renderMainUI() {
        try {
            const results = this.currentData.results;
            const info = this.currentData.info;
            if (!results || !info) return;

            // 1. Render Format 1 (Mặc định)
            this._renderFormat1(results, info);

            // 2. Nếu đang ở Mode 2, render luôn Format 2
            const doc = getE('tp-a4-document');
            if (doc && doc.dataset.viewMode === '2') {
                this._renderFormat2();
            }
        } catch (error) {
            Opps('TourPrice._renderMainUI error:', error);
        }
    }

    /**
     * Render dữ liệu cho Format 1
     */
    _renderFormat1(results, info) {
        // 1. Thông tin chung
        setText('tp-doc-title', `[ƯU ĐÃI] TOUR "${this.currentData.tour_name || 'CHƯA ĐẶT TÊN'}" 💖`);
        setText('tp-doc-duration', info.duration ? `(${info.duration})` : '');
        setText('tp-doc-list-price', info.list_price ? formatNumber(info.list_price) : '');

        // Lấy giá bán "Chỉ từ"
        const minSelling = results.selling_adult.length > 0 ? Math.min(...results.selling_adult.map((s) => s.price)) : 0;
        setText('tp-doc-selling-price', minSelling ? formatNumber(minSelling) : '-');

        // 2. Bảng giá bán người lớn (2-10 pax)
        const adultBody = getE('tp-doc-adult-body');
        if (adultBody) {
            adultBody.innerHTML = results.selling_adult
                .filter((item) => item.pax >= 2 && item.pax <= 10)
                .map(
                    (item) => `
        <tr>
          <td class="fw-bold">${item.pax}</td>
          <td class="text-danger">-${formatNumber(item.discount)}</td>
          <td class="fw-bold text-primary fs-5">${formatNumber(item.price)}</td>
        </tr>
      `
                )
                .join('');
        }

        // 3. Bảng giá bán trẻ em (Matrix)
        const childBody = getE('tp-doc-child-body');
        if (childBody) {
            childBody.innerHTML = results.base_child
                .map((row) => {
                    const pricesHtml = row.prices
                        .map((p) => {
                            const val = p.selling > 0 ? formatNumber(p.selling) : '0';
                            return `<td>${val}</td>`;
                        })
                        .join('');

                    const adultPriceHtml = `<td>Người Lớn</td>`;

                    return `
          <tr>
            <td class="fw-bold bkg-light">${row.label}</td>
            ${pricesHtml}
            ${adultPriceHtml}
          </tr>
        `;
                })
                .join('');
        }

        // 4. Quy định & Lưu ý
        const notes = info.notes || '';
        const regulations = info.regulations || '';
        const surcharges = results.surcharges;

        let notesHtml = '<ul class="ps-3 mb-0">';
        if (notes) notesHtml += `<li>${notes.replace(/\n/g, '</li><li>')}</li>`;
        if (regulations) notesHtml += `<li>${regulations.replace(/\n/g, '</li><li>')}</li>`;
        notesHtml += '</ul>';
        setHTML('tp-doc-notes', notesHtml || '<p class="text-muted italic mb-0">Chưa có thông tin.</p>');

        let surchargesHtml = '<ul class="ps-3 mb-0">';
        if (surcharges) {
            surchargesHtml += `<li class="fw-bold text-danger">Cao Điểm: ${formatNumber(surcharges.adult.peak)}/NL</li>`;
            surchargesHtml += `<li class="fw-bold text-danger">Lễ Tết: ${formatNumber(surcharges.adult.holiday)}/NL</li>`;
            surchargesHtml += `<li class="text-muted mt-1">Trẻ em: ${formatNumber(surcharges.child.peak)} (CĐ) / ${formatNumber(surcharges.child.holiday)} (Lễ)</li>`;
        }
        surchargesHtml += '</ul>';
        setHTML('tp-doc-surcharges', surchargesHtml);
    }

    /**
     * Lưu dữ liệu
     */
    async saveData() {
        try {
            const data = this._collectData();
            if (!data.id || !data.tour_name) {
                return logA('Vui lòng nhập Mã Tour và Tên Tour', 'warning');
            }

            showLoading(true, 'Đang lưu bảng giá...');

            // 1. Lưu Giá Gốc vào Firestore (tour_prices)
            const baseData = {
                ...data,
                results: this.currentData.results, // Đảm bảo lưu cả kết quả tính toán
                updated_at: new Date().toISOString(),
            };
            const res = await A.DB.saveRecord('tour_prices', baseData);

            if (res.success) {
                // 2. Lưu Giá Bán vào IndexedDB (để Sales truy cập nhanh)
                await A.DB.local.put('tour_prices', {
                    id: data.id,
                    tour_name: data.tour_name,
                    status: data.status,
                    results: this.currentData.results || {},
                    info: data.info,
                    services: data.services,
                    updated_at: baseData.updated_at,
                });

                logA('Đã lưu bảng giá thành công!', 'success', 'toast');
                this._updateTourSelect();
                setVal('tp-tour-select', data.id);
                this._renderMainUI();

                // Đóng modal
                A.Modal.hide();
            } else {
                throw new Error(res.error || 'Lỗi khi lưu vào Firestore');
            }
        } catch (error) {
            Opps('TourPrice.saveData error:', error);
        } finally {
            showLoading(false);
        }
    }

    /**
     * Load dữ liệu từ APP_DATA hoặc IndexedDB
     */
    async loadData(id) {
        if (!id) id = getVal('tp-tour-select');
        if (!id) return logA('❌ Lỗi: ID not found.', 'error');
        try {
            // 1. Thử lấy từ APP_DATA (Firestore sync)
            let data = APP_DATA.tour_prices?.[id];

            // 2. Nếu không có, thử lấy từ IndexedDB (tour_prices)
            if (!data) {
                const localData = await A.DB.local.get('tour_prices', id);
                if (localData) {
                    data = {
                        id: localData.id,
                        tour_name: localData.tour_name,
                        results: localData.results || {},
                        info: localData.info,
                        services: localData.services || this._getEmptyData().services,
                    };
                }
            }

            if (data) {
                this.currentData = JSON.parse(JSON.stringify(data));
                this._renderMainUI();
            } else {
                logA('Không tìm thấy dữ liệu bảng giá này.', 'warning');
            }
        } catch (error) {
            Opps('TourPrice.loadData error:', error);
        }
    }

    /**
     * Xóa bảng giá
     */
    async deletePrice() {
        try {
            const id = getVal('tp-base-id');
            if (!id) return;

            const ok = await showConfirm(`Bạn có chắc chắn muốn xóa bảng giá [${id}]? Thao tác này không thể hoàn tác.`);
            if (!ok) return;

            showLoading(true, 'Đang xóa bảng giá...');

            // 1. Xóa khỏi Firestore
            const res = await A.DB.deleteRecord('tour_prices', id);

            if (res.success) {
                // 2. Xóa khỏi IndexedDB
                await A.DB.local.delete('tour_prices', id);

                logA('Đã xóa bảng giá thành công!', 'success');

                // 3. Cập nhật UI
                if (APP_DATA.tour_prices) delete APP_DATA.tour_prices[id];
                this._updateTourSelect();
                this.currentData = this._getEmptyData();
                this._renderMainUI();

                A.Modal.hide();
            } else {
                throw new Error(res.error || 'Lỗi khi xóa khỏi Firestore');
            }
        } catch (error) {
            Opps('TourPrice.deletePrice error:', error);
        } finally {
            showLoading(false);
        }
    }

    /**
     * Điền dữ liệu vào Modal
     */
    _fillModalData(data) {
        setVal('tp-base-id', data.id);
        setVal('tp-base-name', data.tour_name);
        setVal('tp-base-status', data.status);
        setVal('tp-base-duration', data.info.duration);
        setNum('tp-base-list-price', data.info.list_price);
        setVal('tp-base-hook', data.info.hook);
        setNum('tp-base-profit-adult', data.info.profit_adult);
        setNum('tp-base-profit-child', data.info.profit_child);
        setVal('tp-base-notes', data.info.notes);
        setVal('tp-base-regulations', data.info.regulations);

        this._fillTableData('tp-table-hotel-body', data.services.hotels, 'hotel');
        this._fillTableData('tp-table-private-body', data.services.private, 'private');
        this._fillTableData('tp-table-common-body', data.services.common, 'common');
        this._fillTableData('tp-table-car-body', data.services.cars, 'car');
    }

    /**
     * Helper điền dữ liệu vào bảng
     */
    _fillTableData(tbodyId, dataList = [], type) {
        const tbody = getE(tbodyId);
        if (!tbody) return;

        // Xóa hàng cũ
        tbody.innerHTML = '';

        // Đảm bảo đủ số hàng (tối thiểu 4 hàng hoặc theo data)
        const rowCount = Math.max(dataList.length, type === 'private' ? 10 : 4);
        this._generateTableRows(tbodyId, rowCount, this._getColsByType(type));

        const rows = Array.from(tbody.querySelectorAll('tr'));
        rows.forEach((row, i) => {
            const rowData = dataList[i] || {};
            row.querySelectorAll('.tp-input').forEach((input) => {
                const field = input.dataset.field;
                if (input.classList.contains('number')) {
                    setNum(input, rowData[field] || 0);
                } else {
                    setVal(input, rowData[field] || '');
                }
            });
        });
    }

    _getColsByType(type) {
        switch (type) {
            case 'hotel':
                return [
                    { field: 'name', type: 'text', list: 'dl-hotels' },
                    { field: 'price', type: 'number' },
                    { field: 'nights', type: 'number' },
                    { field: 'child', type: 'number' },
                    { field: 'extrabed', type: 'number' },
                    { field: 'peak', type: 'number' },
                    { field: 'holiday', type: 'number' },
                ];
            case 'private':
                return [
                    { field: 'type', type: 'text', list: 'dl-service-types' },
                    { field: 'name', type: 'text', list: 'dl-service-names' },
                    { field: 'adult', type: 'number' },
                    { field: 'child', type: 'number' },
                    { field: 'peak', type: 'number' },
                    { field: 'holiday', type: 'number' },
                ];
            case 'common':
                return [
                    { field: 'type', type: 'text', list: 'dl-service-types' },
                    { field: 'name', type: 'text', list: 'dl-service-names' },
                    { field: 'price', type: 'number' },
                    { field: 'qty', type: 'number' },
                ];
            case 'car':
                return [
                    { field: 'name', type: 'text' },
                    { field: 'p7', type: 'number' },
                    { field: 'p16', type: 'number' },
                    { field: 'p29', type: 'number' },
                    { field: 'p35', type: 'number' },
                    { field: 'p45', type: 'number' },
                ];
            default:
                return [];
        }
    }

    /**
     * Cập nhật danh sách tour vào select
     */
    _updateTourSelect() {
        const select = getE('tp-tour-select');
        if (!select) return;

        const tourPrices = Object.values(APP_DATA.tour_prices || {});
        let html = '<option value="">-- Chọn Tour/Combo --</option>';

        tourPrices.forEach((tp) => {
            html += `<option value="${tp.id}">${tp.tour_name} (${tp.id})</option>`;
        });

        select.innerHTML = html;
    }

    /**
     * Xuất PDF
     */
    async exportPDF() {
        try {
            await SYS.loadLibraryAsync('html2pdf');
            const element = getE('tp-a4-document');
            if (!element) return Opps('Không tìm thấy nội dung để xuất PDF');

            const opt = {
                filename: `Bang_Gia_${this.currentData.tour_name || 'Tour'}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: {
                    scale: 2,
                    useCORS: true,
                    logging: false,
                    letterRendering: true,
                    backgroundColor: '#fffdf2',
                    pagebreak: { mode: 'avoid-all' },
                },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            };

            showLoading(true, 'Đang xuất PDF...');
            const worker = html2pdf().set(opt).from(element);
            await worker.save();
            showLoading(false);
            logA('Đã xuất file PDF thành công!', 'success');
        } catch (error) {
            showLoading(false);
            Opps('Export error:', error);
        }
    }

    /**
     * Xuất Ảnh chất lượng cao
     */
    async exportImage() {
        try {
            // Sử dụng dom-to-image (CDN)
            const libUrl = 'https://cdnjs.cloudflare.com/ajax/libs/dom-to-image/2.6.0/dom-to-image.min.js';
            if (typeof window.domtoimage === 'undefined') {
                await new Promise((resolve) => {
                    const script = document.createElement('script');
                    script.src = libUrl;
                    script.onload = resolve;
                    document.head.appendChild(script);
                });
            }

            const element = getE('tp-a4-document');
            if (!element) return Opps('Không tìm thấy nội dung để xuất ảnh');

            showLoading(true, 'Đang tạo ảnh chất lượng cao...');

            // Tối ưu render ảnh: Tránh lỗi lệch 50% bằng cách không dùng transform scale trực tiếp lên element gốc
            // Thay vào đó, dom-to-image sẽ tự xử lý kích thước nếu ta truyền width/height lớn hơn
            const scale = 2;
            const options = {
                width: element.offsetWidth * scale,
                height: element.offsetHeight * scale,
                style: {
                    transform: `scale(${scale})`,
                    transformOrigin: 'top left',
                    width: element.offsetWidth + 'px',
                    height: element.offsetHeight + 'px',
                    margin: '0', // Reset margin để tránh lệch
                    left: '0',
                    top: '0',
                },
                quality: 0.95,
                bgcolor: '#fffdf2',
            };

            // Sử dụng toJpeg
            const dataUrl = await window.domtoimage.toJpeg(element, options);

            const link = document.createElement('a');
            link.download = `Bang_Gia_${this.currentData.tour_name || 'Tour'}.jpg`;
            link.href = dataUrl;
            link.click();

            showLoading(false);
            logA('Đã tải ảnh thành công!', 'success');
        } catch (error) {
            showLoading(false);
            console.warn('dom-to-image failed, trying html2canvas fallback...');
            this._exportImageFallback();
        }
    }

    /**
     * Fallback export image using html2canvas
     */
    async _exportImageFallback() {
        try {
            const element = getE('tp-a4-document');
            if (typeof html2canvas === 'undefined') {
                await SYS.loadLibraryAsync('html2pdf');
            }

            const canvas = await html2canvas(element, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#fffdf2',
                logging: false,
            });

            const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
            const link = document.createElement('a');
            link.download = `Bang_Gia_${this.currentData.tour_name || 'Tour'}.jpg`;
            link.href = dataUrl;
            link.click();

            showLoading(false);
            logA('Đã tải ảnh thành công (fallback)!', 'success');
        } catch (error) {
            showLoading(false);
            Opps('Export Image Fallback error:', error);
        }
    }

    _getEmptyData() {
        return {
            id: '',
            tour_id: '',
            tour_name: '',
            status: 'draft',
            info: {
                duration: '',
                list_price: 0,
                hook: '',
                profit_adult: 0,
                profit_child: 0,
                notes: '',
                regulations: '',
            },
            services: {
                hotels: [],
                private: [],
                common: [],
                cars: [],
            },
            footers: {
                hotels: { adult: 0, child: 0, single: 0, peak: 0, holiday: 0 },
                private: { adult: 0, child: 0, peak: 0, holiday: 0 },
                common: { adult: 0 },
                cars: { p7: 0, p16: 0, p29: 0, p35: 0, p45: 0 },
            },
        };
    }
}
