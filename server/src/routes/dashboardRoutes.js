const { Router } = require("express");
const dashboardController = require("../controllers/dashboardController");
const { authenticate } = require("../middleware/authMiddleware");

const router = Router();

router.use(authenticate);

router.get("/users/:userId/summary", dashboardController.getUserSummary);
router.get("/merchant/summary", dashboardController.getMerchantSummary);

module.exports = router;


