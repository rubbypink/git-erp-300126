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

    async function initFirebase() {
        return new Promise((resolve, reject) => {
            showLoading(true, "Đang Xác Thực Người Dùng...");
            try {
                if (!firebase.apps.length) {
                    app = firebase.initializeApp(CFG_FB_RTDB);
                } else {
                    app = firebase.app();
                }
                
                auth = firebase.auth();
                AUTH_MANAGER.monitorAuth(); 
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
        monitorAuth: function() {
            auth.onAuthStateChanged(async (user) => {
                if (user) {
                    log('🔓 Đã xác thực Auth, đang tải Profile...', 'info');
                    await this.fetchUserProfile(user);
                } else {
                    showLoading(false);
                    log('🔒 Chưa đăng nhập', 'warning');
                    if (typeof showLoading === 'function') showLoading(false);
                    else document.getElementById('loading-overlay').classList.add('d-none');
                    log('Đã đóng loading');
                    this.showLoginForm();
                }
            });
        },

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
                    if (realRole === 'admin' || realRole === 'manager') {
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
                await SECURITY_MANAGER.applySecurity(CURRENT_USER);
                await initApp();
                this.updateUserMenu();
                log('✅ Chào mừng: ' + (userProfile.user_name || firebaseUser.email), 'success');
                
                SECURITY_MANAGER.cleanDOM(document);

            } catch (e) {
                console.error(e);
                alert("Lỗi tải profile: " + e.message);
            } finally {
                // Đóng modal
                showLoading(false);
                const modalEl = document.getElementById('dynamic-modal');
                if (modalEl) {
                    const modalInstance = bootstrap.Modal.getInstance(modalEl);
                    if (modalInstance) modalInstance.hide();
                    document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
                }
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
            const modalBody = `
                <div class="row g-3 justify-content-center p-3">
                    <div class="col-12 text-center mb-3">
                        <img src="https://9tripvietnam.com/wp-content/uploads/2019/05/Logo-9-trip.png.webp" class="img-fluid" style="max-height:50px;">
                        <h5 class="mt-2 text-secondary">Đăng nhập hệ thống</h5>
                    </div>
                    
                    <div class="col-md-10">
                        <div class="form-floating mb-3">
                            <input type="email" class="form-control" id="login-email" placeholder="name@example.com">
                            <label for="login-email">Email</label>
                        </div>
                        <div class="form-floating mb-3">
                            <input type="password" class="form-control" id="login-pass" placeholder="Password">
                            <label for="login-pass">Mật khẩu</label>
                        </div>
                        <button class="btn btn-primary w-100 py-2 mb-3 fw-bold" onclick="AUTH_MANAGER.handleEmailLogin()">
                            <i class="fas fa-sign-in-alt me-2"></i> Đăng nhập
                        </button>
                        
                        <div class="position-relative my-4">
                            <hr class="text-secondary">
                            <span class="position-absolute top-50 start-50 translate-middle px-2 bg-white text-muted small">HOẶC</span>
                        </div>

                        <div class="d-grid gap-2">
                            <button class="btn btn-outline-danger" onclick="AUTH_MANAGER.handleSocialLogin('google')">
                                <i class="fab fa-google me-2"></i> Tiếp tục với Google
                            </button>
                            <button class="btn btn-outline-primary" onclick="AUTH_MANAGER.handleSocialLogin('facebook')">
                                <i class="fab fa-facebook-f me-2"></i> Tiếp tục với Facebook
                            </button>
                        </div>
                    </div>
                </div>
            `;

            // Sử dụng hàm helper có sẵn nếu bạn đã viết, hoặc gọi trực tiếp Bootstrap
            var modalEl = document.getElementById('dynamic-modal');
            if(!modalEl)  {
                UI_RENDERER.renderTemplate('body', 'tmpl-dynamic-modal', false, '.app-container');
            } else {
                UI_RENDERER.renderTemplate('body', 'tmpl-dynamic-modal', true, '.app-container');
            }
            modalEl = document.getElementById('dynamic-modal');
            modalEl.querySelector('.modal-title').innerText = ''; // Ẩn title cho đẹp
            modalEl.querySelector('.modal-body').innerHTML = modalBody;
            modalEl.querySelector('.modal-footer').style.display = 'none'; // Ẩn footer

            // Prevent close click outside
            const modal = new bootstrap.Modal(modalEl, {
                backdrop: 'static',
                keyboard: false
            });
            modal.show();
            
            // Thêm sự kiện Enter key cho password input
            setTimeout(() => {
                const passInput = getE('login-pass');
                if (passInput) {
                    passInput.addEventListener('keypress', (event) => {
                        if (event.key === 'Enter') {
                            AUTH_MANAGER.handleEmailLogin();
                        }
                    });
                }
            }, 100);
            modalEl.addEventListener('hidden.bs.modal', () => {
                modalEl.remove();
                UI_RENDERER.renderedTemplates['tmpl-dynamic-modal'] = false;
            });
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
        // Cấu hình danh sách Admin cứng
        ADMIN_EMAILS: ['tranthuaanh90@gmail.com', '9tripphuquoc@gmail.com'],

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
            const isHardAdmin = this.ADMIN_EMAILS.includes(email);           

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
