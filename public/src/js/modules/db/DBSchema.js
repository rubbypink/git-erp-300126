/**
 * =========================================================================
 * DB_SCHEMA_DETAILED.JS - Comprehensive Field Metadata Schema
 *
 * Purpose:
 *   - Provides detailed field metadata for all collections in the system
 *   - Each field includes: index, name, type, tag, attributes, CSS, validation rules
 *   - Enables dynamic form generation, validation, and data transformation
 *
 * Usage:
 *   DB_SCHEMA['bookings'] → Collection with field definitions
 *   DB_SCHEMA['bookings'].fields → Array of field objects
 *   Accessing single field: DB_SCHEMA['bookings'].fields.find(f => f.name === 'customer_full_name')
 * =========================================================================
 */

export const DB_SCHEMA = {
  // =========================================================================
  // 1. BOOKINGS COLLECTION
  // =========================================================================
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
          pattern: '^1\\d{4,}$', // e.g., 10001
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
        dataSource: 'lists.payment',
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
        dataSource: 'lists.staff',
      },
      {
        index: 15,
        name: 'status',
        displayNameEng: 'Status',
        displayName: 'Trạng thái',
        type: 'select',
        tag: 'input',
        attrs: ['readonly'],
        class: 'fw-bold bg-warning bg-opacity-25',
        options: ['Đặt Lịch', 'Xác Nhận', 'Thanh Toán', 'Xong BK', 'Hủy'],
        initial: 'Đặt Lịch',
        dataSource: 'lists.status',
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
    index: ['id', 'created_at', 'start_date', 'staff_id', 'status'],
  },

  // =========================================================================
  // 2. BOOKING_DETAILS COLLECTION
  // =========================================================================
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
        options: ['Phòng', 'Vé MB', 'Vé Tàu', 'Ăn'],
        dataSource: 'lists.types',
        validation: {
          required: true,
        },
        event: {
          change: 'SalesModule.UI.updateHotelSelect',
        },
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
        dataSource: 'hotelLocations',
        description: 'Extracted from lists.hotelMatrix[col0] + lists.locOther',
        event: {
          change: 'SalesModule.UI.updateServiceSelect',
        },
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
        dataSource: 'serviceNames',
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
      sum: ['total', 'quantity', 'child_qty', 'discount', 'surcharge'],
      unique: ['id', 'hotel_name', 'service_name'],
    },
    index: ['id', 'booking_id', 'hotel_name', 'service_name', 'service_type'],
  },

  // =========================================================================
  // 3. OPERATOR_ENTRIES COLLECTION
  // =========================================================================
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
        dataSource: 'hotelLocations',
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
        dataSource: 'serviceNames',
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
    index: ['id', 'booking_id', 'hotel_name', 'service_name', 'service_type', 'supplier', 'debt_balance'],
  },

  // =========================================================================
  // 4. CUSTOMERS COLLECTION
  // =========================================================================
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
    index: ['id', 'phone', 'email', 'source', 'created_at'],
  },

  // =========================================================================
  // 5. USERS COLLECTION
  // =========================================================================
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
        options: ['admin', 'op', 'sale', 'acc'],
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
        options: ['active', 'inactive', 'suspended'],
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

  // =========================================================================
  // 6. HOTELS COLLECTION
  // =========================================================================
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
        options: ['1', '2', '3', '4', '5'],
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
        type: 'select',
        tag: 'select',
        attrs: [],
        class: '',
      },
    ],
    index: ['id', 'name', 'rooms', 'star'],
  },

  // =========================================================================
  // 7. SUPPLIERS COLLECTION
  // =========================================================================
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
        type: 'text',
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
    index: ['id', 'phone', 'dept_balance'],
  },

  // =========================================================================
  // 8. TRANSACTIONS COLLECTION
  // =========================================================================
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
        options: [
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
        type: 'text',
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
        options: ['Completed', 'Pending', 'Cancelled'],
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
    index: ['id', 'booking_id', 'receiver', 'fund_source', 'status', 'transaction_date'],
  },
  // transactions_thenice: cùng cấu trúc transactions, dùng cho công ty The Nice
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
  },
  // =========================================================================
  // 9. FUND_ACCOUNTS COLLECTION
  // =========================================================================
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
        options: ['cash', 'bank', 'credit_card'],
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
    aggregate: {
      sum: ['balance'],
      unique: ['id'],
    },
    index: ['id', 'type', 'name', 'balance'],
  },

  // fund_accounts_thenice: cùng cấu trúc fund_accounts, dùng cho công ty The Nice
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
        name: 'hotel_id',
        displayNameEng: 'Hotel ID',
        displayName: 'Mã Khách sạn',
        type: 'select',
        tag: 'select',
        attrs: ['required'],
        class: '',
        dataSource: 'hotels',
        description: 'Mã Khách sạn (Firestore: info.hotelId)',
        validation: { required: true },
      },
      {
        index: 2,
        name: 'rate_pkg',
        displayNameEng: 'Rate Package',
        displayName: 'Gói Giá',
        type: 'select',
        tag: 'select',
        attrs: ['required'],
        class: '',
        dataSource: 'pkg_hotel_price',
        description: 'Mã gói giá - VD: base, contract (Firestore: info.ratePkg)',
        validation: { required: true },
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
        description: 'Năm áp dụng (Firestore: info.year)',
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
        name: 'price_data',
        displayNameEng: 'Price Data Map',
        displayName: 'Dữ liệu giá',
        type: 'json',
        tag: 'textarea',
        attrs: ['readonly'],
        class: '',
        description: 'Dạng Map: { "roomId_rateType": { "periodId": { startDate, endDate, supplier, costPrice, sellPrice } } }',
      },
      {
        index: 6,
        name: 'view_config',
        displayNameEng: 'View Config',
        displayName: 'Cấu hình hiển thị',
        type: 'json',
        tag: 'textarea',
        attrs: [],
        class: '',
        description: 'Firestore: info.viewConfig — {periods: string[], packages: string[], priceTypes: string[]}',
      },
      {
        index: 7,
        name: 'search_tags',
        displayNameEng: 'Search Tags',
        displayName: 'Tags tìm kiếm',
        type: 'text',
        tag: 'input',
        attrs: ['readonly'],
        class: '',
        description: 'Auto sinh mảng tag tìm kiếm để filter.',
      },
      {
        index: 8,
        name: 'updated_by',
        displayNameEng: 'Updated By',
        displayName: 'Cập nhật bởi',
        type: 'text',
        tag: 'input',
        attrs: ['readonly'],
        class: '',
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
        name: 'updated_at',
        displayNameEng: 'Updated Date',
        displayName: 'Ngày cập nhật',
        type: 'date',
        tag: 'input',
        attrs: ['readonly'],
        class: '',
      },
    ],
    index: ['hotel_id', 'rate_pkg', 'year', 'status'],
  },

  // =========================================================================
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
        type: 'array',
        tag: 'textarea',
        attrs: [],
        class: '',
        description: 'Firestore: items[]. Chỉnh qua component at-tbl-service-price.',
        itemSchema: {
          type: { displayName: 'Loại DV', type: 'select', dataSource: 'lists.types' },
          name: { displayName: 'Tên DV', type: 'text' },
          from: { displayName: 'Từ ngày', type: 'text', placeholder: 'DD/MM' },
          to: { displayName: 'Đến ngày', type: 'text', placeholder: 'DD/MM' },
          adl: { displayName: 'Giá NL', type: 'number' },
          chd: { displayName: 'Giá TE', type: 'number' },
          note: { displayName: 'Ghi chú', type: 'text' },
        },
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
    index: ['id', 'supplier_id', 'year', 'supplier_name', 'status'],
  },

  // =========================================================================
  // 11. TOUR_PRICES COLLECTION
  // =========================================================================
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
    index: ['id', 'tour_id', 'status'],
  },

  // =========================================================================
  // 12. SELLING_PRICES (Virtual - IndexedDB Only)
  // =========================================================================
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

  booking_details_by_booking: {
    displayNameEng: 'Booking Details (by Booking)',
    displayName: 'Chi tiết DV (theo Booking)',
    isSecondaryIndex: true,
    source: 'booking_details',
    groupBy: 'booking_id',
    description: 'Secondary index của booking_details, nhóm theo booking_id. ' + 'APP_DATA.booking_details_by_booking[bookingId] → BookingDetail[]',
  },

  operator_entries_by_booking: {
    displayNameEng: 'Operator Entries (by Booking)',
    displayName: 'Chi phí Giá Vốn (theo Booking)',
    isSecondaryIndex: true,
    source: 'operator_entries',
    groupBy: 'booking_id',
    description: 'Secondary index của operator_entries, nhóm theo booking_id. ' + 'APP_DATA.operator_entries_by_booking[bookingId] → OperatorEntry[]',
  },
  operator_entries_by_supplier: {
    displayNameEng: 'Operator Entries (by Supplier)',
    displayName: 'Chi phí Giá Vốn (theo Nhà Cung Cấp)',
    isSecondaryIndex: true,
    source: 'operator_entries',
    groupBy: 'supplier',
    description: 'Secondary index của operator_entries, nhóm theo supplier. ' + 'APP_DATA.operator_entries_by_supplier[supplier] → OperatorEntry[]',
  },
  operator_entries_by_month: {
    displayNameEng: 'Operator Entries (by Month)',
    displayName: 'Chi phí Giá Vốn (theo Tháng)',
    isSecondaryIndex: true,
    source: 'operator_entries',
    groupBy: 'check_in',
    description: 'Secondary index của operator_entries, nhóm theo month. ' + 'APP_DATA.operator_entries_by_month[month] → OperatorEntry[]',
  },

  transactions_by_booking: {
    displayNameEng: 'Transactions (by Booking)',
    displayName: 'Giao dịch (theo Booking)',
    isSecondaryIndex: true,
    source: 'transactions',
    groupBy: 'booking_id',
    description: 'Secondary index của transactions, nhóm theo booking_id. ' + 'APP_DATA.transactions_by_booking[bookingId] → Transaction[]',
  },

  transactions_by_month: {
    displayNameEng: 'Transactions (by Month)',
    displayName: 'Giao dịch (theo Tháng)',
    isSecondaryIndex: true,
    source: 'transactions',
    groupBy: 'transaction_date',
    description: 'Secondary index của transactions, nhóm theo month. ' + 'APP_DATA.transactions_by_month[month] → Transaction[]',
  },

  transactions_by_fund: {
    displayNameEng: 'Transactions (by Fund)',
    displayName: 'Giao dịch (theo Quỹ)',
    isSecondaryIndex: true,
    source: 'transactions',
    groupBy: 'fund_source',
    description: 'Secondary index của transactions, nhóm theo fund_source. ' + 'APP_DATA.transactions_by_fund[fundAccountId] → Transaction[]',
  },

  // =========================================================================
  // VIRTUAL COLLECTIONS FOR REPORTS
  // =========================================================================
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

  FIELD_MAP: function (collectionName) {
    const coll = this[collectionName];
    if (!coll) return {};
    const map = {};
    coll.fields.forEach((field) => {
      if (field?.name) map[field.index] = field.name;
    });
    return map;
  },

  arrayToObject: function (arrData, collectionName) {
    const map = this.FIELD_MAP(collectionName);
    if (!map || Object.keys(map).length === 0) return {};
    const obj = {};
    Object.keys(map).forEach((index) => {
      let val = arrData[index];
      if (val === undefined || val === null) val = '';
      if (val instanceof Date) val = val.toISOString().split('T')[0];
      obj[map[index]] = val;
    });
    return obj;
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
  // getFieldNames: function (collectionName) {
  //   const map = A.DB.schema.FIELD_MAP[collectionName];
  //   if (!map) return [];
  //   return Object.values(map);
  // },
  getFieldNames: function (collectionName) {
    const coll = this[collectionName];
    if (!coll?.fields) return []; // guard: secondary indexes và functions không có fields[]
    return coll.fields.map((field) => field.name).filter(Boolean);
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
        // Dùng displayName từ schema là nguồn chính thức (tiếng Việt)
        // Fallback: Lang translation → raw field name
        headerObj[field.name] = field.displayName || A.Lang?.t(field.name) || field.name;
      }
    });
    return headerObj;
  },
};

