const { Router } = require("express");
const authRoutes = require("./authRoutes");
const userRoutes = require("./userRoutes");
const checkoutRoutes = require("./checkoutRoutes");
const dashboardRoutes = require("./dashboardRoutes");
const healthRoutes = require("./healthRoutes");
const assetRoutes = require("./assetRoutes");
const tradingRoutes = require("./tradingRoutes");
const walletRoutes = require("./walletRoutes");
const portfolioRoutes = require("./portfolioRoutes");
const paymentRoutes = require("./paymentRoutes");
const notificationRoutes = require("./notificationRoutes");
const analyticsRoutes = require("./analyticsRoutes");

const router = Router();

// Health check
router.use("/health", healthRoutes);

// Authentication
router.use("/auth", authRoutes);

// User management
router.use("/users", userRoutes);

// Assets
router.use("/assets", assetRoutes);

// Trading
router.use("/trading", tradingRoutes);

// Wallets
router.use("/wallets", walletRoutes);

// Portfolio
router.use("/portfolio", portfolioRoutes);

// Payments
router.use("/payments", paymentRoutes);

// Notifications
router.use("/notifications", notificationRoutes);

// Analytics & Reports
router.use("/analytics", analyticsRoutes);

// Legacy routes
router.use("/checkout", checkoutRoutes);
router.use("/dashboard", dashboardRoutes);

module.exports = router;


