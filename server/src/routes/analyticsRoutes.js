const express = require("express");
const router = express.Router();
const analyticsController = require("../controllers/analyticsController");
const { authenticate } = require("../middleware/authMiddleware");
const asyncHandler = require("../middleware/asyncHandler");

// Public analytics
router.get("/market", asyncHandler(analyticsController.getMarketOverview));

// Protected routes
router.get("/dashboard", authenticate, asyncHandler(analyticsController.getDashboardMetrics));
router.get("/trading", authenticate, asyncHandler(analyticsController.getTradingAnalytics));
router.get("/users", authenticate, asyncHandler(analyticsController.getUserAnalytics));
router.get("/assets", authenticate, asyncHandler(analyticsController.getAssetAnalytics));
router.get("/revenue", authenticate, asyncHandler(analyticsController.getRevenueAnalytics));
router.get("/portfolio", authenticate, asyncHandler(analyticsController.getUserPortfolioAnalytics));

// Reports
router.post("/reports", authenticate, asyncHandler(analyticsController.createReport));
router.get("/reports", authenticate, asyncHandler(analyticsController.getUserReports));
router.get("/reports/:id", authenticate, asyncHandler(analyticsController.getReport));
router.delete("/reports/:id", authenticate, asyncHandler(analyticsController.deleteReport));

module.exports = router;
