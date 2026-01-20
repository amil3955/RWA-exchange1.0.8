const { z } = require("zod");

const signupSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["user", "merchant"]),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const cardSchema = z.object({
  brand: z.string().min(2),
  last4: z.string().regex(/^\d{4}$/),
  exp_month: z.string().regex(/^(0[1-9]|1[0-2])$/),
  exp_year: z.string().regex(/^\d{2}$/),
  nickname: z.string().optional(),
  default: z.boolean().optional(),
});

const bankSchema = z.object({
  name: z.string().min(2),
  account_last4: z.string().regex(/^\d{4}$/),
  routing_number: z.string().min(4),
  nickname: z.string().optional(),
  type: z.enum(["checking", "savings"]).optional(),
});

const transactionSchema = z.object({
  merchantId: z.string().uuid(),
  amount: z.number().positive(),
  currency: z.string().min(3),
  payment_method: z.enum(["card", "bank", "crypto"]),
});

module.exports = {
  signupSchema,
  loginSchema,
  cardSchema,
  bankSchema,
  transactionSchema,
};


