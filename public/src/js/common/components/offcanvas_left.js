/**
 * =========================================================================
 * 9 TRIP ERP - OFFCANVAS LEFT MENU COMPONENT
 * Version: 2.0 (Optimized for Travel ERP)
 * Author: 9 Trip ERP Assistant
 * =========================================================================
 */

class OffcanvasLeftMenuComponent extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        
        // State Management
        this.state = {
            selectedStages: new Set(['all']),
            searchQuery: '',
            isHoverEnabled: true,
            triggerWidth: 15 // pixels
        };

        // Bind methods to keep 'this' context
        this._handleMouseMove = this._handleMouseMove.bind(this);
        this._handleMouseLeave = this._handleMouseLeave.bind(this);
    }

    connectedCallback() {
        this._render();
        this._setupDOM();
        this._attachEvents();
        this._initHoverTrigger();
        
        // Mặc định ẩn
        this.close();
    }

    disconnectedCallback() {
        // Cleanup global listeners to prevent memory leaks
        document.removeEventListener('mousemove', this._handleMouseMove);
        if (this.hoverTrigger) this.hoverTrigger.remove();
    }

    // =========================================================================
    // 1. CORE RENDERING (UI/UX)
    // =========================================================================

    _render() {
        const template = document.createElement('template');
        template.innerHTML = `
            ${this._getStyles()}
            <div class="offcanvas-wrapper">
                <div class="header">
                    <div class="header-title">
                        <i class="fas fa-sliders-h"></i> <span>BỘ LỌC & CÔNG CỤ</span>
                    </div>
                    <button class="btn-close"><i class="fas fa-times"></i></button>
                </div>

                <div class="body">
                    <div class="section">
                        <div class="section-title">TEST</div>
                          <div class="flex-center gap-2 admin-only">
                            <div class="row">
                              <textarea type="text" class="form-control text-wrap w-100 h-100" id="test-input" rows="5"></textarea>
                            </div>
                            <button id="btn-admin-test" class="btn btn-danger mx-auto my-0 admin-only"><i class="fa-solid fa-circle-info" onclick="test()"></i> TEST</button>
                        </div>  
                    </div>                   
                    <div class="section">
                        <div class="section-title">TÌM KIẾM BOOKING</div>
                        <div class="search-box">
                            <input type="text" id="searchInput" placeholder="Tên khách, Mã booking..." autocomplete="off">
                            <i class="fas fa-search search-icon"></i>
                        </div>
                    </div>

                    <div class="section">
                        <div class="section-title">TRẠNG THÁI XỬ LÝ</div>
                        <div class="stage-list">
                            ${this._renderCheckbox('all', 'Tất cả', 'all', true)}
                            ${this._renderCheckbox('planning', 'Lập kế hoạch', 'planning')}
                            ${this._renderCheckbox('confirmed', 'Đã xác nhận', 'confirmed')}
                            ${this._renderCheckbox('operating', 'Đang điều hành', 'in-progress')}
                            ${this._renderCheckbox('completed', 'Hoàn tất', 'completed')}
                            ${this._renderCheckbox('canceled', 'Hủy bỏ', 'canceled')}
                        </div>
                        <button class="btn-reset" id="btnReset"><i class="fas fa-redo"></i> Đặt lại bộ lọc</button>
                    </div>

                    <div class="section function-section">
                        <div class="section-title">CHỨC NĂNG HỆ THỐNG</div>
                        <div class="function-grid">
                            ${this._renderFuncBtn('export', 'Xuất Excel', 'file-excel', '#218838')}
                            ${this._renderFuncBtn('import', 'Nhập liệu', 'file-upload', '#007bff')}
                            ${this._renderFuncBtn('report', 'Báo cáo', 'chart-pie', '#dc3545')}
                            ${this._renderFuncBtn('setting', 'Cấu hình', 'cog', '#6c757d')}
                        </div>
                    </div>
                 
  
                </div>
            </div>
        `;
        this.shadowRoot.appendChild(template.content.cloneNode(true));
    }

    _renderCheckbox(value, label, className, checked = false) {
        return `
            <label class="checkbox-item">
                <input type="checkbox" class="stage-filter" value="${value}" ${checked ? 'checked' : ''}>
                <span class="custom-check"></span>
                <span class="badge ${className}">${label}</span>
            </label>
        `;
    }

    _renderFuncBtn(action, label, icon, color) {
        return `
            <button class="func-btn" data-action="${action}">
                <i class="fas fa-${icon}" style="color: ${color}"></i>
                <span>${label}</span>
            </button>
        `;
    }

    _getStyles() {
        return `
        <style>
            :host {
                --w-panel: 340px;
                --bg-body: #f4f6f9;
                --primary: #0d6efd;
                --text: #343a40;
                --border: #e9ecef;
                --z-index: 9999;
                
                position: fixed;
                top: 0;
                left: 0;
                height: 100vh;
                z-index: var(--z-index);
                pointer-events: none; /* Let clicks pass through when closed */
            }

            /* Container transform logic for GPU acceleration */
            .offcanvas-wrapper {
                width: var(--w-panel);
                height: 100%;
                background: #fff;
                box-shadow: 4px 0 15px rgba(0,0,0,0.1);
                display: flex;
                flex-direction: column;
                
                transform: translateX(-102%); /* Hide completely */
                transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                pointer-events: auto; /* Re-enable clicks inside */
            }

            :host(.show) .offcanvas-wrapper {
                transform: translateX(0);
            }

            /* Header */
            .header {
                padding: 15px 20px;
                border-bottom: 1px solid var(--border);
                display: flex;
                justify-content: space-between;
                align-items: center;
                background: #fff;
            }
            .header-title { font-weight: 700; color: var(--primary); font-size: 14px; display: flex; gap: 8px; align-items: center; }
            .btn-close { border: none; background: none; font-size: 18px; color: #999; cursor: pointer; padding: 5px; }
            .btn-close:hover { color: var(--text); }

            /* Body */
            .body { flex: 1; overflow-y: auto; padding: 20px; background: var(--bg-body); }
            
            .section { background: #fff; padding: 15px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); margin-bottom: 15px; }
            .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #adb5bd; margin-bottom: 12px; letter-spacing: 0.5px; }

            /* Search */
            .search-box { position: relative; }
            .search-box input { width: 100%; padding: 10px 15px 10px 35px; border: 1px solid var(--border); border-radius: 6px; font-size: 13px; box-sizing: border-box; outline: none; transition: border 0.2s; }
            .search-box input:focus { border-color: var(--primary); }
            .search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #adb5bd; font-size: 12px; }

            /* Checkboxes */
            .stage-list { display: flex; flex-direction: column; gap: 8px; }
            .checkbox-item { display: flex; align-items: center; cursor: pointer; user-select: none; }
            .checkbox-item input { display: none; }
            .custom-check { width: 16px; height: 16px; border: 2px solid #ced4da; border-radius: 4px; margin-right: 10px; position: relative; transition: all 0.2s; }
            .checkbox-item input:checked + .custom-check { background: var(--primary); border-color: var(--primary); }
            .checkbox-item input:checked + .custom-check::after { content: '✓'; color: #fff; position: absolute; font-size: 10px; top: 50%; left: 50%; transform: translate(-50%, -50%); }
            
            .badge { padding: 4px 8px; border-radius: 4px; font-size: 13px; font-weight: 500; width: 100%; }
            .all { background: #e9ecef; color: #495057; }
            .planning { background: #fff3cd; color: #856404; }
            .confirmed { background: #d1e7dd; color: #0f5132; }
            .in-progress { background: #cff4fc; color: #055160; }
            .completed { background: #d1e7dd; color: #198754; }
            .canceled { background: #f8d7da; color: #842029; }
            
            .checkbox-item:hover .badge { opacity: 0.8; }
            .checkbox-item input:checked ~ .badge { box-shadow: 0 0 0 1px var(--primary); }

            /* Function Grid */
            .function-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
            .func-btn { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 15px; background: #f8f9fa; border: 1px solid var(--border); border-radius: 6px; cursor: pointer; transition: all 0.2s; }
            .func-btn:hover { background: #fff; transform: translateY(-2px); box-shadow: 0 2px 5px rgba(0,0,0,0.05); border-color: var(--primary); }
            .func-btn i { font-size: 18px; }
            .func-btn span { font-size: 12px; font-weight: 500; color: var(--text); }

            .btn-reset { width: 100%; margin-top: 15px; padding: 8px; background: none; border: 1px dashed var(--primary); color: var(--primary); border-radius: 6px; cursor: pointer; font-size: 12px; }
            .btn-reset:hover { background: rgba(13, 110, 253, 0.05); }

            /* Scrollbar */
            .body::-webkit-scrollbar { width: 5px; }
            .body::-webkit-scrollbar-thumb { background: #ccc; border-radius: 10px; }
        </style>
        `;
    }

    // =========================================================================
    // 2. LOGIC & EVENT HANDLING
    // =========================================================================

    _setupDOM() {
        this.dom = {
            wrapper: this.shadowRoot.querySelector('.offcanvas-wrapper'),
            closeBtn: this.shadowRoot.querySelector('.btn-close'),
            searchInput: this.shadowRoot.querySelector('#searchInput'),
            checkboxes: this.shadowRoot.querySelectorAll('.stage-filter'),
            btnReset: this.shadowRoot.querySelector('#btnReset'),
            funcButtons: this.shadowRoot.querySelectorAll('.func-btn')
        };
    }

    _attachEvents() {
        // UI Events
        this.dom.closeBtn.addEventListener('click', () => this.close());
        this.dom.btnReset.addEventListener('click', () => this._resetFilters());
        
        // Search
        this.dom.searchInput.addEventListener('input', (e) => {
            this.state.searchQuery = e.target.value.trim();
            this._dispatchUpdate();
        });

        // Checkbox Logic (Matrix Selection)
        this.dom.checkboxes.forEach(cb => {
            cb.addEventListener('change', (e) => this._handleCheckboxChange(e));
        });

        // Function Buttons
        this.dom.funcButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.action;
                this.dispatchEvent(new CustomEvent('menu-action', {
                    detail: { action },
                    bubbles: true,
                    composed: true
                }));
                // Tự động đóng menu sau khi chọn chức năng (Optional)
                // this.close();
            });
        });

        // Mouse Leave (Auto Hide) logic on the wrapper
        this.dom.wrapper.addEventListener('mouseleave', this._handleMouseLeave);
    }

    _handleCheckboxChange(e) {
        const val = e.target.value;
        const isChecked = e.target.checked;

        if (val === 'all') {
            // Nếu chọn All -> Bỏ chọn các cái khác
            if (isChecked) {
                this.state.selectedStages.clear();
                this.state.selectedStages.add('all');
                this.dom.checkboxes.forEach(c => {
                    if (c.value !== 'all') c.checked = false;
                });
            } else {
                e.target.checked = true; // Không cho phép uncheck All nếu không chọn cái khác
            }
        } else {
            // Nếu chọn item con -> Bỏ check All
            if (isChecked) {
                this.state.selectedStages.delete('all');
                this.dom.checkboxes.forEach(c => {
                    if (c.value === 'all') c.checked = false;
                });
                this.state.selectedStages.add(val);
            } else {
                this.state.selectedStages.delete(val);
                // Nếu không còn cái nào được chọn -> Auto chọn lại All
                if (this.state.selectedStages.size === 0) {
                    this.state.selectedStages.add('all');
                    this.shadowRoot.querySelector('input[value="all"]').checked = true;
                }
            }
        }
        this._dispatchUpdate();
    }

    _resetFilters() {
        this.dom.searchInput.value = '';
        this.state.searchQuery = '';
        this.state.selectedStages.clear();
        this.state.selectedStages.add('all');
        
        this.dom.checkboxes.forEach(c => {
            c.checked = (c.value === 'all');
        });
        
        this._dispatchUpdate();
    }

    _dispatchUpdate() {
        this.dispatchEvent(new CustomEvent('filter-change', {
            detail: {
                stages: Array.from(this.state.selectedStages),
                search: this.state.searchQuery
            },
            bubbles: true,
            composed: true
        }));
    }

    // =========================================================================
    // 3. AUTO HIDE/SHOW TRIGGER LOGIC
    // =========================================================================

    _initHoverTrigger() {
        // Tạo vùng trigger vô hình bên trái màn hình
        document.addEventListener('mousemove', this._handleMouseMove);
    }

    _handleMouseMove(e) {
        if (!this.state.isHoverEnabled) return;

        // Nếu chuột ở sát mép trái (trong khoảng triggerWidth)
        if (e.clientX <= this.state.triggerWidth) {
            this.open();
        }
    }

    _handleMouseLeave(e) {
        if (!this.state.isHoverEnabled) return;
        
        // Delay một chút để trải nghiệm mượt mà hơn, tránh đóng khi lỡ tay
        setTimeout(() => {
            // Kiểm tra lại xem chuột có đang hover vào lại menu không (nếu có logic phức tạp hơn)
            // Ở đây ta đóng luôn
            this.close();
        }, 300);
    }

    // =========================================================================
    // 4. PUBLIC API
    // =========================================================================

    open() {
        this.classList.add('show');
    }

    close() {
        this.classList.remove('show');
    }

    toggle() {
        this.classList.toggle('show');
    }
}

