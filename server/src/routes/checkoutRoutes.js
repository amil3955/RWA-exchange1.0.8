const { Router } = require("express");
const checkoutController = require("../controllers/checkoutController");
const validateRequest = require("../middleware/validateRequest");
const { transactionSchema } = require("./validators");
const { authenticate } = require("../middleware/authMiddleware");

const router = Router();

router.get("/goods/:method", checkoutController.getGoods);
router.get("/rates/:symbol", checkoutController.getRate);
router.post(
  "/transactions",
  authenticate,
  validateRequest(transactionSchema),
  checkoutController.createTransaction
);

module.exports = router;


