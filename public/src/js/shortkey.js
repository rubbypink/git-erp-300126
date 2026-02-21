
/**
 * ----------------------------------------------------------------------
 * MODULE: KEYBOARD SHORTCUT MANAGER (CTRL REQUIRED VERSION)
 * ----------------------------------------------------------------------
 */
const SHORTCUT_KEY_STORAGE = '9TRIP_SHORTCUTS_CFG';

// Cấu hình mặc định
let APP_SHORTCUTS = {
    'saveForm': 'Ctrl+Shift+S',
    'reloadPage': 'Ctrl+Alt+Q', // Tránh F5 vì yêu cầu Ctrl
    'openSettingsModal': 'Ctrl+Alt+M',
    'actionCreateBooking': 'Ctrl+Alt+B',
    'openCalculator': 'Ctrl+Shift+C',
    'openAdminConsole': 'Ctrl+Alt+A',
};

// 1. Khởi tạo (Gọi hàm này trong initApp)
function initShortcuts() {
    // Load từ localStorage nếu có
    const saved = localStorage.getItem(SHORTCUT_KEY_STORAGE);
    if (saved) {
        APP_SHORTCUTS = JSON.parse(saved);
    }
    loadShortcutsToForm();
    
    // Đăng ký sự kiện toàn trang
    document.addEventListener('keydown', handleGlobalShortcuts);
}

// 2. Helper: Tạo chuỗi combo từ phím bấm
function buildKeyCombination(e) {
    const modifiers = [];
    if (e.ctrlKey) modifiers.push('Ctrl');
    if (e.shiftKey) modifiers.push('Shift');
    if (e.altKey) modifiers.push('Alt');
    
    // Bỏ qua nếu chỉ là phím modifier
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return null;
    
    if (modifiers.length === 0) return null; // Phải có ít nhất 1 modifier
    
    return modifiers.join('+') + '+' + e.key?.toUpperCase();
}

// 2B. Helper: Parse function name và arguments từ chuỗi
// Ví dụ: "funcA(val1,val2)" -> {name: "funcA", args: ["val1", "val2"]}
//       "saveForm()" -> {name: "saveForm", args: []}
//       "saveForm" -> {name: "saveForm", args: []}
function parseFunctionCall(funcStr) {
    const match = funcStr.match(/^(\w+)\s*\((.*)\)\s*$/);
    
    if (match) {
        const name = match[1];
        const argsStr = match[2].trim();
        const args = argsStr 
            ? argsStr.split(',').map(arg => arg.trim())
            : [];
        return { name, args };
    }
    
    // Nếu không match format, coi toàn bộ là function name
    return { name: funcStr.trim(), args: [] };
}

// 2C. Helper: Thực thi function với arguments
function executeFunctionWithArgs(funcStr) {
    const { name, args } = parseFunctionCall(funcStr);
    
    if (typeof window[name] !== 'function') {
        console.warn(`Function ${name} not found!`);
        return false;
    }
    
    try {
        if (args.length === 0) {
            window[name]();
        } else {
            // Gọi function với arguments
            window[name](...args);
        }
        return true;
    } catch (error) {
        console.error(`Error executing ${funcStr}:`, error);
        return false;
    }
}

// 3. Xử lý khi người dùng bấm phím bất kỳ trên trang
function handleGlobalShortcuts(e) {
    const combo = buildKeyCombination(e);
    if (!combo) return;

    // Kiểm tra xem combo này có trùng với lệnh nào không
    for (const [funcName, assignedCombo] of Object.entries(APP_SHORTCUTS)) {
        if (assignedCombo === combo) {
            e.preventDefault();
            e.stopPropagation();
            
            console.log(`🔥 Executing Shortcut: ${combo} -> ${funcName}`);
            
            // Gọi hàm với arguments nếu có
            executeFunctionWithArgs(funcName);
            return;
        }
    }
}

/**
 * ----------------------------------------------------------------------
 * CÁC HÀM HỖ TRỢ TRONG SETTINGS FORM
 * ----------------------------------------------------------------------
 */

