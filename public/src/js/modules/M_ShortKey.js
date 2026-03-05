/**
 * =========================================================================
 * MODULE: 9 TRIP KEYBOARD SHORTCUT MANAGER (ES6 + INDEXEDDB)
 * =========================================================================
 * Tác giả : 9 Trip ERP Tech Lead
 * Phiên bản: 2.0.0
 * Mô tả   : Quản lý phím tắt toàn cục.
 *            • Lưu trữ qua DBLocalStorage (shared IndexedDB — không mở DB riêng).
 *            • Hỗ trợ Registry pattern (ES6) + fallback window (legacy).
 *            • Auto-migrate từ localStorage (v1) sang IndexedDB (v2).
 *            • Full UI: render, add, edit, delete, record key, reset defaults.
 *
 * @example
 *   // main.js
 *   import ShortcutManager from './modules/M_ShortKey.js';
 *   const shortcutMgr = new ShortcutManager();
 *   await shortcutMgr.init();
 *   shortcutMgr.registerCommand('modalAdmin', () => openAdminModal());
 * =========================================================================
 */

import localDB from './DBLocalStorage.js';

// =========================================================================
// 1. CONSTANTS
// =========================================================================

/** Danh sách phím tắt mặc định — nguồn sự thật duy nhất */
const DEFAULT_SHORTCUTS = Object.freeze({
  modalAdmin: 'Ctrl+Shift+S',
  reloadPage: 'Ctrl+Alt+Q',
  openSettingsModal: 'Ctrl+Alt+M',
  openSingleForm: 'Ctrl+Alt+F',
  openCalculator: 'Ctrl+Alt+C',
  openAdminConsole: 'Ctrl+Alt+A',
});

// =========================================================================
// 2. CLASS
// =========================================================================

class ShortcutManager {
  constructor() {
    // Cấu hình lưu trữ — dùng chung DB qua DBLocalStorage singleton
    this.STORE_NAME = 'app_config';
    this.CONFIG_KEY = 'general';

    /** @type {Map<string, Function>} Registry ES6 commands */
    this._registry = new Map();

    /** Bản sao phím tắt runtime (sẽ merge với DB khi init) */
    this.shortcuts = { ...DEFAULT_SHORTCUTS };
    this.initialized = false;

    /** Cờ ngăn global handler khi đang ghi phím */
    this.isRecording = false;

    // Bind 1 lần để có thể removeEventListener chính xác
    this.handleGlobalShortcuts = this.handleGlobalShortcuts.bind(this);
  }

  async _loadFromDB() {
    try {
      const doc = await localDB.get(this.STORE_NAME, this.CONFIG_KEY);
      return doc?.settings?.shortcuts ?? null;
    } catch {
      return null;
    }
  }

  async _saveToDB() {
    let general = {
      id: 'general',
      settings: {
        shortcuts: this.shortcuts,
      },
    };
    return localDB.put(this.STORE_NAME, general);
  }

  // ==========================================
  // KHỞI TẠO & ĐĂNG KÝ (CORE)
  // ==========================================

  /**
   * Khởi tạo module. BẮT BUỘC dùng `await` khi gọi.
   *
   *
   * @returns {Promise<void>}
   */
  async init() {
    try {
      await localDB.initDB(); // Đảm bảo DB sẵn sàng (deduplicate nếu đã init)

      const savedShortcuts = await this._loadFromDB();
      if (savedShortcuts) {
        this.shortcuts = { ...this.shortcuts, ...savedShortcuts };
      } else {
        await this._saveToDB(); // Lưu bản mặc định nếu DB trống
      }
      this.registerCommand('openCalculator', this.openCalculator);
      this.registerCommand('openAdminConsole', this.openAdminConsole);
      this.registerCommand('openSingleForm', this.openSingleForm);
      this.registerCommand('modalAdmin', this.modalAdmin);

      document.addEventListener('keydown', this.handleGlobalShortcuts);
      this.renderSettingsForm(); // Render UI ngay sau khi load config
      log('🚀 [ShortcutManager] Đã load config từ DBLocalStorage & Sẵn sàng.');
    } catch (error) {
      Opps('❌ [ShortcutManager] Lỗi khởi tạo init():', error);
      // Fallback: Vẫn cho chạy với default config nếu IDB sập
      document.addEventListener('keydown', this.handleGlobalShortcuts);
    }
  }