// Register Component
if (!customElements.get('offcanvas-left-menu')) {
    customElements.define('offcanvas-left-menu', OffcanvasLeftMenuComponent);
}

// AUTO INJECT ON STARTUP (Feature requested)
(function() {
    document.addEventListener('DOMContentLoaded', () => {
        if (!document.querySelector('offcanvas-left-menu')) {
            const menu = document.createElement('offcanvas-left-menu');
            document.body.appendChild(menu);
            console.log('✅ [9Trip System] ERP Left Menu Loaded Automatically.');
        }
    });

    // Lắng nghe thay đổi bộ lọc
    // document.addEventListener('filter-change', (e) => {
    //     const { stages, search } = e.detail;
        
    //     console.log('Đang lọc:', stages, search);
        
    //     // Gọi hàm render lại dữ liệu Booking
    //     // Ví dụ: BookingView.render(BookingModel.filter(stages, search));
    // });

    // // Lắng nghe các nút chức năng (Export/Import...)
    // document.addEventListener('menu-action', (e) => {
    //     const action = e.detail.action;
        
    //     switch(action) {
    //         case 'export':
    //             // TripUtils.exportToExcel(...);
    //             break;
    //         case 'report':
    //             // TripUtils.generateReport(...);
    //             break;
    //     }
    // });
})();

