/** Comprehensive field metadata schema for all collections */

export const DB_SCHEMA = {
    bookings: {
        displayNameEng: 'Booking',
        displayName: 'Booking',
        primaryKey: 'id',
        fields: [
            {
                index: 0,
                name: 'id',
                displayNameEng: 'Booking ID',
                displayName: 'Mã Booking',
                type: 'text',
                tag: 'input',
                attrs: ['readonly'],
                class: 'fw-bold text-danger',
                validation: {
                    required: true,
                    pattern: '^1\\d{4,}$',
                },
                placeholder: 'Auto-generated',
            },
            {
                index: 1,
                name: 'customer_id',
                displayNameEng: 'Customer ID',
                displayName: 'Mã Khách',
                type: 'text',
                tag: 'input',
                attrs: [],
                class: 'd-none',
                placeholder: '',
                foreignKey: 'customers',
                foreignKeyDisplay: 'full_name',
            },
            {
                index: 2,
                name: 'customer_full_name',
                displayNameEng: 'Customer Name',
                displayName: 'Khách Hàng',
                type: 'text',
                tag: 'input',
                attrs: ['required'],
                class: '',
                placeholder: 'Họ tên khách',
                validation: {
                    required: true,
                    minLength: 2,
                    maxLength: 100,
                },
            },
            {
                index: 3,
                name: 'customer_phone',
                displayNameEng: 'Customer Phone',
                displayName: 'Số Điện Thoại',
                type: 'phone',
                tag: 'input',
                attrs: ['required'],
                class: 'phone',
                placeholder: '0xxx-xxx-xxx',
                validation: {
                    required: true,
                    pattern: '^0\\d{9,}$',
                    minLength: 9,
                    maxLength: 15,
                },
            },
            {
                index: 4,
                name: 'start_date',
                displayNameEng: 'Start Date',
                displayName: 'Ngày Đi',
                type: 'date',
                tag: 'input',
                attrs: [],
                class: 'border-primary',
                validation: {
                    required: true,
                },
            },
            {
                index: 5,
                name: 'end_date',
                displayNameEng: 'End Date',
                displayName: 'Ngày Về',
                type: 'date',
                tag: 'input',
                attrs: [],
                class: 'border-primary',
                validation: {
                    required: true,
                },
            },
            {
                index: 6,
                name: 'adults',
                displayNameEng: 'Adult Quantity',
                displayName: 'Ng Lớn',
                type: 'number',
                tag: 'input',
                attrs: [],
                class: 'number',
                validation: {
                    required: true,
                    min: 1,
                    max: 100,
                },
                initial: 1,
            },
            {
                index: 7,
                name: 'children',
                displayNameEng: 'Child Quantity',
                displayName: 'Trẻ Em',
                type: 'number',
                tag: 'input',
                attrs: [],
                class: 'number',
                validation: {
                    min: 0,
                    max: 50,
                },
                initial: 0,
            },
            {
                index: 8,
                name: 'total_amount',
                displayNameEng: 'Total Booking Amount',
                displayName: 'Tổng Booking',
                type: 'text',
                tag: 'input',
                attrs: ['readonly'],
                class: 'fw-bold text-end bg-warning number',
                validation: {
                    min: 0,
                },
                initial: '0',
            },
            {
                index: 9,
                name: 'deposit_amount',
                displayNameEng: 'Deposit Amount',
                displayName: 'Đặt Cọc',
                type: 'text',
                tag: 'input',
                attrs: ['readonly'],
                class: 'text-end border-success number',
                validation: {
                    min: 0,
                },
                initial: '0',
            },
            {
                index: 10,
                name: 'balance_amount',
                displayNameEng: 'Balance Amount',
                displayName: 'Còn Lại',
                type: 'text',
                tag: 'input',
                attrs: ['readonly'],
                class: 'text-end fw-bold text-danger number',
                validation: {
                    min: 0,
                },
                initial: '0',
            },
            {
                index: 11,
                name: 'payment_method',
                displayNameEng: 'Payment Method',
                displayName: 'Loại TT',
                type: 'select',
                tag: 'select',
                attrs: [],
                class: '',
                options: ['TM', 'CK CN', 'CK CT', 'Công Nợ', 'Thẻ tín dụng'],
                dataSource: 'APP_DATA.lists.payment',
            },
            {
                index: 12,
                name: 'payment_due_date',
                displayNameEng: 'Payment Due Date',
                displayName: 'Hạn TT',
                type: 'date',
                tag: 'input',
                attrs: [],
                class: '',
                validation: {},
            },
            {
                index: 13,
                name: 'note',
                displayNameEng: 'Booking Note',
                displayName: 'Ghi chú',
                type: 'textarea',
                tag: 'textarea',
                attrs: [],
                class: '',
                placeholder: 'Ghi chú thêm...',
                validation: {
                    maxLength: 1000,
                },
            },
            {
                index: 14,
                name: 'staff_id',
                displayNameEng: 'Staff ID',
                displayName: 'Nhân viên',
                type: 'select',
                tag: 'select',
                attrs: [],
                class: '',
                foreignKey: 'users',
                foreignKeyDisplay: 'user_name',
                dataSource: 'APP_DATA.lists.staff',
            },
            {
                index: 15,
                name: 'status',
                displayNameEng: 'Status',
                displayName: 'Trạng thái',
                type: 'select',
                tag: 'select',
                attrs: ['readonly'],
                class: 'fw-bold bg-warning bg-opacity-25',
                options: ['Đặt Lịch', 'Xác Nhận', 'Thanh Toán', 'Xong BK', 'Hủy'],
                initial: 'Đặt Lịch',
                dataSource: 'APP_DATA.lists.status',
            },
            {
                index: 16,
                name: 'note_internal',
                displayNameEng: 'Internal Note',
                displayName: 'Ghi chú nội bộ',
                type: 'text',
                tag: 'input',
                attrs: [],
                class: '',
                placeholder: 'Ghi chú thêm...',
                validation: {
                    maxLength: 1000,
                },
            },
            {
                index: 17,
                name: 'history',
                displayNameEng: 'History Log',
                displayName: 'Lịch sử',
                type: 'text',
                tag: 'input',
                attrs: ['readonly'],
                class: 'text-break text-nowrap',
            },
            {
                index: 18,
                name: 'created_at',
                displayNameEng: 'Created Date',
                displayName: 'Ngày Đặt',
                type: 'date',
                tag: 'input',
                attrs: ['readonly'],
                class: '',
                initial: 'today',
            },
        ],
        aggregate: {
            sum: ['total_amount', 'deposit_amount', 'balance_amount', 'adults', 'children'],
            unique: ['customer_name', 'id'],
        },
        index: ['created_at', 'start_date', 'status'],
        foreignKeys: ['customer_id', 'staff_id'],
    },

    booking_details: {
        displayNameEng: 'Booking Detail',
        displayName: 'Chi tiết dịch vụ',
        primaryKey: 'id',
        fields: [
            {
                index: 0,
                name: 'id',
                displayNameEng: 'Detail ID',
                displayName: 'ID DV',
                type: 'text',
                tag: 'input',
                attrs: ['readonly'],
                class: 'd-sid',
                placeholder: 'Auto-generated',
            },
            {
                index: 1,
                name: 'booking_id',
                displayNameEng: 'Booking ID',
                displayName: 'Mã Booking',
                type: 'text',
                tag: 'input',
                attrs: ['hidden'],
                class: 'd-bkid',
                placeholder: '',
                foreignKey: 'bookings',
                foreignKeyDisplay: 'id',
            },
            {
                index: 2,
                name: 'service_type',
                displayNameEng: 'Service Type',
                displayName: 'Loại DV',
                type: 'select',
                tag: 'select',
                attrs: [],
                class: 'd-type',
                dataSource: 'APP_DATA.lists.types',
                validation: {
                    required: true,
                },

                onchange: 'SalesModule.UI.onTypeChange',
            },
            {
                index: 3,
                name: 'hotel_name',
                displayNameEng: 'Hotel/Location',
                displayName: 'Khách sạn',
                type: 'select',
                tag: 'select',
                attrs: [],
                class: 'd-hotel',
                validation: {
                    required: true,
                },
                dataSource: 'hotels',
                description: 'Extracted from lists.hotelMatrix[col0] + lists.locOther',
                onchange: 'SalesModule.UI.updateServiceSelect',
                foreignKey: 'hotels',
                foreignKeyDisplay: 'name',
            },
            {
                index: 4,
                name: 'service_name',
                displayNameEng: 'Service Name',
                displayName: 'Tên DV/Phòng',
                type: 'select',
                tag: 'select',
                attrs: [],
                class: 'd-service',
                validation: {
                    required: true,
                },
                dataSource: 'APP_DATA.lists.services',
                dependsOn: ['service_type', 'hotel_name'],
                description: 'Depends on service_type and hotel_name - if Phòng: use hotelMatrix[hotel].slice(2), else use serviceMatrix',
            },
            {
                index: 5,
                name: 'check_in',
                displayNameEng: 'Check-in',
                displayName: 'Ngày Đi',
                type: 'date',
                tag: 'input',
                attrs: [],
                class: 'd-in',
                event: {
                    change: 'SalesModule.Logic.autoSetOrCalcDate',
                },
            },
            {
                index: 6,
                name: 'check_out',
                displayNameEng: 'Check-out',
                displayName: 'Ngày Về',
                type: 'date',
                tag: 'input',
                attrs: [],
                class: 'd-out',
            },
            {
                index: 7,
                name: 'nights',
                displayNameEng: 'Number of Nights',
                displayName: 'Đêm',
                type: 'number',
                tag: 'input',
                attrs: ['readonly'],
                class: 'd-nights number',
                validation: {
                    min: 0,
                },
            },
            {
                index: 8,
                name: 'quantity',
                displayNameEng: 'Quantity',
                displayName: 'SL',
                type: 'number',
                tag: 'input',
                attrs: [],
                class: 'd-qty number',
                validation: {
                    min: 0,
                },
            },
            {
                index: 9,
                name: 'unit_price',
                displayNameEng: 'Unit Price',
                displayName: 'Đơn Giá',
                type: 'text',
                tag: 'input',
                attrs: [],
                class: 'd-price number',
                validation: {
                    format: 'number',
                },
            },
            {
                index: 10,
                name: 'child_qty',
                displayNameEng: 'Child Quantity',
                displayName: 'SL TE',
                type: 'number',
                tag: 'input',
                attrs: [],
                class: 'd-qtyC number',
                validation: {
                    format: 'number',
                },
            },
            {
                index: 11,
                name: 'child_price',
                displayNameEng: 'Child Price',
                displayName: 'Giá TE',
                type: 'text',
                tag: 'input',
                attrs: [],
                class: 'd-priceC number',
            },
            {
                index: 12,
                name: 'surcharge',
                displayNameEng: 'Surcharge',
                displayName: 'Phụ thu',
                type: 'text',
                tag: 'input',
                attrs: [],
                class: 'd-sur number',
                initial: '0',
            },
            {
                index: 13,
                name: 'discount',
                displayNameEng: 'Discount',
                displayName: 'Giảm',
                type: 'text',
                tag: 'input',
                attrs: [],
                class: 'd-disc number',
                initial: '0',
            },
            {
                index: 14,
                name: 'total',
                displayNameEng: 'Total Amount',
                displayName: 'Thành Tiền',
                type: 'text',
                tag: 'input',
                attrs: ['readonly'],
                class: 'd-total text-primary number',
                initial: '0',
            },
            {
                index: 15,
                name: 'ref_code',
                displayNameEng: 'Reference Code',
                displayName: 'Mã Code',
                type: 'text',
                tag: 'input',
                attrs: [],
                class: 'd-code',
            },
            {
                index: 16,
                name: 'note',
                displayNameEng: 'Note',
                displayName: 'Ghi chú',
                type: 'textarea',
                tag: 'textarea',
                attrs: [],
                class: 'd-note',
            },
        ],
        aggregate: {
            sum: ['total', 'quantity', 'child_qty', 'surcharge'],
            unique: ['id', 'hotel_name', 'service_name'],
        },
        index: ['booking_id', 'start_date', 'service_name', 'service_type'],
        foreignKeys: ['hotel_name', 'booking_id'],
    },

    operator_entries: {
        displayNameEng: 'Operator Entry',
        displayName: 'Chi phí Giá Vốn',
        primaryKey: 'id',
        fields: [
            {
                index: 0,
                name: 'id',
                displayNameEng: 'Entry ID',
                displayName: 'Mã SP',
                type: 'text',
                tag: 'input',
                attrs: ['readonly'],
                class: 'd-sid',
                placeholder: 'Auto-generated',
            },
            {
                index: 1,
                name: 'booking_id',
                displayNameEng: 'Booking ID',
                displayName: 'Mã Booking',
                type: 'text',
                tag: 'input',
                attrs: ['hidden'],
                class: 'd-idbk',
            },
            {
                index: 2,
                name: 'customer_full_name',
                displayNameEng: 'Customer Name',
                displayName: 'Khách hàng',
                type: 'text',
                tag: 'input',
                attrs: ['readonly'],
                class: 'd-cust',
            },
            {
                index: 3,
                name: 'service_type',
                displayNameEng: 'Service Type',
                displayName: 'Loại DV',
                type: 'select',
                tag: 'select',
                attrs: ['readonly'],
                class: 'd-type',
                dataSource: 'APP_DATA.lists.types',
                options: ['Phòng', 'Vé MB', 'Vé Tàu', 'Ăn'],
                validation: {
                    required: true,
                },
            },
            {
                index: 4,
                name: 'hotel_name',
                displayNameEng: 'Hotel/Location',
                displayName: 'Khách sạn',
                type: 'select',
                tag: 'select',
                attrs: ['readonly'],
                class: 'd-loc',
                dataSource: 'hotels',
                description: 'Extracted from lists.hotelMatrix[col0] + lists.locOther',
            },
            {
                index: 5,
                name: 'service_name',
                displayNameEng: 'Service Name',
                displayName: 'Tên DV',
                type: 'select',
                tag: 'select',
                attrs: ['readonly'],
                class: 'd-name',
                dataSource: 'APP_DATA.lists.servcies',
                dependsOn: ['service_type', 'hotel_name'],
                description: 'Depends on service_type and hotel_name',
            },
            {
                index: 6,
                name: 'check_in',
                displayNameEng: 'Check-in Date',
                displayName: 'Check In',
                type: 'date',
                tag: 'input',
                attrs: ['readonly'],
                class: 'd-in',
            },
            {
                index: 7,
                name: 'check_out',
                displayNameEng: 'Check-out Date',
                displayName: 'Check Out',
                type: 'date',
                tag: 'input',
                attrs: ['readonly'],
                class: 'd-out',
            },
            {
                index: 8,
                name: 'nights',
                displayNameEng: 'Number of Nights',
                displayName: 'Đêm',
                type: 'number',
                tag: 'input',
                attrs: ['readonly'],
                class: 'd-night',
                validation: {
                    min: 0,
                },
            },
            {
                index: 9,
                name: 'adults',
                displayNameEng: 'Adult Quantity',
                displayName: 'SL',
                type: 'number',
                tag: 'input',
                attrs: [],
                class: 'd-qty number',
                validation: {
                    min: 1,
                },
            },
            {
                index: 10,
                name: 'cost_adult',
                displayNameEng: 'Adult Cost',
                displayName: 'Giá Vốn',
                type: 'text',
                tag: 'input',
                attrs: [],
                class: 'd-costA bg-warning bg-opacity-10 number',
                validation: {
                    min: 0,
                },
            },
            {
                index: 11,
                name: 'children',
                displayNameEng: 'Child Quantity',
                displayName: 'SL TE',
                type: 'text',
                tag: 'input',
                attrs: [],
                class: 'd-qtyC number',
                validation: {
                    min: 0,
                },
            },
            {
                index: 12,
                name: 'cost_child',
                displayNameEng: 'Child Cost',
                displayName: 'Giá Vốn TE',
                type: 'text',
                tag: 'input',
                attrs: [],
                class: 'd-costC bg-warning bg-opacity-10 number',
            },
            {
                index: 13,
                name: 'surcharge',
                displayNameEng: 'Surcharge',
                displayName: 'Phụ thu',
                type: 'text',
                tag: 'input',
                attrs: [],
                class: 'd-sur number',
                initial: '0',
            },
            {
                index: 14,
                name: 'discount',
                displayNameEng: 'Discount',
                displayName: 'Giảm Giá',
                type: 'text',
                tag: 'input',
                attrs: [],
                class: 'd-disc number',
                initial: '0',
            },
            {
                index: 15,
                name: 'total_sale',
                displayNameEng: 'Total Sale',
                displayName: 'Doanh Thu',
                type: 'text',
                tag: 'input',
                attrs: ['readonly'],
                class: 'd-totalSales text-primary number',
            },
            {
                index: 16,
                name: 'ref_code',
                displayNameEng: 'Reference Code',
                displayName: 'Code DV',
                type: 'text',
                tag: 'input',
                attrs: [],
                class: 'd-code',
            },
            {
                index: 17,
                name: 'total_cost',
                displayNameEng: 'Total Cost',
                displayName: 'Tổng Chi Phí',
                type: 'text',
                tag: 'input',
                attrs: ['readonly'],
                class: 'd-totalCost bg-danger bg-opacity-10 number',
            },
            {
                index: 18,
                name: 'paid_amount',
                displayNameEng: 'Paid Amount',
                displayName: 'Đã TT',
                type: 'text',
                tag: 'input',
                attrs: [],
                class: 'd-paid text-success number',
            },
            {
                index: 19,
                name: 'debt_balance',
                displayNameEng: 'Debt Balance',
                displayName: 'Còn Lại',
                type: 'text',
                tag: 'input',
                attrs: ['readonly'],
                class: 'd-remain text-danger number',
            },
            {
                index: 20,
                name: 'supplier',
                displayNameEng: 'Supplier',
                displayName: 'NCC',
                type: 'select',
                tag: 'select',
                attrs: [],
                class: 'd-supplier',
                dataSource: 'suppliers',
                foreignKey: 'suppliers',
                foreignKeyDisplay: 'name',
            },
            {
                index: 21,
                name: 'operator_note',
                displayNameEng: 'Operator Note',
                displayName: 'Ghi chú',
                type: 'textarea',
                tag: 'textarea',
                attrs: [],
                class: 'd-note',
            },
        ],
        aggregate: {
            sum: ['total_sales', 'total_cost', 'adults', 'children', 'discount', 'surcharge', 'paid_amount', 'debt_balance'],
            unique: ['id', 'hotel_name', 'service_name', 'supplier'],
        },
        index: ['created_at', 'booking_id', 'service_name', 'service_type', 'supplier', 'debt_balance'],
        foreignKeys: ['hotel_name', 'booking_id', 'supplier'],
    },

    customers: {
        displayNameEng: 'Customer',
        displayName: 'Khách hàng',
        primaryKey: 'id',
        fields: [
            {
                index: 0,
                name: 'id',
                displayNameEng: 'Customer ID',
                displayName: 'ID Khách',
                type: 'text',
                tag: 'input',
                attrs: ['readonly'],
                class: 'fw-bold text-danger',
                placeholder: 'Auto-generated',
            },
            {
                index: 1,
                name: 'full_name',
                displayNameEng: 'Full Name',
                displayName: 'Họ và Tên',
                type: 'text',
                tag: 'input',
                attrs: ['required'],
                class: '',
                placeholder: 'Họ và tên',
                validation: {
                    required: true,
                    minLength: 2,
                    maxLength: 100,
                },
            },
            {
                index: 2,
                name: 'dob',
                displayNameEng: 'Date of Birth',
                displayName: 'Ngày Sinh',
                type: 'date',
                tag: 'input',
                attrs: [],
                class: '',
            },
            {
                index: 3,
                name: 'id_card',
                displayNameEng: 'ID Card Number',
                displayName: 'Số CCCD/Passport',
                type: 'text',
                tag: 'input',
                attrs: [],
                class: '',
                placeholder: '012345678901',
            },
            {
                index: 4,
                name: 'id_card_date',
                displayNameEng: 'ID Card Issue Date',
                displayName: 'Ngày Cấp',
                type: 'date',
                tag: 'input',
                attrs: [],
                class: '',
            },
            {
                index: 5,
                name: 'address',
                displayNameEng: 'Address',
                displayName: 'Địa chỉ',
                type: 'textarea',
                tag: 'textarea',
                attrs: [],
                class: '',
                placeholder: 'Số nhà, đường, phường, quận...',
                validation: {
                    maxLength: 500,
                },
            },
            {
                index: 6,
                name: 'phone',
                displayNameEng: 'Phone Number',
                displayName: 'Số Điện Thoại',
                type: 'phone',
                tag: 'input',
                attrs: ['required'],
                class: 'phone_number',
                placeholder: '0xxx-xxx-xxx',
                validation: {
                    required: true,
                    pattern: '^0\\d{8,}$',
                },
            },
            {
                index: 7,
                name: 'email',
                displayNameEng: 'Email',
                displayName: 'Email',
                type: 'email',
                tag: 'input',
                attrs: [],
                class: '',
                placeholder: 'abc@gmail.com',
                validation: {
                    pattern: '^[^@]+@[^@]+\\.[^@]+$',
                },
            },
            {
                index: 8,
                name: 'source',
                displayNameEng: 'Customer Source',
                displayName: 'Nguồn khách',
                type: 'select',
                tag: 'select',
                attrs: [],
                class: '',
                dataSource: 'APP_DATA.lists.source',
            },
            {
                index: 9,
                name: 'total_spend',
                displayNameEng: 'Total Spend',
                displayName: 'Tổng Chi Tiêu',
                type: 'text',
                tag: 'input',
                attrs: ['readonly'],
                class: 'number',
                initial: '0',
            },
            {
                index: 10,
                name: 'created_at',
                displayNameEng: 'Created Date',
                displayName: 'Ngày Tạo',
                type: 'date',
                tag: 'input',
                attrs: ['readonly'],
                class: '',
                initial: 'today',
            },
        ],
        index: ['phone', 'email', 'source'],
    },

    users: {
        displayNameEng: 'User',
        displayName: 'Người dùng',
        primaryKey: 'uid',
        fields: [
            {
                index: 0,
                name: 'uid',
                displayNameEng: 'User ID',
                displayName: 'ID Người dùng',
                type: 'text',
                tag: 'input',
                attrs: ['readonly'],
                class: 'fw-bold text-danger',
                placeholder: 'Firebase UID',
            },
            {
                index: 1,
                name: 'account',
                displayNameEng: 'Account/Username',
                displayName: 'Tài khoản',
                type: 'text',
                tag: 'input',
                attrs: ['required'],
                class: '',
                placeholder: 'username',
                validation: {
                    required: true,
                    minLength: 3,
                    maxLength: 50,
                },
            },
            {
                index: 2,
                name: 'user_name',
                displayNameEng: 'Display Name',
                displayName: 'Tên Hiển Thị',
                type: 'text',
                tag: 'input',
                attrs: ['required'],
                class: '',
                placeholder: 'Họ và tên',
                validation: {
                    required: true,
                    minLength: 2,
                    maxLength: 100,
                },
            },
            {
                index: 3,
                name: 'password',
                displayNameEng: 'Password',
                displayName: 'Mật khẩu',
                type: 'text',
                tag: 'input',
                attrs: ['required'],
                class: '',
                placeholder: 'Mật khẩu',
                validation: {
                    required: true,
                    minLength: 6,
                    maxLength: 20,
                },
            },
            {
                index: 4,
                name: 'user_phone',
                displayNameEng: 'Phone Number',
                displayName: 'Số Điện Thoại',
                type: 'phone',
                tag: 'input',
                attrs: [],
                class: 'phone_no',
                placeholder: '0xxxxxxxxx',
            },
            {
                index: 5,
                name: 'email',
                displayNameEng: 'Email Address',
                displayName: 'Email',
                type: 'email',
                tag: 'input',
                attrs: ['required'],
                class: '',
                placeholder: 'user@company.com',
                validation: {
                    required: true,
                    pattern: '^[^@]+@[^@]+\\.[^@]+$',
                },
            },
            {
                index: 6,
                name: 'role',
                displayNameEng: 'User Role',
                displayName: 'Vai trò',
                type: 'select',
                tag: 'select',
                attrs: ['required'],
                class: '',
                dataSource: ['admin', 'op', 'sale', 'acc'],
                validation: {
                    required: true,
                },
            },
            {
                index: 7,
                name: 'level',
                displayNameEng: 'User Level',
                displayName: 'Cấp độ',
                type: 'number',
                tag: 'input',
                attrs: [],
                class: '',
                validation: {
                    min: 1,
                    max: 100,
                },
            },
            {
                index: 8,
                name: 'group',
                displayNameEng: 'User Group',
                displayName: 'Nhóm',
                type: 'checkbox',
                tag: 'input',
                attrs: [],
                class: '',
                placeholder: 'Group name',
                initial: [
                    { id: 'admin', name: 'ADMIN' },
                    { id: 'op', name: 'OPERATORS' },
                    { id: 'sale', name: 'SALES' },
                    { id: 'acc', name: 'ACCOUNTANT' },
                    { id: 'manager', name: 'MANAGER' },
                    { id: 'all', name: 'ALL' },
                ],
            },
            {
                index: 9,
                name: 'status',
                displayNameEng: 'User Status',
                displayName: 'Trạng thái',
                type: 'select',
                tag: 'select',
                attrs: [],
                class: '',
                options: [
                    { id: 'active', name: 'ACTIVE' },
                    { id: 'inactive', name: 'INACTIVE' },
                    { id: 'suspended', name: 'SUSPENDED' },
                ],
                placeholder: 'Status',
            },
            {
                index: 10,
                name: 'created_at',
                displayNameEng: 'Created Date',
                displayName: 'Ngày Tạo',
                type: 'date',
                tag: 'input',
                attrs: ['readonly'],
                class: '',
                initial: 'today',
            },
        ],
        index: ['uid', 'role', 'group', 'user_name'],
    },

    hotels: {
        displayNameEng: 'Hotel',
        displayName: 'Khách sạn',
        primaryKey: 'id',
        fields: [
            {
                index: 0,
                name: 'id',
                displayNameEng: 'Hotel ID',
                displayName: 'Mã Khách sạn',
                type: 'text',
                tag: 'input',
                attrs: ['readonly'],
                class: 'fw-bold text-danger',
            },
            {
                index: 1,
                name: 'name',
                displayNameEng: 'Hotel Name',
                displayName: 'Tên Khách sạn',
                type: 'text',
                tag: 'input',
                attrs: ['required'],
                class: '',
                validation: {
                    required: true,
                    minLength: 2,
                    maxLength: 200,
                },
            },
            {
                index: 2,
                name: 'address',
                displayNameEng: 'Address',
                displayName: 'Địa chỉ',
                type: 'text',
                tag: 'input',
                attrs: [],
                class: '',
            },
            {
                index: 3,
                name: 'phone',
                displayNameEng: 'Phone Number',
                displayName: 'Số Điện Thoại',
                type: 'phone',
                tag: 'input',
                attrs: [],
                class: 'phone_number',
            },
            {
                index: 4,
                name: 'email',
                displayNameEng: 'Email Address',
                displayName: 'Email',
                type: 'email',
                tag: 'input',
                attrs: [],
                class: '',
            },
            {
                index: 5,
                name: 'website',
                displayNameEng: 'Website URL',
                displayName: 'Website',
                type: 'url',
                tag: 'input',
                attrs: [],
                class: '',
            },
            {
                index: 6,
                name: 'star',
                displayNameEng: 'Star Rating',
                displayName: 'Sao',
                type: 'select',
                tag: 'select',
                attrs: [],
                class: '',
                dataSource: ['1', '2', '3', '4', '5'],
            },
            {
                index: 7,
                name: 'pictures',
                displayNameEng: 'Pictures',
                displayName: 'Ảnh',
                type: 'url',
                tag: 'input',
                attrs: [],
                class: '',
            },
            {
                index: 8,
                name: 'rooms',
                displayNameEng: 'Room Types',
                displayName: 'Loại Phòng',
                type: 'map',
                tag: 'object',
                fields: [{ id: 'ID Phòng', name: 'Loại Phòng', index: 'STT', type: 'SL Khách' }],
                attrs: [],
                class: '',
            },
        ],
        index: ['name', 'rooms', 'star'],
    },

    suppliers: {
        displayNameEng: 'Supplier',
        displayName: 'Nhà cung cấp',
        primaryKey: 'id',
        fields: [
            {
                index: 0,
                name: 'id',
                displayNameEng: 'Supplier ID',
                displayName: 'Mã NCC',
                type: 'text',
                tag: 'input',
                attrs: ['readonly'],
                class: 'fw-bold text-danger',
            },
            {
                index: 1,
                name: 'name',
                displayNameEng: 'Supplier Name',
                displayName: 'Tên NCC',
                type: 'text',
                tag: 'input',
                attrs: ['required'],
                class: '',
                validation: {
                    required: true,
                    minLength: 2,
                    maxLength: 200,
                },
            },
            {
                index: 2,
                name: 'phone',
                displayNameEng: 'Phone Number',
                displayName: 'Số Điện Thoại',
                type: 'phone',
                tag: 'input',
                attrs: [],
                class: 'phone_number',
            },
            {
                index: 3,
                name: 'email',
                displayNameEng: 'Email Address',
                displayName: 'Email',
                type: 'email',
                tag: 'input',
                attrs: [],
                class: '',
            },
            {
                index: 4,
                name: 'address',
                displayNameEng: 'Address',
                displayName: 'Địa chỉ',
                type: 'textarea',
                tag: 'textarea',
                attrs: [],
                class: '',
            },
            {
                index: 5,
                name: 'VAT_code',
                displayNameEng: 'VAT Code',
                displayName: 'Mã VAT',
                type: 'text',
                tag: 'input',
                attrs: [],
                class: '',
            },
            {
                index: 6,
                name: 'bank_account',
                displayNameEng: 'Bank Account',
                displayName: 'Tài khoản Ngân hàng',
                type: 'text',
                tag: 'input',
                attrs: [],
                class: '',
            },
            {
                index: 7,
                name: 'bank_name',
                displayNameEng: 'Bank Name',
                displayName: 'Tên Ngân hàng',
                type: 'text',
                tag: 'input',
                attrs: [],
                class: '',
            },
            {
                index: 8,
                name: 'contact_person',
                displayNameEng: 'Contact Person',
                displayName: 'Người Liên hệ',
                type: 'json',
                tag: 'input',
                attrs: [],
                class: '',
            },
            {
                index: 9,
                name: 'dept_balance',
                displayNameEng: 'Debt Balance',
                displayName: 'Nợ Còn Lại',
                type: 'text',
                tag: 'input',
                attrs: ['readonly'],
                class: 'number',
                initial: '0',
            },
        ],
        index: ['phone', 'dept_balance'],
    },

    transactions: {
        displayNameEng: 'Transaction',
        displayName: 'Giao dịch (Thu/Chi)',
        primaryKey: 'id',
        fields: [
            {
                index: 0,
                name: 'id',
                displayNameEng: 'Transaction ID',
                displayName: 'Mã GD',
                type: 'text',
                tag: 'input',
                attrs: ['readonly'],
                class: 'fw-bold text-danger',
            },
            {
                index: 1,
                name: 'transaction_date',
                displayNameEng: 'Transaction Date',
                displayName: 'Ngày GD',
                type: 'date',
                tag: 'input',
                attrs: ['required'],
                class: '',
                validation: {
                    required: true,
                },
                initial: 'today',
            },
            {
                index: 2,
                name: 'type',
                displayNameEng: 'Transaction Type',
                displayName: 'Loại GD',
                type: 'select',
                tag: 'select',
                attrs: ['required'],
                class: '',
                dataSource: [
                    { id: 'IN', name: 'Thu' },
                    { id: 'OUT', name: 'Chi' },
                    { id: 'PENDING', name: 'Chờ Duyệt' },
                ],
                validation: {
                    required: true,
                },
            },
            {
                index: 3,
                name: 'amount',
                displayNameEng: 'Amount',
                displayName: 'Số tiền',
                type: 'number',
                tag: 'input',
                attrs: ['required'],
                class: 'number',
                validation: {
                    required: true,
                    min: 0,
                },
            },
            {
                index: 4,
                name: 'category',
                displayNameEng: 'Category',
                displayName: 'Hạng mục',
                type: 'input',
                tag: 'input',
                attrs: [],
                class: '',
            },
            {
                index: 5,
                name: 'description',
                displayNameEng: 'Description',
                displayName: 'Mô tả',
                type: 'textarea',
                tag: 'textarea',
                attrs: [],
                class: '',
            },
            {
                index: 6,
                name: 'booking_id',
                displayNameEng: 'Related Booking',
                displayName: 'Booking liên quan',
                type: 'text',
                tag: 'input',
                attrs: [],
                class: '',
            },
            {
                index: 7,
                name: 'receiver',
                displayNameEng: 'Receiver',
                displayName: 'Người nhận',
                type: 'text',
                tag: 'input',
                attrs: [],
                class: '',
            },
            {
                index: 8,
                name: 'fund_source',
                displayNameEng: 'Fund Source',
                displayName: 'Nguồn tiền',
                type: 'select',
                tag: 'select',
                attrs: [],
                class: '',
                dataSource: 'fund_accounts',
                foreignKey: 'fund_accounts',
                foreignKeyDisplay: 'name',
            },
            {
                index: 9,
                name: 'status',
                displayNameEng: 'Status',
                displayName: 'Trạng thái',
                type: 'select',
                tag: 'select',
                attrs: [],
                class: '',
                dataSource: ['Completed', 'Pending', 'Cancelled'],
            },
            {
                index: 10,
                name: 'created_at',
                displayNameEng: 'Created Date',
                displayName: 'Ngày tạo',
                type: 'date',
                tag: 'input',
                attrs: ['readonly'],
                class: '',
                initial: 'today',
            },
            {
                index: 11,
                name: 'created_by',
                displayNameEng: 'Created By',
                displayName: 'Tạo bởi',
                type: 'text',
                tag: 'input',
                attrs: ['readonly'],
                class: '',
            },
        ],
        aggregate: {
            sum: ['amount'],
            unique: ['id', 'booking_id', 'receiver'],
        },
        index: ['booking_id', 'receiver', 'fund_source', 'status', 'transaction_date'],
        foreignKeys: ['booking_id', 'fund_source'],
    },

    transactions_thenice: {
        displayNameEng: 'Transaction (The Nice)',
        displayName: 'Giao dịch (The Nice)',
        primaryKey: 'id',
        description: 'Alias collection — cùng cấu trúc với transactions, dùng cho công ty The Nice.',
        fields: [
            {
                index: 0,
                name: 'id',
                displayNameEng: 'Transaction ID',
                displayName: 'Mã GD',
                type: 'text',
                tag: 'input',
                attrs: ['readonly'],
                class: 'fw-bold text-danger',
            },
            {
                index: 1,
                name: 'transaction_date',
                displayNameEng: 'Transaction Date',
                displayName: 'Ngày GD',
                type: 'date',
                tag: 'input',
                attrs: ['required'],
                class: '',
                validation: { required: true },
                initial: 'today',
            },
            {
                index: 2,
                name: 'type',
                displayNameEng: 'Transaction Type',
                displayName: 'Loại GD',
                type: 'select',
                tag: 'select',
                attrs: ['required'],
                class: '',
                options: ['Thu', 'Chi', 'Chuyển'],
                validation: { required: true },
            },
            {
                index: 3,
                name: 'amount',
                displayNameEng: 'Amount',
                displayName: 'Số tiền',
                type: 'text',
                tag: 'input',
                attrs: ['required'],
                class: 'number',
                validation: { required: true, min: 0 },
            },
            {
                index: 4,
                name: 'category',
                displayNameEng: 'Category',
                displayName: 'Hạng mục',
                type: 'select',
                tag: 'select',
                attrs: [],
                class: '',
            },
            {
                index: 5,
                name: 'description',
                displayNameEng: 'Description',
                displayName: 'Mô tả',
                type: 'textarea',
                tag: 'textarea',
                attrs: [],
                class: '',
            },
            {
                index: 6,
                name: 'booking_id',
                displayNameEng: 'Related Booking',
                displayName: 'Booking liên quan',
                type: 'text',
                tag: 'input',
                attrs: [],
                class: '',
            },
            {
                index: 7,
                name: 'fund_source',
                displayNameEng: 'Fund Source',
                displayName: 'Nguồn tiền',
                type: 'select',
                tag: 'select',
                attrs: [],
                class: '',
                dataSource: 'fund_accounts_thenice',
            },
            {
                index: 8,
                name: 'status',
                displayNameEng: 'Status',
                displayName: 'Trạng thái',
                type: 'select',
                tag: 'select',
                attrs: [],
                class: '',
                options: ['Hoàn thành', 'Chờ duyệt', 'Từ chối'],
            },
            {
                index: 9,
                name: 'created_at',
                displayNameEng: 'Created Date',
                displayName: 'Ngày tạo',
                type: 'date',
                tag: 'input',
                attrs: ['readonly'],
                class: '',
                initial: 'today',
            },
            {
                index: 10,
                name: 'created_by',
                displayNameEng: 'Created By',
                displayName: 'Tạo bởi',
                type: 'text',
                tag: 'input',
                attrs: ['readonly'],
                class: '',
            },
        ],
        foreignKeys: ['booking_id', 'fund_source'],
    },
    fund_accounts: {
        displayNameEng: 'Fund Account',
        displayName: 'Tài khoản quỹ',
        primaryKey: 'id',
        fields: [
            {
                index: 0,
                name: 'id',
                displayNameEng: 'Account ID',
                displayName: 'Mã Tài khoản',
                type: 'text',
                tag: 'input',
                attrs: ['readonly'],
                class: 'fw-bold text-danger',
            },
            {
                index: 1,
                name: 'type',
                displayNameEng: 'Account Type',
                displayName: 'Loại TK',
                type: 'select',
                tag: 'select',
                attrs: ['required'],
                class: '',
                dataSource: [
                    { id: 'cash', name: 'Tiền Mặt' },
                    { id: 'bank', name: 'CK Ngân Hàng' },
                    { id: 'credit_card', name: 'Thẻ Quốc Tế' },
                ],
                validation: {
                    required: true,
                },
            },
            {
                index: 2,
                name: 'name',
                displayNameEng: 'Account Name',
                displayName: 'Tên TK',
                type: 'text',
                tag: 'input',
                attrs: ['required'],
                class: '',
                validation: {
                    required: true,
                    minLength: 2,
                    maxLength: 100,
                },
            },
            {
                index: 3,
                name: 'code',
                displayNameEng: 'Account Code',
                displayName: 'Mã TK',
                type: 'text',
                tag: 'input',
                attrs: [],
                class: '',
            },
            {
                index: 4,
                name: 'account_no',
                displayNameEng: 'Account Number',
                displayName: 'Số TK',
                type: 'text',
                tag: 'input',
                attrs: [],
                class: '',
            },
            {
                index: 5,
                name: 'balance',
                displayNameEng: 'Current Balance',
                displayName: 'Số dư',
                type: 'number',
                tag: 'input',
                attrs: ['readonly'],
                class: 'number',
                initial: '0',
            },
            {
                index: 6,
                name: 'created_at',
                displayNameEng: 'Created Date',
                displayName: 'Ngày tạo',
                type: 'date',
                tag: 'input',
                attrs: ['readonly'],
                class: '',
                initial: 'today',
            },
        ],
        aggregate: {
            sum: ['balance'],
            unique: ['id'],
        },
        index: ['type', 'name', 'balance'],
    },

    fund_accounts_thenice: {
        displayNameEng: 'Fund Account (The Nice)',
        displayName: 'Tài khoản quỹ (The Nice)',
        primaryKey: 'id',
        description: 'Alias collection — cùng cấu trúc với fund_accounts, dùng cho công ty The Nice.',
        fields: [
            {
                index: 0,
                name: 'id',
                displayNameEng: 'Account ID',
                displayName: 'Mã Tài khoản',
                type: 'text',
                tag: 'input',
                attrs: ['readonly'],
                class: 'fw-bold text-danger',
            },
            {
                index: 1,
                name: 'type',
                displayNameEng: 'Account Type',
                displayName: 'Loại TK',
                type: 'select',
                tag: 'select',
                attrs: ['required'],
                class: '',
                options: ['Tiền mặt', 'Ngân hàng', 'Ví điện tử'],
                validation: { required: true },
            },
            {
                index: 2,
                name: 'name',
                displayNameEng: 'Account Name',
                displayName: 'Tên TK',
                type: 'text',
                tag: 'input',
                attrs: ['required'],
                class: '',
                validation: { required: true },
            },
            {
                index: 3,
                name: 'code',
                displayNameEng: 'Account Code',
                displayName: 'Mã TK',
                type: 'text',
                tag: 'input',
                attrs: [],
                class: '',
            },
            {
                index: 4,
                name: 'account_no',
                displayNameEng: 'Account Number',
                displayName: 'Số TK',
                type: 'text',
                tag: 'input',
                attrs: [],
                class: '',
            },
            {
                index: 5,
                name: 'balance',
                displayNameEng: 'Current Balance',
                displayName: 'Số dư',
                type: 'text',
                tag: 'input',
                attrs: ['readonly'],
                class: 'number',
                initial: '0',
            },
            {
                index: 6,
                name: 'created_at',
                displayNameEng: 'Created Date',
                displayName: 'Ngày tạo',
                type: 'date',
                tag: 'input',
                attrs: ['readonly'],
                class: '',
                initial: 'today',
            },
        ],
    },

    hotel_price_schedules: {
        displayNameEng: 'Hotel Price Schedule',
        displayName: 'Bảng Giá Khách Sạn',
        primaryKey: 'id',
        description: 'Bảng giá KS theo Khách sạn × Gói giá × Năm. Tối ưu O(1) query.',
        fields: [
            {
                index: 0,
                name: 'id',
                displayNameEng: 'Schedule ID',
                displayName: 'Mã Bảng Giá',
                type: 'text',
                tag: 'input',
                attrs: ['readonly'],
                class: 'fw-bold text-danger',
                description: 'Auto-generated: {HOTELID}_{RATEPKG}_{YEAR}',
                placeholder: 'Auto-generated',
            },
            {
                index: 1,
                name: 'info',
                type: 'map',
                fields: [
                    {
                        index: 0,
                        name: 'hotelId',
                        displayNameEng: 'Hotel ID',
                        displayName: 'Mã Khách sạn',
                        type: 'select',
                        tag: 'select',
                        attrs: ['required'],
                        class: '',
                        dataSource: 'hotels',
                        description: 'Mã Khách sạn (Firestore: info.hotelId)',
                        validation: { required: true },
                        foreignKey: 'hotels',
                        foreignKeyDisplay: 'name',
                    },
                    {
                        index: 1,
                        name: 'ratePkg',
                        displayNameEng: 'Rate Package',
                        displayName: 'Gói Giá',
                        type: 'select',
                        tag: 'select',
                        attrs: ['required'],
                        class: '',
                        dataSource: 'APP_DATA.lists.rates_pkg',
                        description: 'Mã gói giá - VD: base, contract (Firestore: info.ratePkg)',
                        validation: { required: true },
                    },
                    {
                        index: 2,
                        name: 'year',
                        displayNameEng: 'Year',
                        displayName: 'Năm',
                        type: 'number',
                        tag: 'input',
                        attrs: ['required'],
                        class: 'number',
                        description: 'Năm áp dụng (Firestore: info.year)',
                        validation: { required: true, min: 2020, max: 2099 },
                        initial: new Date().getFullYear(),
                    },
                    {
                        index: 3,
                        name: 'status',
                        displayNameEng: 'Status',
                        displayName: 'Trạng thái',
                        type: 'select',
                        tag: 'select',
                        attrs: [],
                        class: '',
                        options: ['actived', 'pending', 'canceled', 'stopped'],
                        description: 'Firestore: info.status',
                        initial: 'actived',
                    },
                    {
                        index: 4,
                        name: 'viewConfig',
                        displayNameEng: 'View Config',
                        displayName: 'Cấu hình hiển thị',
                        type: 'json',
                        tag: 'object',
                        attrs: [],
                        class: '',
                        description: 'Firestore: info.viewConfig — {periods: string[], packages: string[], priceTypes: string[]}',
                    },
                    {
                        index: 5,
                        name: 'suppliers',
                        displayNameEng: 'Suppliers',
                        displayName: 'Nhà CC',
                        type: 'select',
                        tag: 'select',
                        class: '',
                        dataSource: 'suppliers',
                        description: 'Mã NCC (Firestore: info.supplierId)',
                        validation: { required: true },
                    },
                ],
                description: 'Mã NCC (Firestore: info.supplierId)',
            },

            {
                index: 2,
                name: 'priceData',
                displayNameEng: 'Price Data Map',
                displayName: 'Dữ liệu giá',
                type: 'json',
                tag: 'object',
                attrs: ['readonly'],
                class: '',
                description: 'Dạng Map: { "roomId_rateType": { "periodId_supplierId": { startDate, endDate, supplier, costPrice, sellPrice }}}',
            },
            {
                index: 3,
                name: 'searchTags',
                displayNameEng: 'Search Tags',
                displayName: 'Tags tìm kiếm',
                type: 'text',
                tag: 'input',
                attrs: ['readonly'],
                class: '',
                description: 'Auto sinh mảng tag tìm kiếm để filter.',
            },
            {
                index: 4,
                name: 'updated_by',
                displayNameEng: 'Updated By',
                displayName: 'Cập nhật bởi',
                type: 'text',
                tag: 'input',
                attrs: ['readonly'],
                class: '',
            },
            {
                index: 5,
                name: 'created_at',
                displayNameEng: 'Created Date',
                displayName: 'Ngày tạo',
                type: 'date',
                tag: 'input',
                attrs: ['readonly'],
                class: '',
                initial: 'today',
            },
            {
                index: 6,
                name: 'updated_at',
                displayNameEng: 'Updated Date',
                displayName: 'Ngày cập nhật',
                type: 'date',
                tag: 'input',
                attrs: ['readonly'],
                class: '',
            },
        ],
        index: ['hotel_id', 'ratePkg', 'year', 'status'],
    },

    service_price_schedules: {
        displayNameEng: 'Service Price Schedule',
        displayName: 'Bảng Giá Dịch Vụ',
        primaryKey: 'id',
        description: 'Bảng giá dịch vụ (vé, ăn, ...) theo NCC × Năm. items = mảng dòng giá.',
        fields: [
            {
                index: 0,
                name: 'id',
                displayNameEng: 'Schedule ID',
                displayName: 'Mã Bảng Giá',
                type: 'text',
                tag: 'input',
                attrs: ['readonly'],
                class: 'fw-bold text-danger',
                description: 'Auto-generated: {SUPPLIERID}_{YEAR}',
                placeholder: 'Auto-generated',
            },
            {
                index: 1,
                name: 'supplier_id',
                displayNameEng: 'Supplier ID',
                displayName: 'Mã NCC',
                type: 'select',
                tag: 'select',
                attrs: ['required'],
                class: '',
                dataSource: 'suppliers',
                description: 'Firestore: info.supplierId',
                validation: { required: true },
            },
            {
                index: 2,
                name: 'supplier_name',
                displayNameEng: 'Supplier Name',
                displayName: 'Tên NCC',
                type: 'text',
                tag: 'input',
                attrs: ['readonly'],
                class: '',
                description: 'Firestore: info.supplierName — auto-fill từ supplier_id',
            },
            {
                index: 3,
                name: 'year',
                displayNameEng: 'Year',
                displayName: 'Năm',
                type: 'number',
                tag: 'input',
                attrs: ['required'],
                class: 'number',
                description: 'Firestore: info.year',
                validation: { required: true, min: 2020, max: 2099 },
                initial: new Date().getFullYear(),
            },
            {
                index: 4,
                name: 'status',
                displayNameEng: 'Status',
                displayName: 'Trạng thái',
                type: 'select',
                tag: 'select',
                attrs: [],
                class: '',
                options: ['actived', 'pending', 'canceled', 'stopped'],
                description: 'Firestore: info.status',
                initial: 'actived',
            },
            {
                index: 5,
                name: 'items',
                displayNameEng: 'Price Items',
                displayName: 'Danh sách giá dịch vụ',
                type: 'map',
                tag: 'object',
                attrs: [],
                class: '',
                description: 'Firestore: items[]. Chỉnh qua component at-tbl-service-price.',
                fields: [
                    { name: 'id', displayName: 'ID', type: 'text', attrs: ['readonly'] },
                    { name: 'type', displayName: 'Loại DV', type: 'select', dataSource: 'APP_DATA.lists.types' },
                    { name: 'name', displayName: 'Tên DV', type: 'text' },
                    { name: 'from', displayName: 'Từ ngày', type: 'text', placeholder: 'DD/MM' },
                    { name: 'to', displayName: 'Đến ngày', type: 'text', placeholder: 'DD/MM' },
                    { name: 'adl', displayName: 'Giá NL', type: 'number' },
                    { name: 'chd', displayName: 'Giá TE', type: 'number' },
                    { name: 'sell_adl', displayName: 'Giá NL', type: 'number' },
                    { name: 'sell_chd', displayName: 'Giá TE', type: 'number' },
                    { name: 'note', displayName: 'Ghi chú', type: 'text' },
                ],
            },
            {
                index: 6,
                name: 'created_at',
                displayNameEng: 'Created Date',
                displayName: 'Ngày tạo',
                type: 'date',
                tag: 'input',
                attrs: ['readonly'],
                class: '',
                initial: 'today',
            },
            {
                index: 7,
                name: 'updated_at',
                displayNameEng: 'Updated Date',
                displayName: 'Ngày cập nhật',
                type: 'date',
                tag: 'input',
                attrs: ['readonly'],
                class: '',
                description: 'Firestore: info.updatedAt (ms timestamp)',
            },
        ],
        index: ['supplier_id', 'year', 'supplier_name', 'status'],
        foreignKeys: ['supplier_id', 'hotel_id'],
    },

    tour_prices: {
        displayNameEng: 'Tour Price',
        displayName: 'Bảng Giá Tour',
        primaryKey: 'id',
        fields: [
            {
                index: 0,
                name: 'id',
                displayNameEng: 'ID',
                displayName: 'Mã Bảng Giá',
                type: 'text',
                tag: 'input',
                attrs: ['readonly'],
                class: 'fw-bold text-danger',
            },
            {
                index: 1,
                name: 'tour_id',
                displayNameEng: 'Tour ID',
                displayName: 'Mã Tour',
                type: 'text',
                tag: 'input',
                attrs: ['required'],
                class: '',
            },
            {
                index: 2,
                name: 'tour_name',
                displayNameEng: 'Tour Name',
                displayName: 'Tên Tour',
                type: 'text',
                tag: 'input',
                attrs: ['required'],
                class: 'fw-bold',
            },
            {
                index: 3,
                name: 'status',
                displayNameEng: 'Status',
                displayName: 'Trạng thái',
                type: 'select',
                tag: 'select',
                options: ['draft', 'published'],
                initial: 'draft',
            },
            {
                index: 4,
                name: 'info',
                displayNameEng: 'Price Info',
                displayName: 'Thông tin giá',
                type: 'json',
                tag: 'textarea',
                class: 'd-none',
            },
            {
                index: 5,
                name: 'services',
                displayNameEng: 'Services',
                displayName: 'Dịch vụ gốc',
                type: 'json',
                tag: 'textarea',
                class: 'd-none',
            },
            {
                index: 6,
                name: 'updated_at',
                displayNameEng: 'Updated At',
                displayName: 'Cập nhật',
                type: 'date',
                tag: 'input',
                attrs: ['readonly'],
            },
        ],
        index: ['tour_id', 'status'],
    },

    selling_prices: {
        displayNameEng: 'Selling Price',
        displayName: 'Bảng Giá Bán',
        primaryKey: 'id',
        virtualCollection: true,
        fields: [
            { index: 0, name: 'id', type: 'text' },
            { index: 1, name: 'tour_name', type: 'text' },
            { index: 2, name: 'results', type: 'json' },
            { index: 3, name: 'info', type: 'json' },
            { index: 4, name: 'updated_at', type: 'text' },
        ],
        index: ['id'],
    },

    report_sales_general: {
        displayName: 'Báo cáo Doanh thu Tổng hợp',
        fields: [
            { name: 'id', displayName: 'Mã BK', type: 'text' },
            { name: 'created_at', displayName: 'Ngày Đặt', type: 'date' },
            { name: 'customer_full_name', displayName: 'Khách Hàng', type: 'text' },
            { name: 'staff_id', displayName: 'NV Sale', type: 'text' },
            { name: 'total_amount', displayName: 'Doanh Thu', type: 'number', class: 'number' },
            { name: 'balance_amount', displayName: 'Còn Lại', type: 'number', class: 'number' },
            { name: 'status', displayName: 'Trạng Thái', type: 'html' },
        ],
        virtualCollection: true,
        aggregate: { sum: ['total_amount', 'balance_amount'], unique: ['id'] },
    },
    report_sales_services: {
        displayName: 'Báo cáo Chi tiết Dịch vụ',
        fields: [
            { name: 'check_in', displayName: 'Ngày Đi', type: 'date' },
            { name: 'name', displayName: 'Tên Dịch Vụ / KS', type: 'text' },
            { name: 'type', displayName: 'Loại DV', type: 'text' },
            { name: 'count', displayName: 'Số Lần Bán', type: 'number' },
            { name: 'qty', displayName: 'Tổng Số Lượng', type: 'number', class: 'number' },
            { name: 'amount', displayName: 'Tổng Doanh Thu', type: 'number', class: 'number' },
        ],
        virtualCollection: true,
        aggregate: { sum: ['qty', 'amount'], unique: ['name'] },
    },
    report_op_debt_detail: {
        displayName: 'Báo cáo Công nợ NCC',
        fields: [
            { name: 'check_in', displayName: 'Ngày Đi', type: 'date' },
            { name: 'supplier', displayName: 'Nhà Cung Cấp', type: 'text' },
            { name: 'service_display', displayName: 'Dịch Vụ (Mã BK)', type: 'html' },
            { name: 'adults', displayName: 'NL', type: 'number' },
            { name: 'cost_adult', displayName: 'Giá NL', type: 'number', class: 'number' },
            { name: 'children', displayName: 'TE', type: 'number' },
            { name: 'cost_child', displayName: 'Giá TE', type: 'number', class: 'number' },
            { name: 'surcharge', displayName: 'Phụ Phí', type: 'number', class: 'number' },
            { name: 'discount', displayName: 'Giảm Giá', type: 'number', class: 'number' },
            { name: 'total_cost', displayName: 'Tổng Chi Phí', type: 'number', class: 'number' },
            { name: 'paid_amount', displayName: 'Đã TT', type: 'number', class: 'number' },
            { name: 'debt_display', displayName: 'Công Nợ', type: 'number', class: 'number' },
        ],
        virtualCollection: true,
        aggregate: { sum: ['total_cost', 'paid_amount', 'debt_balance'], unique: ['supplier'] },
    },
    report_fin_general: {
        displayName: 'Báo cáo Lợi nhuận Tổng hợp',
        fields: [
            { name: 'id', displayName: 'Mã BK', type: 'text' },
            { name: 'created_at', displayName: 'Ngày Đặt', type: 'date' },
            { name: 'start_date', displayName: 'Ngày Đi', type: 'date' },
            { name: 'rev', displayName: 'Doanh Thu', type: 'number', class: 'number' },
            { name: 'cost', displayName: 'Giá Vốn', type: 'number', class: 'number' },
            { name: 'profit_display', displayName: 'Lợi Nhuận', type: 'html' },
            { name: 'margin', displayName: '%', type: 'text' },
        ],
        virtualCollection: true,
        aggregate: { sum: ['rev', 'cost', 'profit'], unique: ['id'] },
    },
    report_error_sync_sa: {
        displayName: 'Lỗi Sync Sales-Acc',
        fields: [
            { name: 'id', displayName: 'Mã BK', type: 'text' },
            { name: 'customer', displayName: 'Khách Hàng', type: 'text' },
            { name: 'deposit', displayName: 'Booking Deposit', type: 'number', class: 'number' },
            { name: 'transaction', displayName: 'Transaction Total', type: 'number', class: 'number' },
            { name: 'diff_display', displayName: 'Chênh Lệch', type: 'html' },
            { name: 'created', displayName: 'Ngày Tạo', type: 'date' },
        ],
        virtualCollection: true,
        aggregate: { sum: ['diff'], unique: ['id'] },
    },
    report_error_booking_details: {
        displayName: 'Lỗi Booking Details',
        fields: [
            { name: 'id', displayName: 'Mã Detail', type: 'text' },
            { name: 'booking_id', displayName: 'Booking ID', type: 'text' },
            { name: 'service_name', displayName: 'Dịch Vụ', type: 'text' },
            { name: 'error_type', displayName: 'Loại Lỗi', type: 'html' },
            { name: 'total', displayName: 'Số Tiền', type: 'number', class: 'number' },
            { name: 'created_at', displayName: 'Ngày Tạo', type: 'date' },
        ],
        virtualCollection: true,
    },
    report_error_sync_so: {
        displayName: 'Lỗi Sync Sales-Op',
        fields: [
            { name: 'id', displayName: 'Mã Detail', type: 'text' },
            { name: 'booking_id', displayName: 'Mã BK', type: 'text' },
            { name: 'service_name', displayName: 'Dịch Vụ', type: 'text' },
            { name: 'hotel_name', displayName: 'Khách Sạn', type: 'text' },
            { name: 'created_at', displayName: 'Ngày Nhập', type: 'date' },
            { name: 'total', displayName: 'Số Tiền', type: 'number', class: 'number' },
            { name: 'status_display', displayName: 'Trạng Thái', type: 'html' },
        ],
        virtualCollection: true,
    },
    report_error_cancelled_booking: {
        displayName: 'Lỗi Booking Hủy',
        fields: [
            { name: 'id', displayName: 'Mã BK', type: 'text' },
            { name: 'customer_full_name', displayName: 'Khách Hàng', type: 'text' },
            { name: 'status_display', displayName: 'Trạng Thái', type: 'html' },
            { name: 'total_amount', displayName: 'Tổng Tiền', type: 'number', class: 'number' },
            { name: 'updated_at', displayName: 'Ngày Hủy', type: 'date' },
            { name: 'notes', displayName: 'Ghi Chú', type: 'text' },
        ],
        virtualCollection: true,
    },

    ai_content_queue: {
        displayName: 'Content Queue AI',
        displayNameEng: 'AI Content Queue',
        primaryKey: 'id',
        fields: [
            {
                index: 0,
                name: 'id',
                displayName: 'ID',
                displayNameEng: 'ID',
                type: 'text',
                tag: 'input',
                attrs: ['readonly'],
                class: 'fw-bold text-primary',
            },
            {
                index: 1,
                name: 'writerContent',
                displayName: 'Nội Dung',
                displayNameEng: 'Content',
                type: 'object',
                tag: 'input',
                attrs: [],
                class: '',
                subFields: {
                    title: { displayName: 'Tiêu đề', type: 'text' },
                    content: { displayName: 'Nội dung', type: 'textarea' },
                    cta: { displayName: 'CTA', type: 'text' },
                    hashtags: { displayName: 'Hashtag', type: 'array' },
                    format: { displayName: 'Format', type: 'text' },
                },
            },
            {
                index: 2,
                name: 'sourceTopic',
                displayName: 'Chủ Đề',
                displayNameEng: 'Topic',
                type: 'text',
                tag: 'input',
                attrs: [],
                class: '',
            },
            {
                index: 3,
                name: 'visualAnalysis',
                displayName: 'Phân Tích Visual',
                displayNameEng: 'Visual Analysis',
                type: 'object',
                tag: 'input',
                attrs: [],
                class: '',
                subFields: {
                    topic: { displayName: 'Chủ đề', type: 'text' },
                    mood: { displayName: 'Tâm trạng', type: 'text' },
                    keyElements: { displayName: 'Yếu tố chính', type: 'array' },
                },
            },
            {
                index: 4,
                name: 'suggestions',
                displayName: 'Đề Xuất Media',
                displayNameEng: 'Media Suggestions',
                type: 'array',
                tag: 'input',
                attrs: [],
                class: '',
            },
            {
                index: 5,
                name: 'logoSpec',
                displayName: 'Logo 9Trip',
                displayNameEng: 'Logo Spec',
                type: 'object',
                tag: 'input',
                attrs: [],
                class: '',
            },
            {
                index: 6,
                name: 'platformOptimized',
                displayName: 'Nền Tảng',
                displayNameEng: 'Platforms',
                type: 'array',
                tag: 'input',
                attrs: [],
                class: '',
            },
            {
                index: 7,
                name: 'status',
                displayName: 'Trạng Thái',
                displayNameEng: 'Status',
                type: 'text',
                tag: 'select',
                attrs: [],
                class: '',
                options: [
                    { value: 'pending_review', label: 'Chờ duyệt' },
                    { value: 'approved', label: 'Đã duyệt' },
                    { value: 'rejected', label: 'Từ chối' },
                    { value: 'revision', label: 'Sửa lại' },
                ],
            },
            {
                index: 8,
                name: 'review',
                displayName: 'Review',
                displayNameEng: 'Review',
                type: 'object',
                tag: 'input',
                attrs: [],
                class: '',
            },
            {
                index: 9,
                name: 'created_at',
                displayName: 'Ngày Tạo',
                displayNameEng: 'Created',
                type: 'date',
                tag: 'input',
                attrs: ['readonly'],
                class: 'small text-muted',
            },
            {
                index: 10,
                name: 'updated_at',
                displayName: 'Cập Nhật',
                displayNameEng: 'Updated',
                type: 'date',
                tag: 'input',
                attrs: ['readonly'],
                class: 'small text-muted',
            },
        ],
    },

    FIELD_MAP: function (collectionName) {
        const coll = this[collectionName];
        if (!coll) return {};
        const map = {};
        coll.fields.forEach((field) => {
            if (field?.name) map[field.index] = field.name;
        });
        return map;
    },

    getHeader: function (collectionName) {
        let map;
        if (typeof collectionName === 'object') {
            map = collectionName;
        } else {
            map = this.FIELD_MAP(collectionName);
            if (!map || Object.keys(map).length === 0) return {};
        }
        if (!map) return [];
        const maxIdx = Math.max(...Object.keys(map).map(Number));
        const arr = new Array(maxIdx + 1).fill('');
        for (let idx in map) arr[idx] = map[idx];
        return arr;
    },

    /**
     * Get all field names for a collection
     * Usage: getFieldNames('bookings') → ['id', 'created_at', 'customer_id', ...]
     */
    getFieldNames: function (collectionName) {
        const coll = this[collectionName];
        if (!coll?.fields) return [];
        return coll.fields.map((field) => field.name).filter(Boolean);
    },

    isCollection: function (collectionName) {
        return this[collectionName] !== undefined && this[collectionName].fields !== undefined;
    },

    getCollectionNames: function (collectionNames) {
        if (!collectionNames || collectionNames.length === 0) {
            collectionNames = Object.keys(this).filter((key) => (typeof this[key] === 'object' && this[key].fields) || this[key].isSecondaryIndex);
        }
        const map = {};
        for (let coll of collectionNames) {
            map[coll] = this[coll]?.displayName ?? coll;
        }
        return map;
    },

    /**
     * Create header row for grid display from field names
     * Usage: createHeaderFromFields('bookings') → { id: 'ID', customer_full_name: 'Tên Khách', ... }
     */
    createHeaderFromFields: function (collectionName) {
        const coll = this[collectionName];
        if (!coll?.fields) {
            if (coll?.isSecondaryIndex) {
                coll = this[coll.source];
                if (!coll?.fields) return {};
            }
        }
        const headerObj = {};
        coll.fields.forEach((field) => {
            if (field?.name) {
                headerObj[field.name] = field.displayName || A.Lang?.t(field.name) || field.name;
            }
        });
        return headerObj;
    },
};

