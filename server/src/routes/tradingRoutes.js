const express = require("express");
const router = express.Router();
const tradingController = require("../controllers/tradingController");
const { authenticate } = require("../middleware/authMiddleware");
const asyncHandler = require("../middleware/asyncHandler");

// Public routes
router.get("/pairs", asyncHandler(tradingController.getTradingPairs));
router.get("/orderbook/:symbol", asyncHandler(tradingController.getOrderBook));
router.get("/trades/:symbol", asyncHandler(tradingController.getRecentTrades));
router.get("/market/:symbol", asyncHandler(tradingController.getMarketData));
router.get("/ohlcv/:symbol", asyncHandler(tradingController.getOHLCV));
router.get("/status/:symbol", asyncHandler(tradingController.getTradingStatus));

// Protected routes
router.post("/orders", authenticate, asyncHandler(tradingController.placeOrder));
router.get("/orders", authenticate, asyncHandler(tradingController.getUserOrders));
router.get("/orders/open", authenticate, asyncHandler(tradingController.getOpenOrders));
router.get("/orders/history", authenticate, asyncHandler(tradingController.getOrderHistory));
router.get("/orders/statistics", authenticate, asyncHandler(tradingController.getOrderStatistics));
router.get("/orders/:id", authenticate, asyncHandler(tradingController.getOrder));
router.put("/orders/:id", authenticate, asyncHandler(tradingController.modifyOrder));
router.delete("/orders/:id", authenticate, asyncHandler(tradingController.cancelOrder));
router.delete("/orders", authenticate, asyncHandler(tradingController.cancelAllOrders));

router.get("/positions", authenticate, asyncHandler(tradingController.getUserPositions));
router.get("/my-trades", authenticate, asyncHandler(tradingController.getUserTrades));
router.get("/statistics", authenticate, asyncHandler(tradingController.getUserTradingStats));

module.exports = router;