// 3. Hàm render giá trị hiện tại vào các ô Input trong Modal
// (Gọi hàm này khi mở Modal Settings - Load cả shortcut default và custom)
function loadShortcutsToForm() {
    const inputs = document.querySelectorAll('.shortcut-input');
    
    // Load shortcut vào các input có sẵn (default)
    inputs.forEach(input => {
        const funcName = input.dataset.fn;
        if (APP_SHORTCUTS[funcName]) {
            input.value = APP_SHORTCUTS[funcName];
        }
        
        // Gán sự kiện click để bắt đầu ghi âm phím
        input.addEventListener('click', () => startRecordingKey(input));
    });
    
    // Render custom shortcuts (những shortcut không có input element trong HTML)
    const container = document.getElementById('shortcut-list-container');
    if (!container) return;
    
    // Lấy danh sách các function call đã lưu từ APP_SHORTCUTS
    Object.entries(APP_SHORTCUTS).forEach(([funcCall, keyCombo]) => {
        const { name: funcName } = parseFunctionCall(funcCall);
        
        // Kiểm tra xem shortcut này đã có trong HTML không
        const existingInput = document.querySelector(`[data-fn="${funcCall}"]`);
        if (existingInput) {
            // Đã có input element trong HTML, không cần tạo lại
            return;
        }
        
        // Kiểm tra xem đã thêm item này chưa
        const existingItem = document.getElementById(`sc-${funcName.replace(/[^\w]/g, '_')}`);
        if (existingItem) {
            return; // Đã có rồi, không thêm lại
        }
        
        // Đây là custom shortcut, cần render nó vào form
        const newItem = document.createElement('div');
        const scId = `sc-${funcName.replace(/[^\w]/g, '_')}_custom`;
        newItem.className = 'list-group-item d-flex justify-content-between align-items-center py-3 px-0';
        newItem.id = scId;
        newItem.innerHTML = `
            <div>
                <div class="fw-bold text-dark">
                    <i class="fa-solid fa-keyboard me-2 text-secondary"></i>${funcCall}
                </div>
                <small class="text-muted">Hàm thực thi: <code>${funcCall}</code></small>
            </div>
            <div class="position-relative d-flex gap-2" style="width: auto">
                <input type="text"
                    class="form-control form-control-sm text-center fw-bold text-primary shortcut-input"
                    id="${scId}-input" readonly placeholder="Click to set..." data-fn="${funcCall}" value="${keyCombo}" />
                <button type="button" class="btn btn-sm btn-outline-danger" onclick="deleteShortcut('${funcCall}', '${scId}')">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
        `;
        
        // Thêm event click vào input mới
        const newInput = newItem.querySelector(`#${scId}-input`);
        newInput.addEventListener('click', () => startRecordingKey(newInput));
        
        // Thêm vào container
        container.appendChild(newItem);
    });
}

// 4. Logic ghi nhận phím bấm (Recording)
function startRecordingKey(inputEl) {
    // UI Feedback
    inputEl.value = "Giữ Phím (Ctrl/Shift/Alt) + Ký tự...";
    inputEl.classList.add('bg-warning', 'text-dark');
    inputEl.classList.remove('bg-white');

    // Tạo handler tạm thời
    const tempHandler = (e) => {
        e.preventDefault();
        
        // Nếu người dùng nhấn Esc -> Hủy bỏ
        if (e.key === 'Escape') {
            inputEl.value = APP_SHORTCUTS[inputEl.dataset.fn] || "";
            finishRecording(inputEl, tempHandler);
            return;
        }

        // Kiểm tra logic: BẮT BUỘC CÓ MODIFIER (Ctrl, Shift, hoặc Alt)
        if (!e.ctrlKey && !e.shiftKey && !e.altKey) {
            return; // Chờ cho đến khi có modifier
        }

        // Bỏ qua nếu chỉ đang giữ modifier mà chưa bấm phím ký tự
        if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;

        // Đã hợp lệ (Modifier(s) + Ký tự)
        const newCombo = buildKeyCombination(e);
        
        if (newCombo) {
            // Cập nhật UI
            inputEl.value = newCombo;
            
            // Cập nhật vào biến config tạm
            APP_SHORTCUTS[inputEl.dataset.fn] = newCombo;

            finishRecording(inputEl, tempHandler);
        }
    };

    // Lắng nghe
    document.addEventListener('keydown', tempHandler);
    
    // Xử lý khi blur ra ngoài (hủy bỏ)
    inputEl.onblur = () => {
         finishRecording(inputEl, tempHandler);
         // Restore value if invalid
         if(inputEl.value === "Giữ Phím (Ctrl/Shift/Alt) + Ký tự...") {
             inputEl.value = APP_SHORTCUTS[inputEl.dataset.fn] || "";
         }
    };
}