const _fieldMapCache = {};
const FIELD_MAP = new Proxy(_fieldMapCache, {
    get(cache, collectionName) {
        if (typeof collectionName !== 'string') return undefined;
        if (collectionName in cache) return cache[collectionName];
        const map = DB_SCHEMA.FIELD_MAP(collectionName);
        const result = Object.keys(map).length > 0 ? map : undefined;
        cache[collectionName] = result;
        return result;
    },
});

window.FIELD_MAP = FIELD_MAP;

/**
 * Get all fields for a collection
 * @param {string} collectionName - Name of the collection
 * @returns {Object} Object of field objects by field name
 */
function getFieldsSchema(collectionName) {
    if (!DB_SCHEMA[collectionName]) return {};
    const fields = DB_SCHEMA[collectionName]?.fields ?? [];
    return Object.fromEntries(fields.filter((f) => f?.name).map((f) => [f.name, f]));
}

/**
 * Create a complete, responsive form from schema
 *
 * Features:
 *   - Mobile-first: 2-column grid on mobile, flexible on desktop
 *   - All fields same size with auto-adjustment
 *   - Bootstrap form styling (form-control-sm, btn-sm)
 *   - Readonly fields grouped in collapsible section
 *   - All fields have data-field and data-initial attributes
 *   - Dynamic dropdowns with data-source support
 *   - Footer with Reset, Save, Load buttons
 *
 * @param {string} collectionName - Name of the collection (e.g., 'bookings')
 * @param {string} formId - ID for the form element
 * @returns {string} Complete form HTML
 *
 * @example
 * const formHtml = createFormBySchema('bookings', 'booking-form');
 * document.getElementById('form-container').innerHTML = formHtml;
 */