// =========================================================================
// A.DB.schema.FIELD_MAP — Derived lazily from DB_SCHEMA via Proxy
// =========================================================================
// Thay thế static A.DB.schema.FIELD_MAP trong db_schema.js.
// Backward compatible 100%: mọi code cũ dùng A.DB.schema.FIELD_MAP[coll][idx] vẫn hoạt động.
//
// Cơ chế:
//   - Proxy intercepts `A.DB.schema.FIELD_MAP['bookings']` → gọi DB_SCHEMA.A.DB.schema.FIELD_MAP('bookings')
//   - Kết quả được cache vào `_cache` object để tránh tính toán lại
//   - Collection không tồn tại → trả undefined (falsy) — đúng hành vi cũ
//
// Pattern cũ vẫn hoạt động:
//   A.DB.schema.FIELD_MAP['bookings'][2]              → 'customer_full_name'
//   A.DB.schema.FIELD_MAP.booking_details[0]          → 'id'
//   if (A.DB.schema.FIELD_MAP[path]) { ... }          → false nếu collection không tồn tại
//   Object.values(A.DB.schema.FIELD_MAP[collection])  → ['id', 'created_at', ...]
// =========================================================================
const _fieldMapCache = {};
const FIELD_MAP = new Proxy(_fieldMapCache, {
  get(cache, collectionName) {
    if (typeof collectionName !== 'string') return undefined;
    if (collectionName in cache) return cache[collectionName];
    const map = DB_SCHEMA.FIELD_MAP(collectionName);
    // Trả undefined (falsy) nếu collection không tồn tại — giữ đúng hành vi cũ
    const result = Object.keys(map).length > 0 ? map : undefined;
    cache[collectionName] = result;
    return result;
  },
});
// Expose globally để code cũ (non-module scripts) vẫn dùng được
window.FIELD_MAP = FIELD_MAP;

