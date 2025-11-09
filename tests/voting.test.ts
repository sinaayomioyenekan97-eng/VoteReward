// tests/voting.test.ts
import { describe, it, expect, beforeEach } from "vitest";

interface Vote {
  choice: boolean;
  stake: bigint;
  multiplier: bigint;
  votedAt: bigint;
}

interface Referendum {
  title: string;
  status: string;
  startBlock: bigint;
  endBlock: bigint;
  quorum: bigint;
  rewardPool: bigint;
  quizRequired: boolean;
  quizId: bigint | null;
  yesVotes: bigint;
  noVotes: bigint;
  totalStaked: bigint;
}

class MockContracts {
  referendum = {
    data: new Map<number, Referendum>(),
    getReferendum: (id: bigint): Referendum | null =>
      this.referendum.data.get(Number(id)) || null,
  };
  staking = {
    locked: new Map<string, bigint>(),
    lockStake: (id: bigint, amount: bigint) => {
      const key = `${id}-${"ST1TEST"}`;
      this.staking.locked.set(key, amount);
      return { isOk: true, value: true };
    },
    unlockStake: (id: bigint, user: string, amount: bigint) => {
      const key = `${id}-${user}`;
      this.staking.locked.delete(key);
      return { isOk: true, value: true };
    },
  };
}

class VotingContract {
  state = {
    votes: new Map<string, Vote>(),
    userStakes: new Map<string, bigint>(),
    totalYes: new Map<number, bigint>(),
    totalNo: new Map<number, bigint>(),
    totalStaked: new Map<number, bigint>(),
  };
  blockHeight = 150n;
  caller = "ST1TEST";
  mocks = new MockContracts();

  constructor() {
    this.mocks.referendum.getReferendum = (id) =>
      this.mocks.referendum.data.get(Number(id)) || null;
  }

  castVote(
    referendumId: bigint,
    choice: boolean,
    stake: bigint,
    quizPassed: boolean
  ): any {
    const ref = this.mocks.referendum.getReferendum(referendumId);
    if (!ref) return { isOk: false, value: 101n };

    if (ref.status !== "active") return { isOk: false, value: 105n };
    if (this.blockHeight < ref.startBlock || this.blockHeight >= ref.endBlock)
      return { isOk: false, value: 106n };

    const key = `${referendumId}-${this.caller}`;
    if (this.state.votes.has(key)) return { isOk: false, value: 103n };
    if (stake < 100n) return { isOk: false, value: 104n };
    if (stake === 0n) return { isOk: false, value: 110n };

    if (ref.quizRequired && !quizPassed) return { isOk: false, value: 108n };

    const multiplier = ref.quizRequired && quizPassed ? 150n : 100n;
    this.mocks.staking.lockStake(referendumId, stake);

    this.state.votes.set(key, {
      choice,
      stake,
      multiplier,
      votedAt: this.blockHeight,
    });
    this.state.userStakes.set(key, stake);

    const weighted = stake * multiplier;
    if (choice) {
      this.state.totalYes.set(
        Number(referendumId),
        (this.state.totalYes.get(Number(referendumId)) || 0n) + weighted
      );
    } else {
      this.state.totalNo.set(
        Number(referendumId),
        (this.state.totalNo.get(Number(referendumId)) || 0n) + weighted
      );
    }
    this.state.totalStaked.set(
      Number(referendumId),
      (this.state.totalStaked.get(Number(referendumId)) || 0n) + stake
    );

    return { isOk: true, value: true };
  }

