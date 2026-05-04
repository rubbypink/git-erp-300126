const plannerConfig = {
  angles: [
    { id: 'chi_phi', label: 'Chi phí & tiết kiệm', description: 'So sánh giá, mẹo tiết kiệm, combo giá tốt' },
    { id: 'dia_diem', label: 'Địa điểm & review', description: 'Review địa điểm ăn chơi, khách sạn, resort' },
    { id: 'canh_bao', label: 'Cảnh báo & lưu ý', description: 'Cảnh báo thời tiết, an ninh, lừa đảo, chính sách mới' },
    { id: 'kinh_nghiem', label: 'Kinh nghiệm du lịch', description: 'Kinh nghiệm tự túc, itinerary gợi ý, tips' },
    { id: 'am_thuc', label: 'Ẩm thực', description: 'Món ngon, quán ăn, đặc sản Phú Quốc' },
    { id: 'khach_san', label: 'Khách sạn & Resort', description: 'Review, so sánh, deal khách sạn' },
  ],
  targets: [
    { id: 'family', label: 'Gia đình', description: 'Phù hợp gia đình có trẻ em, người già' },
    { id: 'couple', label: 'Cặp đôi', description: 'Lãng mạn, riêng tư, dành cho 2 người' },
    { id: 'solo', label: 'Đi một mình', description: 'Backpack, tự túc, tiết kiệm' },
    { id: 'group', label: 'Nhóm bạn', description: 'Team building, hội bạn thân, công ty' },
  ],
  mediaTypes: [
    { id: 'image', label: 'Ảnh tĩnh' },
    { id: 'video', label: 'Video ngắn' },
    { id: 'carousel', label: 'Album ảnh' },
  ],
  categoryAngleMap: {
    tour: 'chi_phi',
    khách_sạn: 'khach_san',
    ẩm_thực: 'am_thuc',
    sự_kiện: 'dia_diem',
    thời_tiết: 'canh_bao',
    thuế_chính_sách: 'canh_bao',
  },
  categoryTargetMap: {
    tour: 'family',
    khách_sạn: 'couple',
    ẩm_thực: 'group',
    sự_kiện: 'group',
  },
  categoryMediaMap: {
    tour: 'carousel',
    khách_sạn: 'image',
    ẩm_thực: 'image',
    sự_kiện: 'video',
  },
  defaultAngle: 'kinh_nghiem',
  defaultTarget: 'family',
  defaultMediaType: 'image',
};

export default plannerConfig;
