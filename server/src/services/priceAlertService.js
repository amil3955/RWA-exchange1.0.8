const { v4: uuidv4 } = require("uuid");
const db = require("../db");

/**
 * Price Alert Service - Handles price alerts and notifications
 * Supports various alert conditions and notification channels
 */

const ALERT_TYPE = {
  PRICE_ABOVE: "price_above",
  PRICE_BELOW: "price_below",
  PERCENT_CHANGE: "percent_change",
  VOLUME_SPIKE: "volume_spike",
  PRICE_RANGE: "price_range",
};

const ALERT_STATUS = {
  ACTIVE: "active",
  TRIGGERED: "triggered",
  EXPIRED: "expired",
  CANCELLED: "cancelled",
};

/**
 * Create price alert
 */
const createAlert = async (userId, alertData) => {
  const data = db.read();

  if (!data.priceAlerts) {
    data.priceAlerts = [];
  }

  const alert = {
    id: uuidv4(),
    userId,
    symbol: alertData.symbol,
    type: alertData.type || ALERT_TYPE.PRICE_ABOVE,
    condition: {
      targetPrice: alertData.targetPrice || null,
      percentChange: alertData.percentChange || null,
      priceRange: alertData.priceRange || null,
      volumeThreshold: alertData.volumeThreshold || null,
    },
    notification: {
      channels: alertData.channels || ["in_app"],
      message: alertData.message || null,
    },
    repeating: alertData.repeating || false,
    expiresAt: alertData.expiresAt || null,
    status: ALERT_STATUS.ACTIVE,
    triggeredCount: 0,
    lastTriggeredAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  data.priceAlerts.push(alert);
  db.write(data);

  return alert;
};

/**
 * Get alert by ID
 */
const getAlertById = async (alertId) => {
  const data = db.read();
  const alert = (data.priceAlerts || []).find((a) => a.id === alertId);

  if (!alert) {
    throw new Error("Alert not found");
  }

  return alert;
};

/**
 * Get user alerts
 */
const getUserAlerts = async (userId, filters = {}) => {
  const data = db.read();
  let alerts = (data.priceAlerts || []).filter((a) => a.userId === userId);

  if (filters.symbol) {
    alerts = alerts.filter((a) => a.symbol === filters.symbol);
  }

  if (filters.status) {
    alerts = alerts.filter((a) => a.status === filters.status);
  }

  if (filters.type) {
    alerts = alerts.filter((a) => a.type === filters.type);
  }

  return alerts;
};

/**
 * Update alert
 */
const updateAlert = async (alertId, userId, updates) => {
  const data = db.read();
  const index = (data.priceAlerts || []).findIndex(
    (a) => a.id === alertId && a.userId === userId
  );

  if (index === -1) {
    throw new Error("Alert not found or unauthorized");
  }

  const alert = data.priceAlerts[index];

  if (updates.targetPrice !== undefined) {
    alert.condition.targetPrice = updates.targetPrice;
  }

  if (updates.channels) {
    alert.notification.channels = updates.channels;
  }

  if (updates.repeating !== undefined) {
    alert.repeating = updates.repeating;
  }

  if (updates.expiresAt !== undefined) {
    alert.expiresAt = updates.expiresAt;
  }

  if (updates.status) {
    alert.status = updates.status;
  }

  alert.updatedAt = new Date().toISOString();
  data.priceAlerts[index] = alert;
  db.write(data);

  return alert;
};

/**
 * Delete alert
 */
const deleteAlert = async (alertId, userId) => {
  const data = db.read();
  const index = (data.priceAlerts || []).findIndex(
    (a) => a.id === alertId && a.userId === userId
  );

  if (index === -1) {
    throw new Error("Alert not found or unauthorized");
  }

  data.priceAlerts.splice(index, 1);
  db.write(data);

  return { success: true };
};

/**
 * Check alerts against current price
 */
const checkAlerts = async (symbol, currentPrice, volume = null) => {
  const data = db.read();
  const now = new Date();

  const activeAlerts = (data.priceAlerts || []).filter(
    (a) =>
      a.symbol === symbol &&
      a.status === ALERT_STATUS.ACTIVE &&
      (!a.expiresAt || new Date(a.expiresAt) > now)
  );

  const triggeredAlerts = [];

  for (const alert of activeAlerts) {
    let shouldTrigger = false;

    switch (alert.type) {
      case ALERT_TYPE.PRICE_ABOVE:
        shouldTrigger = currentPrice >= alert.condition.targetPrice;
        break;

      case ALERT_TYPE.PRICE_BELOW:
        shouldTrigger = currentPrice <= alert.condition.targetPrice;
        break;

      case ALERT_TYPE.PERCENT_CHANGE:
        // Would need previous price to calculate
        break;

      case ALERT_TYPE.VOLUME_SPIKE:
        if (volume && alert.condition.volumeThreshold) {
          shouldTrigger = volume >= alert.condition.volumeThreshold;
        }
        break;

      case ALERT_TYPE.PRICE_RANGE:
        if (alert.condition.priceRange) {
          const { min, max } = alert.condition.priceRange;
          shouldTrigger = currentPrice >= min && currentPrice <= max;
        }
        break;
    }

    if (shouldTrigger) {
      // Trigger the alert
      const index = data.priceAlerts.findIndex((a) => a.id === alert.id);

      if (alert.repeating) {
        data.priceAlerts[index].triggeredCount++;
        data.priceAlerts[index].lastTriggeredAt = now.toISOString();
      } else {
        data.priceAlerts[index].status = ALERT_STATUS.TRIGGERED;
        data.priceAlerts[index].triggeredCount = 1;
        data.priceAlerts[index].lastTriggeredAt = now.toISOString();
      }

      data.priceAlerts[index].updatedAt = now.toISOString();

      triggeredAlerts.push({
        ...alert,
        currentPrice,
        triggeredAt: now.toISOString(),
      });
    }
  }

  if (triggeredAlerts.length > 0) {
    db.write(data);
  }

  return triggeredAlerts;
};

/**
 * Get alert statistics
 */
const getAlertStatistics = async (userId = null) => {
  const data = db.read();
  let alerts = data.priceAlerts || [];

  if (userId) {
    alerts = alerts.filter((a) => a.userId === userId);
  }

  const active = alerts.filter((a) => a.status === ALERT_STATUS.ACTIVE).length;
  const triggered = alerts.filter((a) => a.status === ALERT_STATUS.TRIGGERED).length;

  const bySymbol = {};
  const byType = {};

  alerts.forEach((a) => {
    bySymbol[a.symbol] = (bySymbol[a.symbol] || 0) + 1;
    byType[a.type] = (byType[a.type] || 0) + 1;
  });

  return {
    total: alerts.length,
    active,
    triggered,
    expired: alerts.filter((a) => a.status === ALERT_STATUS.EXPIRED).length,
    cancelled: alerts.filter((a) => a.status === ALERT_STATUS.CANCELLED).length,
    totalTriggered: alerts.reduce((sum, a) => sum + a.triggeredCount, 0),
    bySymbol,
    byType,
  };
};

/**
 * Clean expired alerts
 */
const cleanExpiredAlerts = async () => {
  const data = db.read();
  const now = new Date();
  let cleaned = 0;

  data.priceAlerts = (data.priceAlerts || []).map((a) => {
    if (
      a.status === ALERT_STATUS.ACTIVE &&
      a.expiresAt &&
      new Date(a.expiresAt) <= now
    ) {
      a.status = ALERT_STATUS.EXPIRED;
      a.updatedAt = now.toISOString();
      cleaned++;
    }
    return a;
  });

  if (cleaned > 0) {
    db.write(data);
  }

  return { cleaned };
};

/**
 * Bulk create alerts
 */
const bulkCreateAlerts = async (userId, alerts) => {
  const results = [];

  for (const alertData of alerts) {
    try {
      const alert = await createAlert(userId, alertData);
      results.push({ status: "created", alert });
    } catch (error) {
      results.push({ status: "failed", error: error.message, data: alertData });
    }
  }

  return {
    total: alerts.length,
    created: results.filter((r) => r.status === "created").length,
    failed: results.filter((r) => r.status === "failed").length,
    results,
  };
};

module.exports = {
  ALERT_TYPE,
  ALERT_STATUS,
  createAlert,
  getAlertById,
  getUserAlerts,
  updateAlert,
  deleteAlert,
  checkAlerts,
  getAlertStatistics,
  cleanExpiredAlerts,
  bulkCreateAlerts,
};
