const { v4: uuidv4 } = require("uuid");
const db = require("../db");

/**
 * Notification Service - Handles user notifications
 * Supports in-app, email, SMS, and push notifications
 */

const NOTIFICATION_TYPE = {
  TRADE: "trade",
  ORDER: "order",
  PAYMENT: "payment",
  ASSET: "asset",
  KYC: "kyc",
  SECURITY: "security",
  SYSTEM: "system",
  MARKETING: "marketing",
  ALERT: "alert",
};

const NOTIFICATION_CHANNEL = {
  IN_APP: "in_app",
  EMAIL: "email",
  SMS: "sms",
  PUSH: "push",
};

const NOTIFICATION_PRIORITY = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  URGENT: "urgent",
};

/**
 * Create a notification
 */
const createNotification = async (userId, notificationData) => {
  const data = db.read();

  if (!data.notifications) {
    data.notifications = [];
  }

  const notification = {
    id: uuidv4(),
    userId,
    type: notificationData.type || NOTIFICATION_TYPE.SYSTEM,
    title: notificationData.title,
    message: notificationData.message,
    data: notificationData.data || {},
    priority: notificationData.priority || NOTIFICATION_PRIORITY.MEDIUM,
    channels: notificationData.channels || [NOTIFICATION_CHANNEL.IN_APP],
    read: false,
    readAt: null,
    actionUrl: notificationData.actionUrl || null,
    expiresAt: notificationData.expiresAt || null,
    createdAt: new Date().toISOString(),
  };

  data.notifications.push(notification);
  db.write(data);

  // Trigger delivery through specified channels
  await deliverNotification(notification);

  return notification;
};

/**
 * Deliver notification through channels
 */
const deliverNotification = async (notification) => {
  const deliveryResults = [];

  for (const channel of notification.channels) {
    let result;

    switch (channel) {
      case NOTIFICATION_CHANNEL.EMAIL:
        result = await sendEmailNotification(notification);
        break;
      case NOTIFICATION_CHANNEL.SMS:
        result = await sendSmsNotification(notification);
        break;
      case NOTIFICATION_CHANNEL.PUSH:
        result = await sendPushNotification(notification);
        break;
      case NOTIFICATION_CHANNEL.IN_APP:
      default:
        result = { channel, status: "delivered" };
        break;
    }

    deliveryResults.push(result);
  }

  return deliveryResults;
};

/**
 * Send email notification (mock)
 */
const sendEmailNotification = async (notification) => {
  // In production, would integrate with email service (SendGrid, SES, etc.)
  return {
    channel: NOTIFICATION_CHANNEL.EMAIL,
    status: "sent",
    sentAt: new Date().toISOString(),
  };
};

/**
 * Send SMS notification (mock)
 */
const sendSmsNotification = async (notification) => {
  // In production, would integrate with SMS service (Twilio, etc.)
  return {
    channel: NOTIFICATION_CHANNEL.SMS,
    status: "sent",
    sentAt: new Date().toISOString(),
  };
};

/**
 * Send push notification (mock)
 */
const sendPushNotification = async (notification) => {
  // In production, would integrate with push service (Firebase, APNs, etc.)
  return {
    channel: NOTIFICATION_CHANNEL.PUSH,
    status: "sent",
    sentAt: new Date().toISOString(),
  };
};

/**
 * Get user notifications
 */
const getUserNotifications = async (userId, filters = {}) => {
  const data = db.read();
  let notifications = (data.notifications || []).filter((n) => n.userId === userId);

  // Filter expired notifications
  const now = new Date();
  notifications = notifications.filter(
    (n) => !n.expiresAt || new Date(n.expiresAt) > now
  );

  if (filters.type) {
    notifications = notifications.filter((n) => n.type === filters.type);
  }

  if (filters.read !== undefined) {
    notifications = notifications.filter((n) => n.read === filters.read);
  }

  if (filters.priority) {
    notifications = notifications.filter((n) => n.priority === filters.priority);
  }

  // Sort by date descending
  notifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // Pagination
  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const startIndex = (page - 1) * limit;

  return {
    notifications: notifications.slice(startIndex, startIndex + limit),
    total: notifications.length,
    unread: notifications.filter((n) => !n.read).length,
    page,
    totalPages: Math.ceil(notifications.length / limit),
  };
};

