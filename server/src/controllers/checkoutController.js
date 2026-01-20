const asyncHandler = require("../middleware/asyncHandler");
const checkoutService = require("../services/checkoutService");

const getGoods = asyncHandler((req, res) => {
  const { method } = req.params;
  const goods = checkoutService.getGoodsByMethod(method);
  res.json({ goods });
});

const getRate = asyncHandler((req, res, next) => {
  const { symbol } = req.params;
  const rate = checkoutService.getCryptoRate(symbol);
  if (!rate) {
    const error = new Error(`No rate found for ${symbol}`);
    error.statusCode = 404;
    return next(error);
  }
  return res.json({ rate });
});

const createTransaction = asyncHandler((req, res) => {
  const txn = checkoutService.createTransaction({
    userId: req.user.id,
    merchantId: req.body.merchantId,
    amount: req.body.amount,
    payment_method: req.body.payment_method,
    currency: req.body.currency,
  });
  res.status(201).json({ transaction: txn });
});

module.exports = {
  getGoods,
  getRate,
  createTransaction,
};


