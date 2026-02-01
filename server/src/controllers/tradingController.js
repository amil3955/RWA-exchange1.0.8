const orderService = require("../services/orderService");
const tradingService = require("../services/tradingService");
const matchingService = require("../services/matchingService");

/**
 * Trading Controller - Handles trading-related HTTP requests
 */

const placeOrder = async (req, res, next) => {
  try {
    const result = await tradingService.placeOrder(req.user.id, req.body);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const getOrder = async (req, res, next) => {
  try {
    const order = await orderService.getOrderById(req.params.id);
    res.json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
};

const getUserOrders = async (req, res, next) => {
  try {
    const result = await orderService.getUserOrders(req.user.id, req.query);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

const getOpenOrders = async (req, res, next) => {
  try {
    const result = await orderService.getOpenOrders({ ...req.query, userId: req.user.id });
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

const cancelOrder = async (req, res, next) => {
  try {
    const order = await orderService.cancelOrder(req.params.id, req.user.id, req.body.reason);
    res.json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
};

const cancelAllOrders = async (req, res, next) => {
  try {
    const result = await orderService.cancelAllOrders(req.user.id, req.query);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

const modifyOrder = async (req, res, next) => {
  try {
    const order = await orderService.modifyOrder(req.params.id, req.user.id, req.body);
    res.json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
};

const getOrderBook = async (req, res, next) => {
  try {
    const orderBook = await orderService.getOrderBook(req.params.symbol, req.query.depth);
    res.json({ success: true, data: orderBook });
  } catch (error) {
    next(error);
  }
};

const getOrderHistory = async (req, res, next) => {
  try {
    const result = await orderService.getOrderHistory(req.user.id, req.query);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

const getOrderStatistics = async (req, res, next) => {
  try {
    const stats = await orderService.getOrderStatistics(req.user.id);
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
};

const getTradingStatus = async (req, res, next) => {
  try {
    const status = await tradingService.getTradingStatus(req.params.symbol);
    res.json({ success: true, data: status });
  } catch (error) {
    next(error);
  }
};

const getMarketData = async (req, res, next) => {
  try {
    const data = await tradingService.getMarketData(req.params.symbol);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const getUserPositions = async (req, res, next) => {
  try {
    const positions = await tradingService.getUserPositions(req.user.id);
    res.json({ success: true, data: positions });
  } catch (error) {
    next(error);
  }
};

const getTradingPairs = async (req, res, next) => {
  try {
    const pairs = await tradingService.getTradingPairs();
    res.json({ success: true, data: pairs });
  } catch (error) {
    next(error);
  }
};

const getOHLCV = async (req, res, next) => {
  try {
    const data = await tradingService.getOHLCV(req.params.symbol, req.query.interval, req.query.limit);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const getRecentTrades = async (req, res, next) => {
  try {
    const trades = await matchingService.getRecentTrades(req.params.symbol, req.query.limit);
    res.json({ success: true, data: trades });
  } catch (error) {
    next(error);
  }
};

const getUserTrades = async (req, res, next) => {
  try {
    const result = await matchingService.getUserTrades(req.user.id, req.query);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

const getUserTradingStats = async (req, res, next) => {
  try {
    const stats = await tradingService.getUserTradingStats(req.user.id);
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  placeOrder,
  getOrder,
  getUserOrders,
  getOpenOrders,
  cancelOrder,
  cancelAllOrders,
  modifyOrder,
  getOrderBook,
  getOrderHistory,
  getOrderStatistics,
  getTradingStatus,
  getMarketData,
  getUserPositions,
  getTradingPairs,
  getOHLCV,
  getRecentTrades,
  getUserTrades,
  getUserTradingStats,
};
