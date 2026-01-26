const { v4: uuidv4 } = require("uuid");
const db = require("../db");

/**
 * Activity Service - Tracks user activities and generates activity feeds
 * Supports activity logging, feeds, and activity analytics
 */

const ACTIVITY_TYPE = {
  LOGIN: "login",
  LOGOUT: "logout",
  TRADE: "trade",
  ORDER: "order",
  DEPOSIT: "deposit",
  WITHDRAWAL: "withdrawal",
  ASSET_CREATE: "asset_create",
  ASSET_UPDATE: "asset_update",
  KYC_UPDATE: "kyc_update",
  PROFILE_UPDATE: "profile_update",
  WATCHLIST: "watchlist",
  ALERT: "alert",
  COMMENT: "comment",
  FOLLOW: "follow",
};

/**
 * Log activity
 */
const logActivity = async (userId, activityData) => {
  const data = db.read();

  if (!data.activities) {
    data.activities = [];
  }

  const activity = {
    id: uuidv4(),
    userId,
    type: activityData.type,
    action: activityData.action,
    description: activityData.description || null,
    entityType: activityData.entityType || null,
    entityId: activityData.entityId || null,
    metadata: activityData.metadata || {},
    visibility: activityData.visibility || "private", // private, followers, public
    createdAt: new Date().toISOString(),
  };

  data.activities.push(activity);

  // Keep only last 50000 activities
  if (data.activities.length > 50000) {
    data.activities = data.activities.slice(-50000);
  }

  db.write(data);

  return activity;
};

/**
 * Get user activities
 */
const getUserActivities = async (userId, filters = {}) => {
  const data = db.read();
  let activities = (data.activities || []).filter((a) => a.userId === userId);

  if (filters.type) {
    activities = activities.filter((a) => a.type === filters.type);
  }

  if (filters.startDate) {
    activities = activities.filter(
      (a) => new Date(a.createdAt) >= new Date(filters.startDate)
    );
  }

  if (filters.endDate) {
    activities = activities.filter(
      (a) => new Date(a.createdAt) <= new Date(filters.endDate)
    );
  }

  // Sort by date descending
  activities.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // Pagination
  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const startIndex = (page - 1) * limit;

  return {
    activities: activities.slice(startIndex, startIndex + limit),
    total: activities.length,
    page,
    totalPages: Math.ceil(activities.length / limit),
  };
};

/**
 * Get activity feed (includes followed users)
 */
const getActivityFeed = async (userId, options = {}) => {
  const data = db.read();

  // Get followed users
  const following = (data.follows || [])
    .filter((f) => f.followerId === userId)
    .map((f) => f.followingId);

  // Include own activities and public activities from followed users
  let activities = (data.activities || []).filter(
    (a) =>
      a.userId === userId ||
      (following.includes(a.userId) && a.visibility !== "private")
  );

  // Sort by date descending
  activities.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // Pagination
  const page = options.page || 1;
  const limit = options.limit || 20;
  const startIndex = (page - 1) * limit;

  return {
    activities: activities.slice(startIndex, startIndex + limit),
    total: activities.length,
    page,
    totalPages: Math.ceil(activities.length / limit),
  };
};

/**
 * Get public activity feed
 */
const getPublicFeed = async (options = {}) => {
  const data = db.read();

  let activities = (data.activities || []).filter(
    (a) => a.visibility === "public"
  );

  // Sort by date descending
  activities.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // Pagination
  const page = options.page || 1;
  const limit = options.limit || 20;
  const startIndex = (page - 1) * limit;

  return {
    activities: activities.slice(startIndex, startIndex + limit),
    total: activities.length,
    page,
    totalPages: Math.ceil(activities.length / limit),
  };
};

/**
 * Delete activity
 */
const deleteActivity = async (activityId, userId) => {
  const data = db.read();
  const index = (data.activities || []).findIndex(
    (a) => a.id === activityId && a.userId === userId
  );

  if (index === -1) {
    throw new Error("Activity not found or unauthorized");
  }

  data.activities.splice(index, 1);
  db.write(data);

  return { success: true };
};

/**
 * Follow user
 */
const followUser = async (followerId, followingId) => {
  const data = db.read();

  if (!data.follows) {
    data.follows = [];
  }

  // Check if already following
  const exists = data.follows.some(
    (f) => f.followerId === followerId && f.followingId === followingId
  );

  if (exists) {
    throw new Error("Already following this user");
  }

  const follow = {
    id: uuidv4(),
    followerId,
    followingId,
    createdAt: new Date().toISOString(),
  };

  data.follows.push(follow);
  db.write(data);

  // Log activity
  await logActivity(followerId, {
    type: ACTIVITY_TYPE.FOLLOW,
    action: "followed",
    entityType: "user",
    entityId: followingId,
    visibility: "private",
  });

  return follow;
};

/**
 * Unfollow user
 */
const unfollowUser = async (followerId, followingId) => {
  const data = db.read();

  const index = (data.follows || []).findIndex(
    (f) => f.followerId === followerId && f.followingId === followingId
  );

  if (index === -1) {
    throw new Error("Not following this user");
  }

  data.follows.splice(index, 1);
  db.write(data);

  return { success: true };
};

/**
 * Get followers
 */
const getFollowers = async (userId) => {
  const data = db.read();

  return (data.follows || [])
    .filter((f) => f.followingId === userId)
    .map((f) => f.followerId);
};

/**
 * Get following
 */
const getFollowing = async (userId) => {
  const data = db.read();

  return (data.follows || [])
    .filter((f) => f.followerId === userId)
    .map((f) => f.followingId);
};

/**
 * Get activity statistics
 */
const getActivityStatistics = async (userId, period = "30d") => {
  const data = db.read();

  let startDate;
  switch (period) {
    case "7d":
      startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "30d":
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      break;
    case "90d":
      startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      break;
    default:
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  }

  const activities = (data.activities || []).filter(
    (a) => a.userId === userId && new Date(a.createdAt) >= startDate
  );

  const byType = {};
  const byDay = {};

  activities.forEach((a) => {
    byType[a.type] = (byType[a.type] || 0) + 1;

    const day = a.createdAt.split("T")[0];
    byDay[day] = (byDay[day] || 0) + 1;
  });

  return {
    userId,
    period,
    totalActivities: activities.length,
    byType,
    byDay: Object.entries(byDay)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, count]) => ({ date, count })),
    averagePerDay: activities.length / parseInt(period) || 0,
  };
};

/**
 * Get most active users
 */
const getMostActiveUsers = async (limit = 10, period = "7d") => {
  const data = db.read();

  const startDate = new Date(
    Date.now() - parseInt(period) * 24 * 60 * 60 * 1000
  );

  const activities = (data.activities || []).filter(
    (a) => new Date(a.createdAt) >= startDate
  );

  const userCounts = {};
  activities.forEach((a) => {
    userCounts[a.userId] = (userCounts[a.userId] || 0) + 1;
  });

  return Object.entries(userCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([userId, count]) => ({ userId, activityCount: count }));
};

module.exports = {
  ACTIVITY_TYPE,
  logActivity,
  getUserActivities,
  getActivityFeed,
  getPublicFeed,
  deleteActivity,
  followUser,
  unfollowUser,
  getFollowers,
  getFollowing,
  getActivityStatistics,
  getMostActiveUsers,
};
