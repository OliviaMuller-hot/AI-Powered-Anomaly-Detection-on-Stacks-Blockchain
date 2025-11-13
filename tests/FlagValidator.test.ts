// tests/flag-validator.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Cl, ClarityValue, cvToValue } from "@stacks/transactions";
import { uintCV, someCV, boolCV, stringAsciiCV, tupleCV } from "@stacks/transactions";

interface Flag {
  "tx-id": string;
  "anomaly-score": bigint;
  submitter: string;
  "created-at": bigint;
  "expires-at": bigint;
  status: string;
  "yes-votes": bigint;
  "no-votes": bigint;
  "total-staked": bigint;
}

interface ValidatorStake {
  stake: bigint;
  vote: ClarityValue | null;
}

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_STAKE = 101;
const ERR_INVALID_FLAG_ID = 102;
const ERR_FLAG_NOT_FOUND = 103;
const ERR_ALREADY_VOTED = 104;
const ERR_INSUFFICIENT_STAKE = 105;
const ERR_VOTING_CLOSED = 106;
const ERR_FLAG_EXPIRED = 110;
const ERR_FLAG_NOT_EXPIRED = 111;
const ERR_MIN_STAKE_VIOLATION = 113;

class FlagValidatorMock {
  state: {
    nextFlagId: bigint;
    consensusThreshold: bigint;
    votingDuration: bigint;
    minStakeAmount: bigint;
    flags: Map<bigint, Flag>;
    validatorStakes: Map<string, ValidatorStake>;
    validatorTotalStake: Map<string, bigint>;
  } = {
    nextFlagId: 0n,
    consensusThreshold: 66n,
    votingDuration: 144n,
    minStakeAmount: 1000000n,
    flags: new Map(),
    validatorStakes: new Map(),
    validatorTotalStake: new Map(),
  };

  blockHeight = 1000n;
  caller = "ST1TEST";
  contractPrincipal = "ST1CONTRACT";

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextFlagId: 0n,
      consensusThreshold: 66n,
      votingDuration: 144n,
      minStakeAmount: 1000000n,
      flags: new Map(),
      validatorStakes: new Map(),
      validatorTotalStake: new Map(),
    };
    this.blockHeight = 1000n;
    this.caller = "ST1TEST";
  }

  private getStakeKey(flagId: bigint, validator: string): string {
    return `${flagId.toString()}-${validator}`;
  }

  submitFlag(txId: string, anomalyScore: bigint): { ok: boolean; value: bigint | number } {
    if (anomalyScore < 0n || anomalyScore > 100n) {
      return { ok: false, value: 112 };
    }
    const flagId = this.state.nextFlagId;
    const expiresAt = this.blockHeight + this.state.votingDuration;
    const flag: Flag = {
      "tx-id": txId,
      "anomaly-score": anomalyScore,
      submitter: this.caller,
      "created-at": this.blockHeight,
      "expires-at": expiresAt,
      status: "pending",
      "yes-votes": 0n,
      "no-votes": 0n,
      "total-staked": 0n,
    };
    this.state.flags.set(flagId, flag);
    this.state.nextFlagId += 1n;
    return { ok: true, value: flagId };
  }

  stakeAndVote(flagId: bigint, vote: boolean, stakeAmount: bigint): { ok: boolean; value: bigint | number } {
    const flag = this.state.flags.get(flagId);
    if (!flag) return { ok: false, value: ERR_FLAG_NOT_FOUND };
    if (this.blockHeight > flag["expires-at"]) return { ok: false, value: ERR_VOTING_CLOSED };
    if (stakeAmount < this.state.minStakeAmount) return { ok: false, value: ERR_MIN_STAKE_VIOLATION };

    const stakeKey = this.getStakeKey(flagId, this.caller);
    const existing = this.state.validatorStakes.get(stakeKey);
    if (existing && existing.vote !== null) return { ok: false, value: ERR_ALREADY_VOTED };

    const newStake = existing ? existing.stake + stakeAmount : stakeAmount;
    this.state.validatorStakes.set(stakeKey, { stake: newStake, vote: someCV(boolCV(vote)) });
    this.state.validatorTotalStake.set(this.caller, (this.state.validatorTotalStake.get(this.caller) || 0n) + stakeAmount);

    const updatedFlag = {
      ...flag,
      "total-staked": flag["total-staked"] + stakeAmount,
      "yes-votes": vote ? flag["yes-votes"] + stakeAmount : flag["yes-votes"],
      "no-votes": vote ? flag["no-votes"] : flag["no-votes"] + stakeAmount,
    };
    this.state.flags.set(flagId, updatedFlag);
    return { ok: true, value: newStake };
  }

  finalizeFlag(flagId: bigint): { ok: boolean; value: string | number } {
    const flag = this.state.flags.get(flagId);
    if (!flag) return { ok: false, value: ERR_FLAG_NOT_FOUND };
    if (this.blockHeight <= flag["expires-at"]) return { ok: false, value: ERR_FLAG_NOT_EXPIRED };

    const totalVotes = flag["yes-votes"] + flag["no-votes"];
    if (totalVotes === 0n) return { ok: true, value: "insufficient-votes" };

    const consensusReached = (flag["yes-votes"] * 100n) >= (totalVotes * this.state.consensusThreshold);
    const finalStatus = consensusReached ? "confirmed" : "dismissed";
    this.state.flags.set(flagId, { ...flag, status: finalStatus });

    this.distributeRewardsOrSlash(flagId, consensusReached);
    return { ok: true, value: finalStatus };
  }

  private distributeRewardsOrSlash(flagId: bigint, consensusYes: boolean) {
    for (const [key, stakeEntry] of this.state.validatorStakes.entries()) {
      const [fidStr, validator] = key.split("-");
      if (BigInt(fidStr) !== flagId) continue;

      const vote = stakeEntry.vote ? cvToValue(stakeEntry.vote) : null;
      if (vote === null) continue;

      const correct = vote === consensusYes;
      const reward = correct ? stakeEntry.stake + 500000n : stakeEntry.stake - (stakeEntry.stake * 20n) / 100n;

      if (reward > 0n) {
        // Simulate transfer
      }

      this.state.validatorStakes.delete(key);
      this.state.validatorTotalStake.set(
        validator,
        (this.state.validatorTotalStake.get(validator) || 0n) - stakeEntry.stake
      );
    }
  }

  getFlag(flagId: bigint): Flag | null {
    return this.state.flags.get(flagId) || null;
  }

  getValidatorStake(flagId: bigint, validator: string): ValidatorStake | null {
    return this.state.validatorStakes.get(this.getStakeKey(flagId, validator)) || null;
  }

  getNextFlagId(): bigint {
    return this.state.nextFlagId;
  }
}

