/**
 * SALES MODULE CONFIGURATION
 * Chuẩn hóa 100% theo V1 FIELD_MAP & COL_INDEX
 */

export const SALES_CONFIG = {
    // A. CẤU HÌNH HIỂN THỊ TRÊN DASHBOARD (Bảng danh sách bên ngoài)
    DASHBOARD_SCHEMA: {
        bookings: [
            { key: 'id', title: 'Mã BK', type: 'text', width: '80px', class: 'fw-bold text-primary', align: 'text-center' },
            { key: 'customer_name', title: 'Khách Hàng', type: 'text', class: 'fw-bold' },
            { key: 'start_date', title: 'Ngày Đi', type: 'date', align: 'text-center' },
            { key: 'total_amount', title: 'Tổng Tiền', type: 'money', align: 'text-end', class: 'fw-bold' },
            { key: 'balance_amount', title: 'Còn Lại', type: 'money', align: 'text-end', class: 'text-danger fw-bold' },
            { key: 'status', title: 'Trạng Thái', type: 'badge', align: 'text-center' },
            { key: 'staff_id', title: 'Sale', type: 'text', hidden: true }
        ],
        customers: [
            { key: 'id', title: 'Mã KH', type: 'text', width: '80px', align: 'text-center' },
            { key: 'full_name', title: 'Họ Tên', type: 'text', class: 'fw-bold text-primary' },
            { key: 'phone', title: 'SĐT', type: 'phone', align: 'text-center' },
            { key: 'email', title: 'Email', type: 'text', hidden: true },
            { key: 'source', title: 'Nguồn', type: 'text', align: 'text-center' },
            { key: 'total_spend', title: 'Tổng Chi', type: 'money', align: 'text-end' }
        ]
    },

    // B. CẤU HÌNH DỮ LIỆU & FORM (Dùng để validate và render bảng nhập liệu chi tiết)
    FIELDS: {
        bookings: {
            id: { type: 'string' },
            created_at: { type: 'datetime' },
            customer_id: { type: 'string' },
            customer_name: { type: 'string', required: true },
            customer_phone: { type: 'phone', required: true },
            start_date: { type: 'date', required: true }, // M_START
            end_date: { type: 'date' }, // M_END
            adults: { type: 'number', default: 1 }, // M_ADULT
            children: { type: 'number', default: 0 }, // M_CHILD
            total_amount: { type: 'money', default: 0 },
            deposit_amount: { type: 'money', default: 0 },
            balance_amount: { type: 'money', default: 0 },
            payment_type: { type: 'string' },
            payment_due_date: { type: 'date' },
            status: { type: 'string', default: 'Mới' },
            note: { type: 'text' },
            staff_id: { type: 'string' }
        },
        
        // CHI TIẾT DỊCH VỤ (Full Fields V1)
        booking_details: {
            id: { type: 'string' },
            booking_id: { type: 'string' },
            service_type: { type: 'string', default: 'Tour' }, // D_TYPE
            hotel_name: { type: 'string' }, // D_HOTEL (Quan trọng)
            service_name: { type: 'string', required: true }, // D_SERVICE
            check_in: { type: 'date' }, // D_IN
            check_out: { type: 'date' }, // D_OUT
            nights: { type: 'number', default: 0 }, // D_NIGHT
            quantity: { type: 'number', default: 1 }, // D_QTY (Số lượng / Người lớn)
            unit_price: { type: 'money', default: 0 }, // D_PRICE
            child_qty: { type: 'number', default: 0 }, // D_CHILD (SL Trẻ em)
            child_price: { type: 'money', default: 0 }, // D_PRICEC (Giá trẻ em)
            surcharge: { type: 'money', default: 0 }, // D_SUR
            discount: { type: 'money', default: 0 }, // D_DISC
            total: { type: 'money', default: 0 }, // D_TOTAL
            ref_code: { type: 'string' }, // D_CODE
            note: { type: 'text' } // D_NOTE
        },

        customers: {
            id: { type: 'string' },
            full_name: { type: 'string', required: true }, // C_NAME
            phone: { type: 'phone', required: true }, // C_PHONE
            dob: { type: 'date' }, // C_DOB
            id_card: { type: 'string' }, // C_CCCD
            id_card_date: { type: 'date' }, // C_CCCDDATE
            address: { type: 'string' }, // C_ADDRESS
            email: { type: 'string' }, // C_MAIL
            source: { type: 'string' }, // C_SOURCE
            total_spend: { type: 'money', default: 0 },
            created_at: { type: 'datetime' }
        }
    }
};