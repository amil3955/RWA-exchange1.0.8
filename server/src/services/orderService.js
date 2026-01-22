const { v4: uuidv4 } = require("uuid");
const db = require("../db");

/**
 * Order Service - Handles order management for the exchange
 * Supports limit orders, market orders, and various order types
 */

const ORDER_TYPE = {
  MARKET: "market",
  LIMIT: "limit",
  STOP_LOSS: "stop_loss",
  STOP_LIMIT: "stop_limit",
  TAKE_PROFIT: "take_profit",
  TRAILING_STOP: "trailing_stop",
};

const ORDER_SIDE = {
  BUY: "buy",
  SELL: "sell",
};

const ORDER_STATUS = {
  PENDING: "pending",
  OPEN: "open",
  PARTIALLY_FILLED: "partially_filled",
  FILLED: "filled",
  CANCELLED: "cancelled",
  EXPIRED: "expired",
  REJECTED: "rejected",
};

const TIME_IN_FORCE = {
  GTC: "good_till_cancelled",
  IOC: "immediate_or_cancel",
  FOK: "fill_or_kill",
  DAY: "day",
  GTD: "good_till_date",
};

/**
 * Create a new order
 */
const createOrder = async (userId, orderData) => {
  const data = db.read();

  if (!data.orders) {
    data.orders = [];
  }

  // Validate order
  const validation = validateOrder(orderData);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const order = {
    id: uuidv4(),
    userId,
    assetId: orderData.assetId,
    tokenId: orderData.tokenId,
    symbol: orderData.symbol,
    type: orderData.type || ORDER_TYPE.LIMIT,
    side: orderData.side,
    quantity: orderData.quantity,
    filledQuantity: 0,
    remainingQuantity: orderData.quantity,
    price: orderData.price || null,
    stopPrice: orderData.stopPrice || null,
    limitPrice: orderData.limitPrice || null,
    trailingAmount: orderData.trailingAmount || null,
    trailingPercent: orderData.trailingPercent || null,
    averageFilledPrice: null,
    timeInForce: orderData.timeInForce || TIME_IN_FORCE.GTC,
    expiresAt: orderData.expiresAt || null,
    status: ORDER_STATUS.PENDING,
    fills: [],
    fees: {
      estimated: calculateEstimatedFees(orderData),
      actual: 0,
    },
    metadata: {
      clientOrderId: orderData.clientOrderId || null,
      source: orderData.source || "web",
      ipAddress: orderData.ipAddress || null,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  data.orders.push(order);
  db.write(data);

  return order;
};

/**
 * Validate order parameters
 */
const validateOrder = (orderData) => {
  if (!orderData.side || !Object.values(ORDER_SIDE).includes(orderData.side)) {
    return { valid: false, error: "Invalid order side" };
  }

  if (!orderData.quantity || orderData.quantity <= 0) {
    return { valid: false, error: "Invalid quantity" };
  }

  if (orderData.type === ORDER_TYPE.LIMIT && !orderData.price) {
    return { valid: false, error: "Limit orders require a price" };
  }

  if (
    orderData.type === ORDER_TYPE.STOP_LOSS ||
    orderData.type === ORDER_TYPE.STOP_LIMIT
  ) {
    if (!orderData.stopPrice) {
      return { valid: false, error: "Stop orders require a stop price" };
    }
  }

  if (!orderData.assetId && !orderData.tokenId && !orderData.symbol) {
    return { valid: false, error: "Order must specify asset, token, or symbol" };
  }

  return { valid: true };
};

/**
 * Calculate estimated fees
 */
const calculateEstimatedFees = (orderData) => {
  const feeRate = 0.001; // 0.1% fee
  const notionalValue = (orderData.quantity || 0) * (orderData.price || 0);
  return notionalValue * feeRate;
};

/**
 * Get order by ID
 */
const getOrderById = async (orderId) => {
  const data = db.read();
  const order = (data.orders || []).find((o) => o.id === orderId);

  if (!order) {
    throw new Error("Order not found");
  }

  return order;
};

/**
 * Get orders by user
 */
const getUserOrders = async (userId, filters = {}) => {
  const data = db.read();
  let orders = (data.orders || []).filter((o) => o.userId === userId);

  if (filters.status) {
    orders = orders.filter((o) => o.status === filters.status);
  }

  if (filters.side) {
    orders = orders.filter((o) => o.side === filters.side);
  }

  if (filters.symbol) {
    orders = orders.filter((o) => o.symbol === filters.symbol);
  }

  if (filters.type) {
    orders = orders.filter((o) => o.type === filters.type);
  }

  if (filters.startDate) {
    orders = orders.filter(
      (o) => new Date(o.createdAt) >= new Date(filters.startDate)
    );
  }

  if (filters.endDate) {
    orders = orders.filter(
      (o) => new Date(o.createdAt) <= new Date(filters.endDate)
    );
  }

  // Sort by date descending
  orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // Pagination
  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const startIndex = (page - 1) * limit;

  return {
    orders: orders.slice(startIndex, startIndex + limit),
    total: orders.length,
    page,
    totalPages: Math.ceil(orders.length / limit),
  };
};

/**
 * Get open orders
 */
const getOpenOrders = async (filters = {}) => {
  const data = db.read();
  let orders = (data.orders || []).filter(
    (o) =>
      o.status === ORDER_STATUS.OPEN ||
      o.status === ORDER_STATUS.PARTIALLY_FILLED
  );

  if (filters.userId) {
    orders = orders.filter((o) => o.userId === filters.userId);
  }

  if (filters.symbol) {
    orders = orders.filter((o) => o.symbol === filters.symbol);
  }

  if (filters.side) {
    orders = orders.filter((o) => o.side === filters.side);
  }

  return orders;
};

/**
 * Update order status
 */
const updateOrderStatus = async (orderId, newStatus, additionalData = {}) => {
  const data = db.read();
  const index = (data.orders || []).findIndex((o) => o.id === orderId);

  if (index === -1) {
    throw new Error("Order not found");
  }

  if (!Object.values(ORDER_STATUS).includes(newStatus)) {
    throw new Error("Invalid order status");
  }

  const order = data.orders[index];

  order.status = newStatus;
  order.statusHistory = order.statusHistory || [];
  order.statusHistory.push({
    status: newStatus,
    timestamp: new Date().toISOString(),
    reason: additionalData.reason || null,
  });

  if (additionalData.filledQuantity !== undefined) {
    order.filledQuantity = additionalData.filledQuantity;
    order.remainingQuantity = order.quantity - order.filledQuantity;
  }

  if (additionalData.averageFilledPrice !== undefined) {
    order.averageFilledPrice = additionalData.averageFilledPrice;
  }

  order.updatedAt = new Date().toISOString();
  data.orders[index] = order;
  db.write(data);

  return order;
};

/**
 * Add fill to order
 */
const addFill = async (orderId, fillData) => {
  const data = db.read();
  const index = (data.orders || []).findIndex((o) => o.id === orderId);

  if (index === -1) {
    throw new Error("Order not found");
  }

  const order = data.orders[index];

  const fill = {
    id: uuidv4(),
    quantity: fillData.quantity,
    price: fillData.price,
    fee: fillData.fee || 0,
    counterpartyOrderId: fillData.counterpartyOrderId || null,
    tradeId: fillData.tradeId || null,
    timestamp: new Date().toISOString(),
  };

  order.fills.push(fill);
  order.filledQuantity += fill.quantity;
  order.remainingQuantity = order.quantity - order.filledQuantity;
  order.fees.actual += fill.fee;

  // Calculate average filled price
  const totalValue = order.fills.reduce((sum, f) => sum + f.quantity * f.price, 0);
  order.averageFilledPrice = totalValue / order.filledQuantity;

  // Update status
  if (order.remainingQuantity <= 0) {
    order.status = ORDER_STATUS.FILLED;
    order.filledAt = new Date().toISOString();
  } else if (order.filledQuantity > 0) {
    order.status = ORDER_STATUS.PARTIALLY_FILLED;
  }

  order.updatedAt = new Date().toISOString();
  data.orders[index] = order;
  db.write(data);

  return { order, fill };
};

/**
 * Cancel order
 */
const cancelOrder = async (orderId, userId, reason = null) => {
  const data = db.read();
  const index = (data.orders || []).findIndex(
    (o) => o.id === orderId && o.userId === userId
  );

  if (index === -1) {
    throw new Error("Order not found or unauthorized");
  }

  const order = data.orders[index];

  if (![ORDER_STATUS.OPEN, ORDER_STATUS.PENDING, ORDER_STATUS.PARTIALLY_FILLED].includes(order.status)) {
    throw new Error(`Cannot cancel order with status: ${order.status}`);
  }

  order.status = ORDER_STATUS.CANCELLED;
  order.cancelledAt = new Date().toISOString();
  order.cancellationReason = reason;
  order.statusHistory = order.statusHistory || [];
  order.statusHistory.push({
    status: ORDER_STATUS.CANCELLED,
    timestamp: new Date().toISOString(),
    reason,
  });
  order.updatedAt = new Date().toISOString();

  data.orders[index] = order;
  db.write(data);

  return order;
};

/**
 * Cancel all orders for user
 */
const cancelAllOrders = async (userId, filters = {}) => {
  const data = db.read();
  let cancelledCount = 0;

  data.orders = data.orders.map((order) => {
    if (
      order.userId === userId &&
      [ORDER_STATUS.OPEN, ORDER_STATUS.PENDING, ORDER_STATUS.PARTIALLY_FILLED].includes(order.status)
    ) {
      if (filters.symbol && order.symbol !== filters.symbol) {
        return order;
      }
      if (filters.side && order.side !== filters.side) {
        return order;
      }

      order.status = ORDER_STATUS.CANCELLED;
      order.cancelledAt = new Date().toISOString();
      order.cancellationReason = "bulk_cancel";
      order.updatedAt = new Date().toISOString();
      cancelledCount++;
    }
    return order;
  });

  db.write(data);

  return { cancelledCount };
};

/**
 * Modify order
 */
const modifyOrder = async (orderId, userId, modifications) => {
  const data = db.read();
  const index = (data.orders || []).findIndex(
    (o) => o.id === orderId && o.userId === userId
  );

  if (index === -1) {
    throw new Error("Order not found or unauthorized");
  }

  const order = data.orders[index];

  if (![ORDER_STATUS.OPEN, ORDER_STATUS.PENDING].includes(order.status)) {
    throw new Error(`Cannot modify order with status: ${order.status}`);
  }

  const allowedModifications = ["price", "quantity", "stopPrice", "limitPrice", "expiresAt"];

  allowedModifications.forEach((field) => {
    if (modifications[field] !== undefined) {
      if (field === "quantity") {
        if (modifications.quantity < order.filledQuantity) {
          throw new Error("New quantity cannot be less than filled quantity");
        }
        order.remainingQuantity = modifications.quantity - order.filledQuantity;
      }
      order[field] = modifications[field];
    }
  });

  order.modificationHistory = order.modificationHistory || [];
  order.modificationHistory.push({
    modifications,
    timestamp: new Date().toISOString(),
  });
  order.updatedAt = new Date().toISOString();

  data.orders[index] = order;
  db.write(data);

  return order;
};

/**
 * Get order book for a symbol
 */
const getOrderBook = async (symbol, depth = 20) => {
  const data = db.read();
  const openOrders = (data.orders || []).filter(
    (o) =>
      o.symbol === symbol &&
      (o.status === ORDER_STATUS.OPEN || o.status === ORDER_STATUS.PARTIALLY_FILLED) &&
      o.type === ORDER_TYPE.LIMIT
  );

  const bids = openOrders
    .filter((o) => o.side === ORDER_SIDE.BUY)
    .map((o) => ({
      price: o.price,
      quantity: o.remainingQuantity,
      orders: 1,
    }));

  const asks = openOrders
    .filter((o) => o.side === ORDER_SIDE.SELL)
    .map((o) => ({
      price: o.price,
      quantity: o.remainingQuantity,
      orders: 1,
    }));

  // Aggregate by price level
  const aggregatePriceLevels = (levels) => {
    const aggregated = {};
    levels.forEach((level) => {
      if (aggregated[level.price]) {
        aggregated[level.price].quantity += level.quantity;
        aggregated[level.price].orders += 1;
      } else {
        aggregated[level.price] = { ...level };
      }
    });
    return Object.values(aggregated);
  };

  const aggregatedBids = aggregatePriceLevels(bids)
    .sort((a, b) => b.price - a.price)
    .slice(0, depth);

  const aggregatedAsks = aggregatePriceLevels(asks)
    .sort((a, b) => a.price - b.price)
    .slice(0, depth);

  return {
    symbol,
    bids: aggregatedBids,
    asks: aggregatedAsks,
    timestamp: new Date().toISOString(),
  };
};

/**
 * Get order history
 */
const getOrderHistory = async (userId, filters = {}) => {
  const data = db.read();
  let orders = (data.orders || []).filter(
    (o) =>
      o.userId === userId &&
      [ORDER_STATUS.FILLED, ORDER_STATUS.CANCELLED, ORDER_STATUS.EXPIRED].includes(o.status)
  );

  if (filters.symbol) {
    orders = orders.filter((o) => o.symbol === filters.symbol);
  }

  if (filters.status) {
    orders = orders.filter((o) => o.status === filters.status);
  }

  orders.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const startIndex = (page - 1) * limit;

  return {
    orders: orders.slice(startIndex, startIndex + limit),
    total: orders.length,
    page,
    totalPages: Math.ceil(orders.length / limit),
  };
};

/**
 * Process expired orders
 */
const processExpiredOrders = async () => {
  const data = db.read();
  const now = new Date();
  let expiredCount = 0;

  data.orders = data.orders.map((order) => {
    if (
      [ORDER_STATUS.OPEN, ORDER_STATUS.PENDING].includes(order.status) &&
      order.expiresAt &&
      new Date(order.expiresAt) < now
    ) {
      order.status = ORDER_STATUS.EXPIRED;
      order.updatedAt = now.toISOString();
      expiredCount++;
    }
    return order;
  });

  if (expiredCount > 0) {
    db.write(data);
  }

  return { expiredCount };
};

/**
 * Get order statistics
 */
const getOrderStatistics = async (userId) => {
  const data = db.read();
  const orders = (data.orders || []).filter((o) => o.userId === userId);

  const stats = {
    totalOrders: orders.length,
    byStatus: {},
    bySide: {
      buy: orders.filter((o) => o.side === ORDER_SIDE.BUY).length,
      sell: orders.filter((o) => o.side === ORDER_SIDE.SELL).length,
    },
    totalVolume: orders
      .filter((o) => o.status === ORDER_STATUS.FILLED)
      .reduce((sum, o) => sum + o.filledQuantity * o.averageFilledPrice, 0),
    totalFees: orders.reduce((sum, o) => sum + o.fees.actual, 0),
  };

  orders.forEach((order) => {
    stats.byStatus[order.status] = (stats.byStatus[order.status] || 0) + 1;
  });

  return stats;
};

module.exports = {
  ORDER_TYPE,
  ORDER_SIDE,
  ORDER_STATUS,
  TIME_IN_FORCE,
  createOrder,
  getOrderById,
  getUserOrders,
  getOpenOrders,
  updateOrderStatus,
  addFill,
  cancelOrder,
  cancelAllOrders,
  modifyOrder,
  getOrderBook,
  getOrderHistory,
  processExpiredOrders,
  getOrderStatistics,
};
