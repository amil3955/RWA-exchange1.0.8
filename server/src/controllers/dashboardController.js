const asyncHandler = require("../middleware/asyncHandler");
const userService = require("../services/userService");
const dashboardService = require("../services/dashboardService");

const ensureSelf = (requestingUser, targetUserId) => {
  if (requestingUser.id !== targetUserId) {
    const error = new Error("Not authorized to access this dashboard.");
    error.statusCode = 403;
    throw error;
  }
};

const getUserSummary = asyncHandler((req, res) => {
  ensureSelf(req.user, req.params.userId);
  const transactions = userService.getTransactions(req.user.id).slice(-5);
  const rewards = dashboardService.getRewardSummary(req.user.id);
  const market = dashboardService.getMarketData();

  res.json({
    transactions,
    rewards,
    market,
  });
});

const getMerchantSummary = asyncHandler((req, res) => {
  if (req.user.role !== "merchant") {
    const error = new Error("Merchant access required.");
    error.statusCode = 403;
    throw error;
  }

  const performance = dashboardService.getMerchantPerformance(req.user.id);
  const market = dashboardService.getMarketData();

  res.json({
    performance,
    market,
  });
});

module.exports = {
  getUserSummary,
  getMerchantSummary,
};


