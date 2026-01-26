const portfolioService = require("../services/portfolioService");

/**
 * Portfolio Controller - Handles portfolio-related HTTP requests
 */

const getPortfolio = async (req, res, next) => {
  try {
    const portfolio = await portfolioService.getPortfolio(req.user.id);
    res.json({ success: true, data: portfolio });
  } catch (error) {
    next(error);
  }
};

const getPortfolioValue = async (req, res, next) => {
  try {
    const value = await portfolioService.calculatePortfolioValue(req.user.id);
    res.json({ success: true, data: value });
  } catch (error) {
    next(error);
  }
};

const getPortfolioPerformance = async (req, res, next) => {
  try {
    const performance = await portfolioService.getPortfolioPerformance(
      req.user.id,
      req.query.period
    );
    res.json({ success: true, data: performance });
  } catch (error) {
    next(error);
  }
};

const getTargetAllocation = async (req, res, next) => {
  try {
    const target = await portfolioService.getTargetAllocation(req.user.id);
    res.json({ success: true, data: target });
  } catch (error) {
    next(error);
  }
};

const setTargetAllocation = async (req, res, next) => {
  try {
    const target = await portfolioService.setTargetAllocation(req.user.id, req.body);
    res.json({ success: true, data: target });
  } catch (error) {
    next(error);
  }
};

const getRebalancing = async (req, res, next) => {
  try {
    const rebalancing = await portfolioService.calculateRebalancing(req.user.id);
    res.json({ success: true, data: rebalancing });
  } catch (error) {
    next(error);
  }
};

const getRiskMetrics = async (req, res, next) => {
  try {
    const metrics = await portfolioService.getRiskMetrics(req.user.id);
    res.json({ success: true, data: metrics });
  } catch (error) {
    next(error);
  }
};

const getPortfolioHistory = async (req, res, next) => {
  try {
    const history = await portfolioService.getPortfolioHistory(req.user.id, req.query.period);
    res.json({ success: true, data: history });
  } catch (error) {
    next(error);
  }
};

const recordSnapshot = async (req, res, next) => {
  try {
    const snapshot = await portfolioService.recordSnapshot(req.user.id);
    res.json({ success: true, data: snapshot });
  } catch (error) {
    next(error);
  }
};

const getIncomeSummary = async (req, res, next) => {
  try {
    const summary = await portfolioService.getIncomeSummary(req.user.id, req.query.year);
    res.json({ success: true, data: summary });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPortfolio,
  getPortfolioValue,
  getPortfolioPerformance,
  getTargetAllocation,
  setTargetAllocation,
  getRebalancing,
  getRiskMetrics,
  getPortfolioHistory,
  recordSnapshot,
  getIncomeSummary,
};
