const scoringConfig = {
  dimensions: {
    freshness: {
      weight: 0.25,
      thresholds: [
        { maxHours: 6, score: 10, label: 'Rất mới' },
        { maxHours: 24, score: 8, label: 'Mới trong ngày' },
        { maxHours: 72, score: 5, label: 'Trong 3 ngày' },
        { maxHours: 168, score: 3, label: 'Trong tuần' },
        { maxHours: null, score: 0, label: 'Cũ hơn 1 tuần' },
      ],
    },
    trend: {
      weight: 0.20,
      priorityPhrases: [
        'Phú Quốc', 'Đảo Ngọc', 'du lịch Phú Quốc', 'tour Phú Quốc',
        'Vinpearl', 'Grand World', 'phú quốc resort',
      ],
    },
    businessRelevance: {
      weight: 0.30,
      productCategories: ['tour', 'khách_sạn', 'ẩm_thực', 'dịch_vụ'],
      boostKeywords: [
        '9 Trip', '9trip', 'combo', 'khuyến mãi', 'ưu đãi',
        'đặt phòng', 'tour trọn gói', 'giá tốt', 'review tour',
      ],
    },
    seasonFit: {
      weight: 0.25,
      seasons: {
        '01-02': { name: 'cao_diem_tet', label: 'Tết & cao điểm', boost: 2 },
        '03-04': { name: 'giao_mua', label: 'Giao mùa', boost: 1 },
        '05-08': { name: 'mua_he', label: 'Mùa hè - du lịch cao điểm', boost: 2 },
        '09-10': { name: 'mua_mua', label: 'Mùa mưa', boost: 0 },
        '11-12': { name: 'cuoi_nam', label: 'Cuối năm', boost: 1 },
      },
      topicSeasonMap: {
        biển: ['mua_he', 'cao_diem_tet'],
        ẩm_thực: ['giao_mua', 'mua_he'],
        khách_sạn: ['mua_he', 'cuoi_nam', 'cao_diem_tet'],
        lễ_hội: ['cao_diem_tet', 'mua_he'],
      },
    },
  },
  thresholds: {
    shouldProcess: 6.5,
    highValue: 8.0,
    priority: 9.0,
  },
};

export default scoringConfig;
