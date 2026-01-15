const express = require("express");
const router = express.Router();
const portfolioController = require("../controllers/portfolioController");
const { authenticate } = require("../middleware/authMiddleware");
const asyncHandler = require("../middleware/asyncHandler");

// All routes require authentication
router.use(authenticate);

router.get("/", asyncHandler(portfolioController.getPortfolio));
router.get("/value", asyncHandler(portfolioController.getPortfolioValue));
router.get("/performance", asyncHandler(portfolioController.getPortfolioPerformance));
router.get("/history", asyncHandler(portfolioController.getPortfolioHistory));
router.get("/risk", asyncHandler(portfolioController.getRiskMetrics));
router.get("/income", asyncHandler(portfolioController.getIncomeSummary));

router.get("/allocation", asyncHandler(portfolioController.getTargetAllocation));
router.put("/allocation", asyncHandler(portfolioController.setTargetAllocation));
router.get("/rebalance", asyncHandler(portfolioController.getRebalancing));

router.post("/snapshot", asyncHandler(portfolioController.recordSnapshot));

module.exports = router;
