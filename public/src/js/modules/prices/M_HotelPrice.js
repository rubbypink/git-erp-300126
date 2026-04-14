/**
 * =========================================================================
 * 9TRIP ERP - HOTEL PRICE MODULE (Flattened Hash Map Architecture)
 * Goal: Render matrix UI efficiently while storing data in optimal Map struct.
 * =========================================================================
 */

import { getFirestore, doc, runTransaction } from 'firebase/firestore';
import { runMigrateFieldData } from '../db/migration-helper.js';
import { PriceCalculator } from './PriceCalculator.js';

class HotelPriceManager {
    static _instance = null;
    // [OPTIMIZATION] Cache static để dùng chung giữa các instance và tránh load lại nhiều lần
    static _cache = {
        schedules: null, // Map { docId: data }
    };

    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) return;

        this.state = {
            masterData: {
                suppliers: [],
                hotels: [],
                periods: [],
                packages: [],
                rateTypes: [],
            },
            values: {}, // UI Matrix Flat State: { roomId-rateTypeId-periodId-packageId: value }
            metadata: null,
            aiData: null,
            config: {
                supplierId: '',
                hotelId: '',
                year: new Date().getFullYear(),
            },
            viewConfig: {
                periodIds: [],
                packageIds: [],
                rateTypeIds: [],
            },
        };

        this.init();
    }

    static getInstance(containerId) {
        if (!HotelPriceManager._instance) {
            HotelPriceManager._instance = new HotelPriceManager(containerId);
        }
        return HotelPriceManager._instance;
    }

    async init() {
        try {
            this.renderLayout();
            await this.loadMasterData();
            this.attachEvents();
        } catch (error) {
            console.error('[HotelPriceManager] Init Error:', error);
        }
    }

    // --- HELPER CHUẨN HÓA ID PHÒNG ---
    sanitizeRoomId(name) {
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

    renderLayout() {
        this.container.innerHTML = `
      <style>
        .hp-matrix-table { border-collapse: separate; border-spacing: 0; }
        .hp-matrix-table th.sticky-left, .hp-matrix-table td.sticky-left { 
          position: sticky; left: 0; z-index: 2; border-right: 2px solid #dee2e6 !important;
        }
        .hp-matrix-table th.sticky-top { position: sticky; top: 0; z-index: 3; }
        .hp-price-input:focus { background-color: #fff3cd !important; outline: none; }
        .hp-metadata-row { background-color: #e7f1ff !important; color: #0c4128; font-weight: 600; }
        .hp-room-name-input:focus { background-color: #e7f1ff !important; outline: none; }
      </style>
      <div class="card shadow-sm border-0 h-100">
        <div class="card-header bg-white py-3 border-bottom d-flex justify-content-between align-items-center">
          <h5 class="mb-0 fw-bold text-primary"><i class="bi bi-table me-2"></i>Bảng Giá Khách Sạn</h5>
          <div class="d-flex gap-2">
            <select id="hp-quick-select" data-source="hotel_price_schedules" class="smart-select form-select form-select-sm" style="width: 200px;"><option value="">-- Bảng giá đã lưu --</option></select>
            <button id="hp-btn-clear-form" class="btn btn-outline-secondary btn-sm px-3"><i class="bi bi-eraser me-1"></i>Xóa Form</button>
            <button id="hp-btn-delete-db" class="btn btn-outline-danger btn-sm px-3"><i class="bi bi-trash me-1"></i>Xóa Bảng Giá</button>
            <button id="hp-btn-map-rooms" class="btn btn-outline-warning btn-sm px-3"><i class="bi bi-shuffle me-1"></i>Map Rooms</button>
            <button id="hp-btn-update-hotel" class="btn btn-outline-primary btn-sm px-3"><i class="bi bi-building-up me-1"></i>Cập nhật Khách Sạn</button>
            <button id="hp-btn-save" class="btn btn-success btn-sm px-3"><i class="bi bi-save me-1"></i>Lưu Bảng Giá</button>
          </div>
        </div>
        <div class="card-body p-0 d-flex flex-column">
          <div class="bg-light p-3 border-bottom">
            <div class="row g-2">
              <div class="col-md-3">
                <select id="hp-sel-supplier" class="form-select form-select-sm shadow-sm"></select>
              </div>
              <div class="col-md-3">
                <select id="hp-sel-hotel" class="form-select form-select-sm shadow-sm"><option value="">-- Chọn Khách sạn --</option></select>
              </div>
              <div class="col-md-2">
                <select id="hp-sel-year" class="form-select form-select-sm shadow-sm">
                  <option value="2025">2025</option>
                  <option value="2026" selected>2026</option>
                  <option value="2027">2027</option>
                </select>
              </div>
              <div class="col-md-2">
                <select id="hp-sel-package" class="form-select form-select-sm shadow-sm">
                <option value="">-- Gói giá --</option>
                </select>
              </div>
              <div class="col-md-2">
                <button id="hp-btn-view" class="btn btn-primary btn-sm w-100 shadow-sm">Xem Bảng Giá</button>
              </div>
            </div>
          </div>
          <div id="hp-matrix-wrapper" class="flex-grow-1 overflow-auto position-relative" style="min-height: 400px;">
            <div id="hp-loading" class="position-absolute w-100 h-100 d-none justify-content-center align-items-center bg-white bg-opacity-75" style="z-index: 10;">
              <div class="spinner-border text-primary"></div>
            </div>
            <div id="hp-table-container" class="p-2"></div>
          </div>
        </div>
      </div>
    `;
    }

    async loadMasterData() {
        try {
            const suppliers = Object.values(window.APP_DATA?.suppliers || {});
            this.state.masterData.suppliers = suppliers;
            fillSelect('hp-sel-supplier', suppliers, 'Chọn Nhà cung cấp');

            const hotels = Object.values(window.APP_DATA?.hotels || {});
            this.state.masterData.hotels = hotels;
            fillSelect('hp-sel-hotel', hotels, 'Chọn Khách sạn');
            const lists = await A.DB.local.get('app_config', 'lists');
            const periods = lists['price_periods'] || [];
            const packages = lists['pkg_hotel_price'] || [];
            const types = lists['price_type'] || [];

            this.state.masterData.periods = normalizeList(periods).length > 0 ? normalizeList(periods).sort((a, b) => (a.from || '').localeCompare(b.from || '')) : [{ id: 'all_year', name: 'Cả Năm' }];
            this.state.masterData.packages = normalizeList(packages).length > 0 ? normalizeList(packages) : [{ id: 'base', name: 'Giá NET' }];
            this.state.masterData.rateTypes = normalizeList(types).length > 0 ? normalizeList(types) : [{ id: 'bb', name: 'Ăn sáng (BB)' }];

            fillSelect('hp-sel-package', this.state.masterData.packages, 'Chọn Gói giá');
            if (this.state.masterData.packages.length > 0) {
                setVal('hp-sel-package', this.state.masterData.packages[0].id);
            }

            await this.loadQuickSelect();
        } catch (error) {
            console.error('[HotelPriceManager] loadMasterData Error:', error);
        }
    }

    async loadQuickSelect() {
        try {
            // [OPTIMIZATION] Sử dụng cache hoặc APP_DATA thay vì fetch DB liên tục
            if (!HotelPriceManager._cache.schedules) {
                const schedules = window.APP_DATA?.hotel_price_schedules || (await A.DB.getCollection('hotel_price_schedules'));
                HotelPriceManager._cache.schedules = normalizeList(schedules).reduce((acc, s) => {
                    acc[s.id] = s;
                    return acc;
                }, {});
            }

            // const schedules = HotelPriceManager._cache.schedules;
            // if (schedules) {
            //   let html = '<option value="">-- Bảng giá đã lưu --</option>';
            //   Object.values(schedules).forEach((s) => {
            //     const hotelName = s.info?.hotelName || s.info?.hotelId || '';
            //     const pkgName = s.info?.ratePkg || '';
            //     const status = s.info?.status === 'actived' ? '✅' : '⏳';
            //     html += `<option value="${s.id}">${hotelName} | Gói ${pkgName} (${s.info?.year}) ${status}</option>`;
            //   });
            //   setHTML('hp-quick-select', html);
            // }
        } catch (error) {
            console.error('[HotelPriceManager] loadQuickSelect Error:', error);
        }
    }

    attachEvents() {
        getE('hp-btn-view').addEventListener('click', () => this.loadPriceData());
        getE('hp-btn-save').addEventListener('click', () => this.handleSaveClick());
        getE('hp-btn-clear-form').addEventListener('click', () => this.clearForm());
        getE('hp-btn-delete-db').addEventListener('click', () => this.deletePriceTable());
        getE('hp-btn-update-hotel').addEventListener('click', () => this.handleUpdateHotelRooms());
        getE('hp-btn-map-rooms').addEventListener('click', () => this.handleMapRooms());

        getE('hp-sel-supplier').addEventListener('change', () => this.handleQuickUpdateMetadata());
        getE('hp-sel-hotel').addEventListener('change', () => this.handleQuickUpdateMetadata());

        getE('hp-sel-package').addEventListener('change', async (e) => {
            const pkgId = e.target.value;
            if (pkgId && getE('hp-table-container').innerHTML !== '') {
                this.state.viewConfig.packageIds = [pkgId];
                if (this.state.aiData) {
                    await this.fillDataFromAI(this.state.aiData, this.state.metadata);
                } else {
                    this.loadPriceData(); // Tải lại data của package mới
                }
            }
        });

        getE('hp-quick-select').addEventListener('change', async (e) => {
            const docId = e.target.value;
            if (!docId) return;
            const parts = docId.split('_'); // Schema mới: HOTELID_PKGID_YEAR
            if (parts.length >= 3) {
                setVal('hp-sel-hotel', parts[0]);
                setVal('hp-sel-package', parts[1]);
                setVal('hp-sel-year', parts[2]);

                // [OPTIMIZATION] Lấy từ cache thay vì fetch DB
                const schedule = HotelPriceManager._cache.schedules?.[docId] || (await A.DB.getCollection('hotel_price_schedules', docId));
                if (schedule?.info?.supplierId) setVal('hp-sel-supplier', schedule.info.supplierId);

                await this.loadPriceData();
            }
        });
    }

    clearForm() {
        try {
            this.state.values = {};
            this.state.metadata = null;
            this.state.aiData = null;
            this.renderMatrix();
            logA('Đã xóa trắng form bảng giá.', 'success', 'toast');
        } catch (error) {
            Opps(error, 'HotelPriceManager.clearForm');
        }
    }

    async deletePriceTable() {
        try {
            const hotelId = getVal('hp-sel-hotel');
            const pkgId = getVal('hp-sel-package');
            const year = getVal('hp-sel-year');

            if (!hotelId || !pkgId || !year) {
                return logA('Vui lòng chọn đầy đủ (Khách sạn, Gói giá, Năm) để xóa.', 'warning', 'toast');
            }

            const docId = `${hotelId}_${pkgId}_${year}`.toUpperCase();
            const confirm = await showConfirm(`Bạn có chắc muốn xóa bảng giá <b>${docId}</b>?`);
            if (!confirm) return;

            this.toggleLoading(true);
            const res = await A.DB.deleteRecord('hotel_price_schedules', docId);
            if (res.success) {
                // [OPTIMIZATION] Cập nhật cache sau khi xóa
                if (HotelPriceManager._cache.schedules) {
                    delete HotelPriceManager._cache.schedules[docId];
                }
                logA('Đã xóa bảng giá thành công!', 'success', 'toast');
                this.clearForm();
                await this.loadQuickSelect();
            } else {
                throw new Error(res.error || 'Lỗi khi xóa bảng giá.');
            }
        } catch (error) {
            Opps(error, 'HotelPriceManager.deletePriceTable');
        } finally {
            this.toggleLoading(false);
        }
    }

    async renderMatrix() {
        try {
            const container = getE('hp-table-container');
            if (!container) return;

            const { periodIds, packageIds, rateTypeIds } = this.state.viewConfig;

            const activePeriods = periodIds.length > 0 ? periodIds.map((id) => this.state.masterData.periods.find((p) => p.id === id) || { id, name: id }) : this.state.masterData.periods;
            const activePackages = packageIds.length > 0 ? packageIds.map((id) => this.state.masterData.packages.find((p) => p.id === id) || { id, name: id }) : this.state.masterData.packages;
            const activeRateTypes = rateTypeIds.length > 0 ? rateTypeIds.map((id) => this.state.masterData.rateTypes.find((t) => t.id === id) || { id, name: id }) : this.state.masterData.rateTypes;

            const savedRoomIds = new Set();
            Object.keys(this.state.values).forEach((key) => {
                const parts = key.split('-');
                if (parts.length >= 4) savedRoomIds.add(parts[0]);
            });

            const allRoomIds = [...savedRoomIds];
            if (allRoomIds.length === 0) allRoomIds.push('phong_mac_dinh');

            // Lấy thông tin khách sạn hiện tại để lấy tên phòng hiển thị
            const hotelId = getVal('hp-sel-hotel');
            const currentHotel = this.state.masterData.hotels.find((h) => h.id === hotelId);
            const roomsMap = {};
            if (currentHotel?.rooms) {
                currentHotel.rooms.forEach((r) => (roomsMap[r.id] = r.name));
            }

            let metadataHtml = '';
            if (this.state.metadata) {
                const meta = this.state.metadata;
                metadataHtml = `<tr class="hp-metadata-row"><th colspan="${1 + activePeriods.length * activePackages.length * activeRateTypes.length}" class="text-start py-2 px-3">Metadata: ${meta.hotel_name || ''} | ${meta.supplier_name || ''} | ${meta.year || ''}</th></tr>`;
            }

            let html = `
        <table class="table table-sm table-bordered align-middle text-center bg-white shadow-sm hp-matrix-table" style="font-size: 0.85rem;">
          <thead class="table-dark sticky-top">
            ${metadataHtml}
            <tr>
              <th rowspan="2" style="min-width: 200px; z-index: 5;" class="sticky-left bg-dark">Hạng phòng (ID)</th>
              ${activePeriods.map((p) => `<th colspan="${activePackages.length * activeRateTypes.length}">${p.name}</th>`).join('')}
            </tr>
            <tr>
              ${activePeriods.map((p) => activePackages.map((pkg) => activeRateTypes.map((rate) => `<th style="min-width: 120px;">${pkg.name}<br><small class="opacity-75">${rate.name}</small></th>`).join('')).join('')).join('')}
            </tr>
          </thead>
          <tbody>
        `;

            allRoomIds.forEach((roomId) => {
                const roomDisplayName = roomsMap[roomId] || roomId;
                html += `
          <tr>
            <td class="text-start fw-bold sticky-left bg-white shadow-sm p-0">
              <input type="text" class="form-control form-control-sm border-0 fw-bold hp-room-name-input" data-room-id="${roomId}" value="${roomDisplayName}" style="background: transparent;">
            </td>
            ${activePeriods
                .map((p) =>
                    activePackages
                        .map((pkg) =>
                            activeRateTypes
                                .map((rate) => {
                                    const key = `${roomId}-${rate.id}-${p.id}-${pkg.id}`;
                                    const val = this.state.values[key] || 0;
                                    return `<td class="p-0"><input type="text" class="form-control form-control-sm border-0 text-end hp-price-input" data-key="${key}" value="${formatNumber(val)}" onfocus="this.select()" style="background: transparent;"></td>`;
                                })
                                .join('')
                        )
                        .join('')
                )
                .join('')}
          </tr>
        `;
            });

            html += `</tbody></table>`;
            container.innerHTML = html;

            container.querySelectorAll('.hp-price-input').forEach((input) => {
                input.addEventListener('change', (e) => {
                    const key = e.target.dataset.key;
                    const val = getNum(e.target.value);
                    this.state.values[key] = val;
                    e.target.value = formatNumber(val);
                });
            });
        } catch (error) {
            Opps(error, 'HotelPriceManager.renderMatrix');
        }
    }

    handleSaveClick() {
        this.savePriceData();
    }

    // --- HELPER: CHUYỂN ĐỔI NGÀY SANG SỐ YYYYMMDD ---
    _parsePeriodDate(dateStr, baseYear) {
        if (!dateStr) return 0;
        if (dateStr.includes('-')) return parseInt(dateStr.replace(/-/g, '')) || 0;
        if (dateStr.includes('/')) {
            const parts = dateStr.split('/');
            const d = parseInt(parts[0]) || 1;
            const m = parseInt(parts[1]) || 1;
            const y = parts.length > 2 ? parseInt(parts[2]) : parseInt(baseYear);
            return y * 10000 + m * 100 + d;
        }
        return 0;
    }

    // --- TẢI DATA: CHỈ LỌC GIÁ CỦA NCC ĐANG CHỌN LÊN GRID ---
    async loadPriceData() {
        this.toggleLoading(true);
        try {
            const supplierId = getVal('hp-sel-supplier');
            const hotelId = getVal('hp-sel-hotel');
            const pkgId = getVal('hp-sel-package');
            const year = getVal('hp-sel-year');

            if (!hotelId || !pkgId || !supplierId) return logA('Vui lòng chọn NCC, Khách sạn và Gói giá', 'warning', 'toast');

            const docId = `${hotelId}_${pkgId}_${year}`.toUpperCase();
            // [OPTIMIZATION] Lấy từ cache trước khi fetch DB
            const savedData = HotelPriceManager._cache.schedules?.[docId] || (await A.DB.getCollection('hotel_price_schedules', docId));

            this.state.values = {}; // Reset trước khi load

            if (savedData && savedData.priceData) {
                Object.entries(savedData.priceData).forEach(([roomRateKey, periods]) => {
                    // Dùng dải phân cách an toàn ___
                    const [roomId, rateId] = roomRateKey.split('___');

                    Object.entries(periods).forEach(([periodSuppKey, pData]) => {
                        if (pData.supplier === supplierId) {
                            // Ưu tiên lấy periodId đã lưu cứng, hoặc tách chuỗi an toàn
                            const periodId = pData.periodId || periodSuppKey.split('___')[0];
                            const matrixKey = `${roomId}-${rateId}-${periodId}-${pkgId}`;
                            this.state.values[matrixKey] = pData.costPrice || 0;
                        }
                    });
                });

                this.state.metadata = savedData.metadata || null;
                this.state.viewConfig = savedData.info?.viewConfig || this.state.viewConfig;
                this.state.viewConfig.packageIds = [pkgId];
            }

            await this.renderMatrix();
        } catch (error) {
            Opps(error, 'HotelPriceManager.loadPriceData');
        } finally {
            this.toggleLoading(false);
        }
    }

    // --- LƯU DATA: MERGE DATA VÀ DÙNG KEY AN TOÀN ---
    async savePriceData() {
        this.toggleLoading(true);
        try {
            const supplierId = getVal('hp-sel-supplier');
            const hotelId = getVal('hp-sel-hotel');
            const pkgId = getVal('hp-sel-package');
            const year = getVal('hp-sel-year');

            if (!hotelId || !pkgId || !supplierId) return logA('Thiếu thông tin để lưu!', 'error', 'toast');

            const hotel = this.state.masterData.hotels.find((h) => h.id === hotelId);
            const star = hotel ? hotel.star : 3;
            const flatSellingPriceData = PriceCalculator.recalculateHotelTable(this.state.values, star);

            const docId = `${hotelId}_${pkgId}_${year}`.toUpperCase();
            const yearNum = parseInt(year);

            // [OPTIMIZATION] Lấy từ cache thay vì fetch DB
            const existingDoc = HotelPriceManager._cache.schedules?.[docId] || (await A.DB.getCollection('hotel_price_schedules', docId));
            const mergedPriceData = existingDoc ? existingDoc.priceData || {} : {};
            const allSuppliers = new Set(existingDoc?.info?.suppliers || []);
            allSuppliers.add(supplierId);

            // Dọn dẹp giá CŨ của NCC đang chọn
            Object.keys(mergedPriceData).forEach((roomRateKey) => {
                Object.keys(mergedPriceData[roomRateKey]).forEach((periodSuppKey) => {
                    if (mergedPriceData[roomRateKey][periodSuppKey].supplier === supplierId) {
                        delete mergedPriceData[roomRateKey][periodSuppKey];
                    }
                });
                if (Object.keys(mergedPriceData[roomRateKey]).length === 0) {
                    delete mergedPriceData[roomRateKey];
                }
            });

            // Thêm MỚI giá từ giao diện
            Object.keys(this.state.values).forEach((key) => {
                const parts = key.split('-');
                if (parts.length < 4) return;
                const [rId, rateId, periodId, pId] = parts;

                if (pId !== pkgId) return;
                const costPrice = this.state.values[key];
                if (!costPrice) return;

                // SỬ DỤNG DẢI PHÂN CÁCH ___ AN TOÀN TUYỆT ĐỐI CHO FIRESTORE
                const roomRateKey = `${rId}___${rateId}`;
                const periodSuppKey = `${periodId}___${supplierId}`;

                if (!mergedPriceData[roomRateKey]) mergedPriceData[roomRateKey] = {};

                const periodObj = this.state.masterData.periods.find((p) => p.id === periodId) || {};
                const sellPrice = flatSellingPriceData[key] || costPrice;

                let startDate = this._parsePeriodDate(periodObj.from, yearNum) || yearNum * 10000 + 101;
                let endDate = this._parsePeriodDate(periodObj.to, yearNum) || yearNum * 10000 + 1231;
                if (endDate < startDate) endDate += 10000;

                mergedPriceData[roomRateKey][periodSuppKey] = {
                    periodId: periodId, // Lưu dự phòng để dễ Load
                    periodName: periodObj.name || periodId,
                    startDate: startDate,
                    endDate: endDate,
                    supplier: supplierId,
                    costPrice: costPrice,
                    sellPrice: sellPrice,
                };
            });

            const payload = {
                id: docId,
                info: {
                    hotelId,
                    hotelName: hotel ? hotel.name : hotelId,
                    ratePkg: pkgId,
                    year: yearNum,
                    suppliers: Array.from(allSuppliers),
                    status: 'actived',
                    updatedAt: new Date().getTime(),
                    updatedBy: CURRENT_USER?.name || 'system',
                    viewConfig: this.state.viewConfig,
                },
                priceData: mergedPriceData,
                searchTags: [hotelId, pkgId, year.toString(), 'actived', ...Array.from(allSuppliers)].filter(Boolean),
            };

            await A.DB.saveRecord('hotel_price_schedules', payload);
            // [OPTIMIZATION] Cập nhật cache sau khi lưu
            if (!HotelPriceManager._cache.schedules) HotelPriceManager._cache.schedules = {};
            HotelPriceManager._cache.schedules[docId] = payload;

            logA('Đã lưu Bảng giá thành công!', 'success', 'toast');
            await this.loadQuickSelect();
        } catch (error) {
            Opps(error, 'HotelPriceManager.savePriceData');
        } finally {
            this.toggleLoading(false);
        }
    }

    async fillDataFromAI(data, metadata, hotelInfo = null) {
        this.toggleLoading(true);
        try {
            this.state.values = {};
            this.state.aiData = data;

            // ----------------------------------------------------------------------
            // 2. XỬ LÝ THÔNG TIN KHÁCH SẠN TỪ AI (Upsert - Tạo mới hoặc Cập nhật)
            // ----------------------------------------------------------------------
            if (hotelInfo && hotelInfo.name) {
                const hName = hotelInfo.name.trim();

                // Lấy danh sách KS hiện tại (hỗ trợ cả định dạng Array và Object)
                const existingHotels = Array.isArray(window.APP_DATA?.hotels) ? window.APP_DATA.hotels : Object.values(window.APP_DATA?.hotels || {});

                // Tìm xem khách sạn đã tồn tại chưa
                let foundH = null;
                if (metadata && metadata.hotel_id) {
                    foundH = existingHotels.find((h) => h.id === metadata.hotel_id);
                }
                if (!foundH) {
                    foundH = existingHotels.find((h) => h.name.toLowerCase() === hName.toLowerCase());
                }

                // Tạo ID mới nếu chưa có (Chuyển Tiếng Việt có dấu thành slug không dấu)
                let hotelId = foundH ? foundH.id : '';
                // Tạo cục Data gộp giữa cái AI lấy được và cái đã có trong DB
                const hotelObj = {
                    id: hotelId,
                    name: hotelInfo.name || foundH?.name || 'Khách sạn chưa tên',
                    address: hotelInfo.address || foundH?.address || '',
                    phone: hotelInfo.phone || foundH?.phone || '',
                    email: hotelInfo.email || foundH?.email || '',
                    star: hotelInfo.star || foundH?.star || 3,
                    website: hotelInfo.website || foundH?.website || '',
                    pictures: hotelInfo.pictures?.length ? hotelInfo.pictures : foundH?.pictures || [],
                    rooms: hotelInfo.rooms?.length ? hotelInfo.rooms : foundH?.rooms || [],
                    updatedAt: Date.now(),
                };

                // Cập nhật Cache MasterData để UI nhận dạng ngay lập tức
                if (this.cdm && this.cdm.state) {
                    const hIdx = this.cdm.state.masterData.hotels.findIndex((h) => h.id === hotelId);
                    if (hIdx > -1) this.cdm.state.masterData.hotels[hIdx] = hotelObj;
                    else this.cdm.state.masterData.hotels.push(hotelObj);

                    // Re-render Select Box Hotel với data mới nhất
                    if (typeof fillSelect === 'function') {
                        fillSelect(
                            'hp-sel-hotel',
                            this.cdm.state.masterData.hotels.map((h) => ({ id: h.id, name: h.name })),
                            'Chọn Khách sạn'
                        );
                    }
                }

                // Ép metadata nhận hotel_id mới để block tiếp theo tự động focus vào nó
                if (!metadata) metadata = {};
                metadata.hotel_id = hotelId;
            }

            // 3. Cập nhật Select từ Metadata (Kế thừa logic cũ)
            if (metadata) {
                this.state.metadata = metadata;
                if (metadata.year) setVal('hp-sel-year', metadata.year);

                // Tìm và set Supplier
                if (metadata.supplier_name || metadata.supplier_id) {
                    const sName = (metadata.supplier_name || '').toLowerCase().trim();
                    const sId = (metadata.supplier_id || '').toLowerCase().trim();
                    const existingSuppliers = Array.isArray(window.APP_DATA?.suppliers) ? window.APP_DATA.suppliers : Object.values(window.APP_DATA?.suppliers || {});

                    const foundS = existingSuppliers.find((s) => s.id.toLowerCase() === sId || s.name.toLowerCase().includes(sName));
                    if (foundS) setVal('hp-sel-supplier', foundS.id);
                }

                // Tìm và set Hotel (sẽ auto tìm trúng cái hotelObj vừa tạo ở bước 2)
                if (metadata.hotel_name || metadata.hotel_id) {
                    const hName = (metadata.hotel_name || '').toLowerCase().trim();
                    const hId = (metadata.hotel_id || '').toLowerCase().trim();
                    const existingHotels = Array.isArray(window.APP_DATA?.hotels) ? window.APP_DATA.hotels : Object.values(window.APP_DATA?.hotels || {});

                    const foundH = existingHotels.find((h) => h.id.toLowerCase() === hId || h.name.toLowerCase().includes(hName));
                    if (foundH) setVal('hp-sel-hotel', foundH.id);
                }
            }

            const periodMap = {};
            this.state.masterData.periods.forEach((p) => (periodMap[p.name.toLowerCase().trim()] = p.id));
            const packageMap = {};
            this.state.masterData.packages.forEach((p) => (packageMap[p.name.toLowerCase().trim()] = p.id));
            const rateTypeMap = {};
            this.state.masterData.rateTypes.forEach((t) => (rateTypeMap[t.name.toLowerCase().trim()] = t.id));

            const currentGoiGiaId = getVal('hp-sel-package') || 'base';

            data.forEach((item) => {
                const rName = (item.room_name || '').toString().trim();
                const pName = (item.period_name || '').toString().trim();
                const rtName = (item.rate_type_name || item.rate_name || '').toString().trim();

                // SỬ DỤNG HÀM SANITIZE CHO ROOM ID MỚI
                const roomId = this.sanitizeRoomId(rName);
                const periodId = periodMap[pName.toLowerCase()] || pName || 'all_year';
                const loaiGiaId = rateTypeMap[rtName.toLowerCase()] || rtName || 'bb';
                const goiGiaId = currentGoiGiaId;

                const key = `${roomId}-${loaiGiaId}-${periodId}-${goiGiaId}`;
                this.state.values[key] = getNum(item.price || 0);

                if (!this.state.viewConfig.periodIds.includes(periodId)) this.state.viewConfig.periodIds.push(periodId);
                if (!this.state.viewConfig.packageIds.includes(goiGiaId)) this.state.viewConfig.packageIds.push(goiGiaId);
                if (!this.state.viewConfig.rateTypeIds.includes(loaiGiaId)) this.state.viewConfig.rateTypeIds.push(loaiGiaId);
            });

            await this.renderMatrix();
            logA(`Đã đồng bộ AI với ID phòng được chuẩn hóa.`, 'success', 'toast');
        } catch (error) {
            Opps(error, 'HotelPriceManager.fillDataFromAI');
        } finally {
            this.toggleLoading(false);
        }
    }

    async handleUpdateHotelRooms() {
        try {
            const hotelId = getVal('hp-sel-hotel');
            if (!hotelId) return logA('Vui lòng chọn Khách sạn để cập nhật.', 'warning', 'toast');

            const roomInputs = this.container.querySelectorAll('.hp-room-name-input');
            if (roomInputs.length === 0) return logA('Không có dữ liệu phòng để cập nhật.', 'warning', 'toast');

            const newRooms = [];
            roomInputs.forEach((input) => {
                const oldId = input.dataset.roomId;
                const newName = input.value.trim();
                if (newName) {
                    newRooms.push({
                        id: oldId, // Giữ nguyên ID cũ để không làm hỏng bảng giá
                        name: newName,
                    });
                }
            });

            const confirm = await showConfirm(`Bạn có chắc chắn muốn cập nhật danh sách ${newRooms.length} hạng phòng cho khách sạn này?`);
            if (!confirm) return;

            this.toggleLoading(true);
            const res = await A.DB.saveRecord('hotels', { id: hotelId, rooms: newRooms });
            if (res.success) {
                logA('Cập nhật thông tin phòng khách sạn thành công!', 'success', 'toast');
                // Cập nhật lại MasterData local
                const hotel = this.state.masterData.hotels.find((h) => h.id === hotelId);
                if (hotel) hotel.rooms = newRooms;
            } else {
                throw new Error(res.error || 'Lỗi khi cập nhật khách sạn.');
            }
        } catch (error) {
            Opps(error, 'HotelPriceManager.handleUpdateHotelRooms');
        } finally {
            this.toggleLoading(false);
        }
    }

    /**
     * HÀM MỚI: MAP ROOMS & MIGRATE DATA
     * Mục đích: Đồng bộ tên phòng giữa DB và Bảng giá, cập nhật các booking liên quan.
     */
    async handleMapRooms() {
        try {
            const hotelId = getVal('hp-sel-hotel');
            if (!hotelId) return logA('Vui lòng chọn Khách sạn.', 'warning', 'toast');

            const currentHotel = this.state.masterData.hotels.find((h) => h.id === hotelId);
            if (!currentHotel) return logA('Không tìm thấy thông tin khách sạn.', 'error', 'toast');

            const dbRooms = currentHotel.rooms || []; // Array of {id, name}

            // 1. Lấy danh sách room name từ bảng giá hiện tại (trên UI)
            const priceTableRoomIds = new Set();
            Object.keys(this.state.values).forEach((key) => {
                const parts = key.split('-');
                if (parts.length >= 4) priceTableRoomIds.add(parts[0]);
            });

            const priceTableRooms = [];
            const roomInputs = this.container.querySelectorAll('.hp-room-name-input');
            roomInputs.forEach((input) => {
                const rId = input.dataset.roomId;
                const rName = input.value.trim();
                if (rName && priceTableRoomIds.has(rId)) {
                    priceTableRooms.push({ id: rId, name: rName });
                }
            });

            if (priceTableRooms.length === 0) return logA('Bảng giá hiện tại không có phòng nào.', 'warning', 'toast');

            // 2. Tạo giao diện Modal Mapping
            let mappingHtml = `
        <div class="text-start" style="max-height: 400px; overflow-y: auto;">
          <p class="small text-muted mb-3">Chọn tên phòng mới từ bảng giá để thay thế tên phòng cũ trong database. Các bản ghi booking cũ sẽ được cập nhật tự động.</p>
          <table class="table table-sm table-hover align-middle">
            <thead class="table-light sticky-top">
              <tr>
                <th>Phòng trong DB</th>
                <th>Phòng trong Bảng giá</th>
              </tr>
            </thead>
            <tbody>
      `;

            dbRooms.forEach((dbRoom) => {
                mappingHtml += `
          <tr>
            <td><span class="fw-bold text-primary">${dbRoom.name}</span></td>
            <td>
              <select class="form-select form-select-sm hp-map-select" data-old-name="${dbRoom.name}" data-old-id="${dbRoom.id}">
                <option value="">-- Giữ nguyên / Không đổi --</option>
                ${priceTableRooms.map((pr) => `<option value="${pr.name}">${pr.name}</option>`).join('')}
              </select>
            </td>
          </tr>
        `;
            });

            mappingHtml += `</tbody></table></div>`;

            // 3. Hiển thị Modal và thu thập kết quả
            const { value: mappings, isConfirmed } = await Swal.fire({
                title: '<i class="bi bi-shuffle me-2"></i>Map & Migrate Rooms',
                html: mappingHtml,
                showCancelButton: true,
                confirmButtonText: 'Bắt đầu Migrate',
                cancelButtonText: 'Hủy',
                width: '650px',
                preConfirm: () => {
                    const results = [];
                    document.querySelectorAll('.hp-map-select').forEach((select) => {
                        const oldName = select.dataset.oldName;
                        const newName = select.value;
                        if (newName && newName !== oldName) {
                            results.push({ oldName, newName });
                        }
                    });
                    return results;
                },
            });

            if (!isConfirmed) return;

            this.toggleLoading(true);

            // 4. Thực thi Migration (Batch Update)
            for (const m of mappings) {
                L._(`🔄 Đang migrate: ${m.oldName} -> ${m.newName}...`);
                // Cập nhật booking_details và operator_entries
                await runMigrateFieldData('booking_details', 'service_name', m.oldName, m.newName);
                await runMigrateFieldData('operator_entries', 'service_name', m.oldName, m.newName);
            }

            // 5. Cập nhật danh sách rooms cho Hotel (Atomic Transaction)
            const db = getFirestore();
            const hotelRef = doc(db, 'hotels', hotelId);

            await runTransaction(db, async (transaction) => {
                const hotelDoc = await transaction.get(hotelRef);
                if (!hotelDoc.exists()) throw 'Khách sạn không tồn tại trên server!';

                const currentDbRooms = hotelDoc.data().rooms || [];
                const renamedOldNames = new Set(mappings.map((m) => m.oldName));
                const priceTableNames = new Set(priceTableRooms.map((r) => r.name));

                // Gộp 2 danh sách:
                // - Ưu tiên các phòng từ Bảng giá hiện tại
                // - Giữ lại các phòng cũ trong DB mà không bị đổi tên và không trùng tên với bảng giá
                const finalRooms = [...priceTableRooms];
                currentDbRooms.forEach((dr) => {
                    if (!renamedOldNames.has(dr.name) && !priceTableNames.has(dr.name)) {
                        finalRooms.push(dr);
                    }
                });

                transaction.update(hotelRef, {
                    rooms: finalRooms,
                    updatedAt: Date.now(),
                });
            });

            logA('Đã hoàn tất mapping và migration phòng!', 'success', 'toast');

            // 6. Cập nhật lại MasterData local để UI phản ánh thay đổi
            const updatedHotelDoc = await A.DB.getCollection('hotels', hotelId);
            if (updatedHotelDoc) {
                const hotelIdx = this.state.masterData.hotels.findIndex((h) => h.id === hotelId);
                if (hotelIdx > -1) this.state.masterData.hotels[hotelIdx].rooms = updatedHotelDoc.rooms;
            }

            await this.renderMatrix();
        } catch (error) {
            Opps(error, 'HotelPriceManager.handleMapRooms');
        } finally {
            this.toggleLoading(false);
        }
    }

    handleQuickUpdateMetadata() {
        try {
            const supplierId = getVal('hp-sel-supplier');
            const hotelId = getVal('hp-sel-hotel');
            const year = getVal('hp-sel-year');

            this.state.config.supplierId = supplierId;
            this.state.config.hotelId = hotelId;
            this.state.config.year = year;

            const supplier = this.state.masterData.suppliers.find((s) => s.id === supplierId);
            const hotel = this.state.masterData.hotels.find((h) => h.id === hotelId);

            const sName = supplier ? supplier.name : supplierId;
            const hName = hotel ? hotel.name : hotelId;

            // Cập nhật header metadata nếu bảng đang hiển thị
            const metaEl = this.container.querySelector('.hp-metadata-row th');
            if (metaEl) {
                metaEl.textContent = `AI Metadata: ${hName} | ${sName} | ${year}`;
            }

            // Cập nhật state metadata để đồng bộ khi lưu
            if (this.state.metadata) {
                this.state.metadata.hotel_name = hName;
                this.state.metadata.supplier_name = sName;
                this.state.metadata.year = year;
            }
        } catch (error) {
            console.error('[HotelPriceManager] handleQuickUpdateMetadata Error:', error);
        }
    }

    toggleLoading(show) {
        const el = getE('hp-loading');
        if (el) el.classList.toggle('d-none', !show);
    }
}

export default HotelPriceManager;