describe("FlagValidator", () => {
  let mock: FlagValidatorMock;

  beforeEach(() => {
    mock = new FlagValidatorMock();
    mock.reset();
  });

  it("submits a flag successfully", () => {
    const result = mock.submitFlag("tx123", 85n);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0n);
    const flag = mock.getFlag(0n);
    expect(flag?.["tx-id"]).toBe("tx123");
    expect(flag?.["anomaly-score"]).toBe(85n);
    expect(flag?.status).toBe("pending");
    expect(flag?.["expires-at"]).toBe(1000n + 144n);
  });

  it("rejects invalid anomaly score", () => {
    const result = mock.submitFlag("tx123", 150n);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(112);
  });

  it("allows staking and voting", () => {
    mock.submitFlag("tx123", 90n);
    const result = mock.stakeAndVote(0n, true, 2000000n);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2000000n);
    const flag = mock.getFlag(0n);
    expect(flag?.["yes-votes"]).toBe(2000000n);
    expect(flag?.["total-staked"]).toBe(2000000n);
  });

  it("prevents double voting", () => {
    mock.submitFlag("tx123", 90n);
    mock.stakeAndVote(0n, true, 2000000n);
    const result = mock.stakeAndVote(0n, false, 1000000n);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_ALREADY_VOTED);
  });

  it("enforces minimum stake", () => {
    mock.submitFlag("tx123", 90n);
    const result = mock.stakeAndVote(0n, true, 500000n);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MIN_STAKE_VIOLATION);
  });

  it("finalizes flag with consensus", () => {
    mock.submitFlag("tx123", 90n);
    mock.stakeAndVote(0n, true, 4000000n);
    mock.caller = "ST2VALIDATOR";
    mock.stakeAndVote(0n, true, 3000000n);
    mock.caller = "ST3VALIDATOR";
    mock.stakeAndVote(0n, false, 2000000n);

    mock.blockHeight = 1200n;
    const result = mock.finalizeFlag(0n);
    expect(result.ok).toBe(true);
    expect(result.value).toBe("confirmed");

    const flag = mock.getFlag(0n);
    expect(flag?.status).toBe("confirmed");
  });

  it("finalizes flag without consensus", () => {
    mock.submitFlag("tx123", 90n);
    mock.stakeAndVote(0n, true, 3000000n);
    mock.caller = "ST2VALIDATOR";
    mock.stakeAndVote(0n, false, 4000000n);

    mock.blockHeight = 1200n;
    const result = mock.finalizeFlag(0n);
    expect(result.ok).toBe(true);
    expect(result.value).toBe("dismissed");
  });

  it("prevents finalizing before expiry", () => {
    mock.submitFlag("tx123", 90n);
    const result = mock.finalizeFlag(0n);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_FLAG_NOT_EXPIRED);
  });

  it("returns next flag ID correctly", () => {
    mock.submitFlag("tx1", 80n);
    mock.submitFlag("tx2", 90n);
    expect(mock.getNextFlagId()).toBe(2n);
  });

  it("tracks validator total stake", () => {
    mock.submitFlag("tx123", 90n);
    mock.stakeAndVote(0n, true, 2000000n);
    mock.caller = "ST2VALIDATOR";
    mock.stakeAndVote(0n, true, 3000000n);

    expect(mock.state.validatorTotalStake.get("ST1TEST")).toBe(2000000n);
    expect(mock.state.validatorTotalStake.get("ST2VALIDATOR")).toBe(3000000n);
  });
});