    //  AUTH MODULE (FIRESTORE VERSION) ---
    const AUTH_MANAGER = {
        CFG_FB_RTDB: {
            apiKey: "AIzaSyAhBOSEAGKN5_8_lfWSPLzQ5gBBd33Jzdc",
            authDomain: "trip-erp-923fd.firebaseapp.com",
            projectId: "trip-erp-923fd",
            storageBucket: "trip-erp-923fd.firebasestorage.app",
            messagingSenderId: "600413765548",
            appId: "1:600413765548:web:bc644e1e58f7bead5d8409",
            measurementId: "G-BG2ECM4R89"
        },
        app: null,
        auth: null,
        db: null,
        initFirebase: async function () {
            return new Promise((resolve, reject) => {
                try {
                    if (!firebase.apps.length) {
                        this.app = firebase.initializeApp(this.CFG_FB_RTDB);
                    } else {
                        this.app = firebase.app();
                    }
                    
                    this.auth = firebase.auth();
                    // ✅ CHUẨN: Dùng Firestore
                    this.db = firebase.firestore(); 
                    
                    // Kích hoạt A.DB
                    if (typeof A.DB !== 'undefined') {
                        A.DB.db = this.db;
                        log("✅ A.DB connected to Firestore");
                    }
                    resolve(this.app);
                } catch(e) {
                    console.error("🔥 Firebase Init Error:", e);
                    reject(e);
                }
            });
        },
        // Lấy thông tin chi tiết từ Firestore
        fetchUserProfile: async function(firebaseUser) {
            try {
                CR_COLLECTION = ROLE_DATA[CURRENT_USER.role] || '';
                await Promise.all([
                    SECURITY_MANAGER.applySecurity(CURRENT_USER), 
                    loadDataFromFirebase()
                ]);
                
                this.updateUserMenu();
                log('✅ Chào mừng: ' + (CURRENT_USER.profile.user_name || firebaseUser.email), 'success');
                
                SECURITY_MANAGER.cleanDOM(document);

            } catch (e) {
                console.error(e);
                alert("Lỗi tải profile: " + e.message);
            } finally {
                // Đóng modal
                showLoading(false);
            }
        },

        updateUserMenu: function() {
            const userFullName = CURRENT_USER.profile.user_name || CURRENT_USER.email.split('@')[0];
            const userEmail = CURRENT_USER.email;
            const userRole = CURRENT_USER.role;
            
            if(document.getElementById('user-menu-text')) document.getElementById('user-menu-text').innerText = userFullName;
            if(document.getElementById('user-menu-name')) document.getElementById('user-menu-name').innerText = userFullName;
            if(document.getElementById('user-menu-email')) document.getElementById('user-menu-email').innerText = userEmail;
            if(document.getElementById('user-menu-role')) document.getElementById('user-menu-role').innerText = userRole.toUpperCase();
            
            if(document.getElementById('btn-logout-menu')) document.getElementById('btn-logout-menu').style.display = 'flex';
            // if(document.getElementById('btn-login-menu')) document.getElementById('btn-login-menu').classList.add('d-none');
        },

        // Hiển thị màn hình lựa chọn Khách / Nhân sự
        showChoiceScreen: function() {
            const choiceHTML = `
                <div style="display: flex; justify-content: center; align-items: center; width: 100vw; height: 100vh; margin: 0; padding: 1rem;">
                    <div class="card shadow-lg border-0" style="max-width: 95vw; max-height: 90vh; width: 100%; border-radius: 15px; display: flex; flex-direction: column;">
                        <div class="card-body p-3 p-md-5 text-center d-flex flex-column align-items-center justify-content-center" style="flex: 1;">
                            <img src="https://9tripvietnam.com/wp-content/uploads/2019/05/Logo-9-trip.png.webp" class="mb-3 mb-md-4" style="height: 15vh; max-height: 100px;">
                            <h4 class="fw-bold mb-2 text-dark" style="font-size: 1.1rem;">CÔNG TY TNHH 9 TRIP PHU QUOC</h4>
                            <p class="text-muted mb-4 mb-md-5" style="font-size: 0.9rem;">Bạn là khách hàng tại 9 Trip?</p>
                            
                            <div class="d-flex flex-column flex-md-row gap-3 justify-content-center align-items-center" style="width: 100%; max-width: 360px;">
                                <button id="btn-choice-customer" class="btn btn-primary btn-lg py-3 fw-bold" style="font-size: 1.5rem; flex: 1; min-width: 100px;">
                                    <i class="fa-solid fa-user-tie me-2"></i> ĐÚNG
                                </button>
                                <button id="btn-choice-staff" class="btn btn-secondary btn-lg py-3 fw-bold shadow-sm" style="font-size: 1.5rem; flex: 1; min-width: 100px;">
                                    <i class="fa-solid fa-briefcase me-2"></i> KHÔNG
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            const container = document.getElementById('main-app');
            container.innerHTML = choiceHTML;
            container.classList.remove('d-none');
            
            // Gán sự kiện
            setTimeout(() => {
                document.getElementById('btn-choice-customer')?.addEventListener('click', () => {
                    window.location.href = 'https://9tripvietnam.com';
                });
                document.getElementById('btn-choice-staff')?.addEventListener('click', () => {
                    this.showLoginForm();
                });
            }, 100);
        },

        // Hiển thị Form Login vào Modal
        showLoginForm: function() {
            // Thay vì dùng Modal, ta render trực tiếp vào app-container để ép người dùng login
            const loginHTML = `
                <div style="display: flex; justify-content: center; align-items: center; width: 100vw; height: 100vh; margin: 0; padding: 1rem;">
                    <div class="card shadow-lg border-0" style="max-width: 95vw; max-height: 90vh; width: 100%; border-radius: 15px; overflow-y: auto; display: flex; flex-direction: column;">
                        <div class="card-body p-3 p-md-5 d-flex flex-column align-items-center justify-content-center text-center">
                            <img src="https://9tripvietnam.com/wp-content/uploads/2019/05/Logo-9-trip.png.webp" class="mb-3 mb-md-4" style="height: 15vh; max-height: 100px;">
                            <h4 class="fw-bold mb-3 mb-md-4 text-dark" style="font-size: 1.1rem;">9 TRIP SYSTEM</h4>
                            
                            <div style="width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                                <div class="form-floating mb-3">
                                    <input type="text" class="form-control form-control-sm" id="login-email" placeholder="name@example.com" style="font-size: 0.9rem;">
                                    <label style="font-size: 0.8rem;">Email/User Name</label>
                                </div>
                                <div class="form-floating mb-3 mb-md-4">
                                    <input type="password" class="form-control form-control-sm" id="login-pass" placeholder="Password" style="font-size: 0.9rem;">
                                    <label style="font-size: 0.8rem;">Mật khẩu</label>
                                </div>
                                
                                <button id="btn-mail-login" class="btn btn-lg btn-primary py-3 fw-bold shadow-sm" style="font-size: 0.9rem;">
                                    ĐĂNG NHẬP
                                </button>
                            </div>
    
                            <div class="mt-3 mt-md-4 small text-muted" style="max-width: 350px;">
                                Hoặc đăng nhập bằng
                                <div class="d-flex gap-2 justify-content-center mt-2">
                                    <button id="btn-google-login" class="btn btn-outline-light border text-dark" style="font-size: 0.8rem;">
                                        <img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" width="16"> Google
                                    </button>
                                </div>
                            </div>
                            
                            <div class="mt-3 mt-md-4">
                                <button id="btn-back-choice" class="btn btn-link text-muted" style="font-size: 0.85rem;">
                                    ← Quay lại
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            const container = document.getElementById('main-app');
            container.innerHTML = loginHTML;
            container.classList.remove('d-none');
            
            // Gán sự kiện Enter
            setTimeout(() => {
                document.getElementById('login-pass')?.addEventListener('keypress', (e) => {
                    if(e.key === 'Enter') {
                        showLoading(true);
                        this.handleEmailLogin();
                    }
                });
                document.getElementById('btn-mail-login')?.addEventListener('click', () => {
                    showLoading(true);
                    this.handleEmailLogin();
                });
                document.getElementById('btn-google-login')?.addEventListener('click', () => {
                    showLoading(true);
                    this.handleSocialLogin('google');
                });
                document.getElementById('btn-back-choice')?.addEventListener('click', () => {
                    this.showChoiceScreen();
                });
            }, 100);
        },

        handleEmailLogin: async function() {
            let email = document.getElementById('login-email').value;
            const pass = document.getElementById('login-pass').value;
            
            if(!email || !pass) {showLoading(false); alert("Thiếu thông tin"); return; }

            // Kiểm tra nếu email không chứa '@' thì tự động thêm domain
            if (!email.includes('@')) {
                email = email + '@9tripphuquoc.com';
            }

            try {
                await this.auth.signInWithEmailAndPassword(email, pass);
            } catch(e) {
                alert("Lỗi đăng nhập: " + e.message);
            } finally {
                showLoading(false);
            }
        },

        // Xử lý Login Social
        handleSocialLogin: async function(providerName) {
            let provider;
            if (providerName === 'google') provider = new firebase.auth.GoogleAuthProvider();
            if (providerName === 'facebook') provider = new firebase.auth.FacebookAuthProvider();

            try {
                showLoading(true);
                // Dùng signInWithPopup cho tiện trên WebApp
                await this.auth.signInWithPopup(provider);
            } catch(e) {
                console.error(e);
                alert("Lỗi đăng nhập Social: " + e.message);
            } finally {
                showLoading(false);           
            }
        },
      
        signOut: function() {
            this.auth.signOut().then(() => {
                location.reload(); // Reload trang cho sạch
            });
        },

        // --- QUẢN LÝ USER (ADMIN) ---

        /**
         * Load danh sách users từ Firestore để hiển thị
         */
        loadUsersData: async function() {
            try {
                // ✅ FIRESTORE: Lấy toàn bộ collection users
                const snapshot = await this.db.collection('users').get();
                
                if (snapshot.empty) {
                    document.getElementById('users-table-body').innerHTML = '<tr><td colspan="10">Chưa có user nào</td></tr>';
                    return;
                }

                let html = '';
                // ✅ FIRESTORE: Duyệt qua từng document
                snapshot.forEach(doc => {
                    const user = doc.data();
                    const uid = doc.id; // Lấy ID từ doc
                    const createdDate = new Date(user.created_at || Date.now()).toLocaleDateString('vi-VN');
                    
                    html += `
                        <tr class="text-center" style="cursor: pointer;" onclick="A.Auth.loadUserToForm('${uid}')">
                            <td><small>${uid.substring(0, 5)}...</small></td>
                            <td>${user.account || '-'}</td>
                            <td>${user.user_name || '-'}</td>
                            <td>${user.user_phone || '-'}</td>
                            <td><small>${user.email || '-'}</small></td>
                            <td><span class="badge bg-info">${(user.role || '').toUpperCase()}</span></td>
                            <td>${user.level || 0}</td>
                            <td>${(user.group || "")}</td>
                            <td>${createdDate}</td>
                            <td><button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); A.Auth.deleteUser('${uid}')"><i class="fa-solid fa-trash"></i></button></td>
                        </tr>
                    `;
                });
                
                const tbody = document.getElementById('users-table-body');
                if(tbody) tbody.innerHTML = html;

            } catch (e) {
                console.error("Lỗi tải users:", e);
            }
        },

        /**
         * Load chi tiết user vào form để edit
         * Chỉ đọc từ Firestore
         */
        loadUserToForm: async function(uid) {
            try {
                // ✅ FIRESTORE: Lấy dữ liệu user
                const doc = await this.db.collection('users').doc(uid).get();
                if (!doc.exists) return;
                
                const user = doc.data();
                
                // Fill form (Giữ nguyên logic cũ)
                getE('form-uid').value = uid;
                getE('form-account').value = user.account || '';
                getE('form-user-name').value = user.user_name || '';
                getE('form-user-phone').value = user.user_phone || '';
                getE('form-email').value = user.email || '';
                getE('form-role').value = user.role || 'sale';
                getE('form-level').value = user.level || 0;
                $$('.group-role-checkbox').forEach(checkbox => {
                    checkbox.checked = false; // Reset
                });
                if (user.group) {
                    const groups = user.group.split(',').map(g => g.trim());
                    groups.forEach(g => {
                        const checkbox = document.querySelector(`.group-role-checkbox[value="${g}"]`);
                        if (checkbox) checkbox.checked = true;
                    });
                }
                
                // Scroll
                getE('users-form').scrollIntoView({ behavior: 'smooth' });
            } catch (e) {
                console.error(e);
            }
        },

        /**
         * Lưu/Cập nhật user vào Firestore
         * 
         * Flow mới (Firestore-first):
         * 1. CASE 1 (Update): Save Firestore → Trigger sync sang Auth
         * 2. CASE 2 (Create): Generate UID (role-ddmmyy) → Save Firestore (kèm password) 
         *                     → Trigger functions tự động tạo Auth user
         * 
         * ⭐ Không còn tạo Auth trực tiếp, toàn bộ do Trigger xử lý
         */
        saveUser: async function() {
            const userData = {};
            userData.uid = document.getElementById('form-uid').value.trim();
            userData.account = document.getElementById('form-account').value.trim();
            userData.user_name = document.getElementById('form-user-name').value.trim();
            userData.user_phone = document.getElementById('form-user-phone').value.trim();
            userData.email = document.getElementById('form-email').value.trim();
            userData.role = document.getElementById('form-role').value;
            userData.level = parseInt(document.getElementById('form-level').value) || 1;
            userData.created_at = document.getElementById('form-created-at')?.value || new Date().toISOString();

            // Lấy các group roles được check
            const groupRoles = [];
            document.querySelectorAll('.group-role-checkbox:checked').forEach(checkbox => {
                groupRoles.push(checkbox.value);
            });
            userData.group = groupRoles.join(', ');

            // ─── Validation ───
            if (!userData.email) {
                logA('Vui lòng nhập Email');
                return;
            }
            if (!userData.account) {
                userData.account = userData.email.split('@')[0];
            }

            try {
                // CASE 1: Cập nhật user hiện tại
                // Chỉ cần lưu Firestore → Trigger sẽ auto sync sang Auth
                if (userData.uid) {
                    await this.db.collection('users').doc(userData.uid).set(userData, { merge: true });
                    log(`✅ User ${userData.uid} updated in Firestore`, 'success');
                    log('💡 Trigger sẽ tự động đồng bộ sang Firebase Auth', 'info');
                    this.renderUsersConfig();
                    return;
                }

                // CASE 2: Tạo user mới (Firestore TRƯỚC)
                // Bước 1: Tạo UID dạng: role-ddmmyy
                const newUid = this.generateUserUID(userData.role);
                log(`📝 Generated UID: ${newUid}`, 'info');

                // Bước 2: Tạo mật khẩu mặc định
                const defaultPassword = userData.email.split('@')[0] + '@2026';

                // Bước 3: Lưu vào Firestore (kèm password để trigger tạo Auth)
                userData.uid = newUid;
                userData.password = defaultPassword; // Trigger sẽ đọc field này để tạo Auth
                
                await this.db.collection('users').doc(newUid).set(userData);
                log(`✅ Firestore document created: ${newUid}`, 'success');

                // Bước 4: Trigger sẽ tự động đọc dữ liệu từ Firestore và tạo Firebase Auth user
                logA(`✅ Tạo người dùng thành công!\n📧 Email: ${userData.email}\n🔑 Trigger sẽ tạo Auth account\n⏳ Vui lòng đợi...`);

                this.renderUsersConfig();
            } catch (error) {
                logError('❌ Lỗi lưu user: ' + error.message);
            }
        },
        renderUsersConfig: function() {
            //   $('.modal-footer').style.display = 'none'; // Ẩn footer nếu có
            // Set ngày tạo mặc định là hôm nay
            document.getElementById('users-form').reset();
            const today = new Date().toISOString().split('T')[0];
            document.getElementById('form-created-at').value = today;
    
            // Load dữ liệu users vào bảng
            this.loadUsersData();
        },

        /**
         * Tạo UID theo định dạng: ROLE-DDMMYY
         * Ví dụ: "OP-200226" (Operator, ngày 20/02/26)
         */
        generateUserUID: function(role) {
            const today = new Date();
            const dd = String(today.getDate()).padStart(2, '0');
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            const yy = String(today.getFullYear()).slice(-2);
            return `${role.toUpperCase()}-${dd}${mm}${yy}`;
        },

        /**
         * Xóa user khỏi Firestore
         * Trigger "syncUserAuthDeleteOnDelete" sẽ tự động xóa Firebase Auth account
         */
        deleteUser: async function(uid) {
            if (!confirm('Chắc chắn xóa user này?\n⚠️ Trigger sẽ tự động xóa Auth account')) return;
            try {
                // ✅ FIRESTORE DELETE → Trigger xóa Auth
                await this.db.collection('users').doc(uid).delete();
                log(`✅ User ${uid} deleted from Firestore`, 'success');
                log('💡 Trigger sẽ tự động xóa Firebase Auth account', 'info');
                this.loadUsersData();
            } catch (error) {
                logError('❌ Lỗi xóa user: ' + error.message);
            }
        }
    };

    const SECURITY_MANAGER = {
        /**
         * HÀM CHÍNH: ÁP DỤNG PHÂN QUYỀN
         * Gọi hàm này ngay sau khi initFirebase() xong và có user profile
         */
        applySecurity: async function(userProfile) {
            const email = (userProfile.email || "").toLowerCase();
            const level = parseInt(userProfile.level || 0);
            const role = (userProfile.role || "").toLowerCase();

            
            // ✅ FIX: Use await for async loadJSForRole
            if (role === 'op') {
                await loadJSForRole('op');
                await A.UI.renderTemplate('body', 'tpl_operator.html', false, '.app-container');
                setVal('module-title', 'OPERATOR CENTER -QUẢN LÝ NCC - ĐIỀU HÀNH');
            } else if (role === 'acc' || role === 'acc_thenice' || role === 'ketoan') {
                if (!document.getElementById('css-accountant')) {
                    const link = document.createElement('link');
                    link.id = 'css-accountant';
                    link.rel = 'stylesheet';
                    link.href = '/accountant/accountant.css';
                    document.head.appendChild(link);
                }
                
                await A.UI.renderTemplate('body', '/accountant/tpl_accountant.html', false, '.app-container');
                
                await A.UI.renderTemplate('body', 'tmpl-acc-footer-bar', false, '#main-footer', 'prepend');
                toggleTemplate('erp-main-footer');
                setVal('module-title', 'ACCOUNTING CENTER - QUẢN LÝ KẾ TOÁN');
                await loadJSFile('/accountant/controller_accountant.js', role); // Load JS riêng cho Kế toán
            } else {
                await loadJSForRole('sale');
                await A.UI.renderTemplate('body', 'tpl_sales.html', false, '.app-container');
                setVal('module-title', 'SALES CENTER - QUẢN LÝ BOOKING');
            }
            

            // Reset class cũ
            document.body.className = ''; 
            // Giữ lại các class nền tảng nếu có (ví dụ: 'bg-light')

            // --- 1. XÁC ĐỊNH CLASS CHO BODY ---
            let permissionClass = '';
            let maskedClass ='';
            let maskedRole = userProfile.realRole ? userProfile.role : null;
            const isHardAdmin = ADMIN_EMAILS.includes(email);           

            if (isHardAdmin || level >= 50) {
                permissionClass = 'is-admin';
                
                A.UI.lazyLoad('tab-log');
                log('🛡️ Security: ADMIN MODE');
                if (maskedRole) {
                    maskedClass = `is-${maskedRole}`;
                    document.body.classList.add(maskedClass);
                    activateTab('tab-dashboard');
                } 
                else activateTab('tab-admin-dashboard');
            } 
            else {
                activateTab('tab-dashboard');
                if (level >= 10) {
                    permissionClass = 'is-manager';
                    log('🛡️ Security: MANAGER MODE');
                } 
                else if (level >= 5) {
                    permissionClass = 'is-sup';
                    log('🛡️ Security: SUPERVISOR MODE');
                } 
                else {
                    // Level thấp: Check Role cụ thể
                    if (role === 'ketoan' || role === 'acc') {
                        permissionClass = 'is-acc';
                        // A.UI.renderTemplate('body', '/accountant/tpl_accountant.html');
                        // window.AccountantCtrl?.init();
                    }
                    else if (role === 'acc_thenice') {
                        permissionClass = 'is-acc-thenice';
                        A.UI.renderTemplate('body', '/accountant/tpl_accountant.html', false, '.app-container');
                    }
                    else if (role === 'op' || role === 'operator' || maskedRole === 'op') {
                        permissionClass = 'is-op';
                        A.UI.renderTemplate('body', 'tpl_operator.html');
                    }
                    else {
                        permissionClass = 'is-sale';
                        A.UI.renderTemplate('body', 'tpl_sales.html');
                    }                

                    
                    log(`🛡️ Security: STAFF MODE (${role})`);
                }
            }

            // Apply vào Body ngay lập tức
            if (permissionClass && permissionClass !== maskedClass) document.body.classList.add(permissionClass);
        },

        /**
         * GIẢI PHÁP CHO VẤN ĐỀ 3: XỬ LÝ DYNAMIC CONTENT
         * Hàm này sẽ duyệt qua container mới render và xóa các node bị cấm
         */
        cleanDOM: function(container) {
            // Lấy class hiện tại của body để biết đang là ai
            const body = document.body;

            // Định nghĩa quy tắc xóa (Ngược lại với CSS hiển thị)
            // Nếu KHÔNG PHẢI Admin -> Xóa .admin-only
            const isAdmin = (CURRENT_USER.realRole && CURRENT_USER.realRole.toLowerCase() === 'admin');
            if (!body.classList.contains('is-admin') && !isAdmin) {
                container.querySelectorAll('.admin-only').forEach(el => el.remove());
            }

            // Nếu KHÔNG PHẢI Admin VÀ KHÔNG PHẢI Manager -> Xóa .manager-only
            if (!body.classList.contains('is-admin') && !body.classList.contains('is-manager')) {
                container.querySelectorAll('.manager-only').forEach(el => el.remove());
            }

            // Nếu KHÔNG PHẢI (Admin, Manager, Sup) -> Xóa .sup-only
            if (!body.classList.contains('is-admin') && !body.classList.contains('is-manager') && !body.classList.contains('is-sup')) {
                container.querySelectorAll('.sup-only').forEach(el => el.remove());
            }

            // Xử lý Role cụ thể (Logic loại trừ)
            // Ví dụ: Nếu là Sale -> Xóa Op, Xóa Acc
            const role = CURRENT_USER.role;
            if (body.classList.contains('is-sale') || role ==='sale') {
                container.querySelectorAll('.op-only, .acc-only').forEach(el => el.remove());
               
            }
            if (body.classList.contains('is-op') || role ==='op') {
                container.querySelectorAll('.sales-only, .acc-only').forEach(el => el.remove());
            }
            if (body.classList.contains('is-acc') || CURRENT_USER.role === 'acc_thenice') {
                container.querySelectorAll('.sales-only').forEach(el => el.remove());
                container.querySelectorAll('[data-bs-target="#tab-form"]').forEach(el => el.remove()); // Ẩn tab Dashboard chung       
                document.querySelector('erp-main-footer')?.remove(); // Ẩn footer chung
            }
        }
    };

    export { AUTH_MANAGER, SECURITY_MANAGER };