function finishRecording(inputEl, handler) {
    inputEl.classList.remove('bg-warning', 'text-dark');
    inputEl.classList.add('bg-white');
    document.removeEventListener('keydown', handler);
}

// 5. Hàm lưu cấu hình (Được gọi khi bấm nút "Lưu Cài Đặt" trong modal)
function saveShortcutsConfig() {
    localStorage.setItem(SHORTCUT_KEY_STORAGE, JSON.stringify(APP_SHORTCUTS));
    showNotify('Đã Lưu!', true);
    console.log("Shortcuts Saved to Storage.");
}

// ========== FUNCTIONS FOR ADD NEW SHORTCUT FORM ==========

// 6. Hiển thị form thêm phím tắt mới
function showAddShortcutForm() {
    const formContainer = document.getElementById('add-shortcut-form-container');
    if (formContainer) {
        formContainer.classList.remove('d-none');
        document.getElementById('new-sc-name').focus();
    }
}

// 7. Ẩn form thêm phím tắt mới
function hideAddShortcutForm() {
    const formContainer = document.getElementById('add-shortcut-form-container');
    if (formContainer) {
        formContainer.classList.add('d-none');
        // Reset form
        document.getElementById('new-sc-name').value = '';
        document.getElementById('new-sc-icon').value = '';
        document.getElementById('new-sc-function').value = '';
        document.getElementById('new-sc-key').value = '';
    }
}

// 8. Ghi nhận phím tắt mới
let recordingNewKey = false;
function startRecordingNewKey() {
    recordingNewKey = true;
    const keyInput = document.getElementById('new-sc-key');
    keyInput.value = "Giữ Phím + Ký tự...";
    keyInput.classList.add('bg-warning', 'text-dark');
    keyInput.classList.remove('bg-white');
    
    const tempHandler = (e) => {
        e.preventDefault();
        
        if (e.key === 'Escape') {
            recordingNewKey = false;
            keyInput.value = '';
            finishRecordingNewKey(keyInput, tempHandler);
            return;
        }
        
        if (!e.ctrlKey && !e.shiftKey && !e.altKey) {
            return;
        }
        
        if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
        
        const combo = buildKeyCombination(e);
        if (combo) {
            keyInput.value = combo;
            recordingNewKey = false;
            finishRecordingNewKey(keyInput, tempHandler);
        }
    };
    
    document.addEventListener('keydown', tempHandler);
    keyInput.onblur = () => {
        if (recordingNewKey) {
            recordingNewKey = false;
            finishRecordingNewKey(keyInput, tempHandler);
            if (keyInput.value === "Giữ Phím + Ký tự...") {
                keyInput.value = '';
            }
        }
    };
}

function finishRecordingNewKey(inputEl, handler) {
    inputEl.classList.remove('bg-warning', 'text-dark');
    inputEl.classList.add('bg-white');
    document.removeEventListener('keydown', handler);
}