function createFormBySchema(collectionName, formId) {
    if (!collectionName) {
        const coll = prompt(`📥 Nhập tên collection muốn tạo form:\n\n(Để trống để hủy)`);
        if (!coll) return '';
        collectionName = coll;
    }

    if (!formId) formId = `${collectionName}-schema-form`;
    const fields = Object.values(getFieldsSchema(collectionName));
    if (!fields || fields.length === 0) return '';

    const editableFields = fields.filter((f) => !f.attrs?.includes('readonly') && !f.attrs?.includes('hidden'));
    const readonlyFields = fields.filter((f) => f.attrs?.includes('readonly'));
    const hiddenFields = fields.filter((f) => f.attrs?.includes('hidden') || f.class?.includes('d-none'));

    const displayCollectionName = A.Lang?.t(collectionName) || collectionName;
    let html = `<form id="${formId}" class="db-schema-form h-100" data-collection="${collectionName}" style="max-width: 85vw; margin: auto; padding-bottom: 1.5rem; min-height: 400px;" gap: 16px; position: relative">`;

    html += `<fieldset class="border p-3 mb-3" data-collection="${collectionName}" style="border-radius: 4px; border-color: #ced4da; flex: 1 1 auto;">`;
    html += `<legend class="w-auto px-2" style="font-size: 1.1em;">${displayCollectionName}</legend>
    `;

    editableFields.forEach((field) => {
        html += _createFieldGroup(field, collectionName);
    });

    html += `</fieldset>`;

    hiddenFields.forEach((field) => {
        html += `<input type="hidden" id="${field.name}" name="${field.name}" data-field="${field.name}" data-initial="" />`;
    });

    if (readonlyFields.length > 0) {
        const collapseId = `${formId}-readonly-collapse`;
        html += `
    <div class="readonly-section card my-3" style="border: 1px solid #dee2e6; border-radius: 4px;">
      <div class="card-header p-2" style="
        background-color: var(--app-bg);
        cursor: pointer;
        user-select: none;
        display: flex;
        justify-content: space-between;
        align-items: center;
      " data-db-action="toggle-collapse" data-target="${collapseId}">
        <small class="fw-bold">
          <i class="fa-solid fa-circle-info me-2 text-info"></i>
          Thông tin bổ sung (${readonlyFields.length} fields)
        </small>
        <i class="fa-solid fa-chevron-down toggle-icon" style="transition: transform 0.2s;"></i>
      </div>
      <div id="${collapseId}" class="d-none" style="
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 12px;
        padding: 12px;
        background-color: var(--app-bg);
      ">
    `;

        readonlyFields.forEach((field) => {
            html += _createFieldGroup(field, collectionName);
        });

        html += `
      </div>
    </div>
    `;
    }

    html += `
  <div class="form-footer" style="
    position: absolute;
    bottom: 0;
    display: flex;
    width: 100%;
    gap: 1rem;
    padding: 0.5rem;
    justify-content: center;
  ">
    <button id="btn-delete-schema-form" type="button" class="btn btn-sm btn-danger me-auto" data-db-action="delete">
      <i class="fa-solid fa-trash me-1"></i> Xóa
    </button>
    <button id="btn-reset-schema-form" type="button" class="btn btn-sm btn-secondary" data-db-action="reset">
      <i class="fa-solid fa-rotate-left me-1"></i> Reset
    </button>
    <button id="btn-save-schema-form" type="button" class="btn btn-sm btn-primary" data-db-action="save">
      <i class="fa-solid fa-save me-1"></i> Save
    </button>
    <button id="btn-load-schema-form" type="button" class="btn btn-sm btn-info" data-db-action="load">
      <i class="fa-solid fa-download me-1"></i> Load
    </button>
  </div>
  `;

    html += `</form>`;
    const frag = document.createDocumentFragment();
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    frag.appendChild(tempDiv.firstChild);

    setTimeout(() => {
        _setupFormActions(formId);
    }, 100);

    return frag.firstChild;
}

