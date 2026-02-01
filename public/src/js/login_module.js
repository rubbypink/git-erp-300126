// CẤU HÌNH FIREBASE
    var CFG_FB_RTDB = {
        apiKey: "AIzaSyAhBOSEAGKN5_8_lfWSPLzQ5gBBd33Jzdc",
        authDomain: "trip-erp-923fd.firebaseapp.com",
        projectId: "trip-erp-923fd",
        storageBucket: "trip-erp-923fd.firebasestorage.app",
        messagingSenderId: "600413765548",
        appId: "1:600413765548:web:bc644e1e58f7bead5d8409",
        measurementId: "G-BG2ECM4R89"
    };

    // --- 1. FIREBASE SETUP MODULE ---
    var app, auth, db;
    
    /**
     * APP_CORE: Điều phối toàn bộ vòng đời ứng dụng
     * Tại sao: Đảm bảo không có code nào chạy tự do ngoài tầm kiểm soát của Auth
     */
    const APP_CORE = {
        init: async function() {
            try {
                log("🚀 System Booting...", "info");
                await initFirebase(); // Khởi tạo app, auth, db
                this.listenAuth();
            } catch (error) {
                log("🔥 Boot Error: " + error.message, "danger");
            }
        },

        listenAuth: function() {
            auth.onAuthStateChanged(async (user) => {
                const launcher = document.getElementById('app-launcher');
                const app = document.getElementById('main-app');
                if (user) {
                    
                    log("🔓 User detected, verifying profile...", "success");
                    if(app) app.style.opacity = 1;
                    await UI_RENDERER.init();
                    await AUTH_MANAGER.fetchUserProfile(user);
                    // Sau khi fetch profile và Security Manager đã render template vào app-container
                    if (launcher) launcher.classList.add('d-none');
                    app.classList.remove('d-none');
                    showLoading(false);
                    // B2. EVENTS: Gán sự kiện
                    setupStaticEvents();
                    initShortcuts();
                } else {
                    log("🔒 No user. Showing Login...", "warning");
                    if (launcher) launcher.classList.add('d-none');
                    if (launcher) launcher.remove();
                    if(app) app.style.opacity = 1;            
                    AUTH_MANAGER.showLoginForm();
                }
            });
        }
    };

    async function initFirebase() {
        return new Promise((resolve, reject) => {
            try {
                if (!firebase.apps.length) {
                    app = firebase.initializeApp(CFG_FB_RTDB);
                } else {
                    app = firebase.app();
                }
                
                auth = firebase.auth();
                
                // ✅ CHUẨN: Dùng Firestore
                db = firebase.firestore(); 
                
                // Kích hoạt DB_MANAGER
                if (typeof DB_MANAGER !== 'undefined') {
                    DB_MANAGER.db = db;
                    log("✅ DB_MANAGER connected to Firestore");
                }
                resolve(app);
            } catch(e) {
                console.error("🔥 Firebase Init Error:", e);
                reject(e);
            }
        });
    }

    // --- 2. AUTH MODULE (FIRESTORE VERSION) ---
    const AUTH_MANAGER = {
        // Lắng nghe trạng thái đăng nhập
        // monitorAuth: function() {
        //     auth.onAuthStateChanged(async (user) => {
        //         if (user) {
        //             log('🔓 Đã xác thực Auth, đang tải Profile...', 'info');
        //             await this.fetchUserProfile(user);
        //         } else {
        //             showLoading(false);
        //             log('🔒 Chưa đăng nhập', 'warning');
        //             if (typeof showLoading === 'function') showLoading(false);
        //             else document.getElementById('loading-overlay').classList.add('d-none');
        //             log('Đã đóng loading');
        //             this.showLoginForm();
        //         }
        //     });
        // },

        // Lấy thông tin chi tiết từ Firestore
        fetchUserProfile: async function(firebaseUser) {
            try {

                // ✅ FIRESTORE: Dùng .collection().doc().get()
                const docRef = db.collection('users').doc(firebaseUser.uid);
                const docSnap = await docRef.get();
                if (!docSnap.exists) {
                    alert("Tài khoản chưa có dữ liệu trên ERP. Vui lòng liên hệ Admin.");
                    auth.signOut();
                    showLoading(false);
                    return;
                }
                
                // ✅ FIRESTORE: Dùng .data()
                const userProfile = docSnap.data();
                // Merge data
                CURRENT_USER.uid = firebaseUser.uid;
                CURRENT_USER.email = firebaseUser.email;   
                CURRENT_USER.level = userProfile.level;
                CURRENT_USER.profile = userProfile;
                const masker = localStorage.getItem('erp-mock-role');
                
                if (masker) {                  
                    const realRole = JSON.parse(masker).realRole;
                    if (realRole === 'admin' || realRole === 'manager' || CURRENT_USER.level >= 50) {
                        CURRENT_USER.role = JSON.parse(masker).maskedRole;
                        CURRENT_USER.realRole = realRole;
                        localStorage.removeItem('erp-mock-role');
                        UI_RENDERER.renderedTemplates = {}; // Clear cache template để load lại
                        log('🎭 Admin masking mode detected. Cleaning up old role scripts...');

                        Object.keys(JS_MANIFEST).forEach(role => {
                            JS_MANIFEST[role].forEach(fileName => {
                                document.querySelectorAll(`script[src*="${fileName}"]`).forEach(script => {
                                    script.remove();
                                    log(`✂️ Removed script: ${fileName}`);
                                });
                            });
                        });
                        log('🎭 Clearing cached templates...');
                        Object.keys(TEMPLATE_MANIFEST).forEach(role => {
                            TEMPLATE_MANIFEST[role].forEach(templateId => {
                                document.querySelectorAll(`#${templateId}`).forEach(template => {
                                    template.remove();
                                    log(`✂️ Removed template: ${templateId}`);
                                });
                            });
                        });
                    }
                } else CURRENT_USER.role = userProfile.role || 'sale';
                CR_COLLECTION = ROLE_DATA[CURRENT_USER.role] || '';
                await Promise.all([
                    SECURITY_MANAGER.applySecurity(CURRENT_USER), 
                    loadDataFromFirebase()
                ]);
                
                this.updateUserMenu();
                log('✅ Chào mừng: ' + (userProfile.user_name || firebaseUser.email), 'success');
                
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

        // Hiển thị Form Login vào Modal
        showLoginForm: function() {
            // Thay vì dùng Modal, ta render trực tiếp vào app-container để ép người dùng login
            const loginHTML = `
                <div class="container d-flex justify-content-center align-items-center vh-100">
                    <div class="card shadow-lg border-0" style="max-width: 400px; width: 100%; border-radius: 15px;">
                        <div class="card-body p-5 text-center">
                            <img src="https://9tripvietnam.com/wp-content/uploads/2019/05/Logo-9-trip.png.webp" class="mb-4" style="height:50px;">
                            <h4 class="fw-bold mb-4 text-dark">HỆ THỐNG ERP 9TRIP</h4>
                            
                            <div class="form-floating mb-3 text-start">
                                <input type="email" class="form-control" id="login-email" placeholder="name@example.com">
                                <label>Email nhân viên</label>
                            </div>
                            <div class="form-floating mb-4 text-start">
                                <input type="password" class="form-control" id="login-pass" placeholder="Password">
                                <label>Mật khẩu</label>
                            </div>
                            
                            <button class="btn btn-primary w-100 py-3 fw-bold shadow-sm" onclick="AUTH_MANAGER.handleEmailLogin()">
                                ĐĂNG NHẬP NGAY
                            </button>
    
                            <div class="mt-4 small text-muted">
                                Hoặc đăng nhập bằng
                                <div class="d-flex gap-2 justify-content-center mt-2">
                                    <button class="btn btn-outline-light border text-dark" onclick="AUTH_MANAGER.handleSocialLogin('google')">
                                        <img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" width="18"> Google
                                    </button>
                                </div>
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
                    if(e.key === 'Enter')
                    this.handleEmailLogin();
                });
            }, 100);
        },

        handleEmailLogin: async function() {
            const email = document.getElementById('login-email').value;
            const pass = document.getElementById('login-pass').value;
            
            if(!email || !pass) { alert("Thiếu thông tin"); return; }

            try {
                await auth.signInWithEmailAndPassword(email, pass);
            } catch(e) {
                alert("Lỗi đăng nhập: " + e.message);
            }
        },

        // Xử lý Login Social
        handleSocialLogin: async function(providerName) {
            let provider;
            if (providerName === 'google') provider = new firebase.auth.GoogleAuthProvider();
            if (providerName === 'facebook') provider = new firebase.auth.FacebookAuthProvider();

            try {
                // Dùng signInWithPopup cho tiện trên WebApp
                await auth.signInWithPopup(provider);
            } catch(e) {
                console.error(e);
                alert("Lỗi đăng nhập Social: " + e.message);
            } finally {
                bootstrap.Modal.getInstance($('dynamic-modal')).hide().dispose();
                setTimeout(() => {
                    document.querySelectorAll('.modal-backdrop').forEach(backdrop => backdrop.remove());
                }, 150);            
            }
        },
      
        signOut: function() {
            auth.signOut().then(() => {
                location.reload(); // Reload trang cho sạch
            });
        },

        // --- QUẢN LÝ USER (ADMIN) ---

        // Load danh sách users
        loadUsersData: async function() {
            try {
                // ✅ FIRESTORE: Lấy toàn bộ collection
                const snapshot = await db.collection('users').get();
                
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
                        <tr class="text-center" style="cursor: pointer;" onclick="AUTH_MANAGER.loadUserToForm('${uid}')">
                            <td><small>${uid.substring(0, 5)}...</small></td>
                            <td>${user.account || '-'}</td>
                            <td>${user.user_name || '-'}</td>
                            <td>${user.user_phone || '-'}</td>
                            <td><small>${user.email || '-'}</small></td>
                            <td><span class="badge bg-info">${(user.role || '').toUpperCase()}</span></td>
                            <td>${user.level || 0}</td>
                            <td>${(user.group || "")}</td>
                            <td>${createdDate}</td>
                            <td><button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); AUTH_MANAGER.deleteUser('${uid}')"><i class="fa-solid fa-trash"></i></button></td>
                        </tr>
                    `;
                });
                
                const tbody = document.getElementById('users-table-body');
                if(tbody) tbody.innerHTML = html;

            } catch (e) {
                console.error("Lỗi tải users:", e);
            }
        },

        // Load chi tiết 1 user
        loadUserToForm: async function(uid) {
            try {
                // ✅ FIRESTORE
                const doc = await db.collection('users').doc(uid).get();
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

        // Lưu/Cập nhật user vào Firebase
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

            if (!userData.email) {
                logA('Vui lòng nhập đầy đủ Account và Email');
                return;
            }
            if (!userData.account) {
                userData.account = userData.email.split('@')[0];
            }

            try {
                if (userData.uid) {
                    // ✅ FIRESTORE UPDATE: Dùng set với merge: true (an toàn hơn update)
                    await db.collection('users').doc(userData.uid).set(userData, { merge: true });
                    logA('Cập nhật thành công');
                } else {
                    // Tạo mới User (Lưu ý: Auth client side sẽ tự login user mới -> Cần cân nhắc)
                    const password = userData.email.split('@')[0] + '@2026'; // Mật khẩu mặc định
                    const authResult = await auth.createUserWithEmailAndPassword(userData.email, password);
                    const newUid = authResult.user.uid;
                    
                    userData.uid = newUid;

                    // ✅ FIRESTORE CREATE
                    await db.collection('users').doc(newUid).set(userData);
                    logA('Tạo user mới thành công');
                }
                
                
                renderUsersConfig();
            } catch (e) {
                logError("Lỗi lưu: " + e.message);
            }
        },

        deleteUser: async function(uid) {
            if (!confirm('Chắc chắn xóa?')) return;
            try {
                // ✅ FIRESTORE DELETE
                await db.collection('users').doc(uid).delete();
                this.loadUsersData();
            } catch (e) {
                logError("Lỗi xóa: " + e.message);
            }
        }
    };

    // Hàm render template users-config vào giao diện
    function renderUsersConfig() {
        //   $('.modal-footer').style.display = 'none'; // Ẩn footer nếu có
        // Set ngày tạo mặc định là hôm nay
        document.getElementById('users-form').reset();
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('form-created-at').value = today;

        // Load dữ liệu users vào bảng
        AUTH_MANAGER.loadUsersData();
    }


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
            if (role === 'op' || role === 'acc') {
                await loadJSForRole('op');
                await UI_RENDERER.renderTemplate('body', 'tpl_operator.html', false, '.app-container');
            } else {
                await loadJSForRole('sale');
                await UI_RENDERER.renderTemplate('body', 'tpl_sales.html', false, '.app-container');
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
                
                UI_RENDERER.lazyLoad('tab-log');
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
                        UI_RENDERER.renderTemplate('body', 'tpl_operator.html');
                    }
                    else if (role === 'op' || role === 'operator' || maskedRole === 'op') {
                        permissionClass = 'is-op';
                        UI_RENDERER.renderTemplate('body', 'tpl_operator.html');
                    }
                    else {
                        permissionClass = 'is-sale';
                        UI_RENDERER.renderTemplate('body', 'tpl_sales.html');
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
            if (!body.classList.contains('is-admin')) {
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
            if (body.classList.contains('is-acc')) {
                container.querySelectorAll('.sales-only').forEach(el => el.remove()); // Acc xem được Op, chỉ xóa Sale
                
            }
        }
    };

    // 2. Lắng nghe sự kiện DOM Ready
    //   document.addEventListener('DOMContentLoaded', initApp);
    document.addEventListener('DOMContentLoaded',  () => {
        try {
            APP_CORE.init(); 
        } catch (e) {
            console.error("Critical Error:", e);
            document.body.innerHTML = `<h3 class="text-danger p-3">Lỗi kết nối hệ thống: ${e.message}</h3>`;
        }
    });
