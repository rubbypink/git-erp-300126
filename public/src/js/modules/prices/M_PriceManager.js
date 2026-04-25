import HotelPriceManager from './M_HotelPrice.js';
import ServicePriceController from './M_ServicePrice.js';
import { PriceCalculator } from './PriceCalculator.js';
import PriceImportAI from './M_ImportPriceAI.js';

/**
 * =========================================================================
 * 9TRIP ERP - PRICE MANAGER (Centralized Data Manager)
 * Goal: Điều phối dữ liệu toàn cục giữa UI Hotel/Service và Database.
 * =========================================================================
 */
export default class PriceManager {
    static autoInit = false;

    constructor() {
        this.state = {
            activeModule: 'hotel', // 'hotel' | 'service' | 'config'
            masterData: {
                suppliers: [],
                hotels: [],
                serviceTypes: [],
            },
            currentFilter: {
                supplierId: '',
                hotelId: '',
                year: new Date().getFullYear(),
            },

            isLoading: false,
            markupConfig: null,
        };

        this.controllers = {
            hotel: null,
            service: null,
            ai: null,
        };

        this._initialized = false;
        this.container = null;
    }

    async init(containerId = 'tab-price-pkg') {
        try {
            if (this._initialized) {
                L._('[PriceManager] Đã khởi tạo, bỏ qua...');
                return;
            }

            L._('[PriceManager] Khởi tạo Core Logic...');
            this.container = getE(containerId);
            if (!this.container) {
                L._(`[PriceManager] Container #${containerId} not found, fallback to tab-price-pkg`, null, 'warning');
                this.container = getE('tab-price-pkg');
            }
            if (!this.container) throw new Error(`Container #${containerId} not found`);

            await this.renderUI();

            this.controllers.hotel = new HotelPriceManager('pm-hotel-container');
            this.controllers.service = new ServicePriceController('pm-service-container');
            this.controllers.ai = new PriceImportAI(this);

            this.controllers.hotel.cdm = this;
            this.controllers.service.cdm = this;


            this.attachEvents();

            if (this.controllers.hotel && typeof this.controllers.hotel.init === 'function') {
                await this.controllers.hotel.init();
            }
            if (this.controllers.service && typeof this.controllers.service.initLayout === 'function') {
                await this.controllers.service.initLayout();
            }

            this.initContextMenu();
            this._initialized = true;

            L._('[PriceManager] Core Logic initialized successfully');
        } catch (error) {
            Opps(error, 'PriceManager.init');
        }
    }

    initContextMenu() {
        try {
            if (!A.ContextMenu) {
                L._('[PriceManager] ContextMenu module chưa sẵn sàng.', null, 'warning');
                return;
            }

            A.ContextMenu.register('#pm-hotel-container table', {
                id: 'hotelPriceContextMenu',
                rowSelector: 'tr',
                items: [
                    { id: 'hp-copy-row', label: 'Sao chép hàng', icon: 'fa-copy', iconColor: 'text-primary', action: (ctx) => this.copyRowData(ctx) },
                    { id: 'hp-paste-row', label: 'Dán vào hàng', icon: 'fa-paste', iconColor: 'text-success', action: (ctx) => this.pasteRowData(ctx) },
                    '---',
                    { id: 'hp-paste-excel', label: 'Dán giá trị (Excel)', icon: 'fa-file-excel', iconColor: 'text-success', action: (ctx) => this.pasteValuesFromExcel(ctx) },
                    '---',
                    { id: 'hp-copy-table', label: 'Sao chép toàn bộ bảng (Excel)', icon: 'fa-table', action: (ctx) => this.copyFullTable(ctx) },
                ],
            });

            A.ContextMenu.register('#pm-service-container table', {
                id: 'servicePriceContextMenu',
                rowSelector: 'tr',
                items: [
                    { id: 'sp-copy-row', label: 'Sao chép hàng', icon: 'fa-copy', iconColor: 'text-primary', action: (ctx) => this.copyRowData(ctx) },
                    {
                        id: 'sp-clone-row',
                        label: 'Nhân bản hàng',
                        icon: 'fa-clone',
                        action: (ctx) => {
                            const row = ctx.row || (ctx.target ? ctx.target.closest('tr') : null);
                            if (this.controllers.service && row) {
                                const rowData = this.getRowDataFromCtx({ ...ctx, row });
                                const currentData = this.controllers.service.table.getData();
                                const newRow = { ...rowData, id: 'new-' + Date.now() };
                                this.controllers.service.table.updateData([...currentData, newRow]);
                            }
                        },
                    },
                    {
                        id: 'sp-delete-row',
                        label: 'Xóa hàng',
                        icon: 'fa-trash',
                        iconColor: 'text-danger',
                        action: (ctx) => {
                            const row = ctx.row || (ctx.target ? ctx.target.closest('tr') : null);
                            if (row && confirm('Bạn có chắc muốn xóa dòng này?')) row.remove();
                        },
                    },
                ],
            });
        } catch (error) {
            Opps(error, 'PriceManager.initContextMenu');
        }
    }