DB_SCHEMA.createFormBySchema = createFormBySchema;

/**
 * Load form data from APP_DATA or Firestore
 *
 * @param {string} formId - ID of the form
 * @param {string|Object} idorData - Either:
 *   - A string ID: will query APP_DATA or Firestore
 *   - An object with data: will load directly into form
 *
 * @example
 * // Load by ID (query APP_DATA or Firestore)
 * loadFormDataSchema('booking-form', 'BK0001');
 *
 * @example
 * // Load from object directly
 * loadFormDataSchema('booking-form', {
 *   id: 'BK0001',
 *   customer_full_name: 'Nguyễn A',
 *   ...
 * });
 */
export async function loadFormDataSchema(formId, idorData = null) {
    const form = getE(formId);
    if (!form) {
        showAlert(`Form with ID '${formId}' not found or no data provided`, 'error');
        return;
    }

    let data = null;

    if (typeof idorData === 'string' && idorData.trim() !== '') {
        const collectionName = form.dataset.collection;
        if (!collectionName) {
            console.error(`Form '${formId}' does not have data-collection attribute`);
            return;
        }

        if (window.APP_DATA && window.APP_DATA[collectionName]) {
            const doc = window.APP_DATA[collectionName][idorData];
            if (doc) {
                L._(`✅ Found in APP_DATA.${collectionName}:`, doc);
                data = { ...doc };
            }
        }
        if (!data && A.DB.db) {
            try {
                L._(`📡 Querying Firestore: ${collectionName}/${idorData}`);

                const docRef = doc(A.DB.db, collectionName, idorData);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    data = { id: docSnap.id, ...docSnap.data() };
                    L._(`✅ Loaded from Firestore:`, data);
                } else {
                    logA(`❌ No data found for ID: ${idorData}`, 'warning', 'alert');
                    return;
                }
            } catch (error) {
                Opps(`❌ Error loading data: ${error.message}`, error);
                return;
            }
        } else if (!data && !A.DB.db) {
            showAlert(`❌ No data found for ID: ${idorData}`, 'warning');
            return;
        }
    }
    else if (typeof idorData === 'object' && idorData !== null) {
        data = idorData;
        L._(`📦 Loading from provided data object:`, data);
    }
    else {
        L._(`❌ Invalid parameter type: ${typeof idorData}`, 'warning');
        return;
    }

    if (!data) {
        console.warn(`⚠️ No data to load into form`);
        return;
    }

    const inputs = form.querySelectorAll('[data-field]');
    let fieldsPopulated = 0;

    inputs.forEach((el) => {
        const fieldName = el.dataset.field;
        if (fieldName && data.hasOwnProperty(fieldName)) {
            el.value = data[fieldName] || '';
            el.dataset.initial = data[fieldName] || '';
            fieldsPopulated++;
        }
    });
    form.dataset.item = data.id || '';
}

