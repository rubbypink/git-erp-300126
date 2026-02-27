
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
    initFirebase: async function () {
        try {
            if (!firebase.apps.length) {
                this.app = firebase.initializeApp(this.CFG_FB_RTDB);
            } else {
                this.app = firebase.app();
            }
            this.auth = firebase.auth();
            return this.app;
        } catch (e) {
            console.error('🔥 Firebase Init Error:', e);
            throw e;
        }
    },
    // Lấy thông tin chi tiết từ Firestore
    fetchUserProfile: async function (firebaseUser) {
        try {
            CR_COLLECTION = ROLE_DATA[CURRENT_USER.role] || '';
            await SECURITY_MANAGER.applySecurity(CURRENT_USER);
            // SECURITY_MANAGER.cleanDOM(document);
            // loadDataFromFirebase() đã được xử lý bởi app.js#runPostBoot — không gọi ở đây
        } catch (e) {
            console.error(e);
            alert("Lỗi tải profile: " + e.message);
        } finally {
            // Đóng modal
            showLoading(false);
        }
    },

    updateUserMenu: function () {
        const userFullName = CURRENT_USER.profile.user_name || CURRENT_USER.email.split('@')[0];
        const userEmail = CURRENT_USER.email;
        const userRole = CURRENT_USER.role;

        if (document.getElementById('user-menu-text')) document.getElementById('user-menu-text').innerText = userFullName;
        if (document.getElementById('user-menu-name')) document.getElementById('user-menu-name').innerText = userFullName;
        if (document.getElementById('user-menu-email')) document.getElementById('user-menu-email').innerText = userEmail;
        if (document.getElementById('user-menu-role')) document.getElementById('user-menu-role').innerText = userRole.toUpperCase();

        if (document.getElementById('btn-logout-menu')) document.getElementById('btn-logout-menu').style.display = 'flex';
        const modalTitle = A.getConfig('moduleTitle') || '9 Trip System';
        if (document.getElementById('module-title')) document.getElementById('module-title').innerText = modalTitle;
    },

    // Hiển thị màn hình lựa chọn Khách / Nhân sự
    showChoiceScreen: function () {
        const choiceHTML = `
        <style id="erp-login-style">
            .erp-login-bg {
                min-height: 100dvh; width: 100vw;
                display: flex; align-items: center; justify-content: center;
                background: linear-gradient(150deg, #2933a5 0%, #1e29cc 55%, #5c6bc0 100%);
                padding: 1rem; box-sizing: border-box;
            }
            .erp-login-card {
                background: #fff; border-radius: 1.25rem; width: 100%; max-width: 400px;
                box-shadow: 0 24px 64px rgba(0,0,0,0.28);
                overflow: hidden; animation: erpLoginIn 0.35s ease;
            }
            @keyframes erpLoginIn {
                from { opacity: 0; transform: translateY(24px) scale(0.98); }
                to   { opacity: 1; transform: translateY(0)    scale(1);    }
            }
            .erp-login-head {
                background: linear-gradient(135deg, #1a237e, #2c37d1);
                padding: 2rem 1.5rem 1.75rem; text-align: center;
            }
            .erp-login-logo {
                height: 64px; max-width: 160px; object-fit: contain;
                filter: drop-shadow(0 2px 8px rgba(0,0,0,0.25));
            }
            .erp-login-brand {
                color: #fff; font-size: 0.8rem; font-weight: 700;
                letter-spacing: 0.08em; margin: 0.75rem 0 0;
                text-transform: uppercase; opacity: 0.92;
            }
            .erp-login-body { padding: 1.75rem 1.5rem 2rem; }
            .erp-login-subtitle {
                text-align: center; color: #64748b; font-size: 0.9rem;
                margin-bottom: 1.5rem; line-height: 1.5;
            }
            .erp-choice-btn {
                display: flex; align-items: center; justify-content: center;
                gap: 0.6rem; width: 100%; padding: 0.85rem 1rem;
                border-radius: 0.75rem; font-size: 0.95rem; font-weight: 600;
                border: none; cursor: pointer;
                transition: transform 0.18s ease, box-shadow 0.18s ease;
                margin-bottom: 0.75rem;
            }
            .erp-choice-btn:last-child { margin-bottom: 0; }
            .erp-choice-yes {
                background: linear-gradient(135deg, #2c37d1, #1a237e); color: #fff;
                box-shadow: 0 4px 16px rgba(44,55,209,0.35);
            }
            .erp-choice-yes:hover  { transform: translateY(-2px); box-shadow: 0 7px 22px rgba(44,55,209,0.45); }
            .erp-choice-yes:active { transform: translateY(0);    box-shadow: 0 2px 8px  rgba(44,55,209,0.25); }
            .erp-choice-no {
                background: #f1f5f9; color: #475569;
                border: 1.5px solid #e2e8f0;
            }
            .erp-choice-no:hover  { background: #e8edf5; transform: translateY(-2px); }
            .erp-choice-no:active { transform: translateY(0); }
            .erp-login-footer-note {
                text-align: center; font-size: 0.72rem; color: #94a3b8;
                margin-top: 1.25rem;
            }
            @media (prefers-color-scheme: dark) {
                .erp-login-card  { background: #1e293b; }
                .erp-login-subtitle { color: #94a3b8; }
                .erp-choice-no  { background: #334155; color: #cbd5e1; border-color: #475569; }
                .erp-choice-no:hover { background: #3d4f67; }
                .erp-login-footer-note { color: #64748b; }
            }
        </style>
        <div class="erp-login-bg">
            <div class="erp-login-card">
                <div class="erp-login-head">
                    <img src="https://9tripvietnam.com/wp-content/uploads/2019/05/Logo-9-trip.png.webp"
                         class="erp-login-logo" alt="9 Trip Logo">
                    <p class="erp-login-brand">Công ty TNHH 9 Trip Phú Quốc</p>
                </div>
                <div class="erp-login-body">
                    <p class="erp-login-subtitle">Bạn có phải là <strong>khách hàng</strong> của 9 Trip?</p>
                    <button id="btn-choice-customer" class="erp-choice-btn erp-choice-yes">
                        <i class="fa-solid fa-user-tie"></i> Có, tôi là khách hàng
                    </button>
                    <button id="btn-choice-staff" class="erp-choice-btn erp-choice-no">
                        <i class="fa-solid fa-briefcase"></i> Không, tôi là nhân viên
                    </button>
                    <p class="erp-login-footer-note">Hệ thống quản lý nội bộ &mdash; chỉ dành cho nhân viên</p>
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
    showLoginForm: function () {
        const loginHTML = `
        <style id="erp-login-style">
            .erp-login-bg {
                min-height: 100dvh; width: 100vw;
                display: flex; align-items: center; justify-content: center;
                background: linear-gradient(150deg, #1a237e 0%, #2c37d1 55%, #5c6bc0 100%);
                padding: 1rem; box-sizing: border-box;
            }
            .erp-login-card {
                background: #fff; border-radius: 1.25rem; width: 100%; max-width: 400px;
                box-shadow: 0 24px 64px rgba(0,0,0,0.28);
                overflow: hidden; animation: erpLoginIn 0.35s ease;
            }
            @keyframes erpLoginIn {
                from { opacity: 0; transform: translateY(24px) scale(0.98); }
                to   { opacity: 1; transform: translateY(0)    scale(1);    }
            }
            .erp-login-head {
                background: linear-gradient(135deg, #1a237e, #2c37d1);
                padding: 1.75rem 1.5rem 1.5rem; text-align: center;
            }
            .erp-login-logo {
                height: 56px; max-width: 140px; object-fit: contain;
                filter: drop-shadow(0 2px 8px rgba(0,0,0,0.25));
            }
            .erp-login-brand {
                color: #fff; font-size: 0.78rem; font-weight: 700;
                letter-spacing: 0.1em; margin: 0.6rem 0 0;
                text-transform: uppercase; opacity: 0.9;
            }
            .erp-login-body { padding: 1.75rem 1.5rem 1.5rem; }
            .erp-field { position: relative; margin-bottom: 1rem; }
            .erp-field-label {
                display: block; font-size: 0.75rem; font-weight: 600;
                color: #64748b; margin-bottom: 0.35rem; letter-spacing: 0.02em;
            }
            .erp-field-input {
                width: 100%; padding: 0.65rem 0.9rem; box-sizing: border-box;
                border: 1.5px solid #e2e8f0; border-radius: 0.65rem;
                font-size: 0.9rem; color: #1e293b; background: #f8fafc;
                outline: none; transition: border-color 0.18s, box-shadow 0.18s;
                -webkit-appearance: none;
            }
            .erp-field-input:focus {
                border-color: #2c37d1; background: #fff;
                box-shadow: 0 0 0 3px rgba(44,55,209,0.12);
            }
            .erp-field-input.has-icon { padding-right: 2.5rem; }
            .erp-field-toggle {
                position: absolute; right: 0.75rem; bottom: 0.65rem;
                color: #94a3b8; cursor: pointer; font-size: 0.9rem;
                line-height: 1; background: none; border: none; padding: 0;
                transition: color 0.15s;
            }
            .erp-field-toggle:hover { color: #2c37d1; }
            .erp-btn-submit {
                width: 100%; padding: 0.8rem; margin-top: 0.25rem;
                background: linear-gradient(135deg, #2c37d1, #1a237e);
                border: none; border-radius: 0.75rem; color: #fff;
                font-size: 0.9rem; font-weight: 700; letter-spacing: 0.06em;
                cursor: pointer; transition: transform 0.18s, box-shadow 0.18s;
                box-shadow: 0 4px 16px rgba(44,55,209,0.35);
            }
            .erp-btn-submit:hover  { transform: translateY(-2px); box-shadow: 0 7px 22px rgba(44,55,209,0.45); }
            .erp-btn-submit:active { transform: translateY(0);    box-shadow: 0 2px 8px  rgba(44,55,209,0.25); }
            .erp-divider {
                display: flex; align-items: center; gap: 0.75rem;
                color: #94a3b8; font-size: 0.75rem; margin: 1.25rem 0;
            }
            .erp-divider::before, .erp-divider::after {
                content: ''; flex: 1; height: 1px; background: #e2e8f0;
            }
            .erp-btn-google {
                display: flex; align-items: center; justify-content: center;
                gap: 0.6rem; width: 100%; padding: 0.7rem;
                background: #fff; border: 1.5px solid #e2e8f0;
                border-radius: 0.75rem; color: #334155; font-size: 0.875rem;
                font-weight: 500; cursor: pointer;
                transition: background 0.18s, border-color 0.18s, transform 0.18s;
            }
            .erp-btn-google:hover  { background: #f8fafc; border-color: #94a3b8; transform: translateY(-1px); }
            .erp-btn-google:active { transform: translateY(0); }
            .erp-btn-back {
                display: flex; align-items: center; justify-content: center;
                gap: 0.4rem; width: 100%; padding: 0.5rem;
                background: none; border: none; cursor: pointer;
                color: #94a3b8; font-size: 0.8rem; margin-top: 0.75rem;
                transition: color 0.18s;
            }
            .erp-btn-back:hover { color: #2c37d1; }
            @media (prefers-color-scheme: dark) {
                .erp-login-card { background: #1e293b; }
                .erp-field-label { color: #94a3b8; }
                .erp-field-input { background: #0f172a; border-color: #334155; color: #f1f5f9; }
                .erp-field-input:focus { background: #1e293b; border-color: #4f63e7; }
                .erp-divider { color: #475569; }
                .erp-divider::before, .erp-divider::after { background: #334155; }
                .erp-btn-google { background: #0f172a; border-color: #334155; color: #cbd5e1; }
                .erp-btn-google:hover { background: #1e293b; }
            }
        </style>
        <div class="erp-login-bg">
            <div class="erp-login-card">
                <div class="erp-login-head">
                    <img src="https://9tripvietnam.com/wp-content/uploads/2019/05/Logo-9-trip.png.webp"
                         class="erp-login-logo" alt="9 Trip Logo">
                    <p class="erp-login-brand">9 Trip System</p>
                </div>
                <div class="erp-login-body">
                    <div class="erp-field">
                        <label class="erp-field-label" for="login-email">Email / Tên đăng nhập</label>
                        <input id="login-email" type="text" class="erp-field-input"
                               placeholder="Nhập email hoặc username" autocomplete="username">
                    </div>
                    <div class="erp-field">
                        <label class="erp-field-label" for="login-pass">Mật khẩu</label>
                        <input id="login-pass" type="password" class="erp-field-input has-icon"
                               placeholder="Nhập mật khẩu" autocomplete="current-password">
                        <button type="button" class="erp-field-toggle" id="btn-toggle-pass" tabindex="-1"
                                onclick="const i=document.getElementById('login-pass');const ic=document.getElementById('pass-eye');i.type=i.type==='password'?'text':'password';ic.className=i.type==='password'?'fa-solid fa-eye-slash':'fa-solid fa-eye';">
                            <i id="pass-eye" class="fa-solid fa-eye-slash"></i>
                        </button>
                    </div>
                    <button id="btn-mail-login" class="erp-btn-submit">
                        <i class="fa-solid fa-right-to-bracket me-2"></i>ĐĂNG NHẬP
                    </button>
                    <div class="erp-divider">Hoặc đăng nhập bằng</div>
                    <button id="btn-google-login" class="erp-btn-google">
                        <img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg"
                             width="18" alt="Google"> Đăng nhập với Google
                    </button>
                    <button id="btn-back-choice" class="erp-btn-back">
                        <i class="fa-solid fa-arrow-left"></i> Quay lại
                    </button>
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
                if (e.key === 'Enter') {
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

    handleEmailLogin: async function () {
        let email = document.getElementById('login-email').value;
        const pass = document.getElementById('login-pass').value;

        if (!email || !pass) { showLoading(false); alert("Thiếu thông tin"); return; }

        // Kiểm tra nếu email không chứa '@' thì tự động thêm domain
        if (!email.includes('@')) {
            email = email + '@9tripphuquoc.com';
        }

        try {
            await this.auth.signInWithEmailAndPassword(email, pass);
        } catch (e) {
            alert("Lỗi đăng nhập: " + e.message);
        } finally {
            showLoading(false);
        }
    },

    // Xử lý Login Social
    handleSocialLogin: async function (providerName) {
        let provider;
        if (providerName === 'google') provider = new firebase.auth.GoogleAuthProvider();
        if (providerName === 'facebook') provider = new firebase.auth.FacebookAuthProvider();

        try {
            showLoading(true);
            // Dùng signInWithPopup cho tiện trên WebApp
            await this.auth.signInWithPopup(provider);
        } catch (e) {
            console.error(e);
            alert("Lỗi đăng nhập Social: " + e.message);
        } finally {
            showLoading(false);
        }
    },

    signOut: function () {
        this.auth.signOut().then(() => {
            A.DB.stopNotificationsListener(); // Hủy tất cả subscription khi logout
            location.reload(); // Reload trang cho sạch
        });
    },

    // --- QUẢN LÝ USER (ADMIN) ---

    /**
     * Load danh sách users từ Firestore để hiển thị
     */
    loadUsersData: async function () {
        try {
            // ✅ FIRESTORE: Lấy toàn bộ collection users
            const snapshot = await A.DB.db.collection('users').get();

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
            if (tbody) tbody.innerHTML = html;

        } catch (e) {
            console.error("Lỗi tải users:", e);
        }
    },

    /**
     * Load chi tiết user vào form để edit
     * Chỉ đọc từ Firestore
     */
    loadUserToForm: async function (uid) {
        try {
            // ✅ FIRESTORE: Lấy dữ liệu user
            const doc = await A.DB.db.collection('users').doc(uid).get();
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
    saveUser: async function () {
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
            showLoading(true);
            // CASE 1: Cập nhật user hiện tại
            // Chỉ cần lưu Firestore → Trigger sẽ auto sync sang Auth
            if (userData.uid) {
                await A.DB.saveRecord('users', userData, { merge: true });
                log(`✅ User ${userData.uid} updated in Firestore`, 'success');
                log('💡 Trigger sẽ tự động đồng bộ sang Firebase Auth', 'info');
                this.renderUsersConfig();
                return;
            }
            const today = new Date();
            const dd = String(today.getDate()).padStart(2, '0');
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            const yy = String(today.getFullYear()).slice(-2);
            const newUid = `${userData.role.toUpperCase()}-${dd}${mm}${yy}`;

            log(`📝 Generated UID: ${newUid}`, 'info');

            // Bước 2: Tạo mật khẩu mặc định
            const defaultPassword = userData.email.split('@')[0] + '@2026';

            // Bước 3: Lưu vào Firestore (kèm password để trigger tạo Auth)
            userData.uid = newUid;
            userData.password = defaultPassword; // Trigger sẽ đọc field này để tạo Auth

            await A.DB.saveRecord('users', userData);
            log(`✅ Firestore document created: ${newUid}`, 'success');

            // Bước 4: Trigger sẽ tự động đọc dữ liệu từ Firestore và tạo Firebase Auth user
            logA(`✅ Tạo người dùng thành công!\n📧 Email: ${userData.email}\n🔑 Trigger sẽ tạo Auth account\n⏳ Vui lòng đợi...`);

            this.renderUsersConfig();
        } catch (error) {
            logError('❌ Lỗi lưu user: ' + error.message);
        } finally {
            showLoading(false);
        }
    },
    renderUsersConfig: function () {
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
    generateUserUID: function (role) {
        const today = new Date();
        const dd = String(today.getDate()).padStart(2, '0');
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const yy = String(today.getFullYear()).slice(-2);
        const newId = `${role.toUpperCase()}-${dd}${mm}${yy}`;
        return newId;
    },

    /**
     * Xóa user khỏi Firestore
     * Trigger "syncUserAuthDeleteOnDelete" sẽ tự động xóa Firebase Auth account
     */
    deleteUser: async function (uid) {
        if (!confirm('Chắc chắn xóa user này?\n⚠️ Trigger sẽ tự động xóa Auth account')) return;
        try {
            showLoading(true);
            // ✅ FIRESTORE DELETE → Trigger xóa Auth (route qua DBManager để đồng bộ notification)
            await A.DB.deleteRecord('users', uid);
            log(`✅ User ${uid} deleted from Firestore`, 'success');
            log('💡 Trigger sẽ tự động xóa Firebase Auth account', 'info');
            this.loadUsersData();
        } catch (error) {
            logError('❌ Lỗi xóa user: ' + error.message);
        } finally {
            showLoading(false);
        }
    }
};

const SECURITY_MANAGER = {
    /**
     * HÀM CHÍNH: ÁP DỤNG PHÂN QUYỀN VÀ KHỞI TẠO MODULE
     * Tối ưu hóa bởi 9Trip Tech Lead
     */
    applySecurity: async function (userProfile) {
        try {
            const email = (userProfile.email || "").toLowerCase();
            const level = parseInt(userProfile.level || 0);
            const role = (userProfile.role || "").toLowerCase();
            const maskedRole = userProfile.realRole ? userProfile.role : null;
            const isHardAdmin = typeof ADMIN_EMAILS !== 'undefined' && ADMIN_EMAILS.includes(email);

            // 1. Cấu hình Module dựa trên Role
            const ROLE_CONFIG = {
                'op': {
                    js: 'op',
                    template: 'tpl_operator.html',
                    container: '.app-container',
                    title: '9 Trip Phu Quoc - Operator Center',
                    moduleTitle: 'OPERATOR CENTER - QUẢN LÝ NCC - ĐIỀU HÀNH',
                    css: null
                },
                'accountant': { // Gom nhóm roles kế toán
                    jsFile: './accountant/controller_accountant.js',
                    template: './src/components/tpl_accountant.html',
                    container: '.app-container',
                    title: '9 Trip Phu Quoc - Accounting Center',
                    moduleTitle: 'ACCOUNTING CENTER - QUẢN LÝ KẾ TOÁN',
                    css: { id: 'css-accountant', href: './accountant/accountant.css' },
                    footerTemplate: 'tmpl-acc-footer-bar'
                },
                'sale': {
                    js: 'sale',
                    template: 'tpl_sales.html',
                    container: '.app-container',
                    title: '9 Trip Phu Quoc - Sales Center',
                    moduleTitle: 'SALES CENTER - QUẢN LÝ BOOKING',
                    css: null
                }
            };

            // 2. Xác định cấu hình áp dụng
            let configKey = 'sale'; // Mặc định
            if (role === 'op') configKey = 'op';
            else if (['acc', 'acc_thenice', 'ketoan'].includes(role)) configKey = 'accountant';

            const activeConfig = ROLE_CONFIG[configKey];

            // 3. Xử lý UI & Tài nguyên (Async)
            // Load CSS nếu có
            if (activeConfig.css && !document.getElementById(activeConfig.css.id)) {
                const link = document.createElement('link');
                link.id = activeConfig.css.id;
                link.rel = 'stylesheet';
                link.href = activeConfig.css.href;
                document.head.appendChild(link);
            }

            // Load Logic JS
            if (activeConfig.js) await loadJSForRole(activeConfig.js);
            if (activeConfig.jsFile) await loadJSFile(activeConfig.jsFile, role);

            // Render Giao diện chính
            await A.UI.renderTemplate('body', activeConfig.template, false, activeConfig.container);

            // Render Footer riêng cho kế toán nếu có
            if (activeConfig.footerTemplate) {
                await A.UI.renderTemplate('body', activeConfig.footerTemplate, false, '#main-footer', 'prepend');
            }

            // Cập nhật thông tin tiêu đề
            if (activeConfig.moduleTitle) A.setConfig('moduleTitle', activeConfig.moduleTitle);
            if (activeConfig.title) document.title = activeConfig.title;

            // 4. Xử lý Phân quyền (Security Class)
            document.body.className = ''; // Reset class
            let permissionClass = '';

            if (isHardAdmin || level >= 50) {
                permissionClass = 'is-admin';
                A.UI.lazyLoad('tab-log');
                log('🛡️ Security: ADMIN MODE');

                if (maskedRole) {
                    document.body.classList.add(`is-${maskedRole}`);
                    if (typeof activateTab === 'function') activateTab('tab-dashboard');
                } else {
                    if (typeof activateTab === 'function') activateTab('tab-admin-dashboard');
                }
            } else {
                if (typeof activateTab === 'function') activateTab('tab-dashboard');

                if (level >= 10) permissionClass = 'is-manager';
                else if (level >= 5) permissionClass = 'is-sup';
                else {
                    // Mapping class theo role cụ thể cho level thấp
                    const roleClassMap = {
                        'ketoan': 'is-acc',
                        'acc': 'is-acc',
                        'acc_thenice': 'is-acc-thenice',
                        'op': 'is-op',
                        'operator': 'is-op'
                    };
                    permissionClass = roleClassMap[role] || (maskedRole === 'op' ? 'is-op' : 'is-sale');
                }
                log(`🛡️ Security: STAFF MODE (${role})`);
            }

            if (permissionClass) document.body.classList.add(permissionClass);

            console.log('LOGIN: UI FOR ROLE LOADED');



        } catch (error) {
            console.error('❌ Lỗi tại applySecurity:', error);
            if (typeof showToast === 'function') showToast('Lỗi phân quyền hệ thống!', 'danger');
        }
    },
    /**
     * GIẢI PHÁP CHO VẤN ĐỀ 3: XỬ LÝ DYNAMIC CONTENT
     * Hàm này sẽ duyệt qua container mới render và xóa các node bị cấm
     */
    cleanDOM: async function (container) {
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
        if (body.classList.contains('is-sale') || role === 'sale') {
            container.querySelectorAll('.op-only, .acc-only').forEach(el => el.remove());

        }
        if (body.classList.contains('is-op') || role === 'op') {
            container.querySelectorAll('.sales-only, .acc-only').forEach(el => el.remove());
        }
        if (body.classList.contains('is-acc') || CURRENT_USER.role === 'acc_thenice') {
            container.querySelectorAll('.sales-only').forEach(el => el.remove());
            container.querySelectorAll('[data-bs-target="#tab-form"]').forEach(el => el.remove()); // Ẩn tab Dashboard chung       
        }
        console.log('LOGIN: DOM CLEANED BASED ON ROLE');
    }
};

export { AUTH_MANAGER, SECURITY_MANAGER };