    getRowDataFromCtx(ctx) {
        const row = ctx.row || (ctx.target ? ctx.target.closest('tr') : null);
        if (!row) return { fields: {}, keys: {} };

        const data = { fields: {}, keys: {} };
        row.querySelectorAll('[data-field]').forEach((el) => (data.fields[el.dataset.field] = getVal(el)));
        row.querySelectorAll('[data-key]').forEach((el) => (data.keys[el.dataset.key] = getVal(el)));

        return data;
    }

    async copyRowData(ctx) {
        try {
            const data = this.getRowDataFromCtx(ctx);
            await navigator.clipboard.writeText(JSON.stringify(data));
            logA('Đã copy dữ liệu hàng', 'success', 'toast');
        } catch (error) {
            Opps(error, 'PriceManager.copyRowData');
        }
    }

    async pasteRowData(ctx) {
        try {
            const row = ctx.row || (ctx.target ? ctx.target.closest('tr') : null);
            if (!row) return;

            const text = await navigator.clipboard.readText();
            if (!text) return;
            const data = JSON.parse(text);

            const clean = (v) => {
                let s = String(v || '').trim();
                if ((s.match(/,/g) || []).length >= 2 || (s.includes(',') && s.includes('.'))) s = s.replace(/,/g, '');
                return Math.round(getNum(s));
            };

            if (data.fields) {
                Object.entries(data.fields).forEach(([field, val]) => {
                    const el = row.querySelector(`[data-field="${field}"]`);
                    if (el) setVal(el, clean(val));
                });
            }

            if (data.keys) {
                const sourceValues = Object.values(data.keys);
                const targetInputs = row.querySelectorAll('[data-key]');
                targetInputs.forEach((input, index) => {
                    if (sourceValues[index] !== undefined) {
                        setVal(input, clean(sourceValues[index]));
                        input.dispatchEvent(new Event('change'));
                    }
                });
            }
            logA('Đã dán dữ liệu hàng', 'success', 'toast');
        } catch (error) {
            Opps(error, 'PriceManager.pasteRowData');
        }
    }

    async pasteValuesFromExcel(ctx) {
        try {
            const text = await navigator.clipboard.readText();
            if (!text) return;

            const rows = text.split(/\r?\n/).filter((line) => line.trim() !== '');
            if (rows.length === 0) return;

            const matrix = rows.map((row) => row.split('\t'));
            const startRow = ctx.row || (ctx.target ? ctx.target.closest('tr') : null);
            if (!startRow) return Opps('Không xác định được hàng bắt đầu dán.');

            const tableBody = startRow.closest('tbody') || startRow.closest('table');
            const allRows = Array.from(tableBody.querySelectorAll('tr')).filter((r) => !r.classList.contains('hp-metadata-row'));
            const startRowIndex = allRows.indexOf(startRow);

            const clean = (v) => {
                let s = String(v || '').trim();
                if ((s.match(/,/g) || []).length >= 2 || (s.includes(',') && s.includes('.'))) s = s.replace(/,/g, '');
                return Math.round(getNum(s));
            };

            let updatedCount = 0;
            matrix.forEach((excelRow, rIdx) => {
                const targetRow = allRows[startRowIndex + rIdx];
                if (!targetRow) return;

                const targetInputs = Array.from(targetRow.querySelectorAll('input.number, input.hp-price-input'));
                excelRow.forEach((value, cIdx) => {
                    const input = targetInputs[cIdx];
                    if (input) {
                        setVal(input, clean(value));
                        input.dispatchEvent(new Event('change'));
                        updatedCount++;
                    }
                });
            });
            logA(`Đã dán ${updatedCount} giá trị từ Excel`, 'success', 'toast');
        } catch (error) {
            Opps(error, 'PriceManager.pasteValuesFromExcel');
        }
    }

