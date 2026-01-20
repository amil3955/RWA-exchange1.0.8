const asyncHandler = require("../middleware/asyncHandler");
const userService = require("../services/userService");

const ensureSelfOrMerchant = (requestingUser, targetUserId) => {
  if (requestingUser.id === targetUserId) return;
  if (requestingUser.role === "merchant") return;
  const error = new Error("Not authorized to access this user.");
  error.statusCode = 403;
  throw error;
};

const getCards = asyncHandler((req, res) => {
  ensureSelfOrMerchant(req.user, req.params.userId);
  const data = userService.getCards(req.params.userId);
  res.json({ cards: data });
});

const addCard = asyncHandler((req, res) => {
  ensureSelfOrMerchant(req.user, req.params.userId);
  const card = userService.addCard(req.params.userId, req.body);
  res.status(201).json({ card });
});

const getBanks = asyncHandler((req, res) => {
  ensureSelfOrMerchant(req.user, req.params.userId);
  const data = userService.getBanks(req.params.userId);
  res.json({ banks: data });
});

const addBank = asyncHandler((req, res) => {
  ensureSelfOrMerchant(req.user, req.params.userId);
  const bank = userService.addBank(req.params.userId, req.body);
  res.status(201).json({ bank });
});

const getTransactions = asyncHandler((req, res) => {
  ensureSelfOrMerchant(req.user, req.params.userId);
  const txns = userService.getTransactions(req.params.userId);
  res.json({ transactions: txns });
});

module.exports = {
  getCards,
  addCard,
  getBanks,
  addBank,
  getTransactions,
};