/**
 * Mark notification as read
 */
const markAsRead = async (notificationId, userId) => {
  const data = db.read();
  const index = (data.notifications || []).findIndex(
    (n) => n.id === notificationId && n.userId === userId
  );

  if (index === -1) {
    throw new Error("Notification not found");
  }

  data.notifications[index].read = true;
  data.notifications[index].readAt = new Date().toISOString();
  db.write(data);

  return data.notifications[index];
};

/**
 * Mark all notifications as read
 */
const markAllAsRead = async (userId) => {
  const data = db.read();
  let count = 0;

  data.notifications = data.notifications.map((n) => {
    if (n.userId === userId && !n.read) {
      n.read = true;
      n.readAt = new Date().toISOString();
      count++;
    }
    return n;
  });

  db.write(data);

  return { markedCount: count };
};

/**
 * Delete notification
 */
const deleteNotification = async (notificationId, userId) => {
  const data = db.read();
  const index = (data.notifications || []).findIndex(
    (n) => n.id === notificationId && n.userId === userId
  );

  if (index === -1) {
    throw new Error("Notification not found");
  }

  data.notifications.splice(index, 1);
  db.write(data);

  return { success: true };
};

/**
 * Delete all read notifications
 */
const deleteReadNotifications = async (userId) => {
  const data = db.read();
  const before = data.notifications.length;

  data.notifications = data.notifications.filter(
    (n) => n.userId !== userId || !n.read
  );

  db.write(data);

  return { deletedCount: before - data.notifications.length };
};

/**
 * Get notification preferences
 */
const getNotificationPreferences = async (userId) => {
  const data = db.read();

  const preferences = (data.notificationPreferences || []).find(
    (p) => p.userId === userId
  );

  if (!preferences) {
    // Return defaults
    return {
      userId,
      channels: {
        [NOTIFICATION_TYPE.TRADE]: [NOTIFICATION_CHANNEL.IN_APP, NOTIFICATION_CHANNEL.EMAIL],
        [NOTIFICATION_TYPE.ORDER]: [NOTIFICATION_CHANNEL.IN_APP, NOTIFICATION_CHANNEL.PUSH],
        [NOTIFICATION_TYPE.PAYMENT]: [NOTIFICATION_CHANNEL.IN_APP, NOTIFICATION_CHANNEL.EMAIL],
        [NOTIFICATION_TYPE.ASSET]: [NOTIFICATION_CHANNEL.IN_APP],
        [NOTIFICATION_TYPE.KYC]: [NOTIFICATION_CHANNEL.IN_APP, NOTIFICATION_CHANNEL.EMAIL],
        [NOTIFICATION_TYPE.SECURITY]: [
          NOTIFICATION_CHANNEL.IN_APP,
          NOTIFICATION_CHANNEL.EMAIL,
          NOTIFICATION_CHANNEL.SMS,
        ],
        [NOTIFICATION_TYPE.SYSTEM]: [NOTIFICATION_CHANNEL.IN_APP],
        [NOTIFICATION_TYPE.MARKETING]: [],
        [NOTIFICATION_TYPE.ALERT]: [NOTIFICATION_CHANNEL.IN_APP, NOTIFICATION_CHANNEL.PUSH],
      },
      quiet_hours: {
        enabled: false,
        start: "22:00",
        end: "08:00",
        timezone: "UTC",
      },
      email_digest: {
        enabled: true,
        frequency: "daily",
      },
    };
  }

  return preferences;
};

/**
 * Update notification preferences
 */
const updateNotificationPreferences = async (userId, preferencesData) => {
  const data = db.read();

  if (!data.notificationPreferences) {
    data.notificationPreferences = [];
  }

  const index = data.notificationPreferences.findIndex((p) => p.userId === userId);

  const preferences = {
    userId,
    channels: preferencesData.channels,
    quiet_hours: preferencesData.quiet_hours || {
      enabled: false,
      start: "22:00",
      end: "08:00",
      timezone: "UTC",
    },
    email_digest: preferencesData.email_digest || {
      enabled: true,
      frequency: "daily",
    },
    updatedAt: new Date().toISOString(),
  };

  if (index !== -1) {
    data.notificationPreferences[index] = preferences;
  } else {
    data.notificationPreferences.push(preferences);
  }

  db.write(data);

  return preferences;
};

