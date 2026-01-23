const { Router } = require("express");
const userController = require("../controllers/userController");
const validateRequest = require("../middleware/validateRequest");
const { cardSchema, bankSchema } = require("./validators");
const { authenticate } = require("../middleware/authMiddleware");

const router = Router();

router.use(authenticate);

router.get("/:userId/cards", userController.getCards);
router.post(
  "/:userId/cards",
  validateRequest(cardSchema),
  userController.addCard
);

router.get("/:userId/banks", userController.getBanks);
router.post(
  "/:userId/banks",
  validateRequest(bankSchema),
  userController.addBank
);

router.get("/:userId/transactions", userController.getTransactions);

module.exports = router;


