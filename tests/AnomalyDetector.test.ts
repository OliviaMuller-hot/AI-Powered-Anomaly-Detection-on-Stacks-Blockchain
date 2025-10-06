import { describe, it, expect, beforeEach } from "vitest";
import { stringAsciiCV, stringUtf8CV, uintCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_TX_ID = 101;
const ERR_INVALID_SCORE = 102;
const ERR_INVALID_THRESHOLD = 103;
const ERR_INVALID_ANOMALY_TYPE = 104;
const ERR_INVALID_REASON = 105;
const ERR_INVALID_TIMESTAMP = 106;
const ERR_INVALID_SUBMITTER = 107;
const ERR_INVALID_UPDATE = 108;
const ERR_INVALID_CONFIDENCE = 109;
const ERR_INVALID_MAX_FLAGS = 110;
const ERR_INVALID_MIN_SCORE = 111;
const ERR_INVALID_MAX_SCORE = 112;
const ERR_INVALID_STATUS = 113;
const ERR_INVALID_ORACLE = 114;
const ERR_INVALID_GOVERNANCE = 115;
const ERR_INVALID_PROPOSAL = 116;
const ERR_INVALID_VOTE = 117;
const ERR_FLAG_ALREADY_EXISTS = 118;
const ERR_FLAG_NOT_FOUND = 119;
const ERR_MAX_FLAGS_EXCEEDED = 120;
const ERR_AUTHORITY_NOT_VERIFIED = 121;
const ERR_INVALID_LOCATION = 122;
const ERR_INVALID_CATEGORY = 123;
const ERR_INVALID_PRIORITY = 124;
const ERR_INVALID_EXPIRY = 125;

interface Flag {
  txId: string;
  score: number;
  flagged: boolean;
  anomalyType: string;
  reason: string;
  timestamp: number;
  submitter: string;
  confidence: number;
  status: boolean;
  location: string;
  category: string;
  priority: number;
  expiry: number;
}

interface FlagUpdate {
  updateScore: number;
  updateFlagged: boolean;
  updateReason: string;
  updateTimestamp: number;
  updater: string;
}

interface Proposal {
  desc: string;
  newThreshold: number;
  yesVotes: number;
  noVotes: number;
  expiry: number;
  proposer: string;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class AnomalyDetectorMock {
  state: {
    nextFlagId: number;
    maxFlags: number;
    submissionFee: number;
    anomalyThreshold: number;
    minScore: number;
    maxScore: number;
    authorityContract: string | null;
    oraclePrincipal: string | null;
    flags: Map<number, Flag>;
    flagUpdates: Map<number, FlagUpdate>;
    flagsByTxId: Map<string, number>;
    governanceProposals: Map<number, Proposal>;
    nextProposalId: number;
  } = {
    nextFlagId: 0,
    maxFlags: 10000,
    submissionFee: 500,
    anomalyThreshold: 80,
    minScore: 0,
    maxScore: 100,
    authorityContract: null,
    oraclePrincipal: null,
    flags: new Map(),
    flagUpdates: new Map(),
    flagsByTxId: new Map(),
    governanceProposals: new Map(),
    nextProposalId: 0,
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  authorities: Set<string> = new Set(["ST1TEST"]);
  oracles: Set<string> = new Set(["ST1TEST"]);
  stxTransfers: Array<{ amount: number; from: string; to: string | null }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextFlagId: 0,
      maxFlags: 10000,
      submissionFee: 500,
      anomalyThreshold: 80,
      minScore: 0,
      maxScore: 100,
      authorityContract: null,
      oraclePrincipal: null,
      flags: new Map(),
      flagUpdates: new Map(),
      flagsByTxId: new Map(),
      governanceProposals: new Map(),
      nextProposalId: 0,
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.authorities = new Set(["ST1TEST"]);
    this.oracles = new Set(["ST1TEST"]);
    this.stxTransfers = [];
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (contractPrincipal === this.caller) {
      return { ok: false, value: false };
    }
    if (this.state.authorityContract !== null) {
      return { ok: false, value: false };
    }
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setOraclePrincipal(oracle: string): Result<boolean> {
    if (oracle === this.caller) {
      return { ok: false, value: false };
    }
    if (this.state.authorityContract === null) {
      return { ok: false, value: false };
    }
    this.state.oraclePrincipal = oracle;
    return { ok: true, value: true };
  }

  setAnomalyThreshold(newThreshold: number): Result<boolean> {
    if (this.state.authorityContract === null) return { ok: false, value: false };
    if (newThreshold <= 0 || newThreshold > 100) return { ok: false, value: false };
    this.state.anomalyThreshold = newThreshold;
    return { ok: true, value: true };
  }

  setMaxFlags(newMax: number): Result<boolean> {
    if (newMax <= 0) return { ok: false, value: false };
    if (this.state.authorityContract === null) return { ok: false, value: false };
    this.state.maxFlags = newMax;
    return { ok: true, value: true };
  }

  setSubmissionFee(newFee: number): Result<boolean> {
    if (newFee < 0) return { ok: false, value: false };
    if (this.state.authorityContract === null) return { ok: false, value: false };
    this.state.submissionFee = newFee;
    return { ok: true, value: true };
  }

  submitFlag(
    txId: string,
    score: number,
    anomalyType: string,
    reason: string,
    confidence: number,
    location: string,
    category: string,
    priority: number,
    expiry: number
  ): Result<number> {
    if (this.state.nextFlagId >= this.state.maxFlags) return { ok: false, value: ERR_MAX_FLAGS_EXCEEDED };
    if (txId.length <= 0 || txId.length > 64) return { ok: false, value: ERR_INVALID_TX_ID };
    if (score < this.state.minScore || score > this.state.maxScore) return { ok: false, value: ERR_INVALID_SCORE };
    if (!["fraud", "laundering", "exploit", "wash-trading"].includes(anomalyType)) return { ok: false, value: ERR_INVALID_ANOMALY_TYPE };
    if (reason.length > 200) return { ok: false, value: ERR_INVALID_REASON };
    if (confidence > 100) return { ok: false, value: ERR_INVALID_CONFIDENCE };
    if (location.length > 100) return { ok: false, value: ERR_INVALID_LOCATION };
    if (!["defi", "nft", "dao", "general"].includes(category)) return { ok: false, value: ERR_INVALID_CATEGORY };
    if (priority > 10) return { ok: false, value: ERR_INVALID_PRIORITY };
    if (expiry <= this.blockHeight) return { ok: false, value: ERR_INVALID_EXPIRY };
    if (!this.oracles.has(this.caller)) return { ok: false, value: ERR_INVALID_SUBMITTER };
    if (this.state.flagsByTxId.has(txId)) return { ok: false, value: ERR_FLAG_ALREADY_EXISTS };
    if (this.state.authorityContract === null) return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };

    this.stxTransfers.push({ amount: this.state.submissionFee, from: this.caller, to: this.state.authorityContract });

    const id = this.state.nextFlagId;
    const flagged = score > this.state.anomalyThreshold;
    const flag: Flag = {
      txId,
      score,
      flagged,
      anomalyType,
      reason,
      timestamp: this.blockHeight,
      submitter: this.caller,
      confidence,
      status: true,
      location,
      category,
      priority,
      expiry,
    };
    this.state.flags.set(id, flag);
    this.state.flagsByTxId.set(txId, id);
    this.state.nextFlagId++;
    return { ok: true, value: id };
  }

  getFlag(id: number): Flag | null {
    return this.state.flags.get(id) || null;
  }

  getFlagByTxId(txId: string): Flag | null {
    const id = this.state.flagsByTxId.get(txId);
    return id !== undefined ? this.getFlag(id) : null;
  }

  updateFlag(id: number, updateScore: number, updateReason: string): Result<boolean> {
    const flag = this.state.flags.get(id);
    if (!flag) return { ok: false, value: false };
    if (flag.submitter !== this.caller) return { ok: false, value: false };
    if (updateScore < this.state.minScore || updateScore > this.state.maxScore) return { ok: false, value: false };
    if (updateReason.length > 200) return { ok: false, value: false };

    const updateFlagged = updateScore > this.state.anomalyThreshold;
    const updated: Flag = {
      ...flag,
      score: updateScore,
      flagged: updateFlagged,
      reason: updateReason,
      timestamp: this.blockHeight,
    };
    this.state.flags.set(id, updated);
    this.state.flagUpdates.set(id, {
      updateScore,
      updateFlagged,
      updateReason,
      updateTimestamp: this.blockHeight,
      updater: this.caller,
    });
    return { ok: true, value: true };
  }

  createProposal(desc: string, newThreshold: number, expiry: number): Result<number> {
    if (desc.length > 200) return { ok: false, value: ERR_INVALID_REASON };
    if (newThreshold <= 0 || newThreshold > 100) return { ok: false, value: ERR_INVALID_THRESHOLD };
    if (expiry <= this.blockHeight) return { ok: false, value: ERR_INVALID_EXPIRY };
    if (this.state.authorityContract === null) return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };

    const id = this.state.nextProposalId;
    const proposal: Proposal = {
      desc,
      newThreshold,
      yesVotes: 0,
      noVotes: 0,
      expiry,
      proposer: this.caller,
    };
    this.state.governanceProposals.set(id, proposal);
    this.state.nextProposalId++;
    return { ok: true, value: id };
  }

  voteOnProposal(propId: number, support: boolean): Result<boolean> {
    const prop = this.state.governanceProposals.get(propId);
    if (!prop) return { ok: false, value: false };
    if (this.blockHeight >= prop.expiry) return { ok: false, value: false };
    if (this.state.oraclePrincipal === null) return { ok: false, value: false };

    const updated: Proposal = {
      ...prop,
      yesVotes: support ? prop.yesVotes + 1 : prop.yesVotes,
      noVotes: support ? prop.noVotes : prop.noVotes + 1,
    };
    this.state.governanceProposals.set(propId, updated);

    if (updated.yesVotes > updated.noVotes + 10) {
      this.state.anomalyThreshold = prop.newThreshold;
      return { ok: true, value: true };
    }
    return { ok: true, value: false };
  }

  getFlagCount(): Result<number> {
    return { ok: true, value: this.state.nextFlagId };
  }

  checkFlagExistence(txId: string): Result<boolean> {
    return { ok: true, value: this.state.flagsByTxId.has(txId) };
  }

  getAnomalyThreshold(): Result<number> {
    return { ok: true, value: this.state.anomalyThreshold };
  }

  getProposal(id: number): Proposal | null {
    return this.state.governanceProposals.get(id) || null;
  }
}

describe("AnomalyDetector", () => {
  let contract: AnomalyDetectorMock;

  beforeEach(() => {
    contract = new AnomalyDetectorMock();
    contract.reset();
  });

  it("submits a flag successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.setOraclePrincipal("ST1TEST");
    const result = contract.submitFlag(
      "tx123",
      85,
      "fraud",
      "Suspicious pattern",
      90,
      "DeFi pool",
      "defi",
      8,
      100
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);

    const flag = contract.getFlag(0);
    expect(flag?.txId).toBe("tx123");
    expect(flag?.score).toBe(85);
    expect(flag?.flagged).toBe(true);
    expect(flag?.anomalyType).toBe("fraud");
    expect(flag?.reason).toBe("Suspicious pattern");
    expect(flag?.confidence).toBe(90);
    expect(flag?.location).toBe("DeFi pool");
    expect(flag?.category).toBe("defi");
    expect(flag?.priority).toBe(8);
    expect(flag?.expiry).toBe(100);
    expect(contract.stxTransfers).toEqual([{ amount: 500, from: "ST1TEST", to: "ST2TEST" }]);
  });

  it("rejects duplicate tx-id flags", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.setOraclePrincipal("ST1TEST");
    contract.submitFlag(
      "tx123",
      85,
      "fraud",
      "Suspicious pattern",
      90,
      "DeFi pool",
      "defi",
      8,
      100
    );
    const result = contract.submitFlag(
      "tx123",
      90,
      "laundering",
      "New reason",
      95,
      "NFT market",
      "nft",
      9,
      200
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_FLAG_ALREADY_EXISTS);
  });

  it("rejects unauthorized submitter", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.setOraclePrincipal("ST3ORACLE");
    contract.oracles = new Set(["ST3ORACLE"]);
    const result = contract.submitFlag(
      "tx456",
      85,
      "fraud",
      "Suspicious pattern",
      90,
      "DeFi pool",
      "defi",
      8,
      100
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_SUBMITTER);
  });

  it("rejects submission without authority contract", () => {
    contract.setOraclePrincipal("ST1TEST");
    const result = contract.submitFlag(
      "tx789",
      85,
      "fraud",
      "Suspicious pattern",
      90,
      "DeFi pool",
      "defi",
      8,
      100
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_AUTHORITY_NOT_VERIFIED);
  });

  it("rejects invalid score", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.setOraclePrincipal("ST1TEST");
    const result = contract.submitFlag(
      "tx101",
      101,
      "fraud",
      "Suspicious pattern",
      90,
      "DeFi pool",
      "defi",
      8,
      100
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_SCORE);
  });

  it("rejects invalid anomaly type", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.setOraclePrincipal("ST1TEST");
    const result = contract.submitFlag(
      "tx102",
      85,
      "invalid",
      "Suspicious pattern",
      90,
      "DeFi pool",
      "defi",
      8,
      100
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_ANOMALY_TYPE);
  });

  it("updates a flag successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.setOraclePrincipal("ST1TEST");
    contract.submitFlag(
      "tx103",
      85,
      "fraud",
      "Old reason",
      90,
      "DeFi pool",
      "defi",
      8,
      100
    );
    const result = contract.updateFlag(0, 75, "New reason");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const flag = contract.getFlag(0);
    expect(flag?.score).toBe(75);
    expect(flag?.flagged).toBe(false);
    expect(flag?.reason).toBe("New reason");
    const update = contract.state.flagUpdates.get(0);
    expect(update?.updateScore).toBe(75);
    expect(update?.updateFlagged).toBe(false);
    expect(update?.updateReason).toBe("New reason");
    expect(update?.updater).toBe("ST1TEST");
  });

  it("rejects update for non-existent flag", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.setOraclePrincipal("ST1TEST");
    const result = contract.updateFlag(99, 75, "New reason");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects update by non-submitter", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.setOraclePrincipal("ST1TEST");
    contract.submitFlag(
      "tx104",
      85,
      "fraud",
      "Old reason",
      90,
      "DeFi pool",
      "defi",
      8,
      100
    );
    contract.caller = "ST3FAKE";
    const result = contract.updateFlag(0, 75, "New reason");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("sets submission fee successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.setSubmissionFee(1000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.submissionFee).toBe(1000);
    contract.setOraclePrincipal("ST1TEST");
    contract.submitFlag(
      "tx105",
      85,
      "fraud",
      "Suspicious pattern",
      90,
      "DeFi pool",
      "defi",
      8,
      100
    );
    expect(contract.stxTransfers).toEqual([{ amount: 1000, from: "ST1TEST", to: "ST2TEST" }]);
  });

  it("rejects submission fee change without authority", () => {
    const result = contract.setSubmissionFee(1000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("returns correct flag count", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.setOraclePrincipal("ST1TEST");
    contract.submitFlag(
      "tx106",
      85,
      "fraud",
      "Pattern1",
      90,
      "Pool1",
      "defi",
      8,
      100
    );
    contract.submitFlag(
      "tx107",
      90,
      "laundering",
      "Pattern2",
      95,
      "Pool2",
      "nft",
      9,
      200
    );
    const result = contract.getFlagCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });

  it("checks flag existence correctly", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.setOraclePrincipal("ST1TEST");
    contract.submitFlag(
      "tx108",
      85,
      "fraud",
      "Suspicious pattern",
      90,
      "DeFi pool",
      "defi",
      8,
      100
    );
    const result = contract.checkFlagExistence("tx108");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const result2 = contract.checkFlagExistence("nonexistent");
    expect(result2.ok).toBe(true);
    expect(result2.value).toBe(false);
  });

  it("creates a proposal successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.createProposal("Update threshold", 70, 100);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const prop = contract.getProposal(0);
    expect(prop?.desc).toBe("Update threshold");
    expect(prop?.newThreshold).toBe(70);
    expect(prop?.expiry).toBe(100);
    expect(prop?.proposer).toBe("ST1TEST");
  });

  it("rejects vote on expired proposal", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.setOraclePrincipal("ST1TEST");
    contract.createProposal("Update threshold", 70, 100);
    contract.blockHeight = 101;
    const result = contract.voteOnProposal(0, true);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("parses flag parameters with Clarity types", () => {
    const txId = stringAsciiCV("tx109");
    const score = uintCV(85);
    const reason = stringUtf8CV("Suspicious pattern");
    expect(txId.value).toBe("tx109");
    expect(score.value).toEqual(BigInt(85));
    expect(reason.value).toBe("Suspicious pattern");
  });

  it("rejects flag submission with empty tx-id", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.setOraclePrincipal("ST1TEST");
    const result = contract.submitFlag(
      "",
      85,
      "fraud",
      "Suspicious pattern",
      90,
      "DeFi pool",
      "defi",
      8,
      100
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_TX_ID);
  });

  it("rejects flag submission with max flags exceeded", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.setOraclePrincipal("ST1TEST");
    contract.state.maxFlags = 1;
    contract.submitFlag(
      "tx110",
      85,
      "fraud",
      "Pattern1",
      90,
      "Pool1",
      "defi",
      8,
      100
    );
    const result = contract.submitFlag(
      "tx111",
      90,
      "laundering",
      "Pattern2",
      95,
      "Pool2",
      "nft",
      9,
      200
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_FLAGS_EXCEEDED);
  });

  it("sets authority contract successfully", () => {
    const result = contract.setAuthorityContract("ST2TEST");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.authorityContract).toBe("ST2TEST");
  });

  it("rejects invalid authority contract", () => {
    contract.caller = "ST3FAKE";
    const result = contract.setAuthorityContract("ST3FAKE");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("gets flag by tx-id successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.setOraclePrincipal("ST1TEST");
    contract.submitFlag(
      "tx112",
      85,
      "fraud",
      "Suspicious pattern",
      90,
      "DeFi pool",
      "defi",
      8,
      100
    );
    const flag = contract.getFlagByTxId("tx112");
    expect(flag?.txId).toBe("tx112");
    expect(flag?.score).toBe(85);
  });

  it("gets anomaly threshold successfully", () => {
    const result = contract.getAnomalyThreshold();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(80);
  });
});