const { v4: uuid } = require("uuid");
const { readDb, withDb } = require("../db");

const getGoodsByMethod = (method) => {
  const db = readDb();
  return db.goods.filter((item) => item.payment_method === method);
};

const getCryptoRate = (symbol) => {
  const db = readDb();
  return (
    db.cryptos.find((asset) => asset.type.toUpperCase() === symbol.toUpperCase()) ||
    null
  );
};

const createTransaction = ({ userId, merchantId, amount, payment_method, currency }) => {
  const newTxn = {
    id: uuid(),
    user_id: userId,
    merchant_id: merchantId,
    amount,
    currency,
    payment_method,
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  withDb((db) => {
    db.transactions.push(newTxn);
    return db;
  });

  return newTxn;
};

module.exports = {
  getGoodsByMethod,
  getCryptoRate,
  createTransaction,
};


