const { v4: uuidv4 } = require("uuid");
const db = require("../db");

/**
 * Webhook Service - Handles webhook subscriptions and delivery
 * Supports event-driven notifications to external systems
 */

const WEBHOOK_EVENT = {
  TRADE_EXECUTED: "trade.executed",
  ORDER_CREATED: "order.created",
  ORDER_FILLED: "order.filled",
  ORDER_CANCELLED: "order.cancelled",
  DEPOSIT_RECEIVED: "deposit.received",
  WITHDRAWAL_COMPLETED: "withdrawal.completed",
  KYC_STATUS_CHANGED: "kyc.status_changed",
  ASSET_CREATED: "asset.created",
  ASSET_TOKENIZED: "asset.tokenized",
  PRICE_UPDATED: "price.updated",
  SETTLEMENT_COMPLETED: "settlement.completed",
};

const WEBHOOK_STATUS = {
  ACTIVE: "active",
  INACTIVE: "inactive",
  SUSPENDED: "suspended",
};

const DELIVERY_STATUS = {
  PENDING: "pending",
  DELIVERED: "delivered",
  FAILED: "failed",
  RETRYING: "retrying",
};

/**
 * Register a webhook
 */
const registerWebhook = async (userId, webhookData) => {
  const data = db.read();

  if (!data.webhooks) {
    data.webhooks = [];
  }

  // Validate URL
  try {
    new URL(webhookData.url);
  } catch {
    throw new Error("Invalid webhook URL");
  }

  const webhook = {
    id: uuidv4(),
    userId,
    url: webhookData.url,
    events: webhookData.events || Object.values(WEBHOOK_EVENT),
    secret: webhookData.secret || generateSecret(),
    description: webhookData.description || null,
    headers: webhookData.headers || {},
    status: WEBHOOK_STATUS.ACTIVE,
    retryPolicy: {
      maxRetries: webhookData.maxRetries || 3,
      retryInterval: webhookData.retryInterval || 60000, // 1 minute
    },
    statistics: {
      totalDeliveries: 0,
      successfulDeliveries: 0,
      failedDeliveries: 0,
      lastDeliveryAt: null,
      lastSuccessAt: null,
      lastFailureAt: null,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  data.webhooks.push(webhook);
  db.write(data);

  return {
    ...webhook,
    secret: webhook.secret, // Return secret only on creation
  };
};

/**
 * Generate webhook secret
 */
const generateSecret = () => {
  return `whsec_${uuidv4().replace(/-/g, "")}`;
};

/**
 * Get webhook by ID
 */
const getWebhookById = async (webhookId) => {
  const data = db.read();
  const webhook = (data.webhooks || []).find((w) => w.id === webhookId);

  if (!webhook) {
    throw new Error("Webhook not found");
  }

  // Don't expose secret
  const { secret, ...safeWebhook } = webhook;
  return safeWebhook;
};

/**
 * Get user webhooks
 */
const getUserWebhooks = async (userId) => {
  const data = db.read();
  const webhooks = (data.webhooks || []).filter((w) => w.userId === userId);

  // Don't expose secrets
  return webhooks.map(({ secret, ...w }) => w);
};

/**
 * Update webhook
 */
const updateWebhook = async (webhookId, userId, updates) => {
  const data = db.read();
  const index = (data.webhooks || []).findIndex(
    (w) => w.id === webhookId && w.userId === userId
  );

  if (index === -1) {
    throw new Error("Webhook not found or unauthorized");
  }

  const webhook = data.webhooks[index];

  if (updates.url) {
    try {
      new URL(updates.url);
      webhook.url = updates.url;
    } catch {
      throw new Error("Invalid webhook URL");
    }
  }

  if (updates.events) {
    webhook.events = updates.events;
  }

  if (updates.description !== undefined) {
    webhook.description = updates.description;
  }

  if (updates.headers) {
    webhook.headers = updates.headers;
  }

  if (updates.status && Object.values(WEBHOOK_STATUS).includes(updates.status)) {
    webhook.status = updates.status;
  }

  webhook.updatedAt = new Date().toISOString();
  data.webhooks[index] = webhook;
  db.write(data);

  const { secret, ...safeWebhook } = webhook;
  return safeWebhook;
};

/**
 * Delete webhook
 */
const deleteWebhook = async (webhookId, userId) => {
  const data = db.read();
  const index = (data.webhooks || []).findIndex(
    (w) => w.id === webhookId && w.userId === userId
  );

  if (index === -1) {
    throw new Error("Webhook not found or unauthorized");
  }

  data.webhooks.splice(index, 1);
  db.write(data);

  return { success: true };
};

/**
 * Rotate webhook secret
 */
const rotateSecret = async (webhookId, userId) => {
  const data = db.read();
  const index = (data.webhooks || []).findIndex(
    (w) => w.id === webhookId && w.userId === userId
  );

  if (index === -1) {
    throw new Error("Webhook not found or unauthorized");
  }

  const newSecret = generateSecret();
  data.webhooks[index].secret = newSecret;
  data.webhooks[index].updatedAt = new Date().toISOString();
  db.write(data);

  return { secret: newSecret };
};

/**
 * Trigger webhook event
 */
const triggerEvent = async (event, payload) => {
  const data = db.read();

  // Find all active webhooks subscribed to this event
  const subscribedWebhooks = (data.webhooks || []).filter(
    (w) => w.status === WEBHOOK_STATUS.ACTIVE && w.events.includes(event)
  );

  const deliveries = [];

  for (const webhook of subscribedWebhooks) {
    const delivery = await createDelivery(webhook, event, payload);
    deliveries.push(delivery);
  }

  return {
    event,
    webhooksNotified: deliveries.length,
    deliveries: deliveries.map((d) => d.id),
  };
};

/**
 * Create webhook delivery
 */
const createDelivery = async (webhook, event, payload) => {
  const data = db.read();

  if (!data.webhookDeliveries) {
    data.webhookDeliveries = [];
  }

  const delivery = {
    id: uuidv4(),
    webhookId: webhook.id,
    event,
    payload,
    url: webhook.url,
    status: DELIVERY_STATUS.PENDING,
    attempts: 0,
    maxAttempts: webhook.retryPolicy.maxRetries + 1,
    response: null,
    error: null,
    createdAt: new Date().toISOString(),
    deliveredAt: null,
  };

  data.webhookDeliveries.push(delivery);
  db.write(data);

  // Attempt delivery
  await attemptDelivery(delivery.id);

  return delivery;
};

/**
 * Attempt webhook delivery (mock)
 */
const attemptDelivery = async (deliveryId) => {
  const data = db.read();
  const deliveryIndex = (data.webhookDeliveries || []).findIndex(
    (d) => d.id === deliveryId
  );

  if (deliveryIndex === -1) return null;

  const delivery = data.webhookDeliveries[deliveryIndex];
  const webhookIndex = (data.webhooks || []).findIndex(
    (w) => w.id === delivery.webhookId
  );

  if (webhookIndex === -1) return null;

  const webhook = data.webhooks[webhookIndex];

  delivery.attempts++;
  delivery.lastAttemptAt = new Date().toISOString();

  // Simulate HTTP POST (in production, would make actual HTTP request)
  // Mock 95% success rate
  const success = Math.random() < 0.95;

  if (success) {
    delivery.status = DELIVERY_STATUS.DELIVERED;
    delivery.deliveredAt = new Date().toISOString();
    delivery.response = {
      statusCode: 200,
      body: "OK",
    };

    // Update webhook statistics
    webhook.statistics.totalDeliveries++;
    webhook.statistics.successfulDeliveries++;
    webhook.statistics.lastDeliveryAt = new Date().toISOString();
    webhook.statistics.lastSuccessAt = new Date().toISOString();
  } else {
    if (delivery.attempts >= delivery.maxAttempts) {
      delivery.status = DELIVERY_STATUS.FAILED;
      webhook.statistics.failedDeliveries++;
      webhook.statistics.lastFailureAt = new Date().toISOString();
    } else {
      delivery.status = DELIVERY_STATUS.RETRYING;
      delivery.nextRetryAt = new Date(
        Date.now() + webhook.retryPolicy.retryInterval
      ).toISOString();
    }
    delivery.error = "Simulated delivery failure";
    webhook.statistics.totalDeliveries++;
    webhook.statistics.lastDeliveryAt = new Date().toISOString();
  }

  data.webhookDeliveries[deliveryIndex] = delivery;
  data.webhooks[webhookIndex] = webhook;
  db.write(data);

  return delivery;
};

/**
 * Get webhook deliveries
 */
const getDeliveries = async (webhookId, filters = {}) => {
  const data = db.read();
  let deliveries = (data.webhookDeliveries || []).filter(
    (d) => d.webhookId === webhookId
  );

  if (filters.status) {
    deliveries = deliveries.filter((d) => d.status === filters.status);
  }

  if (filters.event) {
    deliveries = deliveries.filter((d) => d.event === filters.event);
  }

  deliveries.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const startIndex = (page - 1) * limit;

  return {
    deliveries: deliveries.slice(startIndex, startIndex + limit),
    total: deliveries.length,
    page,
    totalPages: Math.ceil(deliveries.length / limit),
  };
};

/**
 * Retry failed delivery
 */
const retryDelivery = async (deliveryId) => {
  const data = db.read();
  const index = (data.webhookDeliveries || []).findIndex(
    (d) => d.id === deliveryId
  );

  if (index === -1) {
    throw new Error("Delivery not found");
  }

  const delivery = data.webhookDeliveries[index];

  if (delivery.status !== DELIVERY_STATUS.FAILED) {
    throw new Error("Only failed deliveries can be retried");
  }

  delivery.status = DELIVERY_STATUS.RETRYING;
  delivery.maxAttempts = delivery.attempts + 1;
  db.write(data);

  return attemptDelivery(deliveryId);
};

/**
 * Test webhook
 */
const testWebhook = async (webhookId, userId) => {
  const data = db.read();
  const webhook = (data.webhooks || []).find(
    (w) => w.id === webhookId && w.userId === userId
  );

  if (!webhook) {
    throw new Error("Webhook not found or unauthorized");
  }

  const testPayload = {
    event: "webhook.test",
    timestamp: new Date().toISOString(),
    data: {
      message: "This is a test webhook delivery",
      webhookId,
    },
  };

  const delivery = await createDelivery(webhook, "webhook.test", testPayload);

  return delivery;
};

/**
 * Get webhook statistics
 */
const getWebhookStatistics = async (webhookId) => {
  const data = db.read();
  const webhook = (data.webhooks || []).find((w) => w.id === webhookId);

  if (!webhook) {
    throw new Error("Webhook not found");
  }

  const deliveries = (data.webhookDeliveries || []).filter(
    (d) => d.webhookId === webhookId
  );

  const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentDeliveries = deliveries.filter(
    (d) => new Date(d.createdAt) >= last7Days
  );

  const byDay = {};
  recentDeliveries.forEach((d) => {
    const day = d.createdAt.split("T")[0];
    if (!byDay[day]) {
      byDay[day] = { success: 0, failed: 0 };
    }
    if (d.status === DELIVERY_STATUS.DELIVERED) {
      byDay[day].success++;
    } else if (d.status === DELIVERY_STATUS.FAILED) {
      byDay[day].failed++;
    }
  });

  return {
    webhookId,
    status: webhook.status,
    statistics: webhook.statistics,
    successRate:
      webhook.statistics.totalDeliveries > 0
        ? (webhook.statistics.successfulDeliveries /
            webhook.statistics.totalDeliveries) *
          100
        : 0,
    recentDeliveries: {
      total: recentDeliveries.length,
      byDay,
    },
  };
};

module.exports = {
  WEBHOOK_EVENT,
  WEBHOOK_STATUS,
  DELIVERY_STATUS,
  registerWebhook,
  getWebhookById,
  getUserWebhooks,
  updateWebhook,
  deleteWebhook,
  rotateSecret,
  triggerEvent,
  getDeliveries,
  retryDelivery,
  testWebhook,
  getWebhookStatistics,
};