class OffcanvasController {
  constructor() {
      this.component = null;
      this.appCallback = null; // Hàm callback để gọi về App chính
  }

  init() {
      // 1. Tự động Inject UI nếu chưa có
      if (!document.querySelector('offcanvas-left-menu')) {
          this.component = document.createElement('offcanvas-left-menu');
          document.body.appendChild(this.component);
      } else {
          this.component = document.querySelector('offcanvas-left-menu');
      }

      console.log('✅ [9Trip ERP] Offcanvas Module Initialized.');

      // 2. Tự động lắng nghe sự kiện
      this._bindEvents();
  }

  // Đăng ký hàm xử lý dữ liệu từ bên ngoài (Dependency Injection)
  registerDataHandler(callback) {
      this.appCallback = callback;
  }

  _bindEvents() {
      // Lắng nghe sự kiện lọc
      document.addEventListener('filter-change', (e) => {
          const { stages, search } = e.detail;
          
          console.log(`🔍 [Menu Controller] Filter detected: Status=${stages}, Query=${search}`);

          // Nếu App chính đã đăng ký hàm xử lý, thì gọi nó và truyền tham số
          if (this.appCallback && typeof this.appCallback === 'function') {
              this.appCallback({ type: 'FILTER', payload: { stages, search } });
          } else {
              console.warn('⚠️ Chưa có hàm xử lý dữ liệu được đăng ký (registerDataHandler)');
          }
      });

      // Lắng nghe các nút chức năng
      document.addEventListener('menu-action', (e) => {
          if (this.appCallback) {
              this.appCallback({ type: 'ACTION', payload: e.detail.action });
          }
      });
  }
}

// --- PART 3: AUTO BOOTSTRAP ---
// Tự động khởi chạy toàn bộ Module khi trang web load xong
const OffcanvasModule = new OffcanvasController();

document.addEventListener('DOMContentLoaded', () => {
  OffcanvasModule.init();
  
  // Expose ra window để App chính có thể giao tiếp
  window.TripMenuModule = OffcanvasModule;
});