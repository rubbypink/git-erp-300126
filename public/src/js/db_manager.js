/**
 * DB MANAGER - FIRESTORE VERSION (Final)
 * Tương thích với cấu trúc Operator/Supplier Update
 */

const DEPT_COLLS = {
    admin: ['app_config', 'bookings', 'booking_details', 'operator_entries', 'customers', 'transactions', 'fund_accounts', 'users', 'suppliers', 'hotels', 'transactions_thenice', 'fund_accounts_thenice'],
    sales: ['bookings', 'booking_details', 'customers', 'transactions', 'fund_accounts', 'users'],
    operations: ['operator_entries', 'bookings', 'booking_details', 'customers', 'transactions', 'fund_accounts', 'users'],
    accountant: ['transactions', 'fund_accounts', 'users', 'bookings'],
    accountant_thenice: ['transactions_thenice', 'fund_accounts_thenice', 'users']
}
const DB_MANAGER = {
    db: null,
    batchCounterUpdates: {}, // Lưu counter updates cho batch processing
    currentCustomer: null,
    
    // --- COLLECTION NAME ALIASES ---
    COLL: {
        BOOKINGS: 'bookings',
        DETAILS: 'booking_details',
        OPERATORS: 'operator_entries',
        CUSTOMERS: 'customers',
        TRANSACTIONS: 'transactions',
        TRANSACTIONS_THENICE: 'transactions_thenice',
        FUNDS: 'fund_accounts',
        FUNDS_THENICE: 'fund_accounts_thenice',
        USERS: 'users',
        CONFIG: 'app_config'
    },
    
    /**
     * HÀM NỘI BỘ: Tạo ID mới cho các collection
     * @param {string} collectionName - Tên collection (bookings, booking_details, customers, users)
     * @param {string} bookingId - (Optional) Dùng cho booking_details: giá trị booking_id để làm prefix
     * @returns {Promise<{newId: string, newNo: number}>}
     */
    generateIds: async function(collectionName, bookingId = null) {
        if (!this.db) {
            console.error("❌ DB chưa init");
            return null;
        }

        const counterRef = this.db.collection('counters_id').doc(collectionName);

        try {
            const counterSnap = await counterRef.get();
            let lastNo = 0;
            let prefix = '';
            let useRandomId = false;

            // Lấy số hiện tại từ counters_id
            if (counterSnap.exists) {
                if (collectionName === this.COLL.DETAILS) prefix = bookingId ? `${bookingId}_` : 'SID_';
                else prefix = counterSnap.data().prefix || '';
                lastNo = counterSnap.data().last_no;
                if(lastNo && lastNo > 0) await this._updateCounter(collectionName, lastNo + 1);
            }

            // Nếu counters_id không có thì lấy id mới nhất trong collection để suy ra lastNo/prefix
            if (!counterSnap.exists) {
                try {
                    const latestSnap = await this.db.collection(collectionName)
                        .orderBy('id', 'desc')
                        .limit(1)
                        .get();

                    if (!latestSnap.empty) {
                        const latestDoc = latestSnap.docs[0].data() || {};
                        const latestId = String(latestDoc.id || latestSnap.docs[0].id || '').trim();

                        if (/^\d+$/.test(latestId)) {
                            lastNo = parseInt(latestId, 10);
                            prefix = '';
                        } else if (latestId.includes('-')) {
                            const parts = latestId.split('-').filter(Boolean);
                            const lastPart = parts[parts.length - 1] || '';
                            if (/^\d+$/.test(lastPart)) {
                                lastNo = parseInt(lastPart, 10);
                                prefix = parts.slice(0, -1).join('-');
                                prefix = prefix ? `${prefix}-` : '';
                            } else if (!/\d/.test(latestId)) {
                                useRandomId = true;
                            }
                        } else if (!/\d/.test(latestId)) {
                            useRandomId = true;
                        }
                    } else {
                        useRandomId = true;
                    }
                } catch (e) {
                    console.warn(`⚠️ Cannot derive lastNo from latest ${collectionName} id:`, e);
                }
            }

            let newNo = lastNo + 1;
            let newId;

            if (useRandomId) {
                newId = `${prefix}${Math.random().toString(36).slice(2, 8).toUpperCase()}`.trim();
                console.log(`🆔 Generated RANDOM ID for ${collectionName}: ${newId}`);
                return { newId, newNo };
            }

            // Tạo ID cuối cùng
            newId = `${prefix}${newNo}`.trim(); // trim để xóa khoảng trắng thừa nếu có

            console.log(
                `🆔 Generated ID for ${collectionName}: ${newId} (lastNo: ${lastNo} -> ${newNo})`
            );

            return { newId, newNo };
        } catch (e) {
            console.error(`❌ Error generating ID for ${collectionName}:`, e);
            return null;
        }
    },

    /**
     * HÀM NỘI BỘ: Cập nhật counter sau khi save batch
     * Chỉ cập nhật counter cuối cùng của batch
     * @param {string} collectionName
     * @param {number} newNo
     */
    _updateCounter: async function(collectionName, newNo) {
        const counterRef = this.db.collection('counters_id').doc(collectionName);
        try {
            await counterRef.set({ last_no: newNo }, { merge: true });
            if (!this.batchCounterUpdates[collectionName] || this.batchCounterUpdates[collectionName]  <= newNo) this.batchCounterUpdates[collectionName] = newNo;
        } catch (e) {
            console.error(`❌ Error updating counter for ${collectionName}:`, e);
        }
    },
    
    /**
     * HÀM NỘI BỘ: Cập nhật APP_DATA.collectionName_obj sau khi save thành công
     * @param {string} collectionName - Tên collection (bookings, booking_details, ...)
     * @param {object} dataObj - Object dữ liệu vừa save
     */
    _updateAppDataObj: function(collectionName, dataObj) {
        if (!APP_DATA) return; // An toàn nếu APP_DATA chưa init
        
        const objKey = `${collectionName}_obj`;
        
        // ✅ Kiểm tra xem collection_obj có tồn tại không
        if (!Array.isArray(APP_DATA[objKey])) {
            APP_DATA[objKey] = [];
        }
        
        // ✅ Tìm index của object trong array dựa trên ID
        const existingIndex = APP_DATA[objKey].findIndex(item => item.id === dataObj.id);
        
        if (existingIndex !== -1) {
            // ✅ Cập nhật object cũ (merge với dữ liệu mới)
            APP_DATA[objKey][existingIndex] = { ...APP_DATA[objKey][existingIndex], ...dataObj };
            console.log(`✏️ Updated ${collectionName}_obj[${existingIndex}]: ${dataObj.id}`);
        } else {
            // ✅ Thêm object mới vào đầu array (hoặc cuối tùy preference)
            APP_DATA[objKey].unshift(dataObj);
            console.log(`➕ Added new ${collectionName}_obj: ${dataObj.id}`);
        }
    },
    
    /**
     * HÀM NỘI BỘ: Xóa object khỏi APP_DATA.collectionName_obj sau khi delete thành công
     * @param {string} collectionName - Tên collection (bookings, booking_details, ...)
     * @param {string} id - ID của object cần xóa
     */
    _removeFromAppDataObj: function(collectionName, id) {
        if (!APP_DATA) return; // An toàn nếu APP_DATA chưa init
        
        const objKey = `${collectionName}_obj`;
        
        // ✅ Kiểm tra xem collection_obj có tồn tại không
        if (!Array.isArray(APP_DATA[objKey])) {
            return;
        }
        
        // ✅ Tìm index của object trong array dựa trên ID
        const existingIndex = APP_DATA[objKey].findIndex(item => item.id === id);
        
        if (existingIndex !== -1) {
            // ✅ Xóa object khỏi array
            APP_DATA[objKey].splice(existingIndex, 1);
            console.log(`🗑️ Removed ${collectionName}_obj[${existingIndex}]: ${id}`);
        }
    },
    
    loadAllData: async function() {
        if (!this.db) { console.error("❌ DB chưa init"); return null; }
        
        // Lấy User hiện tại từ Firebase Auth (Đã đăng nhập ở bước trước)
        const fUser = firebase.auth().currentUser;
        if (!fUser) { console.error("❌ Chưa đăng nhập"); return null; }

        console.time("LoadFirestore");

        // 1. CHUẨN BỊ HEADER (Tên cột) - Giữ tham chiếu, không push vào data nữa
        const headers = {
            bookings: getHeader(FIELD_MAP.bookings),
            booking_details: getHeader(FIELD_MAP.booking_details),
            operator_entries: getHeader(FIELD_MAP.operator_entries),
            customers: getHeader(FIELD_MAP.customers),
            users: getHeader(FIELD_MAP.users)
        };       
        // Cấu trúc dữ liệu trả về 
        const result = {
            header: headers, 
            
            // Legacy Arrays (Empty init - Point 2)
            bookings: [], 
            booking_details: [],
            operator_entries: [],
            customers: [],
            
            // Modern Objects (Point 1)
            bookings_obj: [],
            booking_details_obj: [],
            operator_entries_obj: [],
            customers_obj: [],
            
            lists: {},         
            currentUser: {}    
        };
        try {
            // TẢI SONG SONG TẤT CẢ (Parallel Fetching) -> Tối ưu tốc độ
            const [cfgSnap, userList, bkSnap, dtSnap, opSnap, cusSnap] = await Promise.all([
                this.db.collection('app_config').doc('current').get(), // 0. Config
                this.db.collection('users').get(),
                this.db.collection('bookings').orderBy('created_at', 'desc').limit(1000).get(), // 2. Bookings
                this.db.collection('booking_details').orderBy('booking_id', 'desc').limit(4000).get(), // 3. Details
                this.db.collection('operator_entries').orderBy('booking_id', 'desc').limit(4000).get(),// 4. Operator
                this.db.collection('customers').limit(1000).get()        // 5. Customers
            ]);

            // --- 1. XỬ LÝ CONFIG (LISTS) ---
            if (cfgSnap.exists) {
                const rawCfg = cfgSnap.data();
                const parsedCfg = {};
                for (let k in rawCfg) {
                    try {
                        // Parse JSON String (do migration đã stringify mảng lồng)
                        parsedCfg[k] = (typeof rawCfg[k] === 'string' && rawCfg[k].startsWith('[')) 
                                       ? JSON.parse(rawCfg[k]) 
                                       : rawCfg[k];
                    } catch(e) { parsedCfg[k] = rawCfg[k]; }
                }
                result.lists = parsedCfg;
            }
            // --- 3. XỬ LÝ DỮ LIỆU BẢNG (Point 1: Assign correct data types) ---
            
            bkSnap.forEach(doc => {
                const data = doc.data();
                // Point 1: Store raw object
                result.bookings_obj.push(data);
                // Point 2: Maintain array format for legacy compatibility (No header row)
                result.bookings.push(objectToArray(data, 'bookings'));
            });
            dtSnap.forEach(doc => {
                const data = doc.data();
                result.booking_details_obj.push(data);
                result.booking_details.push(objectToArray(data, 'booking_details'));
            });
            opSnap.forEach(doc => {
                const data = doc.data();
                result.operator_entries_obj.push(data);
                result.operator_entries.push(objectToArray(data, 'operator_entries'));
            });
            cusSnap.forEach(doc => {
                const data = doc.data();
                result.customers_obj.push(data);
                result.customers.push(objectToArray(data, 'customers'));
            });

            const staffList = [];
            userList.forEach(doc => {
                const data = doc.data();
                staffList.push(data.user_name || 'No Name');
            });
            result.lists.staff = staffList;

            // Gán vào biến toàn cục APP_DATA
            A.DATA = result;
            APP_DATA = result;

            console.timeEnd("LoadFirestore");
            log(`📥 Data Ready: ${result.bookings.length} BKs, ${result.booking_details.length} DTs`);
            
            return APP_DATA;

        } catch (e) {
            console.error("❌ Critical Error loading data:", e);
            alert("Lỗi tải dữ liệu: " + e.message);
            return null;
        }
    },
    loadCollection: async function(collectionName, limit = 4000) {
        if (!this.db) { console.error("❌ DB chưa init"); return null; }
        console.log(`📥 Loading collection: ${collectionName}...`);
        try {
            const collSnap = await this.db.collection(collectionName)
                .orderBy('created_at', 'desc')
                .limit(limit)
                .get();
            const dataList = [];
            collSnap.forEach(doc => {
                const data = doc.data();
                dataList.push(data);
            });
            console.log(`✅ Loaded ${dataList.length} items from ${collectionName}`);
            return dataList;
        } catch (e) {
            console.error(`❌ Error loading ${collectionName}:`, e);
            return null;
        }
    },

    loadDocument: async function(collectionName, docId) {
        if (!this.db) { console.error("❌ DB chưa init"); return null; }
        console.log(`📥 Loading document: ${collectionName}/${docId}...`)
        try {
            const docRef = this.db.collection(collectionName).doc(String(docId));
            const docSnap = await docRef.get();
            if (docSnap.exists) {
                const data = docSnap.data();
                console.log(`✅ Loaded document ${collectionName}/${docId}`);
                return data;
                } else {
                    console.warn(`⚠️ Document not found: ${collectionName}/${docId}`);
                    return null;
                    }
        } catch (e) {
            console.error(`❌ Error loading document ${collectionName}/${docId}:`, e);
            return null;
        }
    },

    runQuery: async function(collectionName, fieldName, operator, value, fieldOrder = 'created_at',  limit = 2000) {
        if (!this.db) { console.error("❌ DB chưa init"); return null; }
        console.log(`🔍 Running query on ${collectionName}: ${fieldName} ${operator} ${value}`);
        try {
            const querySnap = await this.db.collection(collectionName)
                .where(fieldName, operator, value)
                .limit(limit)
                .orderBy(fieldOrder, 'desc')
                .get();
            const results = [];
            querySnap.forEach(doc => {
                results.push(doc.data());
            });
            console.log(`✅ Query returned ${results.length} items from ${collectionName}`);
            return results;
        } catch (e) {
            console.error(`❌ Error running query on ${collectionName}:`, e);
            return null;
        }
    },

    incrementField: async function(collectionName, docId, fieldName, incrementBy) {
        if (!this.db) { console.error("❌ DB chưa init"); return false; };
        console.log(`🔼 Incrementing ${collectionName}/${docId} field ${fieldName} by ${incrementBy}`);
        try {
            const docRef = this.db.collection(collectionName).doc(String(docId));
            await docRef.update({
                [fieldName]: firebase.firestore.FieldValue.increment(incrementBy)
            });
            console.log(`✅ Incremented ${fieldName} by ${incrementBy} for ${collectionName}/${docId}`);
            return true;
        } catch (e) {
            console.error(`❌ Error incrementing field for ${collectionName}/${docId}:`, e);
            return false;
        }
    },

    // =========================================================
    // 2. SYNC LOGIC (Trigger Operator)
    // =========================================================

    /**
     * Trigger: Cập nhật Operator Entry từ Booking Details (Synchronous - không dùng batch)
     * Các trường: id, booking_id, customer_name, supplier_name, service_type, 
     * check_in, check_out, nights, adults, children, total_sale
     * 
     * ⚠️ Hàm này tạo batch riêng để cập nhật operator_entries
     * Dùng cho non-batch save hoặc gọi AFTER batchSave commit xong
     */
    _syncOperatorEntry: async function(detailRow) {
        // ✅ FIX: Xử lý cả array và object format
        let d_id, d_bkid, d_type, d_hotel, d_service, d_in, d_out, d_night, d_qty, d_child, d_total;
        
        if (Array.isArray(detailRow)) {
            // Format array (legacy)
            d_id = detailRow[COL_INDEX.D_SID];
            d_bkid = detailRow[COL_INDEX.D_BKID];
            d_type = detailRow[COL_INDEX.D_TYPE];
            d_hotel = detailRow[COL_INDEX.D_HOTEL];
            d_service = detailRow[COL_INDEX.D_SERVICE];
            d_in = detailRow[COL_INDEX.D_IN];
            d_out = detailRow[COL_INDEX.D_OUT];
            d_night = detailRow[COL_INDEX.D_NIGHT];
            d_qty = detailRow[COL_INDEX.D_QTY];
            d_child = detailRow[COL_INDEX.D_CHILD];
            d_total = detailRow[COL_INDEX.D_TOTAL];
        } else {
            // Format object (modern)
            d_id = detailRow.id;
            d_bkid = detailRow.booking_id;
            d_type = detailRow.service_type;
            d_hotel = detailRow.hotel_name;
            d_service = detailRow.service_name;
            d_in = detailRow.check_in;
            d_out = detailRow.check_out;
            d_night = detailRow.nights;
            d_qty = detailRow.quantity;
            d_child = detailRow.child_qty;
            d_total = detailRow.total;
        }
        
        // ✅ FIX: Gán giá trị mặc định nếu undefined
        const syncData = {
            id: d_id || "",
            booking_id: d_bkid || "",
            customer_name: detailRow.customer_name || detailRow[COL_INDEX.M_CUST] || "",
            service_type: d_type || "",
            hotel_name: d_hotel || "",
            service_name: d_service || "",
            check_in: d_in ? formatDateISO(d_in) : "",
            check_out: d_out ? formatDateISO(d_out) : "",
            nights: d_night || 0,
            adults: d_qty || 0,
            children: d_child || 0,
            total_sale: d_total || 0,
            updated_at: firebase.firestore.FieldValue.serverTimestamp()
        };

        const opRef = this.db.collection(this.COLL.OPERATORS).doc(String(d_id));
        
        try {
            await opRef.set(syncData, { merge: true });
            this._updateAppDataObj(this.COLL.OPERATORS, syncData);
            return { success: true };
        } catch (e) {
            console.error(`❌ Error syncing operator entry ${d_id}:`, e);
            return { success: false, error: e.message };
        }
    },

    /**
     * LƯU 1 BẢN GHI (Gộp Create & Update)
     * @param {string} collectionName - Tên bảng (bookings, booking_details...)
     * @param {Array} dataArray - Dữ liệu dạng mảng (theo format cũ)
     * @param {boolean} isBatch - (Nội bộ) Dùng khi gọi từ batchSave
     * @param {object} batchRef - (Nội bộ) Reference của Batch
     */
    saveRecord: async function(collectionName, dataArray, isBatch = false, batchRef = null) {
        let dataObj;
        if (typeof dataArray === 'object' && !Array.isArray(dataArray)) {
            
            dataObj = dataArray; // Đã là object, không cần convert
        } else {
            // 1. Convert Array -> Object Firestore
            log(`Converting array to object for ${collectionName} saving...`);
            dataObj = arrayToObject(dataArray, collectionName);
        }
        if (collectionName === this.COLL.BOOKINGS) this.currentCustomer = dataObj.customer_name || dataArray[COL_INDEX.M_CUST];
        // ✅ GIAI ĐOẠN 0: NẾU BOOKINGS VÀ customer_id TRỐNG - TÌM HOẶC TẠO CUSTOMER
        if (collectionName === this.COLL.BOOKINGS && (!dataObj.customer_id || dataObj.customer_id === "")) {
            let customerPhone = dataObj.customer_phone || dataArray[COL_INDEX.M_PHONE];
        
            if (customerPhone) {
                if (customerPhone.startsWith("'") || customerPhone.startsWith('+'))
                customerPhone = customerPhone.slice(1).trim();
                console.log(`🔍 Tìm customer với SĐT: ${customerPhone}...`);
                
                // Tìm customer có phone = customer_phone
                const customerSnap = await this.db.collection(this.COLL.CUSTOMERS)
                    .where('phone', '==', String(customerPhone)) // Loại bỏ khoảng trắng & ký tự đầu (0 hoặc +84)
                    .limit(1)
                    .get();
                
                if (customerSnap.size > 0) {
                    // ✅ TÌM ĐƯỢC: Lấy ID của customer cũ
                    const existingCustomer = customerSnap.docs[0];
                    dataObj.customer_id = existingCustomer.id;
                    
                    console.log(`✅ Tìm thấy customer cũ: ${existingCustomer.id}`);
                } else {
                    // ❌ KHÔNG TÌM ĐƯỢC: TẠO CUSTOMER MỚI
                    console.log(`➕ Tạo customer mới từ booking...`);
                    
                    // Tạo ID mới cho customer
                    const newCustomerId = await this.generateIds(this.COLL.CUSTOMERS);
                    if (!newCustomerId) {
                        console.error("❌ Lỗi: Không thể tạo ID customer");
                        return { success: false, message: "Failed to create customer ID" };
                    }
                    
                    // Xây dựng object customer mới với 3 field cần thiết
                    const newCustomer = {
                        id: newCustomerId.newId,
                        full_name: dataObj.customer_name || "",
                        phone: String(customerPhone).trim(),
                        source: 'Fanpage',
                        created_at: firebase.firestore.FieldValue.serverTimestamp()
                    };
                    
                    // Save customer mới vào Firestore
                    try {
                        await this.db.collection(this.COLL.CUSTOMERS)
                            .doc(newCustomerId.newId)
                            .set(newCustomer, { merge: true });
                        
                        // Cập nhật APP_DATA
                        this._updateAppDataObj(this.COLL.CUSTOMERS, newCustomer);
                        
                        // Cập nhật counter
                        dataObj.customer_id = newCustomerId.newId;
                        console.log(`✅ Tạo customer mới thành công: ${newCustomerId.newId}`);
                    } catch (e) {
                        console.error(`❌ Lỗi tạo customer: ${e.message}`);
                        await this._updateCounter(this.COLL.CUSTOMERS, newCustomerId.newNo - 1);
                        delete this.batchCounterUpdates[this.COLL.CUSTOMERS];
                        return { success: false, message: "Failed to create customer" };
                    }
                }
            } else {
                console.warn("⚠️ customer_phone trống, không thể tạo customer mới.");
            }
        }
        
        let docId = dataObj.id; // Cột đầu tiên luôn là ID

        // --- KIỂM TRA VÀ TẠO ID MỚI NẾU CẦN ---
        if (!docId || docId === "") {
            console.log(`🔄 ID trống, đang tạo ID mới cho ${collectionName}...`);
            
            // Xác định bookingId nếu là booking_details
            let bookingId = null;
            if (collectionName === this.COLL.DETAILS) {
                bookingId = dataObj.booking_id || dataArray[COL_INDEX.D_BKID];
            }

            // Gọi generateIds
            const idResult = await this.generateIds(collectionName, bookingId);
            if (!idResult) {
                console.error("❌ Lỗi: Không thể tạo ID");
                return { success: false, message: "Failed to generate ID" };
            }

            docId = idResult.newId;
            dataObj.id = docId;
            if (Array.isArray(dataArray)) {
                dataArray[0] = docId; // Cập nhật lại array (cột đầu tiên)
            }
        }

        if (!docId) {
            console.error("❌ Lỗi: Dữ liệu thiếu ID", dataArray);
            return { success: false, message: "Missing ID" };
        }

        const docRef = this.db.collection(collectionName)?.doc(String(docId));
        
        // Thêm timestamp cập nhật
        dataObj.updated_at = firebase.firestore.FieldValue.serverTimestamp();
        
        // --- TRƯỜNG HỢP 1: Batch mode (chỉ thêm detail, không trigger) ---
        if (isBatch && batchRef) {
            batchRef.set(docRef, dataObj, { merge: true });
            // ⚠️ Không gọi trigger ở đây - sẽ gọi sau khi batchSave commit xong
            return { success: true };
        }
        
        // --- TRƯỜNG HỢP 2: Non-batch mode (commit ngay + trigger) ---
        else {
            try {
                const localBatch = this.db.batch();
                localBatch.set(docRef, dataObj, { merge: true });
                await localBatch.commit();
                
                // ✅ Cập nhật APP_DATA sau khi save thành công
                this._updateAppDataObj(collectionName, dataObj);
                
                // Sau khi detail commit thành công, gọi trigger
                if (collectionName === this.COLL.DETAILS) {
                    await this._syncOperatorEntry(dataArray);
                }
                
                return { success: true, id: docId };
            } catch (e) {
                console.error("Save Error:", e);
                await this._updateCounter(collectionName, this.batchCounterUpdates[collectionName] - 1);
                delete this.batchCounterUpdates[collectionName];
                return { success: false, error: e.message };
            }
        }
    },

    /**
     * LƯU HÀNG LOẠT (Batch Processing)
     * Tự động chia nhỏ nếu > 500 items (Giới hạn của Firestore)
     */
    batchSave: async function(collectionName, dataArrayList) {
        if (!dataArrayList || dataArrayList.length === 0) return;
        let customerName = "";
        let bkId = Array.isArray(dataArrayList[0]) ? dataArrayList[0][1] : dataArrayList[0].booking_id;
        const bkRef = this.db.collection('bookings').doc(String(bkId));
        const bkSnap = await bkRef.get();
        if (bkSnap.exists) {
            customerName = bkSnap.data().customer_name || "null";
        } else log("Booking not found "+ bkId);

        const batchSize = 450; // Để dư chỗ cho Trigger (mỗi detail đẻ thêm 1 operator update)
        const chunks = [];
        
        for (let i = 0; i < dataArrayList.length; i += batchSize) {
            chunks.push(dataArrayList.slice(i, i + batchSize));
        }

        let totalSuccess = 0;
        this.batchCounterUpdates = {}; // Reset counter updates
        const detailsForTrigger = []; // Lưu details để trigger sau
        const processedData = [];

        // ✅ GIAI ĐOẠN 1: TẠO ID CHO NHỮNG ROW CHƯA CÓ ID (Trước khi saveRecord)
        for (const chunk of chunks) {
            for (const row of chunk) {
                let rowId = Array.isArray(row) ? row[0] : row.id;
                
                // Nếu row chưa có ID, tạo ID ngay
                if (!rowId || rowId === "") {
                    let bookingId = null;
                    if (collectionName === this.COLL.DETAILS) {
                        bookingId = Array.isArray(row) ? row[COL_INDEX.D_BKID] : row.booking_id;

                    }
                    
                    const idResult = await this.generateIds(collectionName, bookingId);
                    if (idResult) {
                        if (Array.isArray(row)) {
                            row[0] = idResult.newId; // Cập nhật array[0]
                        } else {
                            row.id = idResult.newId; // Cập nhật object.id
                        }
                        if (!this.batchCounterUpdates[collectionName] || this.batchCounterUpdates[collectionName]  <= idResult.newNo) this.batchCounterUpdates[collectionName] = idResult.newNo;
                        console.log(`🆔 Pre-generated ID: ${idResult.newId}`);
                    }
                    
                }
                processedData.push(row);
            }
        }

        // ✅ GIAI ĐOẠN 2: SAVE CHI TIẾT VÀO BATCH
        for (const chunk of chunks) {
            const batch = this.db.batch();
            
            chunk.forEach(row => {

                this.saveRecord(collectionName, row, true, batch);
                
                // Nếu là booking_details, lưu để trigger sau
                // Lúc này row chắc chắn đã có ID
                if (collectionName === this.COLL.DETAILS) {
                    detailsForTrigger.push(row);
                }
            });

            try {
                await batch.commit();
                totalSuccess += chunk.length;
                console.log(`📦 Saved chunk: ${chunk.length} items to ${collectionName}`);
                
                // ✅ Cập nhật APP_DATA sau khi batch commit thành công
                chunk.forEach(row => {
                    const dataObj = (typeof row === 'object' && !Array.isArray(row)) 
                        ? row 
                        : arrayToObject(row, collectionName);
                    this._updateAppDataObj(collectionName, dataObj);
                });
            } catch (e) {
                console.error(`❌ Batch Error in ${collectionName}:`, e);
            }
        }
        this.batchCounterUpdates = {};

        // ✅ GIAI ĐOẠN 3: SAU KHI batch commit xong, gọi trigger cho tất cả details
        if (collectionName === this.COLL.DETAILS && detailsForTrigger.length > 0) {

            for (const detailRow of detailsForTrigger) {
                if(typeof detailRow === 'object') detailRow.customer_name = customerName; else detailRow[COL_INDEX.M_CUST] = customerName;
                await this._syncOperatorEntry(detailRow);
            }
            
        }

        return { success: true, count: totalSuccess, data: processedData };
    },

    /**
     * XÓA BẢN GHI
     */
    deleteRecord: async function(collectionName, id) {
        if (!id) return;
        try {
            await this.db.collection(collectionName).doc(String(id)).delete();
            
            // ✅ Xóa khỏi APP_DATA sau khi delete thành công
            this._removeFromAppDataObj(collectionName, id);
            
            // Trigger: Nếu xóa Details -> Cần đánh dấu hoặc xóa Operator Details?
            // Tùy nghiệp vụ: Thường là xóa luôn Operator Entry tương ứng
            if (collectionName === this.COLL.DETAILS) {
                await this.db.collection(this.COLL.OPERATORS).doc(String(id)).delete();
                this._removeFromAppDataObj(this.COLL.OPERATORS, id);
            }
            
            return { success: true , message: "Deleted"};
        } catch (e) {
            logError("❌ Delete Error:", e);
            return { success: false, error: e.message };
        }
    },

    /**
     * XÓA HÀNG LOẠT
     */
    batchDelete: async function(collectionName, idList) {
        const batch = this.db.batch();
        idList.forEach(id => {
            const ref = this.db.collection(collectionName).doc(String(id));
            batch.delete(ref);
            
            // Trigger xóa Operator
            if (collectionName === this.COLL.DETAILS) {
                const operatorRef = this.db.collection(this.COLL.OPERATORS).doc(String(id));
                batch.delete(operatorRef);
            }
        });
        
        try {
            await batch.commit();
            
            // ✅ Xóa khỏi APP_DATA sau khi batch delete thành công
            idList.forEach(id => {
                this._removeFromAppDataObj(collectionName, id);
                
                // Trigger xóa operator khỏi APP_DATA
                if (collectionName === this.COLL.DETAILS) {
                    this._removeFromAppDataObj(this.COLL.OPERATORS, id);
                }
            });
            
            return { success: true };
        } catch (e) {
            console.error("❌ Batch Delete Error:", e);
            return { success: false, error: e.message };
        }
    },
    /**
     * CẬP NHẬT HÀNG LOẠT MỘT FIELD CỦA COLLECTION
     * Lọc tất cả documents có fieldName = oldValue, rồi cập nhật thành newValue
     * @param {string} collectionName - Tên collection (bookings, customers, ...)
     * @param {string} fieldName - Tên field cần cập nhật (VD: status, payment_method)
     * @param {*} oldValue - Giá trị cũ để tìm (VD: "pending", "unpaid")
     * @param {*} newValue - Giá trị mới để cập nhật (VD: "completed", "paid")
     * @returns {Promise<{success: boolean, count: number, message: string}>}
     */
    batchUpdateFieldData: async function(collectionName, fieldName, oldValue, newValue) {
        console.time("⏱ Thời gian cập nhật");
        console.log(`🚀 Bắt đầu cập nhật ${collectionName}.${fieldName}: "${oldValue}" → "${newValue}"`);
    
        try {
            // --- GIAI ĐOẠN 1: KIỂM TRA INPUT ---
            if (!collectionName || !fieldName) {
                throw new Error("❌ Lỗi: collectionName và fieldName không được để trống");
            }
    
            // --- GIAI ĐOẠN 2: TẢI TOÀN BỘ COLLECTION ---
            console.log(`1️⃣ Đang tải collection "${collectionName}"...`);
            const db = DB_MANAGER.db;
            
            if (!db) {
                throw new Error("❌ Firestore DB chưa khởi tạo");
            }
    
            const collSnap = await db.collection(collectionName).get();
            console.log(`📦 Tìm thấy ${collSnap.size} documents. Bắt đầu tìm kiếm...`);
    
            // --- GIAI ĐOẠN 3: XỬ LÝ VÀ GHI BATCH ---
            let batch = db.batch();
            let operationCount = 0;     // Đếm số lệnh trong batch hiện tại
            let totalUpdated = 0;       // Đếm tổng số đã cập nhật
            let totalSkipped = 0;       // Đếm số bỏ qua (không match)
    
            for (const doc of collSnap.docs) {
                const data = doc.data();
                const currentValue = data[fieldName];
    
                // So sánh giá trị (chuẩn hóa để tránh lỗi kiểu dữ liệu)
                const isMatch = (
                    String(currentValue).trim() === String(oldValue).trim()
                );
    
                if (isMatch) {
                    // ==> TÌM THẤY KHỚP!
                    const docRef = db.collection(collectionName).doc(doc.id);
                    const updateObj = {};
                    updateObj[fieldName] = newValue;
                    updateObj.updated_at = firebase.firestore.FieldValue.serverTimestamp();
    
                    batch.update(docRef, updateObj);
                    
                    operationCount++;
                    totalUpdated++;
    
                    console.log(`✅ [${totalUpdated}] ${doc.id}: ${fieldName} = "${newValue}"`);
    
                    // ⚠️ GIỚI HẠN BATCH: Nếu đủ 500 lệnh, bắn lên ngay và tạo túi mới
                    if (operationCount >= 499) {
                        console.log(`🔥 Đang commit batch (${operationCount} dòng)...`);
                        await batch.commit();
                        batch = db.batch();
                        operationCount = 0;
                    }
                } else {
                    totalSkipped++;
                }
            }
    
            // --- GIAI ĐOẠN 4: COMMIT SỐ DƯ CÒN LẠI ---
            if (operationCount > 0) {
                console.log(`🔥 Đang commit batch cuối cùng (${operationCount} dòng)...`);
                await batch.commit();
            }
    
            const result = {
                success: true,
                count: totalUpdated,
                skipped: totalSkipped,
                message: `✅ Hoàn tất! Cập nhật ${totalUpdated} documents, bỏ qua ${totalSkipped}`
            };
    
            console.log(`🎉 ${result.message}`);
            return result;
    
        } catch (error) {
            const errorMsg = `❌ Lỗi: ${error.message}`;
            console.error(errorMsg);
            return {
                success: false,
                count: 0,
                message: errorMsg
            };
        } finally {
            console.timeEnd("⏱ Thời gian cập nhật");
        }
    },
    /**
     * CẬP NHẬT 1 DOCUMENT (Đơn giản)
     * @param {string} collectionName - Tên collection (bookings, customers, ...)
     * @param {string} id - ID của document
     * @param {object} objData - Object dữ liệu cần cập nhật
     * @returns {Promise<{success: boolean, message: string}>}
     */
    updateSingle: async function (collectionName, id, objData) {
        // Kiểm tra input
        if (!collectionName || !id || !objData) {
            console.warn("⚠️ updateDocument: Thiếu tham số (collectionName, id, objData)");
            return { success: false, message: "Missing required parameters" };
        }

        // ✅ Kiểm tra objData có field 'id' chưa
        if (!objData.id || objData.id === "") {
            console.error("❌ updateDocument: objData không có field 'id'");
            return { success: false, message: "objData must have 'id' field" };
        }

        const docRef = this.db.collection(collectionName).doc(String(id));
        
        try {
            // Thêm timestamp cập nhật
            objData.updated_at = firebase.firestore.FieldValue.serverTimestamp();
            
            // Cập nhật lên Firebase
            await docRef.set(objData, { merge: true });
            
            // ✅ Cập nhật APP_DATA
            this._updateAppDataObj(collectionName, objData);
            
            console.log(`✅ Updated ${collectionName}/${id}`);
            return { success: true, message: "Updated successfully" };
        } catch (e) {
            console.error(`❌ updateDocument Error:`, e);
            return { success: false, message: e.message };
        }
    }
};

