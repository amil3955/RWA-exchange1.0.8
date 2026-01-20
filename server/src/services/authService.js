const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { v4: uuid } = require("uuid");
const env = require("../config/env");
const { readDb, withDb, setApiKey, verify } = require("../db");

const sanitizeUser = (user) => {
  const { passwordHash, ...rest } = user;
  return rest;
};

const generateToken = (user) =>
  jwt.sign(
    {
      role: user.role,
      email: user.email,
    },
    env.jwtSecret,
    { subject: user.id, expiresIn: env.tokenExpiresIn }
  );

const findUserByEmail = (email) => {
  const db = readDb();
  return db.users.find((user) => user.email.toLowerCase() === email.toLowerCase());
};

const signup = async ({ name, email, password, role }) => {
  const existing = findUserByEmail(email);
  if (existing) {
    const error = new Error("An account already exists for that email.");
    error.statusCode = 409;
    throw error;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const newUser = {
    id: uuid(),
    name,
    email: email.toLowerCase(),
    role,
    passwordHash,
    createdAt: new Date().toISOString(),
  };

  withDb((db) => {
    db.users.push(newUser);
    return db;
  });

  const token = generateToken(newUser);
  return {
    token,
    user: sanitizeUser(newUser),
  };
};


const login = async ({ email, password }) => {
  const user = findUserByEmail(email);

  if (!user) {
    const error = new Error("Invalid credentials.");
    error.statusCode = 401;
    throw error;
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    const error = new Error("Invalid credentials.");
    error.statusCode = 401;
    throw error;
  }

  const token = generateToken(user);
  return {
    token,
    user: sanitizeUser(user),
  };
};

// Payment / banking helpers (added)
const getCards = (userId) => {
  const db = readDb();
  db.cards = db.cards || [];
  return db.cards.filter((card) => card.holder_id === userId);
};

const getBanks = (userId) => {
  const db = readDb();
  db.banks = db.banks || [];
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
    createdAt: new Date().toISOString(),
  };

  withDb((db) => {
    db.cards = db.cards || [];
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
    createdAt: new Date().toISOString(),
  };

  withDb((db) => {
    db.banks = db.banks || [];
    db.banks.push(newBank);
    return db;
  });

  return newBank;
};

const getTransactions = (userId) => {
  const db = readDb();
  db.transactions = db.transactions || [];
  return db.transactions.filter((txn) => txn.user_id === userId);
};

module.exports = {
  signup,
  login,
  sanitizeUser,
  getCards,
  getBanks,
  addCard,
  addBank,
  getTransactions,
};


