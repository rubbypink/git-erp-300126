const analyticsConfig = {
  lookbackDays: 7,
  updateThreshold: 0.5,
  engagementWeights: {
    facebook: { reach: 0.3, likes: 0.2, comments: 0.25, shares: 0.25 },
    tiktok: { views: 0.3, likes: 0.2, comments: 0.2, shares: 0.15, saves: 0.15 },
  },
  scoringAdjustment: {
    highEngagement: 1.5,
    mediumEngagement: 0.5,
    lowEngagement: -0.5,
    noData: 0,
  },
  engagementThresholds: {
    high: { minReach: 1000, minLikes: 50 },
    medium: { minReach: 100, minLikes: 10 },
  },
  collections: {
    publishLogs: 'ai_publish_logs',
    trainingVault: 'training-data-vault',
  },
};

export default analyticsConfig;