  /**
   * Hủy module — gỡ event listener. Gọi khi cần cleanup (SPA navigation, test, …).
   */
  destroy() {
    document.removeEventListener('keydown', this.handleGlobalShortcuts);
    this._registry.clear();
    log('🛑 [ShortcutManager] Đã destroy & gỡ toàn bộ listener.');
  }

  /**
   * Đăng ký lệnh ES6 (ưu tiên cao hơn window fallback).
   *
   * @param {string} commandName - Tên lệnh (trùng key trong this.shortcuts)
   * @param {Function} callback
   */
  registerCommand(commandName, callback) {
    if (typeof callback === 'function') {
      this._registry.set(commandName, callback);
    } else {
      log(`⚠️ [ShortcutManager] Lệnh "${commandName}" không hợp lệ (callback phải là function).`, 'warning');
    }
  }

  /**
   * Gỡ lệnh khỏi Registry.
   *
   * @param {string} commandName
   */
  unregisterCommand(commandName) {
    this._registry.delete(commandName);
  }

  // ==========================================
  // LOGIC XỬ LÝ PHÍM BẤM
  // ==========================================
  _buildKeyCombination(e) {
    const modifiers = [];
    if (e.ctrlKey) modifiers.push('Ctrl');
    if (e.shiftKey) modifiers.push('Shift');
    if (e.altKey) modifiers.push('Alt');

    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return null;
    if (modifiers.length === 0) return null;

    return `${modifiers.join('+')}+${e.key.toUpperCase()}`;
  }