// =========================================================================
// HELPER FUNCTIONS FOR SCHEMA OPERATIONS
// =========================================================================

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

// =========================================================================
// FORM BUILDER FUNCTIONS
// =========================================================================

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

  // Separate fields into categories
  const editableFields = fields.filter((f) => !f.attrs?.includes('readonly') && !f.attrs?.includes('hidden'));
  const readonlyFields = fields.filter((f) => f.attrs?.includes('readonly'));
  const hiddenFields = fields.filter((f) => f.attrs?.includes('hidden') || f.class?.includes('d-none'));

  // Start building form HTML
  // IMPORTANT: data-collection must store the raw collection name (not translated),
  // because saveRecord / deleteRecord / loadFormDataSchema use it as Firestore collection key.
  const displayCollectionName = A.Lang?.t(collectionName) || collectionName;
  let html = `<form id="${formId}" class="db-schema-form h-100" data-collection="${collectionName}" style="max-width: 85vw; margin: auto; padding-bottom: 1.5rem; min-height: 400px;" gap: 16px; position: relative">`;

  html += `<fieldset class="border p-3 mb-3" data-collection="${collectionName}" style="border-radius: 4px; border-color: #ced4da; flex: 1 1 auto;">`;
  html += `<legend class="w-auto px-2" style="font-size: 1.1em;">${displayCollectionName}</legend>
    `;

  editableFields.forEach((field) => {
    html += _createFieldGroup(field, collectionName);
  });

  html += `</fieldset>`;

  // ===== HIDDEN FIELDS SECTION =====
  hiddenFields.forEach((field) => {
    html += `<input type="hidden" id="${field.name}" name="${field.name}" data-field="${field.name}" data-initial="" />`;
  });

  // ===== READONLY FIELDS COLLAPSIBLE SECTION =====
  if (readonlyFields.length > 0) {
    const collapseId = `${formId}-readonly-collapse`;
    html += `
    <div class="readonly-section card mt-3" style="border: 1px solid #dee2e6; border-radius: 4px;">
      <div class="card-header p-2" style="
        background-color: #f8f9fa;
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
        background-color: #fafbfc;
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

  // ===== FOOTER WITH BUTTONS =====
  html += `
  <div class="form-footer" style="
    position: absolute;
    bottom: 0;
    display: flex;
    width: 100%;
    gap: 1rem;
    padding: 0.5rem 1rem 1rem 1rem;
    justify-content: center;
  ">
    <button id="btn-delete-schema-form" type="button" class="btn btn-danger me-auto" data-db-action="delete">
      <i class="fa-solid fa-trash me-1"></i> Xóa
    </button>
    <button id="btn-reset-schema-form" type="button" class="btn btn-secondary" data-db-action="reset">
      <i class="fa-solid fa-rotate-left me-1"></i> Reset
    </button>
    <button id="btn-save-schema-form" type="button" class="btn btn-primary" data-db-action="save">
      <i class="fa-solid fa-save me-1"></i> Save
    </button>
    <button id="btn-load-schema-form" type="button" class="btn btn-info" data-db-action="load">
      <i class="fa-solid fa-download me-1"></i> Load
    </button>
  </div>
  `;

  html += `</form>`;
  const frag = document.createDocumentFragment(); // Dummy operation to hint DOM update
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  frag.appendChild(tempDiv.firstChild);

  // Auto-populate dynamic selects after DOM is updated.
  // _setupFormActions is no longer needed here — handled by document-level delegation
  // (see _initDocumentFormActions, called once at module load).
  setTimeout(() => {
    _autoPopulateDynamicSelects(formId);
    _setupFormActions(formId); // No-op if already initialized, safe to call multiple times
  }, 100);

  return frag.firstChild; // Return the form element
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

  // ===== CASE 1: idorData is a STRING (ID) =====
  if (typeof idorData === 'string' && idorData.trim() !== '') {
    const collectionName = form.dataset.collection;
    if (!collectionName) {
      console.error(`Form '${formId}' does not have data-collection attribute`);
      return;
    }

    // 1. Try to find in APP_DATA first
    if (window.APP_DATA && window.APP_DATA[collectionName]) {
      const doc = window.APP_DATA[collectionName][idorData];
      if (doc) {
        L._(`✅ Found in APP_DATA.${collectionName}:`, doc);
        data = { ...doc };
      }
    }
    // 2. If not found in APP_DATA, query Firestore
    if (!data && A.DB.db) {
      try {
        L._(`📡 Querying Firestore: ${collectionName}/${idorData}`);

        // Firebase query modular style
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
  // ===== CASE 2: idorData is an OBJECT (data) =====
  else if (typeof idorData === 'object' && idorData !== null) {
    data = idorData;
    L._(`📦 Loading from provided data object:`, data);
  }
  // ===== INVALID PARAMETER =====
  else {
    L._(`❌ Invalid parameter type: ${typeof idorData}`, 'warning');
    return;
  }

  // ===== POPULATE FORM WITH DATA =====
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
  form.dataset.item = data.id || ''; // Store loaded ID in form dataset for reference
}
/**
 * Helper: Get data source array from APP_DATA
 * Handles both dataSourceName directly and dataSourceName_obj suffix
 * Converts object format to array format automatically
 * @private
 * @param {string} dataSourceName - Data source name (e.g., 'users' or 'hotels')
 * @returns {Array} Array of data items, or empty array if not found
 */
function _getDataSourceArray(dataSourceName) {
  if (!window.APP_DATA) {
    console.warn('⚠️ APP_DATA not available');
    return [];
  }

  // Try to get from APP_DATA[dataSourceName]
  let data = APP_DATA?.[dataSourceName] ?? APP_DATA?.[`${dataSourceName}`];
  if (Array.isArray(data)) {
    return data;
  }

  // If data is object (not array), convert to array
  // Used for object format: { key: { id, name, full_name }, ... }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const convertedArray = [];
    for (const key in data) {
      if (data.hasOwnProperty(key)) {
        const item = data[key];

        // Extract ID: try id, uid, name, or use object key as fallback
        const itemId = item.id || item.uid || item.name || key;

        // Extract display text: try name, full_name, display_name, service_name
        const itemName = item.name || item.full_name || item.display_name || item.service_name || itemId;

        // Create standardized item object
        const convertedItem = {
          id: itemId,
          uid: item.uid || itemId,
          name: itemName,
          full_name: item.full_name || itemName,
          display_name: item.display_name || itemName,
          service_name: item.service_name || itemName,
          ...item, // Include all other properties from original item
        };

        convertedArray.push(convertedItem);
      }
    }

    if (convertedArray.length > 0) {
      return convertedArray;
    }
  }

  console.warn(`⚠️ Data source '${dataSourceName}' not found in APP_DATA`);
  return [];
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
  // Legacy shim kept for any direct callers — now a no-op because
  // _initDocumentFormActions() handles everything at document level.
  _initDocumentFormActions(formId);
}

// Flag so we only attach the document listener a single time.
let _docFormActionsReady = false;

function _initDocumentFormActions(formId) {
  if (_docFormActionsReady) return;
  _docFormActionsReady = true;
  A.Event.on(
    getE(formId),
    'click',
    (e) => {
      // Only handle clicks inside a .db-schema-form
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
 * Helper: Auto-populate all dynamic selects in a form
 * Called after form is inserted into DOM
 * @private
 * @param {string} formId - ID of the form
 */
function _autoPopulateDynamicSelects(formId) {
  const form = document.getElementById(formId);
  if (!form) {
    console.warn(`Form '${formId}' not found in DOM`);
    return;
  }

  const selectsWithSource = form.querySelectorAll('select[data-source]');
  if (selectsWithSource.length === 0) {
    return; // No dynamic selects
  }

  selectsWithSource.forEach((select) => {
    const dataSourceName = select.dataset.source;
    const fieldName = select.name;

    // Skip service_name here - it will be populated on-demand when dependencies change
    if (dataSourceName === 'serviceNames') {
      return;
    }

    populateSelectFromSource(fieldName, dataSourceName);
  });

  // ===== NEW: Setup cascading dropdown logic =====
  // Find all select fields that have dependsOn attribute (dependent fields)
  const dependentSelects = form.querySelectorAll('select[data-depends-on]');

  dependentSelects.forEach((dependentSelect) => {
    const dependsOnFields = dependentSelect.dataset.dependsOn.split(',').map((f) => f.trim());
    const sourceFieldName = dependentSelect.dataset.source;

    // Only handle service_name (which depends on service_type and hotel_name)
    if (sourceFieldName !== 'serviceNames') {
      return;
    }

    // Add change listeners to all dependency fields
    dependsOnFields.forEach((fieldName) => {
      const depField = form.querySelector(`[name="${fieldName}"]`);
      if (depField) {
        depField.addEventListener('change', () => {
          // Repopulate service_name select
          _populateServiceNameSelect(form, dependentSelect.name);
        });
      }
    });

    // Initial populate if all dependencies have values
    const serviceTypeField = form.querySelector('[name="service_type"]');
    const hotelNameField = form.querySelector('[name="hotel_name"]');

    if (serviceTypeField && serviceTypeField.value && hotelNameField) {
      setTimeout(() => {
        _populateServiceNameSelect(form, dependentSelect.name);
      }, 50);
    }
  });

  L._(`✅ Auto-populated ${selectsWithSource.length} dynamic selects in form '${formId}'`);
}

/**
 * Populate service_name select based on service_type and hotel_name
 * This is a cascading logic: service_name options depend on both fields
 * @private
 * @param {HTMLElement} form - The form element
 * @param {string} selectName - Name of the service_name select element
 */
function _populateServiceNameSelect(form, selectName) {
  const serviceNameSelect = form ? form.querySelector(`[name="${selectName}"]`) : document.querySelector(`[name="${selectName}"]`);
  if (!serviceNameSelect) return;

  const serviceTypeField = form ? form.querySelector('[name="service_type"]') : document.querySelector('[name="service_type"]');
  const hotelNameField = form ? form.querySelector('[name="hotel_name"]') : document.querySelector('[name="hotel_name"]');

  if (!serviceTypeField || !hotelNameField) return;

  const serviceType = serviceTypeField.value;
  const hotelName = hotelNameField.value;

  // Get options based on dependencies
  const options = _getServiceNameOptions(serviceType, hotelName);

  // Keep current value if still valid
  const currentValue = serviceNameSelect.value;

  // Clear and rebuild options
  serviceNameSelect.innerHTML = '<option value="">-- Chọn --</option>';

  options.forEach((optName) => {
    const optionEl = document.createElement('option');
    optionEl.value = optName;
    optionEl.textContent = optName;
    serviceNameSelect.appendChild(optionEl);
  });

  // Restore value if still valid
  if (options.includes(currentValue)) {
    serviceNameSelect.value = currentValue;
  } else {
    serviceNameSelect.value = '';
  }
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

  // Split path by dots and traverse APP_DATA
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
 * Helper: Convert object to array
 * If data is object (not array), convert to array
 * @private
 * @param {*} data - Data to convert
 * @returns {Array} Array of data items
 */
function _convertObjectToArray(data) {
  if (!data) return [];

  // Already array
  if (Array.isArray(data)) {
    return data;
  }

  // Object → array
  if (typeof data === 'object') {
    return Object.values(data);
  }

  // Single value → array
  return [data];
}

/**
 * Helper: Get select options from dataSource or field.options
 * Supports special dataSource names that require complex logic:
 *   - 'hotelLocations': Extract hotel names from lists.hotelMatrix + lists.locOther
 *   - 'serviceNames': Get service options based on service_type and hotel_name (context-dependent)
 * @private
 * @param {Object} field - Field definition
 * @param {string} [collectionName] - Collection name (for context if needed)
 * @returns {Array} Array of option values
 */
function _getSelectOptions(field, collectionName) {
  // PRIORITY 1: Special dataSource handlers
  if (field.dataSource === 'hotelLocations') {
    return _getHotelLocationOptions();
  }

  if (field.dataSource === 'serviceNames') {
    // Will be populated dynamically via _populateServiceNameSelect
    // Return empty for initial render, will be filled on demand
    return [];
  }

  // PRIORITY 2: Standard dataSource (with path support)
  if (field.dataSource && field.dataSource !== 'hotelLocations' && field.dataSource !== 'serviceNames') {
    const data = _getDataByPath(field.dataSource);
    const dataArray = _convertObjectToArray(data);

    if (dataArray && dataArray.length > 0) {
      return dataArray;
    }
  }

  // PRIORITY 3: field.options
  if (field.options && Array.isArray(field.options)) {
    return field.options;
  }

  // FALLBACK: empty array
  return [];
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

  // Get hotel names from matrix (column 0)
  const hotelNames = (lists.hotelMatrix || []).map((row) => (row && row[0] ? row[0] : null)).filter((name) => name !== null && name !== '');

  // Get other locations
  const otherLocs = lists.locOther || [];

  // Combine and remove duplicates
  const allLocations = [...new Set([...hotelNames, ...otherLocs])];

  return allLocations;
}

/**
 * Get service name options based on service_type and hotel_name
 * Logic (from SalesModule.js updateServiceSelect):
 *   - If service_type === 'Phòng': Get room types from lists.hotelMatrix[hotel_name].slice(2)
 *   - Otherwise: Get from lists.serviceMatrix where col[0] === service_type, return col[1]
 * @private
 * @param {string} serviceType - The selected service type
 * @param {string} hotelName - The selected hotel/location (for rooms only)
 * @returns {Array<string>} Array of service names
 */
function _getServiceNameOptions(serviceType, hotelName) {
  const lists = window.APP_DATA?.lists || {};
  let options = [];

  if (serviceType === 'Phòng') {
    // Room service: lookup hotel matrix by hotel name
    const matrix = lists.hotelMatrix || [];
    const hotelRow = matrix.find((row) => row && row[0] === hotelName);

    if (hotelRow) {
      // Take columns 2+ (skip col 0=name, col 1=blank), filter empty
      options = hotelRow.slice(2).filter((cell) => cell !== '' && cell !== null);
    }
  } else {
    // Service type: lookup service matrix
    const svcMatrix = lists.serviceMatrix || [];
    options = svcMatrix
      .filter((row) => row && row[0] === serviceType)
      .map((row) => row[1])
      .filter((name) => name !== '' && name !== null);
  }

  return options;
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

  // Calculate initial value (handle 'today' for date fields)
  const initialValue = _getInitialValue(field.initial, field.type);

  // Build style for field group
  const displayStyle = isDNone ? 'display: none;' : 'display: flex;';
  let fieldHtml = `<div class="form-group field-group-${field.name}" style="${displayStyle} flex-direction: column;">`;

  // Label (hidden fields skip label)
  if (!isHidden) {
    fieldHtml += `
    <label for="${field.name}" class="form-label small fw-bold mb-1" style="white-space: normal;">
      ${field.displayName || field.displayNameEng}
      ${isRequired ? '<span class="text-danger">*</span>' : ''}
    </label>`;
  }

  // Input/Select/Textarea element
  if (field.tag === 'select') {
    // SELECT field
    const dataSourceAttr = field.dataSource ? `data-source="${field.dataSource}"` : '';
    const dependsOnAttr = field.dependsOn ? `data-depends-on="${field.dependsOn.join(',')}"` : '';
    fieldHtml += `
    <select
      id="${field.name}"
      name="${field.name}"
      class="form-select form-select-sm ${field.class || ''}"
      data-field="${field.name}"
      value="${initialValue}"
      ${isRequired ? 'required' : ''}
      ${isReadonly ? 'disabled' : ''}
      ${dataSourceAttr}
      ${dependsOnAttr}
      style="flex: 1; min-height: 32px;">
      <option value="">-- Chọn --</option>
    `;

    // Get options from either dataSource or field.options
    const options = _getSelectOptions(field, collectionName);

    // Render options
    options.forEach((opt) => {
      let optValue = '';
      let optText = '';

      // Handle different data formats
      if (typeof opt === 'string') {
        // String option: value = text = opt
        optValue = opt;
        optText = opt;
      } else if (typeof opt === 'object') {
        // Object option: try to get id/uid and display name
        optValue = opt.id || opt.uid || opt.code || opt.value || '';
        optText = opt.user_name || opt.full_name || opt.name || opt.displayNameEng || opt.displayName || opt.account || opt.value || optValue || '';
      } else {
        // Fallback
        optValue = String(opt);
        optText = String(opt);
      }

      if (optValue) {
        fieldHtml += `<option value="${optValue}">${optText}</option>`;
      }
    });

    fieldHtml += `</select>`;
  } else if (field.tag === 'textarea') {
    // TEXTAREA field
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
    // CHECKBOX field
    try {
      fieldHtml += `<div class="d-flex flex-wrap gap-3 mt-1">`; // Wrapper Flexbox cho giao diện đẹp

      if (Array.isArray(field.initial) && field.initial.length > 0) {
        // Trường hợp là một mảng các tuỳ chọn (Multiple Checkboxes)
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
        // Trường hợp Fallback: Checkbox đơn (Single Checkbox)
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
    // INPUT field (text, date, number, email, phone, etc.)
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
// window.resetFormSchema exposed via _setupFormActions event delegation
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
// window.saveFormDataSchema exposed via _setupFormActions event delegation

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

  // Đọc id từ field [data-field="id"] trong form
  const idInput = form.querySelector('[data-field="id"]');
  let id = idInput?.value?.trim();

  // Nếu không có id trong form, mở prompt
  if (!id) {
    id = prompt(`🗑️ Nhập ID cần xóa trong collection [${collectionName}]:`);
    if (!id?.trim()) return; // hủy nếu trống
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
          // Reset form sau khi xóa
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
// window.deleteFormDataSchema exposed via _setupFormActions event delegation

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

  // Call loadFormDataSchema with the provided ID
  loadFormDataSchema(formId, id.trim());
}

// window.handleLoadFormDataSchema exposed via _setupFormActions event delegation

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

  // Rotate chevron icon
  const icon = headerEl.querySelector('.toggle-icon');
  if (icon) {
    icon.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(180deg)';
  }
}

/**
 * Populate select field with data from dataSource
 * Handles both array and object formats
 *
 * @param {string} fieldName - Name of the field (select id)
 * @param {string} dataSourceName - Name of the data source collection
 *
 * @example
 * // For users collection
 * populateSelectFromSource('staff_id', 'users');
 *
 * @example
 * // For hotels collection
 * populateSelectFromSource('hotel_name', 'hotels');
 * // Will populate from Object.values(APP_DATA.hotels)_obj or Object.values(APP_DATA.hotels)
 */
function populateSelectFromSource(fieldName, dataSourceName) {
  const selectEl = document.getElementById(fieldName);
  if (!selectEl) {
    console.warn(`Select element with ID '${fieldName}' not found`);
    return;
  }

  // Get data from APP_DATA
  const dataArray = _getDataSourceArray(dataSourceName);
  if (!dataArray || dataArray.length === 0) {
    console.warn(`No data found for source '${dataSourceName}'`);
    return;
  }

  // Clear existing options (keep the placeholder)
  const existingOptions = selectEl.querySelectorAll('option:not(:first-child)');
  existingOptions.forEach((opt) => opt.remove());

  // Add new options from data source
  // Handle both array and object formats
  dataArray.forEach((item) => {
    const option = document.createElement('option');

    // Get ID/value (handle both object and array formats)
    const itemId = item.id || item.uid || item.code || item.value || '';

    // Get display text (try multiple properties based on data type)
    let itemText = '';
    if (typeof item === 'string') {
      itemText = item;
    } else if (typeof item === 'object') {
      // Try common display name properties
      itemText = item.user_name || item.full_name || item.name || item.displayNameEng || item.displayName || item.account || item.value || itemId || '';
    }

    if (itemId) {
      option.value = itemId;
      option.textContent = itemText;
      selectEl.appendChild(option);
    }
  });

  L._(`✅ Populated '${fieldName}' with ${dataArray.length} options from '${dataSourceName}'`);
}
const COL_INDEX = {
  // BOOKINGS
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

  // DETAILS
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

  // OPERATORS
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

  // CUSTOMERS
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
  // USERS (Mới bổ sung để lấy Header)
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

window.COL_INDEX = COL_INDEX; // Expose to global scope for easy access in other scripts
export { createFormBySchema };

// Export for module system (if applicable)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DB_SCHEMA;
}
