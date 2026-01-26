const analyticsService = require("../services/analyticsService");
const reportService = require("../services/reportService");

/**
 * Analytics Controller - Handles analytics-related HTTP requests
 */

const getTradingAnalytics = async (req, res, next) => {
  try {
    const analytics = await analyticsService.getTradingAnalytics(req.query.period);
    res.json({ success: true, data: analytics });
  } catch (error) {
    next(error);
  }
};

const getUserAnalytics = async (req, res, next) => {
  try {
    const analytics = await analyticsService.getUserAnalytics(req.query.period);
    res.json({ success: true, data: analytics });
  } catch (error) {
    next(error);
  }
};

const getAssetAnalytics = async (req, res, next) => {
  try {
    const analytics = await analyticsService.getAssetAnalytics();
    res.json({ success: true, data: analytics });
  } catch (error) {
    next(error);
  }
};

const getRevenueAnalytics = async (req, res, next) => {
  try {
    const analytics = await analyticsService.getRevenueAnalytics(req.query.period);
    res.json({ success: true, data: analytics });
  } catch (error) {
    next(error);
  }
};

const getDashboardMetrics = async (req, res, next) => {
  try {
    const metrics = await analyticsService.getDashboardMetrics();
    res.json({ success: true, data: metrics });
  } catch (error) {
    next(error);
  }
};

const getUserPortfolioAnalytics = async (req, res, next) => {
  try {
    const analytics = await analyticsService.getUserPortfolioAnalytics(req.user.id);
    res.json({ success: true, data: analytics });
  } catch (error) {
    next(error);
  }
};

const getMarketOverview = async (req, res, next) => {
  try {
    const overview = await analyticsService.getMarketOverview();
    res.json({ success: true, data: overview });
  } catch (error) {
    next(error);
  }
};

// Report endpoints
const createReport = async (req, res, next) => {
  try {
    const report = await reportService.createReport(req.user.id, req.body);
    res.status(201).json({ success: true, data: report });
  } catch (error) {
    next(error);
  }
};

const getReport = async (req, res, next) => {
  try {
    const report = await reportService.getReportById(req.params.id);
    res.json({ success: true, data: report });
  } catch (error) {
    next(error);
  }
};

const getUserReports = async (req, res, next) => {
  try {
    const reports = await reportService.getUserReports(req.user.id, req.query);
    res.json({ success: true, data: reports });
  } catch (error) {
    next(error);
  }
};

const deleteReport = async (req, res, next) => {
  try {
    const result = await reportService.deleteReport(req.params.id, req.user.id);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getTradingAnalytics,
  getUserAnalytics,
  getAssetAnalytics,
  getRevenueAnalytics,
  getDashboardMetrics,
  getUserPortfolioAnalytics,
  getMarketOverview,
  createReport,
  getReport,
  getUserReports,
  deleteReport,
};
