const { readDb } = require("../db");

const getRewardSummary = (userId) => {
  const db = readDb();
  return db.rewards.filter((reward) => reward.user_id === userId);
};

const getMarketData = () => {
  const db = readDb();
  return db.marketData;
};

const getMerchantPerformance = (merchantId) => {
  const db = readDb();
  const merchantTxns = db.transactions.filter(
    (txn) => txn.merchant_id === merchantId
  );

  const grossVolume = merchantTxns.reduce(
    (acc, txn) => acc + (txn.currency === "USD" ? txn.amount : 0),
    0
  );

  return {
    totalTransactions: merchantTxns.length,
    grossVolume,
    latest: merchantTxns.slice(-5),
  };
};

module.exports = {
  getRewardSummary,
  getMarketData,
  getMerchantPerformance,
};


