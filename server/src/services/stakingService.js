const { v4: uuidv4 } = require("uuid");
const db = require("../db");

/**
 * Staking Service - Handles token staking and rewards
 * Supports flexible and locked staking with yield generation
 */

const STAKING_STATUS = {
  ACTIVE: "active",
  UNSTAKING: "unstaking",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
};

const STAKING_TIER = {
  BRONZE: { name: "Bronze", minStake: 100, apy: 5, multiplier: 1 },
  SILVER: { name: "Silver", minStake: 1000, apy: 8, multiplier: 1.2 },
  GOLD: { name: "Gold", minStake: 10000, apy: 12, multiplier: 1.5 },
  PLATINUM: { name: "Platinum", minStake: 100000, apy: 15, multiplier: 2 },
  DIAMOND: { name: "Diamond", minStake: 1000000, apy: 20, multiplier: 3 },
};

const LOCK_PERIOD = {
  FLEXIBLE: { days: 0, bonus: 0 },
  THIRTY_DAYS: { days: 30, bonus: 1 },
  NINETY_DAYS: { days: 90, bonus: 3 },
  ONE_YEAR: { days: 365, bonus: 5 },
};

/**
 * Create staking position
 */
const createStake = async (userId, stakeData) => {
  const data = db.read();

  if (!data.stakingPositions) {
    data.stakingPositions = [];
  }

  // Validate amount
  if (stakeData.amount <= 0) {
    throw new Error("Stake amount must be positive");
  }

  // Determine tier
  const tier = getTierForAmount(stakeData.amount);

  // Calculate lock period
  const lockPeriod = LOCK_PERIOD[stakeData.lockPeriod] || LOCK_PERIOD.FLEXIBLE;
  const unlockDate = lockPeriod.days > 0
    ? new Date(Date.now() + lockPeriod.days * 24 * 60 * 60 * 1000).toISOString()
    : null;

  // Calculate APY with bonuses
  const baseApy = tier.apy;
  const lockBonus = lockPeriod.bonus;
  const totalApy = baseApy + lockBonus;

  const stake = {
    id: uuidv4(),
    userId,
    tokenId: stakeData.tokenId || "PLATFORM_TOKEN",
    amount: stakeData.amount,
    tier: tier.name,
    lockPeriod: stakeData.lockPeriod || "FLEXIBLE",
    lockDays: lockPeriod.days,
    unlockDate,
    apy: {
      base: baseApy,
      lockBonus,
      total: totalApy,
    },
    multiplier: tier.multiplier,
    rewards: {
      accumulated: 0,
      claimed: 0,
      lastCalculated: new Date().toISOString(),
    },
    status: STAKING_STATUS.ACTIVE,
    autoCompound: stakeData.autoCompound || false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  data.stakingPositions.push(stake);
  db.write(data);

  return stake;
};

/**
 * Get tier for stake amount
 */
const getTierForAmount = (amount) => {
  const tiers = Object.values(STAKING_TIER).sort((a, b) => b.minStake - a.minStake);

  for (const tier of tiers) {
    if (amount >= tier.minStake) {
      return tier;
    }
  }

  return STAKING_TIER.BRONZE;
};

/**
 * Get stake by ID
 */
const getStakeById = async (stakeId) => {
  const data = db.read();
  const stake = (data.stakingPositions || []).find((s) => s.id === stakeId);

  if (!stake) {
    throw new Error("Staking position not found");
  }

  return stake;
};

/**
 * Get user stakes
 */
const getUserStakes = async (userId) => {
  const data = db.read();
  return (data.stakingPositions || []).filter((s) => s.userId === userId);
};

/**
 * Calculate pending rewards
 */
const calculatePendingRewards = async (stakeId) => {
  const stake = await getStakeById(stakeId);

  if (stake.status !== STAKING_STATUS.ACTIVE) {
    return { stakeId, pendingRewards: 0 };
  }

  const lastCalculated = new Date(stake.rewards.lastCalculated);
  const now = new Date();
  const daysElapsed = (now - lastCalculated) / (24 * 60 * 60 * 1000);

  // Daily rate from APY
  const dailyRate = stake.apy.total / 100 / 365;
  const pendingRewards = stake.amount * dailyRate * daysElapsed;

  return {
    stakeId,
    stakedAmount: stake.amount,
    apy: stake.apy.total,
    daysElapsed,
    pendingRewards,
    totalAccumulated: stake.rewards.accumulated + pendingRewards,
  };
};

/**
 * Claim rewards
 */
const claimRewards = async (stakeId, userId) => {
  const data = db.read();
  const index = (data.stakingPositions || []).findIndex(
    (s) => s.id === stakeId && s.userId === userId
  );

  if (index === -1) {
    throw new Error("Staking position not found or unauthorized");
  }

  const stake = data.stakingPositions[index];
  const pendingCalc = await calculatePendingRewards(stakeId);

  const claimAmount = pendingCalc.totalAccumulated;

  if (claimAmount <= 0) {
    throw new Error("No rewards to claim");
  }

  // Record reward claim
  if (!data.stakingRewards) {
    data.stakingRewards = [];
  }

  const claim = {
    id: uuidv4(),
    stakeId,
    userId,
    amount: claimAmount,
    claimedAt: new Date().toISOString(),
  };

  data.stakingRewards.push(claim);

  // Update stake
  stake.rewards.claimed += claimAmount;
  stake.rewards.accumulated = 0;
  stake.rewards.lastCalculated = new Date().toISOString();
  stake.updatedAt = new Date().toISOString();

  data.stakingPositions[index] = stake;
  db.write(data);

  return claim;
};

/**
 * Compound rewards
 */
const compoundRewards = async (stakeId, userId) => {
  const data = db.read();
  const index = (data.stakingPositions || []).findIndex(
    (s) => s.id === stakeId && s.userId === userId
  );

  if (index === -1) {
    throw new Error("Staking position not found or unauthorized");
  }

  const stake = data.stakingPositions[index];
  const pendingCalc = await calculatePendingRewards(stakeId);

  if (pendingCalc.totalAccumulated <= 0) {
    throw new Error("No rewards to compound");
  }

  // Add rewards to stake
  stake.amount += pendingCalc.totalAccumulated;
  stake.rewards.accumulated = 0;
  stake.rewards.lastCalculated = new Date().toISOString();

  // Check if tier upgrade is needed
  const newTier = getTierForAmount(stake.amount);
  if (newTier.name !== stake.tier) {
    stake.tier = newTier.name;
    stake.apy.base = newTier.apy;
    stake.apy.total = newTier.apy + stake.apy.lockBonus;
    stake.multiplier = newTier.multiplier;
  }

  stake.updatedAt = new Date().toISOString();

  data.stakingPositions[index] = stake;
  db.write(data);

  return stake;
};

/**
 * Initiate unstaking
 */
const initiateUnstake = async (stakeId, userId, amount = null) => {
  const data = db.read();
  const index = (data.stakingPositions || []).findIndex(
    (s) => s.id === stakeId && s.userId === userId
  );

  if (index === -1) {
    throw new Error("Staking position not found or unauthorized");
  }

  const stake = data.stakingPositions[index];

  if (stake.status !== STAKING_STATUS.ACTIVE) {
    throw new Error("Stake is not active");
  }

  // Check lock period
  if (stake.unlockDate && new Date(stake.unlockDate) > new Date()) {
    throw new Error(`Stake is locked until ${stake.unlockDate}`);
  }

  const unstakeAmount = amount || stake.amount;

  if (unstakeAmount > stake.amount) {
    throw new Error("Insufficient staked amount");
  }

  // Claim pending rewards first
  await claimRewards(stakeId, userId);

  // Cooldown period (7 days for flexible, 14 days for locked)
  const cooldownDays = stake.lockDays > 0 ? 14 : 7;
  const availableDate = new Date(
    Date.now() + cooldownDays * 24 * 60 * 60 * 1000
  ).toISOString();

  stake.unstaking = {
    amount: unstakeAmount,
    initiatedAt: new Date().toISOString(),
    availableAt: availableDate,
    cooldownDays,
  };

  if (unstakeAmount === stake.amount) {
    stake.status = STAKING_STATUS.UNSTAKING;
  }

  stake.updatedAt = new Date().toISOString();

  data.stakingPositions[index] = stake;
  db.write(data);

  return stake;
};

/**
 * Complete unstaking
 */
const completeUnstake = async (stakeId, userId) => {
  const data = db.read();
  const index = (data.stakingPositions || []).findIndex(
    (s) => s.id === stakeId && s.userId === userId
  );

  if (index === -1) {
    throw new Error("Staking position not found or unauthorized");
  }

  const stake = data.stakingPositions[index];

  if (!stake.unstaking) {
    throw new Error("No unstaking in progress");
  }

  if (new Date(stake.unstaking.availableAt) > new Date()) {
    throw new Error(`Unstaking not available until ${stake.unstaking.availableAt}`);
  }

  const withdrawAmount = stake.unstaking.amount;
  stake.amount -= withdrawAmount;

  if (stake.amount <= 0) {
    stake.status = STAKING_STATUS.COMPLETED;
    stake.completedAt = new Date().toISOString();
  } else {
    stake.status = STAKING_STATUS.ACTIVE;
    // Recalculate tier
    const newTier = getTierForAmount(stake.amount);
    stake.tier = newTier.name;
    stake.apy.base = newTier.apy;
    stake.apy.total = newTier.apy + stake.apy.lockBonus;
    stake.multiplier = newTier.multiplier;
  }

  stake.unstaking = null;
  stake.updatedAt = new Date().toISOString();

  data.stakingPositions[index] = stake;
  db.write(data);

  return {
    stake,
    withdrawnAmount: withdrawAmount,
  };
};

/**
 * Add more to existing stake
 */
const addToStake = async (stakeId, userId, amount) => {
  const data = db.read();
  const index = (data.stakingPositions || []).findIndex(
    (s) => s.id === stakeId && s.userId === userId
  );

  if (index === -1) {
    throw new Error("Staking position not found or unauthorized");
  }

  const stake = data.stakingPositions[index];

  if (stake.status !== STAKING_STATUS.ACTIVE) {
    throw new Error("Stake is not active");
  }

  // Calculate and add pending rewards first
  const pendingCalc = await calculatePendingRewards(stakeId);
  stake.rewards.accumulated = pendingCalc.totalAccumulated;
  stake.rewards.lastCalculated = new Date().toISOString();

  // Add new amount
  stake.amount += amount;

  // Check tier upgrade
  const newTier = getTierForAmount(stake.amount);
  if (newTier.name !== stake.tier) {
    stake.tier = newTier.name;
    stake.apy.base = newTier.apy;
    stake.apy.total = newTier.apy + stake.apy.lockBonus;
    stake.multiplier = newTier.multiplier;
  }

  stake.updatedAt = new Date().toISOString();

  data.stakingPositions[index] = stake;
  db.write(data);

  return stake;
};

/**
 * Get staking statistics
 */
const getStakingStatistics = async (userId = null) => {
  const data = db.read();
  let stakes = data.stakingPositions || [];

  if (userId) {
    stakes = stakes.filter((s) => s.userId === userId);
  }

  const activeStakes = stakes.filter((s) => s.status === STAKING_STATUS.ACTIVE);
  const totalStaked = activeStakes.reduce((sum, s) => sum + s.amount, 0);

  const rewards = data.stakingRewards || [];
  const userRewards = userId
    ? rewards.filter((r) => r.userId === userId)
    : rewards;
  const totalRewardsClaimed = userRewards.reduce((sum, r) => sum + r.amount, 0);

  const byTier = {};
  activeStakes.forEach((s) => {
    byTier[s.tier] = (byTier[s.tier] || 0) + s.amount;
  });

  const averageApy =
    activeStakes.length > 0
      ? activeStakes.reduce((sum, s) => sum + s.apy.total, 0) / activeStakes.length
      : 0;

  return {
    totalStaked,
    activePositions: activeStakes.length,
    totalRewardsClaimed,
    averageApy,
    byTier,
    userId: userId || "platform",
  };
};

/**
 * Get staking tiers info
 */
const getStakingTiers = () => {
  return Object.entries(STAKING_TIER).map(([key, value]) => ({
    id: key,
    ...value,
  }));
};

/**
 * Get lock period options
 */
const getLockPeriods = () => {
  return Object.entries(LOCK_PERIOD).map(([key, value]) => ({
    id: key,
    ...value,
  }));
};

module.exports = {
  STAKING_STATUS,
  STAKING_TIER,
  LOCK_PERIOD,
  createStake,
  getStakeById,
  getUserStakes,
  calculatePendingRewards,
  claimRewards,
  compoundRewards,
  initiateUnstake,
  completeUnstake,
  addToStake,
  getStakingStatistics,
  getStakingTiers,
  getLockPeriods,
};
