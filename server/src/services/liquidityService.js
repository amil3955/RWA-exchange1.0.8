const { v4: uuidv4 } = require("uuid");
const db = require("../db");

/**
 * Liquidity Service - Manages liquidity pools and liquidity provision
 * Supports AMM-style liquidity pools and traditional order book liquidity
 */

const POOL_STATUS = {
  ACTIVE: "active",
  PAUSED: "paused",
  DEPRECATED: "deprecated",
};

const POOL_TYPE = {
  CONSTANT_PRODUCT: "constant_product", // x * y = k
  STABLE_SWAP: "stable_swap",
  WEIGHTED: "weighted",
  CONCENTRATED: "concentrated",
};

/**
 * Create a new liquidity pool
 */
const createPool = async (creatorId, poolData) => {
  const data = db.read();

  if (!data.liquidityPools) {
    data.liquidityPools = [];
  }

  const pool = {
    id: uuidv4(),
    creatorId,
    name: poolData.name,
    symbol: poolData.symbol,
    type: poolData.type || POOL_TYPE.CONSTANT_PRODUCT,
    status: POOL_STATUS.ACTIVE,
    tokens: poolData.tokens.map((token) => ({
      address: token.address,
      symbol: token.symbol,
      decimals: token.decimals || 18,
      weight: token.weight || 50,
      reserve: 0,
    })),
    parameters: {
      swapFee: poolData.swapFee || 0.003, // 0.3%
      protocolFee: poolData.protocolFee || 0.0005, // 0.05%
      amplificationParameter: poolData.amplificationParameter || 100, // For stable swap
      tickSpacing: poolData.tickSpacing || 60, // For concentrated liquidity
    },
    state: {
      totalLiquidity: 0,
      totalShares: 0,
      totalVolume: 0,
      totalFees: 0,
      invariant: 0,
    },
    providers: [],
    swaps: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  data.liquidityPools.push(pool);
  db.write(data);

  return pool;
};

/**
 * Get pool by ID
 */
const getPoolById = async (poolId) => {
  const data = db.read();
  const pool = (data.liquidityPools || []).find((p) => p.id === poolId);

  if (!pool) {
    throw new Error("Liquidity pool not found");
  }

  return pool;
};

/**
 * Get all pools
 */
const getPools = async (filters = {}) => {
  const data = db.read();
  let pools = data.liquidityPools || [];

  if (filters.status) {
    pools = pools.filter((p) => p.status === filters.status);
  }

  if (filters.type) {
    pools = pools.filter((p) => p.type === filters.type);
  }

  if (filters.token) {
    pools = pools.filter((p) =>
      p.tokens.some((t) => t.symbol === filters.token || t.address === filters.token)
    );
  }

  // Sort by total liquidity
  pools.sort((a, b) => b.state.totalLiquidity - a.state.totalLiquidity);

  return pools;
};

/**
 * Add liquidity to pool
 */
const addLiquidity = async (poolId, userId, amounts) => {
  const data = db.read();
  const poolIndex = (data.liquidityPools || []).findIndex((p) => p.id === poolId);

  if (poolIndex === -1) {
    throw new Error("Pool not found");
  }

  const pool = data.liquidityPools[poolIndex];

  if (pool.status !== POOL_STATUS.ACTIVE) {
    throw new Error("Pool is not active");
  }

  // Calculate shares to mint
  let sharesToMint;
  if (pool.state.totalShares === 0) {
    // First liquidity provider
    sharesToMint = Math.sqrt(amounts[0] * amounts[1]);
  } else {
    // Proportional to existing pool
    const shareRatios = pool.tokens.map((token, i) => {
      if (token.reserve === 0) return Infinity;
      return amounts[i] / token.reserve;
    });
    const minRatio = Math.min(...shareRatios.filter((r) => r !== Infinity));
    sharesToMint = pool.state.totalShares * minRatio;
  }

  // Update reserves
  pool.tokens.forEach((token, i) => {
    token.reserve += amounts[i];
  });

  // Update state
  pool.state.totalShares += sharesToMint;
  pool.state.totalLiquidity = calculateTotalLiquidity(pool);
  pool.state.invariant = calculateInvariant(pool);

  // Record provider
  const existingProvider = pool.providers.find((p) => p.userId === userId);
  if (existingProvider) {
    existingProvider.shares += sharesToMint;
    existingProvider.updatedAt = new Date().toISOString();
  } else {
    pool.providers.push({
      userId,
      shares: sharesToMint,
      joinedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  pool.updatedAt = new Date().toISOString();
  data.liquidityPools[poolIndex] = pool;
  db.write(data);

  return {
    pool,
    sharesToMint,
    amounts,
    sharePercent: (sharesToMint / pool.state.totalShares) * 100,
  };
};

/**
 * Remove liquidity from pool
 */
const removeLiquidity = async (poolId, userId, sharesToBurn) => {
  const data = db.read();
  const poolIndex = (data.liquidityPools || []).findIndex((p) => p.id === poolId);

  if (poolIndex === -1) {
    throw new Error("Pool not found");
  }

  const pool = data.liquidityPools[poolIndex];

  const provider = pool.providers.find((p) => p.userId === userId);
  if (!provider || provider.shares < sharesToBurn) {
    throw new Error("Insufficient shares");
  }

  // Calculate amounts to return
  const sharePercent = sharesToBurn / pool.state.totalShares;
  const amountsOut = pool.tokens.map((token) => token.reserve * sharePercent);

  // Update reserves
  pool.tokens.forEach((token, i) => {
    token.reserve -= amountsOut[i];
  });

  // Update state
  pool.state.totalShares -= sharesToBurn;
  pool.state.totalLiquidity = calculateTotalLiquidity(pool);
  pool.state.invariant = calculateInvariant(pool);

  // Update provider
  provider.shares -= sharesToBurn;
  provider.updatedAt = new Date().toISOString();

  if (provider.shares <= 0) {
    pool.providers = pool.providers.filter((p) => p.userId !== userId);
  }

  pool.updatedAt = new Date().toISOString();
  data.liquidityPools[poolIndex] = pool;
  db.write(data);

  return {
    pool,
    sharesBurned: sharesToBurn,
    amountsOut,
  };
};

/**
 * Execute swap on pool
 */
const executeSwap = async (poolId, userId, tokenIn, amountIn) => {
  const data = db.read();
  const poolIndex = (data.liquidityPools || []).findIndex((p) => p.id === poolId);

  if (poolIndex === -1) {
    throw new Error("Pool not found");
  }

  const pool = data.liquidityPools[poolIndex];

  if (pool.status !== POOL_STATUS.ACTIVE) {
    throw new Error("Pool is not active");
  }

  const tokenInIndex = pool.tokens.findIndex(
    (t) => t.symbol === tokenIn || t.address === tokenIn
  );
  if (tokenInIndex === -1) {
    throw new Error("Token not found in pool");
  }

  const tokenOutIndex = tokenInIndex === 0 ? 1 : 0;

  // Calculate output amount based on pool type
  let amountOut;
  let fee;

  switch (pool.type) {
    case POOL_TYPE.CONSTANT_PRODUCT:
      const result = calculateConstantProductSwap(
        pool.tokens[tokenInIndex].reserve,
        pool.tokens[tokenOutIndex].reserve,
        amountIn,
        pool.parameters.swapFee
      );
      amountOut = result.amountOut;
      fee = result.fee;
      break;

    case POOL_TYPE.STABLE_SWAP:
      const stableResult = calculateStableSwap(
        pool.tokens[tokenInIndex].reserve,
        pool.tokens[tokenOutIndex].reserve,
        amountIn,
        pool.parameters.swapFee,
        pool.parameters.amplificationParameter
      );
      amountOut = stableResult.amountOut;
      fee = stableResult.fee;
      break;

    default:
      throw new Error("Unsupported pool type");
  }

  // Update reserves
  pool.tokens[tokenInIndex].reserve += amountIn;
  pool.tokens[tokenOutIndex].reserve -= amountOut;

  // Update state
  pool.state.totalVolume += amountIn;
  pool.state.totalFees += fee;
  pool.state.invariant = calculateInvariant(pool);

  // Record swap
  const swap = {
    id: uuidv4(),
    userId,
    tokenIn: pool.tokens[tokenInIndex].symbol,
    tokenOut: pool.tokens[tokenOutIndex].symbol,
    amountIn,
    amountOut,
    fee,
    price: amountIn / amountOut,
    timestamp: new Date().toISOString(),
  };

  pool.swaps.push(swap);

  pool.updatedAt = new Date().toISOString();
  data.liquidityPools[poolIndex] = pool;
  db.write(data);

  return {
    swap,
    effectivePrice: amountIn / amountOut,
    priceImpact: calculatePriceImpact(pool, tokenInIndex, amountIn),
  };
};

/**
 * Calculate constant product swap (x * y = k)
 */
const calculateConstantProductSwap = (reserveIn, reserveOut, amountIn, feeRate) => {
  const amountInWithFee = amountIn * (1 - feeRate);
  const fee = amountIn * feeRate;

  const numerator = reserveOut * amountInWithFee;
  const denominator = reserveIn + amountInWithFee;
  const amountOut = numerator / denominator;

  return { amountOut, fee };
};

/**
 * Calculate stable swap
 */
const calculateStableSwap = (reserveIn, reserveOut, amountIn, feeRate, amp) => {
  // Simplified stable swap calculation
  const fee = amountIn * feeRate;
  const amountInWithFee = amountIn - fee;

  // For stable pairs, price is close to 1:1
  const d = reserveIn + reserveOut;
  const a = amp;

  // Simplified formula for stable swap
  const amountOut = amountInWithFee * (reserveOut / (reserveIn + amountInWithFee));

  return { amountOut: amountOut * 0.999, fee }; // Small slippage for stable
};

/**
 * Calculate total liquidity in USD
 */
const calculateTotalLiquidity = (pool) => {
  // Simplified: assume each token is worth $1 for demo
  return pool.tokens.reduce((sum, token) => sum + token.reserve, 0);
};

/**
 * Calculate pool invariant
 */
const calculateInvariant = (pool) => {
  if (pool.type === POOL_TYPE.CONSTANT_PRODUCT) {
    return pool.tokens.reduce((product, token) => product * token.reserve, 1);
  }
  return pool.tokens.reduce((sum, token) => sum + token.reserve, 0);
};

/**
 * Calculate price impact
 */
const calculatePriceImpact = (pool, tokenInIndex, amountIn) => {
  const tokenOutIndex = tokenInIndex === 0 ? 1 : 0;
  const spotPrice = pool.tokens[tokenOutIndex].reserve / pool.tokens[tokenInIndex].reserve;

  const { amountOut } = calculateConstantProductSwap(
    pool.tokens[tokenInIndex].reserve,
    pool.tokens[tokenOutIndex].reserve,
    amountIn,
    pool.parameters.swapFee
  );

  const executionPrice = amountIn / amountOut;
  const priceImpact = ((executionPrice - spotPrice) / spotPrice) * 100;

  return Math.abs(priceImpact);
};

/**
 * Get quote for swap
 */
const getSwapQuote = async (poolId, tokenIn, amountIn) => {
  const pool = await getPoolById(poolId);

  const tokenInIndex = pool.tokens.findIndex(
    (t) => t.symbol === tokenIn || t.address === tokenIn
  );
  if (tokenInIndex === -1) {
    throw new Error("Token not found in pool");
  }

  const tokenOutIndex = tokenInIndex === 0 ? 1 : 0;

  const { amountOut, fee } = calculateConstantProductSwap(
    pool.tokens[tokenInIndex].reserve,
    pool.tokens[tokenOutIndex].reserve,
    amountIn,
    pool.parameters.swapFee
  );

  const priceImpact = calculatePriceImpact(pool, tokenInIndex, amountIn);

  return {
    poolId,
    tokenIn: pool.tokens[tokenInIndex].symbol,
    tokenOut: pool.tokens[tokenOutIndex].symbol,
    amountIn,
    amountOut,
    fee,
    rate: amountIn / amountOut,
    priceImpact,
    minimumReceived: amountOut * 0.99, // 1% slippage tolerance
  };
};

/**
 * Get user's liquidity positions
 */
const getUserPositions = async (userId) => {
  const data = db.read();
  const pools = data.liquidityPools || [];

  const positions = [];

  pools.forEach((pool) => {
    const provider = pool.providers.find((p) => p.userId === userId);
    if (provider && provider.shares > 0) {
      const sharePercent = provider.shares / pool.state.totalShares;
      const tokenAmounts = pool.tokens.map((token) => ({
        symbol: token.symbol,
        amount: token.reserve * sharePercent,
      }));

      positions.push({
        poolId: pool.id,
        poolName: pool.name,
        shares: provider.shares,
        sharePercent: sharePercent * 100,
        tokenAmounts,
        totalValue: pool.state.totalLiquidity * sharePercent,
        joinedAt: provider.joinedAt,
      });
    }
  });

  return positions;
};

/**
 * Get pool analytics
 */
const getPoolAnalytics = async (poolId) => {
  const pool = await getPoolById(poolId);

  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const swaps24h = pool.swaps.filter((s) => new Date(s.timestamp) >= last24h);

  const volume24h = swaps24h.reduce((sum, s) => sum + s.amountIn, 0);
  const fees24h = swaps24h.reduce((sum, s) => sum + s.fee, 0);

  // Calculate APR from fees
  const annualizedFees = fees24h * 365;
  const apr = pool.state.totalLiquidity > 0
    ? (annualizedFees / pool.state.totalLiquidity) * 100
    : 0;

  return {
    poolId,
    totalLiquidity: pool.state.totalLiquidity,
    totalVolume: pool.state.totalVolume,
    volume24h,
    fees24h,
    totalFees: pool.state.totalFees,
    apr,
    providerCount: pool.providers.length,
    swapCount24h: swaps24h.length,
    reserves: pool.tokens.map((t) => ({
      symbol: t.symbol,
      reserve: t.reserve,
    })),
  };
};

/**
 * Update pool status
 */
const updatePoolStatus = async (poolId, status) => {
  const data = db.read();
  const index = (data.liquidityPools || []).findIndex((p) => p.id === poolId);

  if (index === -1) {
    throw new Error("Pool not found");
  }

  if (!Object.values(POOL_STATUS).includes(status)) {
    throw new Error("Invalid pool status");
  }

  data.liquidityPools[index].status = status;
  data.liquidityPools[index].updatedAt = new Date().toISOString();
  db.write(data);

  return data.liquidityPools[index];
};

/**
 * Get global liquidity statistics
 */
const getGlobalStatistics = async () => {
  const data = db.read();
  const pools = (data.liquidityPools || []).filter(
    (p) => p.status === POOL_STATUS.ACTIVE
  );

  return {
    totalPools: pools.length,
    totalLiquidity: pools.reduce((sum, p) => sum + p.state.totalLiquidity, 0),
    totalVolume: pools.reduce((sum, p) => sum + p.state.totalVolume, 0),
    totalFees: pools.reduce((sum, p) => sum + p.state.totalFees, 0),
    totalProviders: new Set(pools.flatMap((p) => p.providers.map((pr) => pr.userId))).size,
  };
};

module.exports = {
  POOL_STATUS,
  POOL_TYPE,
  createPool,
  getPoolById,
  getPools,
  addLiquidity,
  removeLiquidity,
  executeSwap,
  getSwapQuote,
  getUserPositions,
  getPoolAnalytics,
  updatePoolStatus,
  getGlobalStatistics,
};