/**
 * Send bulk notification
 */
const sendBulkNotification = async (userIds, notificationData) => {
  const results = [];

  for (const userId of userIds) {
    try {
      const notification = await createNotification(userId, notificationData);
      results.push({ userId, status: "sent", notificationId: notification.id });
    } catch (error) {
      results.push({ userId, status: "failed", error: error.message });
    }
  }

  return {
    total: userIds.length,
    sent: results.filter((r) => r.status === "sent").length,
    failed: results.filter((r) => r.status === "failed").length,
    results,
  };
};

/**
 * Get unread count
 */
const getUnreadCount = async (userId) => {
  const data = db.read();
  const now = new Date();

  const unreadCount = (data.notifications || []).filter(
    (n) =>
      n.userId === userId &&
      !n.read &&
      (!n.expiresAt || new Date(n.expiresAt) > now)
  ).length;

  return { userId, unreadCount };
};

/**
 * Create notification templates
 */
const NOTIFICATION_TEMPLATES = {
  TRADE_EXECUTED: (data) => ({
    type: NOTIFICATION_TYPE.TRADE,
    title: "Trade Executed",
    message: `Your ${data.side} order for ${data.quantity} ${data.symbol} was executed at ${data.price}`,
    priority: NOTIFICATION_PRIORITY.HIGH,
  }),
  ORDER_FILLED: (data) => ({
    type: NOTIFICATION_TYPE.ORDER,
    title: "Order Filled",
    message: `Your order #${data.orderId} has been completely filled`,
    priority: NOTIFICATION_PRIORITY.MEDIUM,
  }),
  DEPOSIT_RECEIVED: (data) => ({
    type: NOTIFICATION_TYPE.PAYMENT,
    title: "Deposit Received",
    message: `Your deposit of ${data.amount} ${data.currency} has been credited to your account`,
    priority: NOTIFICATION_PRIORITY.HIGH,
  }),
  WITHDRAWAL_COMPLETED: (data) => ({
    type: NOTIFICATION_TYPE.PAYMENT,
    title: "Withdrawal Completed",
    message: `Your withdrawal of ${data.amount} ${data.currency} has been processed`,
    priority: NOTIFICATION_PRIORITY.HIGH,
  }),
  KYC_APPROVED: () => ({
    type: NOTIFICATION_TYPE.KYC,
    title: "KYC Approved",
    message: "Your identity verification has been approved. You now have full access to all features.",
    priority: NOTIFICATION_PRIORITY.HIGH,
  }),
  KYC_REJECTED: (data) => ({
    type: NOTIFICATION_TYPE.KYC,
    title: "KYC Verification Failed",
    message: `Your identity verification was not approved. Reason: ${data.reason}`,
    priority: NOTIFICATION_PRIORITY.HIGH,
  }),
  SECURITY_ALERT: (data) => ({
    type: NOTIFICATION_TYPE.SECURITY,
    title: "Security Alert",
    message: data.message,
    priority: NOTIFICATION_PRIORITY.URGENT,
  }),
  PRICE_ALERT: (data) => ({
    type: NOTIFICATION_TYPE.ALERT,
    title: `Price Alert: ${data.symbol}`,
    message: `${data.symbol} has ${data.direction} your target price of ${data.targetPrice}`,
    priority: NOTIFICATION_PRIORITY.HIGH,
  }),
};

/**
 * Send templated notification
 */
const sendTemplatedNotification = async (userId, templateName, data, channels = null) => {
  const template = NOTIFICATION_TEMPLATES[templateName];

  if (!template) {
    throw new Error("Unknown notification template");
  }

  const notificationData = template(data);

  if (channels) {
    notificationData.channels = channels;
  }

  return createNotification(userId, notificationData);
};

module.exports = {
  NOTIFICATION_TYPE,
  NOTIFICATION_CHANNEL,
  NOTIFICATION_PRIORITY,
  createNotification,
  getUserNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteReadNotifications,
  getNotificationPreferences,
  updateNotificationPreferences,
  sendBulkNotification,
  getUnreadCount,
  sendTemplatedNotification,
  NOTIFICATION_TEMPLATES,
};