/**
 * Setup delegated event listeners for all data-db-action elements inside a form.
 * Eliminates the need for inline onclick handlers and window.* assignments.
 *
 * Supported actions (set via data-db-action attribute):
 *   - "reset"            → resetFormSchema(formId)
 *   - "save"             → saveFormDataSchema(formId)
 *   - "load"             → handleLoadFormDataSchema(formId)
 *   - "delete"           → deleteFormDataSchema(formId)
 *   - "toggle-collapse"  → toggleCollapse(data-target, element)
 *
 * @private
 * @param {string} formId - ID of the form
 */
/**
 * Document-level delegation for all [data-db-action] clicks inside any .db-schema-form.
 * Registered ONCE at module load — survives modal re-renders, innerHTML replacements, etc.
 * @private
 */
function _setupFormActions(formId) {
    _initDocumentFormActions(formId);
}

let _docFormActionsReady = false;

function _initDocumentFormActions(formId) {
    if (_docFormActionsReady) return;
    _docFormActionsReady = true;
    A.Event.on(
        getE(formId),
        'click',
        (e) => {
            const form = getE(formId);
            if (!form) return;

            const el = e.target.closest('[data-db-action]');
            if (!el) return;

            const action = el.getAttribute('data-db-action');

            try {
                switch (action) {
                    case 'reset':
                        resetFormSchema(formId);
                        break;
                    case 'save':
                        saveFormDataSchema(formId);
                        break;
                    case 'load':
                        handleLoadFormDataSchema(formId);
                        break;
                    case 'delete':
                        deleteFormDataSchema(formId);
                        break;
                    case 'toggle-collapse': {
                        const collapseId = el.dataset?.target;
                        if (collapseId) toggleCollapse(collapseId, el);
                        break;
                    }
                    default:
                        console.warn(`[DBSchema] Unknown db-action: "${action}"`);
                }
            } catch (err) {
                console.error(`[DBSchema] db-action error (action="${action}", form="${formId}"):`, err);
                if (typeof L._ === 'function') L._(`❌ Lỗi khi thực hiện "${action}": ${err.message}`, 'error');
            }
        },
        true
    );
}