  updateVote(referendumId: bigint, newChoice: boolean): any {
    const ref = this.mocks.referendum.getReferendum(referendumId);
    if (!ref) return { isOk: false, value: 101n };
    if (ref.status !== "active") return { isOk: false, value: 105n };
    if (this.blockHeight >= ref.endBlock) return { isOk: false, value: 106n };

    const key = `${referendumId}-${this.caller}`;
    const vote = this.state.votes.get(key);
    if (!vote) return { isOk: false, value: 101n };

    const weighted = vote.stake * vote.multiplier;
    const currentYes = this.state.totalYes.get(Number(referendumId)) || 0n;
    const currentNo = this.state.totalNo.get(Number(referendumId)) || 0n;

    if (vote.choice) {
      this.state.totalYes.set(Number(referendumId), currentYes - weighted);
    } else {
      this.state.totalNo.set(Number(referendumId), currentNo - weighted);
    }

    if (newChoice) {
      this.state.totalYes.set(
        Number(referendumId),
        currentYes - weighted + weighted
      );
    } else {
      this.state.totalNo.set(
        Number(referendumId),
        currentNo - weighted + weighted
      );
    }

    this.state.votes.set(key, { ...vote, choice: newChoice });
    return { isOk: true, value: true };
  }

  withdrawStake(referendumId: bigint): any {
    const ref = this.mocks.referendum.getReferendum(referendumId);
    if (!ref || ref.status !== "closed") return { isOk: false, value: 109n };

    const key = `${referendumId}-${this.caller}`;
    const vote = this.state.votes.get(key);
    if (!vote) return { isOk: false, value: 101n };

    this.mocks.staking.unlockStake(referendumId, this.caller, vote.stake);
    this.state.votes.delete(key);
    this.state.userStakes.delete(key);

    const currentTotalStaked =
      this.state.totalStaked.get(Number(referendumId)) || 0n;
    this.state.totalStaked.set(
      Number(referendumId),
      currentTotalStaked - vote.stake
    );

    return { isOk: true, value: vote.stake };
  }
}