    async copyFullTable(ctx) {
        try {
            const target = ctx.target || (ctx.row ? ctx.row : null);
            if (!target) return;
            const table = target.closest('table');
            if (!table) return;

            let tsv = '';
            const rows = table.querySelectorAll('tr');
            rows.forEach((row) => {
                const cells = row.querySelectorAll('th, td');
                const rowData = Array.from(cells).map((cell) => {
                    const input = cell.querySelector('input, select');
                    return input ? getVal(input) : cell.innerText.trim();
                });
                tsv += rowData.join('\t') + '\n';
            });

            await navigator.clipboard.writeText(tsv);
            logA('Đã copy toàn bộ bảng (TSV)', 'success', 'toast');
        } catch (error) {
            Opps(error, 'PriceManager.copyFullTable');
        }
    }

    async renderUI() {
        try {
            if (this.container) this.container.innerHTML = '';
            await A.UI.renderTemplate(this.container.id, 'tpl_price_manager.html', true);
            L._('[PriceManager] UI Rendered from template');
        } catch (error) {
            Opps(error, 'PriceManager.renderUI');
        }
    }

    attachEvents() {
        try {
            $$('input[name="pm-module-switch"]').forEach((radio) => {
                radio.addEventListener('change', (e) => this.switchModule(e.target.value));
            });

            const activeRadio = $('input[name="pm-module-switch"]:checked');
            if (activeRadio) this.switchModule(activeRadio.value);

            const btnAI = getE('pm-btn-ai-import');
            if (btnAI) {
                btnAI.addEventListener('click', () => {
                    const type = this.state.activeModule === 'hotel' ? 'hotel_price' : 'service_price';
                    this.controllers.ai.showImportModal(type);
                });
            }
        } catch (error) {
            Opps(error, 'PriceManager.attachEvents');
        }
    }

    async switchModule(moduleName) {
        try {
            if (!['hotel', 'service', 'config'].includes(moduleName)) return;

            this.setState({ activeModule: moduleName });

            setDisplay('pm-hotel-container', moduleName === 'hotel');
            setDisplay('pm-service-container', moduleName === 'service');
            setDisplay('pm-config-container', moduleName === 'config');
            setDisplay('pm-hotel-filter-wrap', moduleName === 'hotel');

            const filterArea = document.querySelector('.pm-filter-area');
            if (filterArea) filterArea.classList.toggle('d-none', moduleName === 'config');

            if (moduleName === 'hotel' && this.controllers.hotel && !this.controllers.hotel._initialized) {
                await this.controllers.hotel.init();
            } else if (moduleName === 'service' && this.controllers.service && !this.controllers.service._initialized) {
                await this.controllers.service.initLayout();
            } else if (moduleName === 'config') {
                await Promise.all([this.loadConfigData(), this.loadMarkupConfig()]);
            }
        } catch (error) {
            Opps(error, 'PriceManager.switchModule');
        }
    }

    async loadConfigData() {
        this.toggleLoading(true);
        try {
            const paths = {
                price_type: 'app_config/lists/price_type',
                price_periods: 'app_config/lists/price_periods',
                pkg_hotel_price: 'app_config/lists/pkg_hotel_price',
            };

            for (const [key, path] of Object.entries(paths)) {
                const data = await A.DB.getCollection(path);
                this.renderConfigList(key, normalizeList(data));
            }
        } catch (error) {
            Opps(error, 'PriceManager.loadConfigData');
        } finally {
            this.toggleLoading(false);
        }
    }