/**
 * Helper: Get data from APP_DATA by path
 * Supports dot notation: 'lists.types' → APP_DATA.lists.types
 * @private
 * @param {string} path - Dot-notation path (e.g., 'lists.types', 'users_obj')
 * @returns {*} Data from APP_DATA or null
 */
function _getDataByPath(path) {
    if (!path || !window.APP_DATA) return null;

    if (path.startsWith('APP_DATA')) path = path.substring(9);
    const keys = path.split('.');
    let data = window.APP_DATA;
    for (const key of keys) {
        if (data && typeof data === 'object' && key in data) {
            data = data[key];
        } else {
            return null;
        }
    }
    return data;
}

/**
 * Extract hotel locations from hotelMatrix (col 0) and locOther
 * Combines: lists.hotelMatrix[*][0] + lists.locOther
 * Common usage: hotel_name select field in booking_details and operator_entries
 * @private
 * @returns {Array<string>} Array of location names (unique)
 */
function _getHotelLocationOptions() {
    const lists = window.APP_DATA?.lists || {};

    const hotelNames = (lists.hotelMatrix || []).map((row) => (row && row[0] ? row[0] : null)).filter((name) => name !== null && name !== '');

    const otherLocs = lists.locOther || [];

    const allLocations = [...new Set([...hotelNames, ...otherLocs])];

    return allLocations;
}

