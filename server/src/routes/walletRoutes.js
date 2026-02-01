const express = require("express");
const router = express.Router();
const walletController = require("../controllers/walletController");
const { authenticate } = require("../middleware/authMiddleware");
const asyncHandler = require("../middleware/asyncHandler");

// All routes require authentication
router.use(authenticate);

router.post("/", asyncHandler(walletController.createWallet));
router.get("/", asyncHandler(walletController.getUserWallets));
router.get("/:id", asyncHandler(walletController.getWallet));
router.put("/:id", asyncHandler(walletController.updateWallet));
router.delete("/:id", asyncHandler(walletController.deleteWallet));

router.put("/:id/default", asyncHandler(walletController.setDefaultWallet));
router.get("/:id/balances", asyncHandler(walletController.getWalletBalances));
router.get("/:id/activity", asyncHandler(walletController.getActivityHistory));
router.get("/:id/statistics", asyncHandler(walletController.getWalletStatistics));

router.put("/:id/security", asyncHandler(walletController.updateSecuritySettings));
router.post("/:id/whitelist", asyncHandler(walletController.addToWhitelist));
router.delete("/:id/whitelist", asyncHandler(walletController.removeFromWhitelist));

module.exports = router;
