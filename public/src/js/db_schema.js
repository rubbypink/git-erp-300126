// 1. MAPPING SCHEMA (Phải khớp với Server GAS)
const COL_INDEX = {
    // BOOKINGS
    M_ID: 0, M_CUSTID: 1, M_CUST: 2, M_PHONE: 3, M_START: 4, M_END: 5, 
    M_ADULT: 6, M_CHILD: 7, M_TOTAL: 8, M_DEPOSIT: 9, M_BALANCE: 10,M_PAYTYPE: 11, M_PAYDUE: 12, 
    M_NOTE: 13, M_STAFF: 14, M_STATUS: 15, M_CREATED: 16,

    // DETAILS
    D_SID: 0, D_BKID: 1, D_TYPE: 2, D_HOTEL: 3, D_SERVICE: 4, D_IN: 5, D_OUT: 6, 
    D_NIGHT: 7, D_QTY: 8, D_PRICE: 9, D_CHILD: 10, D_PRICEC: 11, D_SUR: 12, D_DISC: 13, 
    D_TOTAL: 14, D_CODE: 15, D_NOTE: 16,

    // OPERATORS
    OP_SID: 0, OP_BKID: 1, OP_CUST: 2, OP_TYPE: 3, OP_HOTEL: 4, OP_SERVICE: 5, 
    OP_IN: 6, OP_OUT: 7, OP_NIGHT: 8, OP_QTY: 9, OP_COSTA: 10, OP_CHILD: 11, 
    OP_COSTC: 12, OP_SUR: 13, OP_DISC: 14, OP_TOTALSALE: 15, OP_CODE: 16, 
    OP_TOTALCOST: 17, OP_PAID: 18, OP_BALANCE: 19, OP_SUPPLIER: 20, OP_NOTE: 21, 
    
    // CUSTOMERS
    C_ID: 0, C_NAME: 1, C_DOB: 2, C_CCCD: 3, 
    C_CCCDDATE: 4, C_ADDRESS: 5, C_PHONE: 6,  C_MAIL: 7, C_SOURCE: 8, C_TOTALSPEND: 9, C_CREATED: 10,
    // USERS (Mới bổ sung để lấy Header)
    U_UID: 0, U_ACCOUNT: 1, U_NAME: 2, U_PHONE: 3, U_EMAIL: 4, U_ROLE: 5, 
    U_LEVEL: 6, U_GROUP: 7, U_CREATED: 8
};

const FIELD_MAP = {
    bookings: {
        [COL_INDEX.M_ID]: 'id', [COL_INDEX.M_CREATED]: 'created_at', [COL_INDEX.M_CUSTID]: 'customer_id', 
        [COL_INDEX.M_CUST]: 'customer_name', [COL_INDEX.M_PHONE]: 'customer_phone', 
        [COL_INDEX.M_START]: 'start_date', [COL_INDEX.M_END]: 'end_date', [COL_INDEX.M_ADULT]: 'adults', 
        [COL_INDEX.M_CHILD]: 'children', [COL_INDEX.M_TOTAL]: 'total_amount', [COL_INDEX.M_STATUS]: 'status', 
        [COL_INDEX.M_PAYTYPE]: 'payment_method', [COL_INDEX.M_PAYDUE]: 'payment_due_date', 
        [COL_INDEX.M_DEPOSIT]: 'deposit_amount', [COL_INDEX.M_BALANCE]: 'balance_amount', 
        [COL_INDEX.M_NOTE]: 'note', [COL_INDEX.M_STAFF]: 'staff_id'
    },
    booking_details: {
        [COL_INDEX.D_SID]: 'id', [COL_INDEX.D_BKID]: 'booking_id', [COL_INDEX.D_TYPE]: 'service_type', 
        [COL_INDEX.D_HOTEL]: 'hotel_name', [COL_INDEX.D_SERVICE]: 'service_name', [COL_INDEX.D_IN]: 'check_in', 
        [COL_INDEX.D_OUT]: 'check_out', [COL_INDEX.D_NIGHT]: 'nights', [COL_INDEX.D_QTY]: 'quantity', 
        [COL_INDEX.D_PRICE]: 'unit_price', [COL_INDEX.D_CHILD]: 'child_qty', [COL_INDEX.D_PRICEC]: 'child_price', 
        [COL_INDEX.D_SUR]: 'surcharge', [COL_INDEX.D_DISC]: 'discount', [COL_INDEX.D_TOTAL]: 'total', 
        [COL_INDEX.D_CODE]: 'ref_code', [COL_INDEX.D_NOTE]: 'note'
    },
    operator_entries: {
        [COL_INDEX.OP_SID]: 'id', [COL_INDEX.OP_BKID]: 'booking_id', [COL_INDEX.OP_CUST]: 'customer_name',
        [COL_INDEX.OP_TYPE]: 'service_type', [COL_INDEX.OP_HOTEL]: 'hotel_name', [COL_INDEX.OP_SERVICE]: 'service_name',
        [COL_INDEX.OP_IN]: 'check_in', [COL_INDEX.OP_OUT]: 'check_out', [COL_INDEX.OP_NIGHT]: 'nights',
        [COL_INDEX.OP_QTY]: 'adults', [COL_INDEX.OP_COSTA]: 'cost_adult', [COL_INDEX.OP_CHILD]: 'children', [COL_INDEX.OP_COSTC]: 'cost_child', 
        [COL_INDEX.OP_SUR]: 'surcharge', [COL_INDEX.OP_DISC]: 'discount', [COL_INDEX.OP_TOTALSALE]: 'total_sale',
        [COL_INDEX.OP_CODE]: 'ref_code', [COL_INDEX.OP_TOTALCOST]: 'total_cost',
        [COL_INDEX.OP_PAID]: 'paid_amount', [COL_INDEX.OP_BALANCE]: 'debt_balance',
        [COL_INDEX.OP_SUPPLIER]: 'supplier', [COL_INDEX.OP_NOTE]: 'operator_note'
    },
    customers: {
        [COL_INDEX.C_ID]: 'id', [COL_INDEX.C_NAME]: 'full_name',
        [COL_INDEX.C_DOB]: 'dob', [COL_INDEX.C_CCCD]: 'id_card', [COL_INDEX.C_CCCDDATE]: 'id_card_date',
        [COL_INDEX.C_ADDRESS]: 'address',  [COL_INDEX.C_PHONE]: 'phone', [COL_INDEX.C_MAIL]: 'email', 
        [COL_INDEX.C_SOURCE]: 'source', [COL_INDEX.C_TOTALSPEND]: 'total_spend', [COL_INDEX.C_CREATED]: 'created_at'
    },
    // USERS (Schema)
    users: {
        [COL_INDEX.U_UID]: 'uid', [COL_INDEX.U_ACCOUNT]: 'account', [COL_INDEX.U_NAME]: 'user_name',
        [COL_INDEX.U_PHONE]: 'user_phone', [COL_INDEX.U_EMAIL]: 'email', [COL_INDEX.U_ROLE]: 'role',
        [COL_INDEX.U_LEVEL]: 'level', [COL_INDEX.U_GROUP]: 'group', [COL_INDEX.U_CREATED]: 'created_at'
    },
    hotels: {
        0: 'id',
        1: 'name',
        2: 'address',
        3: 'phone',
        4: 'email',
        5: 'website',
        6: 'star',
        7: 'pictures',
        8: 'rooms'
    },
    suppliers: {
        0: 'id',
        1: 'name',
        2: 'phone',
        3: 'email',
        4: 'address',
        5: 'VAT_code',
        6: 'bank_account',
        7: 'bank_name',
        8: 'contact_person',
        9: 'dept_balance'
    }
};

