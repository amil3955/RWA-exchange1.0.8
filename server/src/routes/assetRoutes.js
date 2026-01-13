const express = require("express");
const router = express.Router();
const assetController = require("../controllers/assetController");
const { authenticate } = require("../middleware/authMiddleware");
const asyncHandler = require("../middleware/asyncHandler");

// Public routes
router.get("/featured", asyncHandler(assetController.getFeaturedAssets));
router.get("/search", asyncHandler(assetController.searchAssets));
router.get("/:id", asyncHandler(assetController.getAsset));
router.get("/", asyncHandler(assetController.getAssets));

// Protected routes
router.post("/", authenticate, asyncHandler(assetController.createAsset));
router.get("/me/assets", authenticate, asyncHandler(assetController.getMyAssets));
router.get("/me/statistics", authenticate, asyncHandler(assetController.getOwnerStatistics));
router.put("/:id", authenticate, asyncHandler(assetController.updateAsset));
router.put("/:id/valuation", authenticate, asyncHandler(assetController.updateValuation));
router.post("/:id/documents", authenticate, asyncHandler(assetController.addDocument));
router.put("/:id/status", authenticate, asyncHandler(assetController.updateStatus));
router.delete("/:id", authenticate, asyncHandler(assetController.deleteAsset));

module.exports = router;