  /**
   * Parse chuỗi "funcName(arg1, arg2)" thành { name, args }.
   *
   * @param {string} funcStr - Ví dụ: 'openTab("booking")' hoặc 'saveForm'
   * @returns {{ name: string, args: string[] }}
   */
  _parseFunctionCall(funcStr) {
    const match = funcStr.match(/^(\w+)\s*\((.*)\)\s*$/);
    if (match) {
      const name = match[1];
      const argsStr = match[2].trim();
      const args = argsStr ? argsStr.split(',').map((arg) => arg.trim().replace(/['"]/g, '')) : [];
      return { name, args };
    }
    return { name: funcStr.trim(), args: [] };
  }

  /**
   * Kiểm tra lệnh có tồn tại trong Registry hoặc window hay không.
   *
   * @param {string} funcStr - Tên hàm hoặc "funcName(args)"
   * @returns {{ exists: boolean, source: 'registry'|'window'|null, argsExpected: number }}
   */
  _validateCommand(funcStr) {
    const { name, args } = this._parseFunctionCall(funcStr);

    if (this._registry.has(name)) {
      return { exists: true, source: 'registry', argsExpected: -1 }; // Registry không check args
    }
    if (typeof window[name] === 'function') {
      return { exists: true, source: 'window', argsExpected: window[name].length };
    }
    return { exists: false, source: null, argsExpected: 0 };
  }

  /**
   * Thực thi lệnh: Registry first → window fallback.
   *
   * @param {string} funcStr
   * @returns {boolean} true nếu thực thi thành công
   */
  _executeCommand(funcStr) {
    const { name, args } = this._parseFunctionCall(funcStr);

    // 1. Chạy trên Registry (Kiến trúc ES6 mới)
    const command = this._registry.get(name);
    if (command) {
      try {
        command(...args);
        return true;
      } catch (error) {
        Opps(`❌ [ShortcutManager] Lỗi thực thi Registry Command [${name}]:`, error);
        return false;
      }
    }

    // 2. Fallback: Gọi hàm ở window (Kiến trúc cũ)
    if (typeof window[name] === 'function') {
      log(`⚠️ [Tech Debt] Đang gọi hàm cũ ở Global Window: ${name}. Cần sớm refactor!`, 'warning');
      try {
        window[name](...args);
        return true;
      } catch (error) {
        Opps(`❌ [ShortcutManager] Lỗi thực thi Window Function [${name}]:`, error);
        return false;
      }
    }

    Opps(`❌ Lệnh "${name}" KHÔNG TỒN TẠI ở Registry và Window.`);
    return false;
  }

  /**
   * Global keydown handler — được bind vào document.
   *
   * @param {KeyboardEvent} e
   */
  handleGlobalShortcuts(e) {
    if (this.isRecording) return;

    const combo = this._buildKeyCombination(e);
    if (!combo) return;

    for (const [funcCall, assignedCombo] of Object.entries(this.shortcuts)) {
      if (assignedCombo === combo) {
        e.preventDefault();
        e.stopPropagation();

        log(`🔥 [ShortcutManager] Bắt phím: ${combo} -> ${funcCall}`);
        this._executeCommand(funcCall);
        return;
      }
    }
  }

  // ==========================================
  // QUẢN LÝ DỮ LIỆU (CRUD)
  // ==========================================

  /**
   * Thêm phím tắt mới — đầy đủ validation + auto-save.
   *
   * @param {string} commandName - Tên lệnh hoặc "funcName(arg1, arg2)"
   * @param {string} keyCombo    - Ví dụ: 'Ctrl+Alt+N'
   * @returns {Promise<boolean>}
   */
  async addNewCustomShortcut(commandName, keyCombo) {
    if (!commandName || !keyCombo) return false;

    // Validate: kiểm tra duplicate key
    const duplicateCmd = this._findCommandByCombo(keyCombo);
    if (duplicateCmd) {
      showAlert(`⚠️ Phím tắt "${keyCombo}" đã được gán cho "${duplicateCmd}".`, 'warning');
      return false;
    }

    // Validate: kiểm tra hàm tồn tại + cảnh báo args
    const { exists, source, argsExpected } = this._validateCommand(commandName);
    if (!exists) {
      const confirmAdd = confirm(`⚠️ Hàm [${this._parseFunctionCall(commandName).name}] chưa được cấu hình trong hệ thống.\nTiếp tục thêm?`);
      if (!confirmAdd) return false;
    } else if (source === 'window') {
      const { args } = this._parseFunctionCall(commandName);
      if (argsExpected > 0 && args.length !== argsExpected) {
        log(`⚠️ [ShortcutManager] Hàm "${commandName}" cần ${argsExpected} args, nhập ${args.length}.`, 'warning');
      }
    }

    try {
      this.shortcuts[commandName] = keyCombo;
      await this._saveToDB();
      await this.renderSettingsForm(); // Re-render UI
      log(`✅ [ShortcutManager] Đã thêm: ${commandName} -> ${keyCombo}`);
      return true;
    } catch (error) {
      Opps('❌ [ShortcutManager] Lỗi lưu phím tắt mới:', error);
      return false;
    }
  }

  /**
   * Xóa phím tắt theo tên lệnh và cập nhật DB.
   *
   * @param {string} funcCall - Key trong this.shortcuts
   * @param {string} domId    - ID của DOM element cần xóa
   */
  async deleteShortcut(funcCall, domId) {
    if (!confirm('Bạn có chắc chắn muốn xóa phím tắt này không?')) return;

    try {
      delete this.shortcuts[funcCall];
      await this._saveToDB();

      const item = document.getElementById(domId);
      if (item) item.remove();

      log(`✅ [ShortcutManager] Xóa thành công ${funcCall}`);
    } catch (error) {
      Opps('❌ [ShortcutManager] Lỗi xóa phím tắt:', error);
    }
  }

  /**
   * Reset toàn bộ phím tắt về mặc định gốc.
   *
   * @returns {Promise<boolean>}
   */
  async resetToDefaults() {
    if (!confirm('⚠️ Reset toàn bộ phím tắt về mặc định?\nMọi tuỳ chỉnh sẽ bị mất.')) {
      return false;
    }

    try {
      this.shortcuts = { ...DEFAULT_SHORTCUTS };
      await this._saveToDB();
      await this.renderSettingsForm();
      log('✅ [ShortcutManager] Đã reset về mặc định.');
      return true;
    } catch (error) {
      Opps('❌ [ShortcutManager] Lỗi reset:', error);
      return false;
    }
  }

  /**
   * Tìm tên lệnh đang gán cho 1 tổ hợp phím.
   *
   * @param {string} keyCombo - Ví dụ: 'Ctrl+Shift+S'
   * @returns {string|null} Tên lệnh hoặc null
   */
  _findCommandByCombo(keyCombo) {
    for (const [cmd, combo] of Object.entries(this.shortcuts)) {
      if (combo === keyCombo) return cmd;
    }
    return null;
  }

  /**
   * Lấy danh sách tất cả phím tắt hiện tại (read-only copy).
   *
   * @returns {Record<string, string>}
   */
  getAll() {
    return { ...this.shortcuts };
  }

  // ==========================================
  // GIAO DIỆN SETTINGS (UI)
  // ==========================================

  /**
   * Render toàn bộ danh sách phím tắt vào container #shortcut-list-container.
   * Phân biệt default (không có nút xóa) và custom (có nút xóa).
   */
  async renderSettingsForm() {
    const container = document.getElementById('shortcut-list-container');
    if (!container) return;

    container.innerHTML = '';

    Object.entries(this.shortcuts).forEach(([funcCall, keyCombo]) => {
      const { name } = this._parseFunctionCall(funcCall);
      const scId = `sc-${name.replace(/[^\w]/g, '_')}`;
      const isDefault = funcCall in DEFAULT_SHORTCUTS;

      // Kiểm tra lệnh có tồn tại không — đánh dấu UI
      const { exists, source } = this._validateCommand(funcCall);
      const statusIcon = exists ? `<span class="badge bg-success-subtle text-success ms-2">${source}</span>` : '<span class="badge bg-danger-subtle text-danger ms-2">not found</span>';

      const item = document.createElement('div');
      item.className = 'list-group-item d-flex justify-content-between align-items-center py-3 px-0';
      item.id = scId;
      item.innerHTML = `
        <div>
          <div class="fw-bold text-dark">
            <i class="fa-solid fa-keyboard me-2 text-secondary"></i>
            ${isDefault ? 'Phím Tắt Mặc Định' : 'Phím Tắt Tuỳ Chỉnh'}
            ${statusIcon}
          </div>
          <small class="text-muted">Hàm thực thi: <code>${funcCall}</code></small>
        </div>
        <div class="position-relative d-flex gap-2" style="width: auto">
          <input type="text"
            class="form-control form-control-sm text-center fw-bold text-primary shortcut-input"
            id="${scId}-input" readonly placeholder="Click to set..."
            data-fn="${funcCall}" value="${keyCombo}" />
          ${
            isDefault
              ? ''
              : `<button type="button" class="btn btn-sm btn-outline-danger" data-delete-id="${scId}" data-delete-func="${funcCall}">
                   <i class="fa-solid fa-trash-can"></i>
                 </button>`
          }
        </div>
      `;
      container.appendChild(item);

      // Event: click input → bắt đầu ghi phím
      const inputEl = item.querySelector(`#${scId}-input`);
      inputEl.addEventListener('click', () => this.recordInput(inputEl));

      // Event: xóa phím tắt (chỉ custom)
      const btnDelete = item.querySelector('[data-delete-id]');
      if (btnDelete) {
        btnDelete.addEventListener('click', () => this.deleteShortcut(funcCall, scId));
      }
    });
  }

  // ==========================================
  // FORM THÊM PHÍM TẮT MỚI (UI)
  // ==========================================

  /**
   * Hiển thị form thêm phím tắt mới (toggle container #add-shortcut-form-container).
   */
  showAddShortcutForm() {
    const form = document.getElementById('add-shortcut-form-container');
    if (!form) return;
    form.classList.remove('d-none');
    document.getElementById('new-sc-function')?.focus();
  }

  /**
   * Ẩn form thêm phím tắt mới và reset các input.
   */
  hideAddForm() {
    const form = document.getElementById('add-shortcut-form-container');
    if (!form) return;
    form.classList.add('d-none');

    // Reset tất cả input trong form
    ['new-sc-name', 'new-sc-icon', 'new-sc-function', 'new-sc-key'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
  }

  /**
   * Bắt đầu ghi phím cho ô input #new-sc-key trong form thêm mới.
   * Tách riêng khỏi recordInput() vì ô này không có data-fn.
   */
  startRecordingNewKey() {
    const keyInput = document.getElementById('new-sc-key');
    if (!keyInput) return;

    this.isRecording = true;
    keyInput.value = 'Giữ Phím (Ctrl/Shift/Alt) + Ký tự...';
    keyInput.classList.add('bg-warning', 'text-dark');
    keyInput.classList.remove('bg-white');

    const tempHandler = (e) => {
      e.preventDefault();

      if (e.key === 'Escape') {
        this._finishRecording(keyInput, tempHandler, '');
        return;
      }

      const combo = this._buildKeyCombination(e);
      if (combo) {
        keyInput.value = combo;
        this._finishRecording(keyInput, tempHandler, combo);
      }
    };

    document.addEventListener('keydown', tempHandler);

    keyInput.onblur = () => {
      if (keyInput.value === 'Giữ Phím (Ctrl/Shift/Alt) + Ký tự...') {
        keyInput.value = '';
      }
      this._finishRecording(keyInput, tempHandler, keyInput.value);
    };
  }

  /**
   * Xử lý submit form thêm phím tắt mới.
   * Validate đầy đủ: name, function, key combo, duplicate check, args check.
   *
   * @returns {Promise<boolean>}
   */
  async saveNewShortcut() {
    const nameEl = document.getElementById('new-sc-name');
    const funcEl = document.getElementById('new-sc-function');
    const keyEl = document.getElementById('new-sc-key');

    const name = nameEl?.value?.trim();
    const funcCall = funcEl?.value?.trim();
    const keyCombo = keyEl?.value?.trim();

    // Validation
    if (!funcCall) {
      alert('⚠️ Vui lòng nhập Tên Hàm!');
      funcEl?.focus();
      return false;
    }
    if (!keyCombo) {
      alert('⚠️ Vui lòng ghi nhận Phím Tắt!');
      return false;
    }

    // Gọi addNewCustomShortcut (đã có đầy đủ validation bên trong)
    const success = await this.addNewCustomShortcut(funcCall, keyCombo);

    if (success) {
      this.hideAddForm();
      const displayName = name || funcCall;
      console.info(`✅ Phím tắt "${displayName}" (${keyCombo}) đã được thêm thành công!`);
    }

    return success;
  }

  // ==========================================
  // GHI PHÍM CHO INPUT CÓ SẴN (Recording)
  // ==========================================

  /**
   * Bắt đầu ghi phím cho 1 input có sẵn (có data-fn).
   * Auto-save vào IndexedDB khi ghi thành công. Duplicate check.
   *
   * @param {HTMLInputElement} inputEl - Input element có data-fn
   */
  recordInput(inputEl) {
    this.isRecording = true;
    const funcCall = inputEl.dataset.fn;
    const originalValue = inputEl.value;

    inputEl.value = 'Giữ Phím (Ctrl/Shift/Alt) + Ký tự...';
    inputEl.classList.add('bg-warning', 'text-dark');
    inputEl.classList.remove('bg-white');

    const tempHandler = async (e) => {
      e.preventDefault();

      if (e.key === 'Escape') {
        this._finishRecording(inputEl, tempHandler, originalValue);
        return;
      }

      const newCombo = this._buildKeyCombination(e);
      if (newCombo) {
        // Duplicate check: bỏ qua chính nó
        const existingCmd = this._findCommandByCombo(newCombo);
        if (existingCmd && existingCmd !== funcCall) {
          alert(`⚠️ Phím tắt "${newCombo}" đã được gán cho "${existingCmd}"!`);
          this._finishRecording(inputEl, tempHandler, originalValue);
          return;
        }

        try {
          this.shortcuts[funcCall] = newCombo;
          await this._saveToDB(); // Auto-save ngay khi đổi phím thành công
          this._finishRecording(inputEl, tempHandler, newCombo);
        } catch (error) {
          console.error('❌ Lỗi cập nhật phím tắt vào DB:', error);
          this._finishRecording(inputEl, tempHandler, originalValue);
        }
      }
    };

    document.addEventListener('keydown', tempHandler);

    inputEl.onblur = () => {
      this._finishRecording(inputEl, tempHandler, this.shortcuts[funcCall] || originalValue);
    };
  }

  /**
   * Kết thúc trạng thái recording — reset UI input.
   *
   * @param {HTMLInputElement} inputEl
   * @param {Function} handler - tempHandler cần gỡ
   * @param {string} finalValue - Giá trị hiển thị cuối cùng
   */
  _finishRecording(inputEl, handler, finalValue) {
    inputEl.value = finalValue;
    inputEl.classList.remove('bg-warning', 'text-dark');
    inputEl.classList.add('bg-white');
    document.removeEventListener('keydown', handler);
    setTimeout(() => {
      this.isRecording = false;
    }, 100);
  }
  openCalculator() {
    if (A.CalculatorWidget && typeof A.CalculatorWidget.toggle === 'function') {
      A.CalculatorWidget.toggle();
    } else log('⚠️ [ShortcutManager] A.CalculatorWidget.toggle() không tồn tại!');
  }

  openAdminConsole() {
    A.AdminConsole.openAdminSettings();
  }
  openSingleForm() {
    A.UI.renderForm();
  }
  modalAdmin() {
    A.Modal.setOptions({ backdrop: true, keyboard: true });
    // CSS trick: cho phép click xuyên qua modal wrapper
    document.querySelector('#dynamic-modal').style.pointerEvents = 'none';
    document.querySelector('#dynamic-modal .modal-dialog').style.pointerEvents = 'auto';
  }
}

const ShortKey = new ShortcutManager();
export default ShortKey;