/**
 * Helper: Convert 'today' to YYYY-MM-DD format
 * @private
 * @param {*} value - Value to convert
 * @returns {string} Converted value
 */
function _getInitialValue(value, fieldType) {
    if (value === 'today' && fieldType === 'date') {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    return value || '';
}

/**
 * Helper: Create individual field group HTML
 * @private
 * @param {Object} field - Field definition object
 * @param {string} collectionName - Name of the collection
 * @returns {string} HTML for field group
 */
function _createFieldGroup(field, collectionName) {
    const isRequired = field.attrs?.includes('required');
    const isReadonly = field.attrs?.includes('readonly');
    const isHidden = field.attrs?.includes('hidden');
    const isDNone = field.class?.includes('d-none');

    const initialValue = _getInitialValue(field.initial, field.type);

    const displayStyle = isDNone ? 'display: none;' : 'display: flex;';
    let fieldHtml = `<div class="form-group field-group-${field.name}" style="${displayStyle} flex-direction: column;">`;

    if (!isHidden) {
        fieldHtml += `
    <label for="${field.name}" class="form-label small fw-bold mb-1" style="white-space: normal;">
      ${field.displayName || field.displayNameEng}
      ${isRequired ? '<span class="text-danger">*</span>' : ''}
    </label>`;
    }

    if (field.tag === 'select') {
        const dataSourceAttr = field.dataSource ? `data-source="${field.dataSource}"` : '';
        const dataOnchange = field.onchange ? `data-onchange="${field.onchange}" ` : '';
        fieldHtml += `
    <select
      name="${field.name}"
      class="form-select form-select-sm ${field.class || ''}"
      data-field="${field.name}"
      value="${initialValue}"
      ${isRequired ? 'required' : ''}
      ${isReadonly ? 'disabled' : ''}
      ${dataSourceAttr}
      ${dataOnchange}
      style="flex: 1; min-height: 32px;">
      <option value="">-- Chọn --</option>
    `;

        const options = field.options || {};
        if (options) {
            let opts = Array.isArray(options) ? options : Object.values(options);

            opts.forEach((opt) => {
                let optValue = '';
                let optText = '';

                if (typeof opt === 'string') {
                    optValue = opt;
                    optText = opt;
                } else if (typeof opt === 'object') {
                    optValue = opt.id || opt.uid || opt.code || opt.value || '';
                    optText = opt.user_name || opt.full_name || opt.name || opt.displayNameEng || opt.displayName || opt.account || opt.value || optValue || '';
                } else {
                    optValue = String(opt);
                    optText = String(opt);
                }

                if (optValue) {
                    fieldHtml += `<option value="${optValue}">${optText}</option>`;
                }
            });
        }

        fieldHtml += `</select>`;
    } else if (field.tag === 'textarea') {
        fieldHtml += `
    <textarea
      id="${field.name}"
      name="${field.name}"
      class="form-control form-control-sm ${field.class || ''}"
      data-field="${field.name}"
      value="${initialValue}"
      rows="3"
      ${isRequired ? 'required' : ''}
      ${isReadonly ? 'readonly' : ''}
      placeholder="${field.placeholder || ''}"
      style="flex: 1; resize: vertical;">
    </textarea>`;
    } else if (field.tag === 'input' && field.type === 'checkbox') {
        try {
            fieldHtml += `<div class="d-flex flex-wrap gap-3 mt-1">`;

            if (Array.isArray(field.initial) && field.initial.length > 0) {
                field.initial.forEach((opt, index) => {
                    const optId = opt.id || `${field.name}_opt_${index}`;
                    const optName = opt.name || opt.value || optId;

                    fieldHtml += `
          <div class="form-check">
            <input
              class="form-check-input ${field.class || ''}"
              type="checkbox"
              name="${field.name}[]" 
              id="${field.name}_${optId}"
              value="${optId}"
              data-field="${field.name}"
              ${isReadonly ? 'disabled' : ''}
            >
            <label class="form-check-label" for="${field.name}_${optId}" style="cursor: pointer;">
              ${optName}
            </label>
          </div>`;
                });
            } else {
                fieldHtml += `
        <div class="form-check">
          <input
            class="form-check-input ${field.class || ''}"
            type="checkbox"
            name="${field.name}"
            id="${field.name}"
            value="${initialValue || 'true'}"
            data-field="${field.name}"
            ${isRequired ? 'required' : ''}
            ${isReadonly ? 'disabled' : ''}
          >
          <label class="form-check-label fw-bold small" for="${field.name}" style="cursor: pointer;">
            ${field.displayName || field.displayNameEng || 'Check'}
            ${isRequired ? '<span class="text-danger">*</span>' : ''}
          </label>
        </div>`;
            }

            fieldHtml += `</div>`;
        } catch (error) {
            console.error(`[_createFieldGroup] Lỗi render checkbox cho field ${field.name}:`, error);
            fieldHtml += `<div class="text-danger small">Lỗi tải dữ liệu checkbox</div>`;
        }
    } else {
        fieldHtml += `
    <input
      type="${field.type || 'text'}"
      id="${field.name}"
      name="${field.name}"
      class="form-control form-control-sm ${field.class || ''}"
      data-field="${field.name}"
      value="${initialValue}"
      ${isRequired ? 'required' : ''}
      ${isReadonly ? 'readonly' : ''}
      ${field.placeholder ? `placeholder="${field.placeholder}"` : ''}
      style="flex: 1; min-height: 32px;" />`;
    }

    fieldHtml += `</div>`;
    return fieldHtml;
}

/**
 * Reset form to initial values
 * @param {string} formId - ID of the form
 */
function resetFormSchema(formId) {
    const form = document.getElementById(formId);
    if (!form) return;

    const inputs = form.querySelectorAll('[data-field]');
    inputs.forEach((el) => {
        if (!el.hasAttribute('readonly') && !el.hasAttribute('disabled')) {
            el.value = el.dataset.initial || '';
        }
    });

    L._(`Form '${formId}' has been reset to initial values`);
}
/**
 * Save form data and log to console
 * @param {string} formId - ID of the form
 */
async function saveFormDataSchema(formId) {
    try {
        showLoading(true, 'Saving data...');
        const form = document.getElementById(formId);
        if (!form) return;

        const data = {};
        const inputs = form.querySelectorAll('[data-field]');

        inputs.forEach((el) => {
            const fieldName = el.dataset.field;
            data[fieldName] = el.value;
        });
        if (Object.keys(data).length === 0) {
            logA('⚠️ No data to save!', 'warning', 'alert');
            return;
        }
        L._(`Form Data from '${formId}':`, data);
        await A.DB.saveRecord(form.dataset.collection, data);
    } catch (error) {
        Opps(`❌ Lỗi: ${error.message}`, error);
    } finally {
        showLoading(false);
    }
}
/**
 * Xóa record từ collection theo ID.
 * Nếu form có giá trị id thì dùng làm ID xóa.
 * Nếu không có, mở prompt để người dùng nhập ID.
 * @param {string} formId - ID của form
 */
async function deleteFormDataSchema(formId) {
    const form = document.getElementById(formId);
    if (!form) return;

    const collectionName = form.dataset.collection;
    if (!collectionName) {
        logA('⚠️ Form chưa có data-collection!', 'warning', 'alert');
        return;
    }

    const idInput = form.querySelector('[data-field="id"]');
    let id = idInput?.value?.trim();

    if (!id) {
        id = prompt(`🗑️ Nhập ID cần xóa trong collection [${collectionName}]:`);
        if (!id?.trim()) return;
        id = id.trim();
    }

    const confirmMsg = `⚠️ Xác nhận xóa record:\n\nCollection: ${collectionName}\nID: ${id}\n\nHành động này không thể hoàn tác!`;
    showConfirm(
        confirmMsg,
        async () => {
            try {
                const res = await A.DB.deleteRecord(collectionName, id);
                if (res?.success) {
                    logA(`✅ Đã xóa thành công: ${collectionName}/${id}`, 'warning', 'alert');
                    resetFormSchema(formId);
                } else {
                    Opps(`❌ Xóa thất bại: ${res?.error ?? 'Lỗi không xác định'}`, `❌ Xóa thất bại: ${res?.error ?? 'Lỗi không xác định'}`);
                }
            } catch (e) {
                Opps(`❌ Lỗi: ${e.message}`, `❌ Lỗi: ${e.message}`);
            }
        },
        () => {
            L._('Delete cancelled');
            return;
        }
    );
}

function handleLoadFormDataSchema(formId) {
    const form = document.getElementById(formId);
    if (!form) {
        console.error(`Form '${formId}' not found`);
        return;
    }

    const collectionName = form.dataset.collection;
    const id = prompt(`📥 Nhập ID để load dữ liệu từ ${collectionName}:\n\n(Để trống để hủy)`);

    if (id === null || id.trim() === '') {
        L._('Load cancelled');
        return;
    }

    loadFormDataSchema(formId, id.trim());
}

/**
 * Toggle collapse section
 * @param {string} collapseId - ID of the collapsible element
 * @param {HTMLElement} headerEl - Header element with chevron icon
 */
function toggleCollapse(collapseId, headerEl) {
    const collapseEl = document.getElementById(collapseId);
    if (!collapseEl) return;

    const isHidden = collapseEl.classList.contains('d-none');
    collapseEl.classList.toggle('d-none', !isHidden);

    const icon = headerEl.querySelector('.toggle-icon');
    if (icon) {
        icon.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(180deg)';
    }
}

const COL_INDEX = {
    M_ID: 0,
    M_CUSTID: 1,
    M_CUST: 2,
    M_PHONE: 3,
    M_START: 4,
    M_END: 5,
    M_ADULT: 6,
    M_CHILD: 7,
    M_TOTAL: 8,
    M_DEPOSIT: 9,
    M_BALANCE: 10,
    M_PAYTYPE: 11,
    M_PAYDUE: 12,
    M_NOTE: 13,
    M_STAFF: 14,
    M_STATUS: 15,
    M_CREATED: 16,

    D_SID: 0,
    D_BKID: 1,
    D_TYPE: 2,
    D_HOTEL: 3,
    D_SERVICE: 4,
    D_IN: 5,
    D_OUT: 6,
    D_NIGHT: 7,
    D_QTY: 8,
    D_PRICE: 9,
    D_CHILD: 10,
    D_PRICEC: 11,
    D_SUR: 12,
    D_DISC: 13,
    D_TOTAL: 14,
    D_CODE: 15,
    D_NOTE: 16,

    OP_SID: 0,
    OP_BKID: 1,
    OP_CUST: 2,
    OP_TYPE: 3,
    OP_HOTEL: 4,
    OP_SERVICE: 5,
    OP_IN: 6,
    OP_OUT: 7,
    OP_NIGHT: 8,
    OP_QTY: 9,
    OP_COSTA: 10,
    OP_CHILD: 11,
    OP_COSTC: 12,
    OP_SUR: 13,
    OP_DISC: 14,
    OP_TOTALSALE: 15,
    OP_CODE: 16,
    OP_TOTALCOST: 17,
    OP_PAID: 18,
    OP_BALANCE: 19,
    OP_SUPPLIER: 20,
    OP_NOTE: 21,

    C_ID: 0,
    C_NAME: 1,
    C_DOB: 2,
    C_CCCD: 3,
    C_CCCDDATE: 4,
    C_ADDRESS: 5,
    C_PHONE: 6,
    C_MAIL: 7,
    C_SOURCE: 8,
    C_TOTALSPEND: 9,
    C_CREATED: 10,

    U_UID: 0,
    U_ACCOUNT: 1,
    U_NAME: 2,
    U_PHONE: 3,
    U_EMAIL: 4,
    U_ROLE: 5,
    U_LEVEL: 6,
    U_GROUP: 7,
    U_CREATED: 8,
};

window.COL_INDEX = COL_INDEX;
export { createFormBySchema };

if (typeof module !== 'undefined' && module.exports) {
    module.exports = DB_SCHEMA;
}