// 9. Lưu phím tắt mới vào danh sách
function saveNewShortcut() {
    const name = document.getElementById('new-sc-name').value.trim();
    const icon = document.getElementById('new-sc-icon').value;
    const funcCall = document.getElementById('new-sc-function').value.trim();
    const keyCombo = document.getElementById('new-sc-key').value.trim();
    
    // Validation
    if (!name) {
        logA('Vui lòng nhập Tên Phím Tắt!');
        return;
    }
    if (!icon) {
        logA('Vui lòng chọn Icon!');
        return;
    }
    if (!funcCall) {
        logA('Vui lòng nhập Tên Hàm!');
        return;
    }
    if (!keyCombo) {
        logA('Vui lòng ghi nhận Phím Tắt!');
        return;
    }
    
    // Parse function call (hỗ trợ funcName hoặc funcName(arg1,arg2))
    const { name: funcName, args } = parseFunctionCall(funcCall);
    
    // Kiểm tra xem function có tồn tại không
    if (typeof window[funcName] !== 'function') {
        const confirm_add = confirm(`⚠️ Hàm "${funcName}" không tìm thấy trong hệ thống. Bạn có muốn tiếp tục thêm không?`);
        if (!confirm_add) return;
    } else {
        // Kiểm tra số lượng arguments (optional - info only)
        const fnLength = window[funcName].length;
        if (args.length !== fnLength && fnLength > 0) {
            console.warn(`⚠️ Hàm "${funcName}" cần ${fnLength} arguments nhưng nhập ${args.length}`);
        }
    }
    
    // Kiểm tra xem shortcut đã được sử dụng chưa
    const existingKey = Object.values(APP_SHORTCUTS).find(v => v === keyCombo);
    if (existingKey) {
        logA(`⚠️ Phím tắt "${keyCombo}" đã được sử dụng rồi!`);
        return;
    }
    
    // Tạo ID duy nhất cho phím tắt mới (dùng funcName, không kèm args)
    const scId = `sc-${funcName.replace(/[^\w]/g, '_')}`;
        
    // Lưu vào APP_SHORTCUTS
    APP_SHORTCUTS[funcCall] = keyCombo;
    
    // Thêm vào HTML
    const container = document.getElementById('shortcut-list-container');
    const newItem = document.createElement('div');
    newItem.className = 'list-group-item d-flex justify-content-between align-items-center py-3 px-0';
    newItem.id = scId;
    newItem.innerHTML = `
        <div>
            <div class="fw-bold text-dark">
                <i class="${icon} me-2"></i>${name}
            </div>
            <small class="text-muted">Hàm thực thi: <code>${funcCall}</code></small>
        </div>
        <div class="position-relative d-flex gap-2" style="width: auto">
            <input type="text"
                class="form-control form-control-sm text-center fw-bold text-primary shortcut-input"
                id="${scId}-input" readonly placeholder="Click to set..." data-fn="${funcCall}" value="${keyCombo}" />
            <button type="button" class="btn btn-sm btn-outline-danger" onclick="deleteShortcut('${funcCall}', '${scId}')">
                <i class="fa-solid fa-trash-can"></i>
            </button>
        </div>
    `;
    
    // Thêm event click vào input mới
    const newInput = newItem.querySelector(`#${scId}-input`);
    newInput.addEventListener('click', () => startRecordingKey(newInput));
    
    container.appendChild(newItem);
    
    // Ẩn form và reset
    hideAddShortcutForm();
    
    // Auto save
    saveShortcutsConfig();
    
    log(`✅ Shortcut mới được thêm: ${funcCall} -> ${keyCombo}`);
    logA(`✅ Phím tắt "${name}" (${keyCombo}) đã được thêm thành công!`);
}

// 10. Xóa phím tắt
function deleteShortcut(funcCall, itemId) {
    const confirm_delete = confirm(`Bạn có chắc chắn muốn xóa phím tắt này không?`);
    if (!confirm_delete) return;
    
    // Xóa khỏi APP_SHORTCUTS
    delete APP_SHORTCUTS[String(funcCall)];
    
    // Xóa khỏi HTML
    const item = document.getElementById(itemId);
    if (item) {
        item.remove();
    }
    
    // Auto save
    saveShortcutsConfig();
    
    logA(`✅ Phím tắt đã được xóa thành công!`);
}

// Hàm 2: Wrapper để tạo Booking mới (Chuyển tab)
function actionCreateBooking() {
    console.log("⚡ Shortcut: Create New Booking");
    // Giả định hàm chuyển tab của bạn là selectTab
    if(typeof activateTab === 'function') {
        activateTab('tab-form'); 
        // Focus ngay vào ô nhập đầu tiên (ví dụ tên khách) để tăng tốc độ
        setTimeout(() => {
             const firstInput = document.querySelector('#tab-form input');
             if(firstInput) firstInput.focus();
        }, 300);
    }
}
function openCalculator() {
    if (CalculatorWidget && typeof CalculatorWidget.toggle === 'function') {
        CalculatorWidget.toggle();
    }
}

function openAdminConsole() {
    window.AdminConsole.init();
}
