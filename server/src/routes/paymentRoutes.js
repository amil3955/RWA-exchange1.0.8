const express = require("express");
const router = express.Router();
const paymentController = require("../controllers/paymentController");
const { authenticate } = require("../middleware/authMiddleware");
const asyncHandler = require("../middleware/asyncHandler");

// All routes require authentication
router.use(authenticate);

router.post("/", asyncHandler(paymentController.createPayment));
router.get("/", asyncHandler(paymentController.getUserPayments));
router.get("/statistics", asyncHandler(paymentController.getPaymentStatistics));
router.post("/calculate-fees", asyncHandler(paymentController.calculateFees));
router.get("/:id", asyncHandler(paymentController.getPayment));
router.post("/:id/process", asyncHandler(paymentController.processPayment));
router.post("/:id/refund", asyncHandler(paymentController.refundPayment));

module.exports = router;
