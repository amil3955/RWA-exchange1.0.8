const { v4: uuid } = require("uuid");
const { readDb, withDb } = require("../db");

const getCards = (userId) => {
  const db = readDb();
  return db.cards.filter((card) => card.holder_id === userId);
};

const getBanks = (userId) => {
  const db = readDb();
  return db.banks.filter((bank) => bank.holder_id === userId);
};

const addCard = (userId, payload) => {
  const newCard = {
    id: uuid(),
    holder_id: userId,
    brand: payload.brand,
    last4: payload.last4,
    exp_month: payload.exp_month,
    exp_year: payload.exp_year,
    nickname: payload.nickname || `${payload.brand} ${payload.last4}`,
    default: Boolean(payload.default),
  };

  withDb((db) => {
    db.cards.push(newCard);
    return db;
  });

  return newCard;
};

const addBank = (userId, payload) => {
  const newBank = {
    id: uuid(),
    holder_id: userId,
    name: payload.name,
    account_last4: payload.account_last4,
    routing_number: payload.routing_number,
    nickname: payload.nickname || `${payload.name} ****${payload.account_last4}`,
    type: payload.type || "checking",
  };

  withDb((db) => {
    db.banks.push(newBank);
    return db;
  });

  return newBank;
};

const getTransactions = (userId) => {
  const db = readDb();
  return db.transactions.filter((txn) => txn.user_id === userId);
};

module.exports = {
  getCards,
  getBanks,
  addCard,
  addBank,
  getTransactions,
};


