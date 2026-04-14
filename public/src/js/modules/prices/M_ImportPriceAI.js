/**
 * =========================================================================
 * MODULE: PriceImportAI.js
 * Tính năng: Render UI vào #tab-price-pkg, Upload File (Ảnh/PDF), Gọi Firebase Function,
 * Render Grid Review & Form Thông tin chung, Lưu trữ lịch sử IndexedDB.
 * Người cập nhật: 9Trip Tech Lead
 * =========================================================================
 */

import { getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';
import ATable from '../core/ATable.js';

export default class PriceImportAI {
    constructor(cdm = null) {
        this.containerId = null;
        this.extractedData = []; // Lưu trữ dữ liệu items (bảng giá)
        this.metadata = {}; // Lưu thông tin metadata (Năm, NCC)
        this.hotelInfo = null; // Lưu thông tin khách sạn bóc tách được (nếu có)

        this.currentImportType = 'hotel_price'; // Default
        this.cdm = cdm; // Centralized Data Manager (PriceManager)
        this.table = null;
        this.storeName = 'ai_prices';
        this._eventsAttached = false;
    }

    /**
     * Khởi tạo Module. Tự động tìm container và render.
     */
    async init(containerId) {
        try {
            if (!this.containerId) this.containerId = containerId || 'tab-price-pkg';
            const container = getE(this.containerId);
            if (!container) {
                L._(`[PriceImportAI] Không tìm thấy phần tử #${this.containerId}. Bỏ qua khởi tạo.`, null, 'warning');
                return;
            }

            // Render bộ khung UI (Action Bar + Hotel Info Form + Data Grid)
            container.innerHTML = this._buildUI();

            // Gắn các sự kiện (Event Listeners) - Sử dụng Delegation để an toàn hơn
            this._attachEvents();

            // Cập nhật danh sách lịch sử
            await this._updateHistorySelect(container);

            L._(`[PriceImportAI] Khởi tạo thành công tại #${this.containerId}`);
        } catch (error) {
            Opps('[PriceImportAI] init error:', error);
        }
    }

    /**
     * Hiển thị Modal Import AI (Sử dụng khi gọi từ nút ngoài)
     * @param {string} type - 'hotel_price' | 'service_price'
     */
    async showImportModal(type = 'hotel_price') {
        try {
            this.currentImportType = type;
            const htmlContent = this._buildUI();

            if (A.Modal) {
                await A.Modal.render(htmlContent, 'AI Import - Trích xuất bảng giá', { size: 'modal-xl' });
                await this._updateHistorySelect();
                this._attachEvents();
                A.Modal.show();
                const typeSelect = getE('#ai-import-type');
                if (typeSelect) typeSelect.value = type;
            }
        } catch (error) {
            Opps('[PriceImportAI] Lỗi khi hiển thị Modal:', error);
        }
    }

    /**
     * Dựng UI bằng Bootstrap. Đảm bảo Mobile First.
     * Chú ý: Có thêm vùng chứa #ai-hotel-info-container
     * @private
     */
    _buildUI() {
        return `
      <div class="ai-import-wrapper d-flex flex-column h-100" style="min-height: 80vh;">
          <div class="action-bar p-3 bg-light border-bottom sticky-top shadow-sm d-flex flex-wrap gap-2 align-items-center">
              
              <div class="input-group input-group-sm" style="max-width: 200px;">
                  <span class="input-group-text"><i class="fa-solid fa-layer-group"></i></span>
                  <select id="ai-import-type" class="form-select">
                      <option value="hotel_price">Bảng giá Khách sạn</option>
                      <option value="service_price">Bảng giá Dịch vụ</option>
                  </select>
              </div>

              <div class="input-group input-group-sm" style="max-width: 250px;">
                  <span class="input-group-text bg-info text-white"><i class="fa-solid fa-clock-rotate-left"></i></span>
                  <select id="ai-history-select" class="form-select">
                      <option value="">-- Lịch sử trích xuất --</option>
                  </select>
              </div>

              <input type="file" id="ai-file-upload" class="d-none" accept="image/jpeg, image/png, application/pdf">
              
              <button type="button" class="btn btn-sm btn-primary" id="btn-trigger-upload">
                  <i class="fa-solid fa-wand-magic-sparkles me-1"></i> Upload File & Extract
              </button>

              <div class="btn-group btn-group-sm gap-2">
                  <button type="button" class="btn btn-outline-success" id="btn-ai-save-local" title="Lưu vào bộ nhớ tạm">
                      <i class="fa-solid fa-floppy-disk"></i> Lưu tạm
                  </button>
                  <button type="button" class="btn btn-outline-danger" id="btn-ai-delete-local" title="Xóa lịch sử">
                      <i class="fa-solid fa-trash-can"></i>
                  </button>
              </div>
              
              <div class="ms-auto d-flex gap-2 mt-2 mt-sm-0">
                  <button type="button" class="btn btn-sm btn-secondary" id="btn-ai-clear">
                      <i class="fa-solid fa-eraser"></i> Xóa Trắng
                  </button>
                  <button type="button" class="btn btn-sm btn-danger fw-bold shadow" id="btn-ai-save">
                      <i class="fa-solid fa-cloud-arrow-up me-1"></i> XÁC NHẬN & ĐẨY VÀO ERP
                  </button>
              </div>
          </div>

          <div id="ai-loading-indicator" class="d-none text-center p-5">
              <div class="spinner-border text-primary" role="status"></div>
              <p class="mt-2 text-muted fw-bold blink-text">🤖 AI đang đọc và phân tích tài liệu (hỗ trợ cả PDF & Ảnh)... Vui lòng đợi...</p>
          </div>

          <div class="flex-grow-1 p-0 overflow-auto bg-white d-flex flex-column">
              <div id="ai-hotel-info-container" class="d-none bg-light p-3 border-bottom shadow-sm"></div>

              <div id="ai-data-grid-container" class="flex-grow-1 w-100 p-2">
                  <div class="text-center text-muted p-5 border border-dashed rounded m-3">
                      <i class="fa-solid fa-file-pdf fa-3x mb-3 text-secondary opacity-50"></i>
                      <h5>Chưa có dữ liệu</h5>
                      <p class="small">Vui lòng tải lên file báo giá hoặc chọn từ lịch sử để AI trích xuất.</p>
                  </div>
              </div>
          </div>
      </div>
    `;
    }

    /**
     * Gắn sự kiện cho các nút bấm sử dụng A.Event.on (Lazy Delegation)
     * @private
     */
    _attachEvents() {
        try {
            L._('AI: Attaching events...');
            // 1. Thay đổi loại import
            A.Event.on(
                '#ai-import-type',
                'change',
                (e, target) => {
                    this.currentImportType = target.value;
                },
                true
            );

            // 2. Chọn từ lịch sử
            A.Event.on(
                '#ai-history-select',
                'change',
                (e, target) => {
                    if (target.value) this._loadFromLocal(target.value);
                },
                true
            );

            // 3. Trigger upload file
            A.Event.on(
                '#btn-trigger-upload',
                'click',
                () => {
                    const fileInput = getE('ai-file-upload');
                    if (fileInput) fileInput.click();
                },
                true
            );

            // 4. Xử lý file upload (Sự kiện change trên input file không nên dùng lazy delegation vì lý do bảo mật trình duyệt)
            // Tuy nhiên, vì input file nằm trong container được render, ta gán trực tiếp hoặc dùng delegation cấp gần nhất.
            // Ở đây dùng delegation vào document cho đồng bộ, A.Event.on xử lý tốt.
            A.Event.on(
                '#ai-file-upload',
                'change',
                (e) => {
                    this._handleFileUpload(e);
                },
                true
            );

            // 5. Lưu tạm vào Local (IndexedDB)
            A.Event.on('#btn-ai-save-local', 'click', () => this._saveToLocal(), true);

            // 6. Xóa bản lưu Local
            A.Event.on('#btn-ai-delete-local', 'click', () => this._deleteFromLocal(), true);

            // 7. Xóa trắng UI
            A.Event.on(
                '#btn-ai-clear',
                'click',
                () => {
                    this.extractedData = [];
                    this.metadata = {};
                    this.hotelInfo = null;
                    this._renderGrid();
                },
                true
            );

            // 8. Xác nhận và lưu vào ERP
            A.Event.on('#btn-ai-save', 'click', () => this._handleSaveToDB(), true);

            this._eventsAttached = true;
        } catch (error) {
            Opps('[PriceImportAI] _attachEvents error:', error);
        }
    }

    /**
     * TỐI ƯU: Lưu dữ liệu hiện tại vào IndexedDB (Chụp lại toàn bộ Form UI + Data Grid)
     */
    async _saveToLocal() {
        try {
            const data = this.table ? this.table.getData() : this.extractedData;
            if (!data || data.length === 0) {
                logA('Không có dữ liệu bảng giá để lưu tạm', 'warning', 'toast');
                return;
            }

            // Lấy dữ liệu mới nhất từ form UI
            const finalHotelInfo = this._getLatestHotelInfo() || this.hotelInfo;
            const defaultName = finalHotelInfo?.name ? `Báo giá ${finalHotelInfo.name}` : `Bản lưu ${new Date().toLocaleTimeString('vi-VN')}`;

            const name = await new Promise((resolve) => {
                Swal.fire({
                    title: 'Lưu bản nháp AI',
                    input: 'text',
                    inputValue: defaultName,
                    showCancelButton: true,
                    confirmButtonText: '<i class="fa-solid fa-floppy-disk"></i> Lưu',
                    cancelButtonText: 'Hủy',
                }).then((result) => {
                    resolve(result.isConfirmed ? result.value : null);
                });
            });

            if (!name) return;

            const record = {
                id: 'save-' + Date.now(),
                name: name,
                type: this.currentImportType,
                data: data,
                metadata: this.metadata || {},
                hotelInfo: finalHotelInfo,
                timestamp: Date.now(),
            };

            const success = await A.DB.local.put(this.storeName, record);
            if (success) {
                logA('Đã lưu bản nháp thành công!', 'success', 'toast');
                await this._updateHistorySelect();

                // Auto select bản vừa lưu để UI khớp trạng thái
                const historySelect = getE('ai-history-select');
                if (historySelect) historySelect.value = record.id;
            }
        } catch (error) {
            Opps('[PriceImportAI] _saveToLocal error:', error);
        }
    }

    /**
     * TỐI ƯU: Tải dữ liệu từ IndexedDB, render lại Form UI và Grid hoàn chỉnh
     */
    async _loadFromLocal(id) {
        try {
            this._toggleLoading(true);
            const record = await A.DB.local.get(this.storeName, id);
            if (record) {
                this.extractedData = record.data || [];
                this.metadata = record.metadata || {};
                this.hotelInfo = record.hotelInfo || null;
                this.currentImportType = record.type;

                const typeSelect = getE('ai-import-type');
                if (typeSelect) typeSelect.value = record.type;

                this._renderGrid();
                logA(`Đã tải bản nháp: ${record.name}`, 'success', 'toast');
            } else {
                logA('Không tìm thấy bản lưu này!', 'error', 'toast');
            }
        } catch (error) {
            Opps('[PriceImportAI] _loadFromLocal error:', error);
        } finally {
            this._toggleLoading(false);
        }
    }

    /**
     * TỐI ƯU: Xóa bản lưu từ IndexedDB và Clear UI gọn gàng
     */
    async _deleteFromLocal() {
        try {
            const historySelect = getE('ai-history-select');
            const selectedId = historySelect ? historySelect.value : '';

            const msg = selectedId ? 'Bạn có chắc chắn muốn xóa bản lưu nháp này?' : 'Bạn có chắc chắn muốn xóa TOÀN BỘ lịch sử lưu tạm?';

            const confirm = await showConfirm(msg);
            if (!confirm) return;

            let success = false;
            if (selectedId) {
                success = await A.DB.local.delete(this.storeName, selectedId);
            } else {
                success = await A.DB.local.clear(this.storeName);
            }

            if (success) {
                logA('Đã xóa thành công!', 'success', 'toast');
                await this._updateHistorySelect();

                // Trả UI về trạng thái rỗng nếu đang xóa bản hiện tại
                if (selectedId) {
                    this.extractedData = [];
                    this.hotelInfo = null;
                    this.metadata = {};
                    if (historySelect) historySelect.value = '';
                    this._renderGrid();
                }
            }
        } catch (error) {
            Opps('[PriceImportAI] _deleteFromLocal error:', error);
        }
    }

    async _updateHistorySelect(container = document) {
        try {
            const historySelect = getE('#ai-history-select');
            if (!historySelect) return;

            const records = await A.DB.local.getCollection(this.storeName);
            if (Array.isArray(records)) {
                records.sort((a, b) => b.timestamp - a.timestamp);
                let html = '<option value="">-- Lịch sử trích xuất --</option>';
                records.forEach((r) => {
                    const time = new Date(r.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
                    const date = new Date(r.timestamp).toLocaleDateString('vi-VN');
                    html += `<option value="${r.id}">${r.name} (${time} ${date})</option>`;
                });
                historySelect.innerHTML = html;
            }
        } catch (error) {
            console.error('[PriceImportAI] _updateHistorySelect error:', error);
        }
    }

    /**
     * Đọc file (Ảnh/PDF) thành Base64 và gọi Backend
     * @private
     */
    async _handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        // Reset input để có thể chọn lại cùng 1 file nếu cần
        event.target.value = '';

        try {
            this._toggleLoading(true);

            const base64String = await this._fileToBase64(file);
            const base64Data = base64String.split(',')[1];
            const mimeType = file.type;

            L._(`[PriceImportAI] Gửi Backend xử lý file: ${file.name} (${mimeType})`);

            let result;
            if (window.A?.DB?.callFunction) {
                result = await A.DB.callFunction('processDocumentAI', {
                    fileBase64: base64Data,
                    mimeType: mimeType,
                    importType: this.currentImportType,
                    fileName: file.name,
                });
            } else {
                const functions = getFunctions(getApp(), 'asia-southeast1');
                const processDocumentAI = httpsCallable(functions, 'processDocumentAI');
                result = await processDocumentAI({
                    fileBase64: base64Data,
                    mimeType: mimeType,
                    importType: this.currentImportType,
                    fileName: file.name,
                });
            }

            if (result.data && result.success) {
                this.extractedData = this._normalizeAIData(result.data.items);
                this.metadata = result.data.metadata || {};
                this.hotelInfo = result.data.hotel_info || null; // Lấy thêm info khách sạn

                L._(`AI đã bóc tách được ${this.extractedData.length} dòng dữ liệu.`);
                this._renderGrid();
            } else {
                throw new Error(result?.message || result?.code || 'AI không thể trích xuất dữ liệu.');
            }
        } catch (error) {
            Opps('[PriceImportAI] Lỗi trích xuất AI:', error);
        } finally {
            this._toggleLoading(false);
        }
    }

    _normalizeAIData(data) {
        if (!Array.isArray(data)) return [];
        return data.map((item) => {
            const normalized = { id: 'ai-' + Date.now() + Math.random() };
            for (const [key, value] of Object.entries(item)) {
                const k = key.toLowerCase();
                if (k.includes('room') || k.includes('phòng')) normalized.room_name = value;
                else if (k.includes('period') || k.includes('giai đoạn')) normalized.period_name = value;
                else if (k.includes('package') || k.includes('gói')) normalized.package_name = value;
                else if (k.includes('type') || k.includes('loại')) normalized.rate_type_name = value;
                else if (k.includes('price') || k.includes('giá')) normalized.price = value;

                const cleanKey = k.replace(/\s+/g, '-');
                normalized[cleanKey] = value;
            }
            return normalized;
        });
    }

    /**
     * Trích xuất thông tin khách sạn mới nhất từ Form HTML (Human-in-the-loop)
     * @private
     */
    _getLatestHotelInfo() {
        if (!this.hotelInfo || this.currentImportType !== 'hotel_price') return null;
        const container = getE('ai-hotel-info-container');
        if (!container) return this.hotelInfo;

        return {
            name: container.querySelector('[name="hi_name"]')?.value || '',
            address: container.querySelector('[name="hi_address"]')?.value || '',
            phone: container.querySelector('[name="hi_phone"]')?.value || '',
            email: container.querySelector('[name="hi_email"]')?.value || '',
            star: parseInt(container.querySelector('[name="hi_star"]')?.value) || 0,
            website: container.querySelector('[name="hi_website"]')?.value || '',
            pictures: this.hotelInfo.pictures || [],
            rooms: this.hotelInfo.rooms || [],
        };
    }

    _renderGrid() {
        try {
            const infoContainer = getE('ai-hotel-info-container');
            const gridContainer = getE('ai-data-grid-container');
            if (!gridContainer) return;

            // Logic Fallback: Nếu không có supplier_name thì lấy tên Khách sạn
            let supplierName = (this.metadata?.supplier_name || '').trim();
            if (!supplierName && this.hotelInfo?.name) {
                supplierName = this.hotelInfo.name.trim();
            }

            if (infoContainer) {
                if (this.currentImportType === 'hotel_price') {
                    // --- FORM CHO KHÁCH SẠN ---
                    infoContainer.classList.remove('d-none');

                    // Render danh sách phòng bóc tách được (Badge)
                    let roomsHtml = '';
                    if (this.hotelInfo?.rooms && Array.isArray(this.hotelInfo.rooms)) {
                        roomsHtml = `
              <div class="mt-2">
                <label class="small text-muted fw-bold d-block mb-1">Hạng phòng bóc tách được:</label>
                <div class="d-flex flex-wrap gap-1">
                  ${this.hotelInfo.rooms
                      .map((r) => {
                          const rName = typeof r === 'string' ? r : r.name || 'N/A';
                          return `<span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle">${rName}</span>`;
                      })
                      .join('')}
                </div>
              </div>
            `;
                    }

                    infoContainer.innerHTML = `
            <div class="d-flex align-items-center mb-2">
                <i class="fa-solid fa-hotel text-primary me-2"></i>
                <h6 class="mb-0 fw-bold">Thông tin Khách sạn & Nhà cung cấp</h6>
                <small class="text-muted ms-2">- Vui lòng kiểm tra và sửa nếu cần</small>
            </div>
            <div class="row g-2 mb-2 pb-2 border-bottom border-dashed">
                <div class="col-md-6">
                    <label class="small text-muted fw-bold">Tên Nhà Cung Cấp (Sẽ lưu vào Data NCC)</label>
                    <input type="text" class="form-control form-control-sm fw-bold text-success shadow-none border-success" name="hi_supplier_name" value="${supplierName}">
                </div>
            </div>
            <div class="row g-2">
                <div class="col-md-4">
                    <label class="small text-muted">Tên KS</label>
                    <input type="text" class="form-control form-control-sm fw-bold text-primary" name="hi_name" value="${this.hotelInfo?.name || ''}">
                </div>
                <div class="col-md-2">
                    <label class="small text-muted">Hạng sao</label>
                    <input type="number" class="form-control form-control-sm" name="hi_star" value="${this.hotelInfo?.star || ''}" min="1" max="5">
                </div>
                <div class="col-md-6">
                    <label class="small text-muted">Địa chỉ</label>
                    <input type="text" class="form-control form-control-sm" name="hi_address" value="${this.hotelInfo?.address || ''}">
                </div>
                <div class="col-md-4">
                    <label class="small text-muted">Số ĐT</label>
                    <input type="text" class="form-control form-control-sm" name="hi_phone" value="${this.hotelInfo?.phone || ''}">
                </div>
                <div class="col-md-4">
                    <label class="small text-muted">Email</label>
                    <input type="text" class="form-control form-control-sm" name="hi_email" value="${this.hotelInfo?.email || ''}">
                </div>
                <div class="col-md-4">
                    <label class="small text-muted">Website</label>
                    <input type="text" class="form-control form-control-sm" name="hi_website" value="${this.hotelInfo?.website || ''}">
                </div>
            </div>
            ${roomsHtml}
          `;
                } else if (this.currentImportType === 'service_price') {
                    // --- FORM RÚT GỌN CHO DỊCH VỤ ---
                    infoContainer.classList.remove('d-none');
                    infoContainer.innerHTML = `
            <div class="d-flex align-items-center mb-2">
                <i class="fa-solid fa-truck-fast text-success me-2"></i>
                <h6 class="mb-0 fw-bold">Thông tin Nhà cung cấp Dịch vụ</h6>
            </div>
            <div class="row g-2">
                <div class="col-md-6">
                    <label class="small text-muted">Tên Nhà Cung Cấp (Bắt buộc)</label>
                    <input type="text" class="form-control form-control-sm fw-bold text-success border-success" name="hi_supplier_name" value="${supplierName}">
                </div>
            </div>
          `;
                } else {
                    infoContainer.classList.add('d-none');
                    infoContainer.innerHTML = '';
                }
            }

            // 2. Render Bảng giá (Grid)
            if (!this.extractedData || this.extractedData.length === 0) {
                gridContainer.innerHTML = `
            <div class="text-center text-muted p-5 border border-dashed rounded m-3">
                <i class="fa-solid fa-file-pdf fa-3x mb-3 text-secondary opacity-50"></i>
                <h5>Bảng dữ liệu trống</h5>
                <p class="small">Vui lòng tải lên file để AI trích xuất hoặc chọn từ Lịch sử.</p>
            </div>`;
                return;
            }

            this.table = new ATable('ai-data-grid-container', {
                editable: true,
                header: false,
                pageSize: 50,
                header: true,
            });
            this.table.init(this.extractedData);
        } catch (error) {
            Opps('[PriceImportAI] _renderGrid error:', error);
        }
    }

    async _handleSaveToDB() {
        try {
            const data = this.table ? this.table.getData() : this.extractedData;
            if (!data || data.length === 0) {
                logA('Không có dữ liệu bảng giá để lưu', 'warning', 'toast');
                return;
            }

            const confirm = await showConfirm(`Bạn có chắc chắn muốn đẩy ${data.length} dòng dữ liệu này vào hệ thống?`);
            if (!confirm) return;

            showLoading(true, 'Đang đồng bộ dữ liệu vào ERP...');

            const finalHotelInfo = this._getLatestHotelInfo();

            // CHUẨN HÓA ID PHÒNG TRƯỚC KHI LƯU
            if (finalHotelInfo && Array.isArray(finalHotelInfo.rooms)) {
                finalHotelInfo.rooms = finalHotelInfo.rooms.map((room) => {
                    const roomName = typeof room === 'string' ? room : room.name || 'Phòng Mặc Định';
                    const roomId = room.id || this._sanitizeRoomId(roomName);
                    return typeof room === 'object' ? { ...room, id: roomId, name: roomName } : { id: roomId, name: roomName };
                });
            }

            // TRÍCH XUẤT supplier_name MỚI NHẤT TỪ FORM TRƯỚC KHI LƯU
            const infoContainer = getE('ai-hotel-info-container');
            if (infoContainer) {
                const splInput = infoContainer.querySelector('[name="hi_supplier_name"]');
                if (splInput && splInput.value.trim()) {
                    this.metadata = this.metadata || {};
                    this.metadata.supplier_name = splInput.value.trim();
                }
            }

            if (this.cdm && typeof this.cdm.importFromAI === 'function') {
                await this.cdm.importFromAI(this.currentImportType, data, this.metadata, finalHotelInfo);

                if (A.Modal) A.Modal.hide();
                logA('Đã đồng bộ dữ liệu vào ERP thành công!', 'success', 'alert');
            } else {
                throw new Error('CDM (PriceManager) không được kết nối hoặc thiếu hàm importFromAI.');
            }
        } catch (error) {
            Opps('[PriceImportAI] Lỗi khi lưu dữ liệu:', error);
        } finally {
            showLoading(false);
        }
    }

    // --- Utility Helpers ---

    /**
     * Helper chuẩn hóa ID phòng (Đồng bộ với M_HotelPrice.js)
     * @private
     */
    _sanitizeRoomId(name) {
        if (!name) return 'phong_mac_dinh';
        return name
            .toString()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // Xóa dấu tiếng Việt
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '_') // Thay ký tự đặc biệt/khoảng trắng bằng _
            .replace(/_+/g, '_') // Gộp nhiều gạch dưới thành 1
            .replace(/^_|_$/g, ''); // Cắt gạch dưới ở 2 đầu
    }

    _toggleLoading(show) {
        const loader = getE('ai-loading-indicator');
        const grid = getE('ai-data-grid-container');
        const info = getE('ai-hotel-info-container');
        if (!loader || !grid) return;

        if (show) {
            loader.classList.remove('d-none');
            grid.classList.add('d-none');
            if (info) info.classList.add('d-none');
        } else {
            loader.classList.add('d-none');
            grid.classList.remove('d-none');
            // info display được quyết định trong _renderGrid()
        }
    }

    _fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = (error) => reject(error);
        });
    }
}

window.PriceImportAI = PriceImportAI;