describe("voting.clar", () => {
  let contract: VotingContract;

  beforeEach(() => {
    contract = new VotingContract();
    contract.blockHeight = 150n;
    contract.caller = "ST1TEST";
  });

  it("casts vote successfully with minimum stake", () => {
    contract.mocks.referendum.data.set(1, {
      title: "Test",
      status: "active",
      startBlock: 100n,
      endBlock: 200n,
      quorum: 1000n,
      rewardPool: 1000000n,
      quizRequired: false,
      quizId: null,
      yesVotes: 0n,
      noVotes: 0n,
      totalStaked: 0n,
    });
    const result = contract.castVote(1n, true, 100n, false);
    expect(result.isOk).toBe(true);
    expect(contract.state.totalYes.get(1)).toBe(10000n);
  });

  it("applies 1.5x multiplier when quiz passed", () => {
    contract.mocks.referendum.data.set(2, {
      title: "Quiz",
      status: "active",
      startBlock: 100n,
      endBlock: 200n,
      quorum: 1000n,
      rewardPool: 1000000n,
      quizRequired: true,
      quizId: 1n,
      yesVotes: 0n,
      noVotes: 0n,
      totalStaked: 0n,
    });
    contract.castVote(2n, true, 200n, true);
    expect(contract.state.totalYes.get(2)).toBe(30000n);
  });

  it("rejects vote below minimum stake", () => {
    contract.mocks.referendum.data.set(3, {
      title: "",
      status: "active",
      startBlock: 100n,
      endBlock: 200n,
      quorum: 0n,
      rewardPool: 0n,
      quizRequired: false,
      quizId: null,
      yesVotes: 0n,
      noVotes: 0n,
      totalStaked: 0n,
    });
    const result = contract.castVote(3n, true, 99n, false);
    expect(result.isOk).toBe(false);
    expect(result.value).toBe(104n);
  });

  it("rejects vote on non-active referendum", () => {
    contract.mocks.referendum.data.set(4, {
      title: "",
      status: "pending",
      startBlock: 100n,
      endBlock: 200n,
      quorum: 0n,
      rewardPool: 0n,
      quizRequired: false,
      quizId: null,
      yesVotes: 0n,
      noVotes: 0n,
      totalStaked: 0n,
    });
    const result = contract.castVote(4n, true, 100n, false);
    expect(result.isOk).toBe(false);
    expect(result.value).toBe(105n);
  });

  it("rejects quiz-required vote without passing", () => {
    contract.mocks.referendum.data.set(5, {
      title: "",
      status: "active",
      startBlock: 100n,
      endBlock: 200n,
      quorum: 0n,
      rewardPool: 0n,
      quizRequired: true,
      quizId: 1n,
      yesVotes: 0n,
      noVotes: 0n,
      totalStaked: 0n,
    });
    const result = contract.castVote(5n, true, 100n, false);
    expect(result.isOk).toBe(false);
    expect(result.value).toBe(108n);
  });

  it("prevents double voting", () => {
    contract.mocks.referendum.data.set(6, {
      title: "",
      status: "active",
      startBlock: 100n,
      endBlock: 200n,
      quorum: 0n,
      rewardPool: 0n,
      quizRequired: false,
      quizId: null,
      yesVotes: 0n,
      noVotes: 0n,
      totalStaked: 0n,
    });
    contract.castVote(6n, true, 100n, false);
    const result = contract.castVote(6n, false, 100n, false);
    expect(result.isOk).toBe(false);
    expect(result.value).toBe(103n);
  });

  it("blocks withdrawal before closure", () => {
    contract.mocks.referendum.data.set(9, {
      title: "",
      status: "active",
      startBlock: 100n,
      endBlock: 200n,
      quorum: 0n,
      rewardPool: 0n,
      quizRequired: false,
      quizId: null,
      yesVotes: 0n,
      noVotes: 0n,
      totalStaked: 0n,
    });
    contract.castVote(9n, true, 300n, false);
    const result = contract.withdrawStake(9n);
    expect(result.isOk).toBe(false);
    expect(result.value).toBe(109n);
  });

  it("tracks total staked correctly", () => {
    contract.mocks.referendum.data.set(10, {
      title: "",
      status: "active",
      startBlock: 100n,
      endBlock: 200n,
      quorum: 0n,
      rewardPool: 0n,
      quizRequired: false,
      quizId: null,
      yesVotes: 0n,
      noVotes: 0n,
      totalStaked: 0n,
    });
    contract.castVote(10n, true, 1000n, false);
    contract.caller = "ST2TEST";
    contract.castVote(10n, false, 500n, false);
    expect(contract.state.totalStaked.get(10)).toBe(1500n);
  });

  it("rejects vote after referendum ended", () => {
    contract.mocks.referendum.data.set(11, {
      title: "",
      status: "active",
      startBlock: 100n,
      endBlock: 160n,
      quorum: 0n,
      rewardPool: 0n,
      quizRequired: false,
      quizId: null,
      yesVotes: 0n,
      noVotes: 0n,
      totalStaked: 0n,
    });
    contract.blockHeight = 170n;
    const result = contract.castVote(11n, true, 100n, false);
    expect(result.isOk).toBe(false);
    expect(result.value).toBe(106n);
  });

  it("clears user stake on withdrawal", () => {
    contract.mocks.referendum.data.set(14, {
      title: "",
      status: "closed",
      startBlock: 100n,
      endBlock: 140n,
      quorum: 0n,
      rewardPool: 0n,
      quizRequired: false,
      quizId: null,
      yesVotes: 0n,
      noVotes: 0n,
      totalStaked: 0n,
    });
    contract.blockHeight = 150n;
    contract.castVote(14n, true, 100n, false);
    contract.withdrawStake(14n);
    expect(contract.state.userStakes.has(`14-${contract.caller}`)).toBe(false);
  });

  it("emits correct weighted votes for quiz bonus", () => {
    contract.mocks.referendum.data.set(15, {
      title: "",
      status: "active",
      startBlock: 100n,
      endBlock: 200n,
      quorum: 0n,
      rewardPool: 0n,
      quizRequired: true,
      quizId: 1n,
      yesVotes: 0n,
      noVotes: 0n,
      totalStaked: 0n,
    });
    contract.castVote(15n, true, 100n, true);
    expect(contract.state.totalYes.get(15)).toBe(15000n);
    expect(contract.state.totalStaked.get(15)).toBe(100n);
  });
});