async function fixMissingCustomerIds() {
    console.time("⏱ Thời gian chạy"); // Bấm giờ
    console.log("🚀 Bắt đầu quy trình vá lỗi dữ liệu...");

    try {
        // --- GIAI ĐOẠN 1: TẠO TỪ ĐIỂN KHÁCH HÀNG (LOOKUP MAP) ---
        console.log("1️⃣ Đang tải danh sách Customers...");
        const custSnap = await db.collection('customers').get();
        
        // Tạo Map: Key là SĐT -> Value là Customer ID
        const phoneToIdMap = {};
        
        custSnap.forEach(doc => {
            const data = doc.data();
            // Giả sử field lưu sđt trong customer là 'phone'
            if (data.phone) {
                // Chuẩn hóa: xóa khoảng trắng, đưa về string để so sánh chính xác
                const cleanPhone = String(data.phone).trim(); 
                phoneToIdMap[cleanPhone] = doc.id;
            }
        });
        
        console.log(`✅ Đã lập chỉ mục xong ${Object.keys(phoneToIdMap).length} khách hàng.`);

        // --- GIAI ĐOẠN 2: TẢI BOOKINGS BỊ LỖI ---
        console.log("2️⃣ Đang tải danh sách Bookings...");
        
        // Chỉ lấy những booking chưa có customer_id (để tiết kiệm)
        // Lưu ý: Nếu field này không tồn tại, query này có thể không chạy được nếu chưa đánh index.
        // Nếu booking ít (< 5000), bạn cứ .get() tất cả về cho lành.
        const bookingSnap = await db.collection('bookings').get();
        
        console.log(`📦 Tìm thấy ${bookingSnap.size} bookings. Bắt đầu xử lý...`);

        // --- GIAI ĐOẠN 3: XỬ LÝ VÀ GHI BATCH (QUAN TRỌNG) ---
        let batch = db.batch();
        let operationCount = 0; // Đếm số lệnh trong batch hiện tại
        let totalUpdated = 0;   // Đếm tổng số đã sửa được

        for (const doc of bookingSnap.docs) {
            const booking = doc.data();
            
            // Bỏ qua nếu đã có customer_id rồi (an toàn)


            const bookingPhone = booking.customer_phone ? String(booking.customer_phone).trim() : null;

            if (bookingPhone && phoneToIdMap[bookingPhone]) {
                // ==> TÌM THẤY KHỚP!
                const customerId = phoneToIdMap[bookingPhone];
                const bookingRef = db.collection('bookings').doc(doc.id);

                // Thêm lệnh update vào túi Batch
                batch.update(bookingRef, { customer_id: customerId });
                
                operationCount++;
                totalUpdated++;

                // ⚠️ GIỚI HẠN BATCH: Nếu đủ 500 lệnh, bắn lên ngay và tạo túi mới
                if (operationCount >= 499) {
                    console.log(`🔥 Đang commit batch ${operationCount} dòng...`);
                    await batch.commit();
                    batch = db.batch(); // Reset túi mới
                    operationCount = 0; // Reset đếm
                }
            } else {
                // Log cảnh báo những booking không tìm thấy khách (do sđt sai hoặc khách chưa tạo)
                console.warn(`⚠️ Bỏ qua Booking ${doc.id}: Không tìm thấy khách có SĐT ${bookingPhone}`);
            }
        }

        // --- GIAI ĐOẠN 4: COMMIT SỐ DƯ CÒN LẠI ---
        if (operationCount > 0) {
            console.log(`🔥 Đang commit batch cuối cùng (${operationCount} dòng)...`);
            await batch.commit();
        }

        console.log(`🎉 HOÀN TẤT! Tổng cộng đã sửa: ${totalUpdated} bookings.`);

    } catch (error) {
        console.error("❌ Lỗi nghiêm trọng:", error);
    } finally {
        console.timeEnd("⏱ Thời gian chạy");
    }
}


window.fixMissingCustomerIds = fixMissingCustomerIds;

export default DB_MANAGER;

