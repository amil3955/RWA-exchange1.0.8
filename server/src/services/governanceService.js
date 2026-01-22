const { v4: uuidv4 } = require("uuid");
const db = require("../db");

/**
 * Governance Service - Handles DAO-style governance
 * Supports proposals, voting, and token-weighted decisions
 */

const PROPOSAL_STATUS = {
  DRAFT: "draft",
  ACTIVE: "active",
  PASSED: "passed",
  REJECTED: "rejected",
  EXECUTED: "executed",
  CANCELLED: "cancelled",
  EXPIRED: "expired",
};

const PROPOSAL_TYPE = {
  PARAMETER_CHANGE: "parameter_change",
  TREASURY: "treasury",
  UPGRADE: "upgrade",
  LISTING: "listing",
  DELISTING: "delisting",
  FEE_CHANGE: "fee_change",
  GENERAL: "general",
};

const VOTE_TYPE = {
  FOR: "for",
  AGAINST: "against",
  ABSTAIN: "abstain",
};

/**
 * Create a proposal
 */
const createProposal = async (creatorId, proposalData) => {
  const data = db.read();

  if (!data.proposals) {
    data.proposals = [];
  }

  // Check if creator has enough voting power
  const votingPower = await getVotingPower(creatorId);
  const minProposalThreshold = 100; // Minimum tokens to create proposal

  if (votingPower < minProposalThreshold) {
    throw new Error(`Insufficient voting power. Required: ${minProposalThreshold}`);
  }

  const now = new Date();
  const votingPeriod = proposalData.votingPeriodDays || 7;

  const proposal = {
    id: uuidv4(),
    creatorId,
    title: proposalData.title,
    description: proposalData.description,
    type: proposalData.type || PROPOSAL_TYPE.GENERAL,
    status: PROPOSAL_STATUS.DRAFT,
    parameters: proposalData.parameters || {},
    actions: proposalData.actions || [],
    voting: {
      startTime: null,
      endTime: null,
      votingPeriodDays: votingPeriod,
      quorumRequired: proposalData.quorum || 10, // 10% of total voting power
      passingThreshold: proposalData.passingThreshold || 50, // 50%+ to pass
    },
    votes: {
      for: 0,
      against: 0,
      abstain: 0,
      totalVotes: 0,
      voters: [],
    },
    discussion: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  data.proposals.push(proposal);
  db.write(data);

  return proposal;
};

/**
 * Get voting power for user
 */
const getVotingPower = async (userId) => {
  const data = db.read();

  // Sum token balances across all tokenizations
  let totalPower = 0;

  (data.tokenizations || []).forEach((t) => {
    const holder = t.holders.find((h) => h.userId === userId);
    if (holder) {
      totalPower += holder.balance;
    }
  });

  // Add staked tokens
  const staking = (data.stakingPositions || []).find(
    (s) => s.userId === userId && s.status === "active"
  );
  if (staking) {
    totalPower += staking.amount * (staking.multiplier || 1);
  }

  return totalPower;
};

/**
 * Start voting on proposal
 */
const startVoting = async (proposalId, creatorId) => {
  const data = db.read();
  const index = (data.proposals || []).findIndex(
    (p) => p.id === proposalId && p.creatorId === creatorId
  );

  if (index === -1) {
    throw new Error("Proposal not found or unauthorized");
  }

  const proposal = data.proposals[index];

  if (proposal.status !== PROPOSAL_STATUS.DRAFT) {
    throw new Error("Only draft proposals can be started");
  }

  const now = new Date();
  const endTime = new Date(
    now.getTime() + proposal.voting.votingPeriodDays * 24 * 60 * 60 * 1000
  );

  proposal.status = PROPOSAL_STATUS.ACTIVE;
  proposal.voting.startTime = now.toISOString();
  proposal.voting.endTime = endTime.toISOString();
  proposal.updatedAt = now.toISOString();

  data.proposals[index] = proposal;
  db.write(data);

  return proposal;
};

/**
 * Cast vote
 */
const castVote = async (proposalId, userId, voteType, reason = null) => {
  const data = db.read();
  const index = (data.proposals || []).findIndex((p) => p.id === proposalId);

  if (index === -1) {
    throw new Error("Proposal not found");
  }

  const proposal = data.proposals[index];

  if (proposal.status !== PROPOSAL_STATUS.ACTIVE) {
    throw new Error("Proposal is not active for voting");
  }

  const now = new Date();
  if (new Date(proposal.voting.endTime) < now) {
    throw new Error("Voting period has ended");
  }

  // Check if already voted
  const existingVote = proposal.votes.voters.find((v) => v.userId === userId);
  if (existingVote) {
    throw new Error("Already voted on this proposal");
  }

  // Get voting power at snapshot
  const votingPower = await getVotingPower(userId);
  if (votingPower <= 0) {
    throw new Error("No voting power");
  }

  // Record vote
  const vote = {
    id: uuidv4(),
    userId,
    voteType,
    power: votingPower,
    reason,
    timestamp: now.toISOString(),
  };

  proposal.votes.voters.push(vote);
  proposal.votes[voteType] += votingPower;
  proposal.votes.totalVotes += votingPower;
  proposal.updatedAt = now.toISOString();

  data.proposals[index] = proposal;
  db.write(data);

  return vote;
};

/**
 * Finalize proposal
 */
const finalizeProposal = async (proposalId) => {
  const data = db.read();
  const index = (data.proposals || []).findIndex((p) => p.id === proposalId);

  if (index === -1) {
    throw new Error("Proposal not found");
  }

  const proposal = data.proposals[index];

  if (proposal.status !== PROPOSAL_STATUS.ACTIVE) {
    throw new Error("Proposal is not active");
  }

  const now = new Date();
  if (new Date(proposal.voting.endTime) > now) {
    throw new Error("Voting period has not ended");
  }

  // Calculate total voting power (simplified)
  let totalVotingPower = 0;
  (data.tokenizations || []).forEach((t) => {
    totalVotingPower += t.totalSupply;
  });

  // Check quorum
  const quorumMet =
    (proposal.votes.totalVotes / totalVotingPower) * 100 >=
    proposal.voting.quorumRequired;

  // Check passing threshold
  const forPercentage =
    proposal.votes.totalVotes > 0
      ? (proposal.votes.for / proposal.votes.totalVotes) * 100
      : 0;

  if (quorumMet && forPercentage >= proposal.voting.passingThreshold) {
    proposal.status = PROPOSAL_STATUS.PASSED;
  } else {
    proposal.status = PROPOSAL_STATUS.REJECTED;
  }

  proposal.result = {
    quorumMet,
    quorumRequired: proposal.voting.quorumRequired,
    quorumAchieved: (proposal.votes.totalVotes / totalVotingPower) * 100,
    forPercentage,
    againstPercentage:
      proposal.votes.totalVotes > 0
        ? (proposal.votes.against / proposal.votes.totalVotes) * 100
        : 0,
    abstainPercentage:
      proposal.votes.totalVotes > 0
        ? (proposal.votes.abstain / proposal.votes.totalVotes) * 100
        : 0,
  };

  proposal.finalizedAt = now.toISOString();
  proposal.updatedAt = now.toISOString();

  data.proposals[index] = proposal;
  db.write(data);

  return proposal;
};

/**
 * Execute passed proposal
 */
const executeProposal = async (proposalId) => {
  const data = db.read();
  const index = (data.proposals || []).findIndex((p) => p.id === proposalId);

  if (index === -1) {
    throw new Error("Proposal not found");
  }

  const proposal = data.proposals[index];

  if (proposal.status !== PROPOSAL_STATUS.PASSED) {
    throw new Error("Only passed proposals can be executed");
  }

  // Execute actions (simplified - would trigger actual changes in production)
  const executionResults = [];

  for (const action of proposal.actions) {
    executionResults.push({
      action: action.type,
      status: "executed",
      timestamp: new Date().toISOString(),
    });
  }

  proposal.status = PROPOSAL_STATUS.EXECUTED;
  proposal.execution = {
    executedAt: new Date().toISOString(),
    results: executionResults,
  };
  proposal.updatedAt = new Date().toISOString();

  data.proposals[index] = proposal;
  db.write(data);

  return proposal;
};

/**
 * Get proposal by ID
 */
const getProposalById = async (proposalId) => {
  const data = db.read();
  const proposal = (data.proposals || []).find((p) => p.id === proposalId);

  if (!proposal) {
    throw new Error("Proposal not found");
  }

  return proposal;
};

/**
 * Get proposals with filters
 */
const getProposals = async (filters = {}) => {
  const data = db.read();
  let proposals = data.proposals || [];

  if (filters.status) {
    proposals = proposals.filter((p) => p.status === filters.status);
  }

  if (filters.type) {
    proposals = proposals.filter((p) => p.type === filters.type);
  }

  if (filters.creatorId) {
    proposals = proposals.filter((p) => p.creatorId === filters.creatorId);
  }

  proposals.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return proposals;
};

/**
 * Add discussion comment
 */
const addComment = async (proposalId, userId, content) => {
  const data = db.read();
  const index = (data.proposals || []).findIndex((p) => p.id === proposalId);

  if (index === -1) {
    throw new Error("Proposal not found");
  }

  const comment = {
    id: uuidv4(),
    userId,
    content,
    createdAt: new Date().toISOString(),
    reactions: [],
  };

  data.proposals[index].discussion.push(comment);
  data.proposals[index].updatedAt = new Date().toISOString();
  db.write(data);

  return comment;
};

/**
 * Get user votes
 */
const getUserVotes = async (userId) => {
  const data = db.read();
  const proposals = data.proposals || [];

  const votes = [];

  proposals.forEach((p) => {
    const vote = p.votes.voters.find((v) => v.userId === userId);
    if (vote) {
      votes.push({
        proposalId: p.id,
        proposalTitle: p.title,
        proposalStatus: p.status,
        ...vote,
      });
    }
  });

  return votes;
};

/**
 * Cancel proposal
 */
const cancelProposal = async (proposalId, creatorId, reason) => {
  const data = db.read();
  const index = (data.proposals || []).findIndex(
    (p) => p.id === proposalId && p.creatorId === creatorId
  );

  if (index === -1) {
    throw new Error("Proposal not found or unauthorized");
  }

  const proposal = data.proposals[index];

  if (![PROPOSAL_STATUS.DRAFT, PROPOSAL_STATUS.ACTIVE].includes(proposal.status)) {
    throw new Error("Cannot cancel proposal in current status");
  }

  proposal.status = PROPOSAL_STATUS.CANCELLED;
  proposal.cancellation = {
    reason,
    cancelledAt: new Date().toISOString(),
  };
  proposal.updatedAt = new Date().toISOString();

  data.proposals[index] = proposal;
  db.write(data);

  return proposal;
};

/**
 * Get governance statistics
 */
const getGovernanceStatistics = async () => {
  const data = db.read();
  const proposals = data.proposals || [];

  const stats = {
    total: proposals.length,
    byStatus: {},
    byType: {},
    totalVotesCast: 0,
    averageParticipation: 0,
    passRate: 0,
  };

  let finalized = 0;
  let passed = 0;

  proposals.forEach((p) => {
    stats.byStatus[p.status] = (stats.byStatus[p.status] || 0) + 1;
    stats.byType[p.type] = (stats.byType[p.type] || 0) + 1;
    stats.totalVotesCast += p.votes.voters.length;

    if ([PROPOSAL_STATUS.PASSED, PROPOSAL_STATUS.REJECTED, PROPOSAL_STATUS.EXECUTED].includes(p.status)) {
      finalized++;
      if (p.status === PROPOSAL_STATUS.PASSED || p.status === PROPOSAL_STATUS.EXECUTED) {
        passed++;
      }
    }
  });

  stats.passRate = finalized > 0 ? (passed / finalized) * 100 : 0;
  stats.averageParticipation =
    proposals.length > 0 ? stats.totalVotesCast / proposals.length : 0;

  return stats;
};

module.exports = {
  PROPOSAL_STATUS,
  PROPOSAL_TYPE,
  VOTE_TYPE,
  createProposal,
  getVotingPower,
  startVoting,
  castVote,
  finalizeProposal,
  executeProposal,
  getProposalById,
  getProposals,
  addComment,
  getUserVotes,
  cancelProposal,
  getGovernanceStatistics,
};