    async loadMarkupConfig() {
        try {
            const config = await A.DB.getCollection('app_config/prices/markup', 'default');
            if (config) {
                this.state.markupConfig = config;
                this.renderMarkupConfig(config);
            }
        } catch (error) {
            console.warn('[PriceManager] loadMarkupConfig error:', error);
        }
    }

    renderMarkupConfig(config) {
        try {
            const inputs = this.container.querySelectorAll('.markup-input');
            inputs.forEach((input) => {
                const type = input.dataset.type;
                const key = input.dataset.key;
                if (config[type] && config[type][key] !== undefined) {
                    input.value = config[type][key];
                }
            });
        } catch (error) {
            Opps(error, 'PriceManager.renderMarkupConfig');
        }
    }

    async saveMarkupConfig() {
        this.toggleLoading(true);
        try {
            const config = {
                id: 'default',
                hotel: {},
                service: {},
                updatedAt: new Date().getTime(),
                updatedBy: CURRENT_USER?.name || 'system',
            };

            const inputs = this.container.querySelectorAll('.markup-input');
            inputs.forEach((input) => {
                const type = input.dataset.type;
                const key = input.dataset.key;
                config[type][key] = Number(input.value);
            });

            await A.DB.saveRecord('app_config/prices/markup', config);
            this.state.markupConfig = config;

            if (PriceCalculator.loadConfig) await PriceCalculator.loadConfig();
            logA('Đã lưu cấu hình Markup thành công!', 'success', 'toast');
        } catch (error) {
            Opps(error, 'PriceManager.saveMarkupConfig');
        } finally {
            this.toggleLoading(false);
        }
    }

    renderConfigList(key, items) {
        try {
            const containerId = `pm-config-${key.replace(/_/g, '-')}`;
            const container = getE(containerId);
            if (!container) return;

            container.innerHTML = items
                .map(
                    (item) => `
        <div class="list-group-item d-flex justify-content-between align-items-center py-2">
          <div>
            <div class="fw-bold">${item.name || item.id}</div>
            <div class="small text-muted">${item.from ? `${item.from} - ${item.to}` : item.id}</div>
          </div>
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-secondary" onclick="A.PriceManager.editConfigItem('${key}', '${item.id}')"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-outline-danger" onclick="A.PriceManager.deleteConfigItem('${key}', '${item.id}')"><i class="bi bi-trash"></i></button>
          </div>
        </div>
      `
                )
                .join('');
        } catch (error) {
            Opps(error, 'PriceManager.renderConfigList');
        }
    }

    async addConfigItem(key) {
        try {
            const name = await prompt(`Nhập tên cho ${key}:`);
            if (!name) return;

            const id = name.toLowerCase().replace(/\s+/g, '-');
            const path = `app_config/lists/${key}`;

            const newItem = { id, name };
            if (key === 'price_periods') {
                newItem.from = '01/01';
                newItem.to = '31/12';
            }

            await A.DB.saveRecord(path, newItem);
            logA('Đã thêm thành công', 'success', 'toast');
            this.loadConfigData();
        } catch (error) {
            Opps(error, 'PriceManager.addConfigItem');
        }
    }

    async editConfigItem(key, id) {
        logA('Tính năng sửa đang được phát triển', 'info', 'toast');
    }

    async deleteConfigItem(key, id) {
        try {
            if (confirm(`Xóa mục ${id}?`)) {
                const path = `app_config/lists/${key}`;
                await A.DB.deleteRecord(path, id);
                logA('Đã xóa', 'success', 'toast');
                this.loadConfigData();
            }
        } catch (error) {
            Opps(error, 'PriceManager.deleteConfigItem');
        }
    }

    updateFilter(filter) {
        this.setState({
            currentFilter: { ...this.state.currentFilter, ...filter },
        });
    }