// --- HELPERS (Giữ nguyên logic cũ) ---
function arrayToObject(arrData, collectionName) {
    const map = FIELD_MAP[collectionName];
    if (!map) return {};
    const obj = {};
    Object.keys(map).forEach(index => {
        let val = arrData[index];
        if (val === undefined || val === null) val = "";
        if (val instanceof Date) val = val.toISOString().split('T')[0];
        obj[map[index]] = val;
    });
    return obj;
}

function objectToArray(objData, collectionName) {
    const map = FIELD_MAP[collectionName];
    if (!map) return [];
    const maxIndex = Math.max(...Object.keys(map).map(Number));
    const arr = new Array(maxIndex + 1).fill("");
    
    Object.keys(map).forEach(index => {
        const key = map[index];
        arr[index] = objData[key] !== undefined ? objData[key] : "";
    });
    return arr;
}

function getHeader(collectionName) {
    let map;
    if (typeof collectionName === 'object') {
         map = collectionName;
    } else {
        map = FIELD_MAP[collectionName];
        if (!map) return {};
    }
    if (!map) return [];
    const maxIdx = Math.max(...Object.keys(map).map(Number));
    const arr = new Array(maxIdx + 1).fill("");
    for (let idx in map) arr[idx] = map[idx];
    return arr;
}

// =====================================================================
// NEW: OBJECT-BASED SCHEMA HELPERS (For modern object-centric approach)
// =====================================================================

/**
 * Reverse mapping: Field name → Index position (for quick lookups)
 * Usage: REVERSE_FIELD_MAP['bookings']['customer_name'] → 4
 */
const REVERSE_FIELD_MAP = {};
Object.entries(FIELD_MAP).forEach(([collectionName, fieldMap]) => {
    REVERSE_FIELD_MAP[collectionName] = {};
    Object.entries(fieldMap).forEach(([idx, fieldName]) => {
        REVERSE_FIELD_MAP[collectionName][fieldName] = Number(idx);
    });
});

/**
 * Get field name by index (Reverse of map lookup)
 * Usage: getFieldName('bookings', 4) → 'customer_name'
 */
function getFieldName(collectionName, index) {
    const map = FIELD_MAP[collectionName];
    return map ? map[index] : null;
}

/**
 * Get index by field name
 * Usage: getFieldIndex('bookings', 'customer_name') → 4
 */
function getFieldIndex(collectionName, fieldName) {
    return REVERSE_FIELD_MAP[collectionName] ? REVERSE_FIELD_MAP[collectionName][fieldName] : -1;
}

/**
 * Convert Firestore object to user-friendly object with display names
 * Usage: objectToDisplay(firestoreObj, 'bookings') → { id, customer_name, start_date, ... }
 */
function objectToDisplay(objData, collectionName) {
    if (!objData) return {};
    const map = FIELD_MAP[collectionName];
    if (!map) return objData;
    
    const displayObj = {};
    Object.entries(map).forEach(([idx, fieldName]) => {
        displayObj[fieldName] = objData[fieldName] !== undefined ? objData[fieldName] : "";
    });
    return displayObj;
}

/**
 * Get all field names for a collection
 * Usage: getFieldNames('bookings') → ['id', 'created_at', 'customer_id', ...]
 */
function getFieldNames(collectionName) {
    const map = FIELD_MAP[collectionName];
    if (!map) return [];
    return Object.values(map);
}

/**
 * Create header row for grid display from field names
 * Usage: createHeaderFromFields('bookings') → { id: 'ID', customer_name: 'Tên Khách', ... }
 */
function createHeaderFromFields(collectionName) {
    const fieldNames = getFieldNames(collectionName);
    const headerObj = {};
    fieldNames.forEach(field => {
        headerObj[field] = field; // Will be translated by UI layer
    });
    return headerObj;
}