    async loadMasterData() {
        this.toggleLoading(true);
        try {
            const suppliers = normalizeList(window.APP_DATA?.suppliers || (await A.DB.getCollection('suppliers')));
            const hotels = normalizeList(window.APP_DATA?.hotels || (await A.DB.getCollection('hotels')));

            this.setState({
                masterData: {
                    ...this.state.masterData,
                    suppliers: suppliers || [],
                    hotels: hotels || [],
                },
            });
        } catch (error) {
            Opps(error, 'PriceManager.loadMasterData');
        } finally {
            this.toggleLoading(false);
        }
    }

    calculateSellingData(type, data, context = {}) {
        try {
            if (type === 'hotel') return PriceCalculator.recalculateHotelTable(data, context.star || 3);
            else if (type === 'service') return PriceCalculator.recalculateServiceItems(data);
            return data;
        } catch (error) {
            Opps(error, 'PriceManager.calculateSellingData');
            return data;
        }
    }

    async onPriceChanged(moduleType, payload) {
        return;
        try {
            const pkgName = payload.info?.ratePkg || 'Mặc định';
            const notification = {
                type: 'price_updated',
                module: moduleType,
                title: `Cập nhật giá ${moduleType === 'hotel' ? 'Khách sạn' : 'Dịch vụ'}`,
                body: moduleType === 'hotel' ? `Bảng giá KS ${payload.info?.hotelName || ''} (Gói: ${pkgName}) năm ${payload.info?.year || ''} đã được cập nhật.` : `Bảng giá dịch vụ của ${payload.info?.supplierName || ''} năm ${payload.info?.year || ''} đã được cập nhật.`,
                createdAt: new Date().getTime(),
                status: 'unread',
                targetGroup: 'sales',
            };

            window.sendToAll('CẬP NHẬT GIÁ!', notification);
        } catch (error) {
            console.error('[PriceManager] onPriceChanged error:', error);
        }
    }

    async importFromAI(importType, data, metadata, hotelInfo = null) {
        try {
            if (metadata && metadata.supplier_name) {
                const sName = metadata.supplier_name.trim();
                const existingSuppliers = Array.isArray(window.APP_DATA?.suppliers) ? window.APP_DATA.suppliers : Object.values(window.APP_DATA?.suppliers || {});
                let foundS = existingSuppliers.find((s) => s.name.toLowerCase() === sName.toLowerCase() || s.id === metadata.supplier_id);

                let supplierId = foundS ? foundS.id : '';
                let needUpdate = false;
                let supplierObj = foundS ? { ...foundS } : { id: supplierId, name: sName, createdAt: Date.now() };
                if (!foundS) needUpdate = true;

                if (importType === 'hotel_price' && hotelInfo) {
                    if (hotelInfo.phone && supplierObj.phone !== hotelInfo.phone) {
                        supplierObj.phone = hotelInfo.phone;
                        needUpdate = true;
                    }
                    if (hotelInfo.email && supplierObj.email !== hotelInfo.email) {
                        supplierObj.email = hotelInfo.email;
                        needUpdate = true;
                    }
                }

                if (needUpdate && window.A && A.DB && typeof A.DB.saveRecord === 'function') {
                    const res = await A.DB.saveRecord('suppliers', supplierObj);
                    if (res.success && !supplierId) {
                        supplierObj.id = res.id;
                        supplierId = res.id;
                    }

                    const sIdx = this.state.masterData.suppliers.findIndex((s) => s.id === supplierId);
                    if (sIdx > -1) this.state.masterData.suppliers[sIdx] = supplierObj;
                    else this.state.masterData.suppliers.push(supplierObj);
                }
                metadata.supplier_id = supplierId;
            }

            if (importType === 'hotel_price') await this.controllers.hotel.fillDataFromAI(data, metadata, hotelInfo);
            else if (importType === 'service_price') await this.controllers.service.fillDataFromAI(data, metadata);
        } catch (error) {
            Opps(error, 'PriceManager.importFromAI');
            throw error;
        }
    }

    toggleLoading(show) {
        setDisplay('pm-loading', show);
    }
    setState(updates) {
        this.state = { ...this.state, ...updates };
    }
}

window.PriceManager = PriceManager;
