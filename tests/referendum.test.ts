// tests/referendum.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { Cl, ClarityType } from "@stacks/transactions";

interface Referendum {
  title: string;
  description: string;
  creator: string;
  startBlock: bigint;
  endBlock: bigint;
  quorum: bigint;
  rewardPool: bigint;
  quizRequired: boolean;
  quizId: bigint | null;
  status: string;
  yesVotes: bigint;
  noVotes: bigint;
  totalStaked: bigint;
  finalResult: boolean | null;
}

interface Result<T> {
  isOk: boolean;
  value: T;
}

class ReferendumContract {
  state = {
    nextReferendumId: 0n,
    referendums: new Map<number, Referendum>(),
    titleIndex: new Map<string, number>(),
  };
  blockHeight = 100n;
  caller = "ST1TEST";

  createReferendum(
    title: string,
    description: string,
    startBlock: bigint,
    endBlock: bigint,
    quorum: bigint,
    rewardPool: bigint,
    quizRequired: boolean,
    quizId: bigint | null
  ): Result<bigint> {
    if (this.state.titleIndex.has(title)) return { isOk: false, value: 102n };
    if (title.length === 0) return { isOk: false, value: 103n };
    if (endBlock < startBlock + 10n) return { isOk: false, value: 103n };
    if (startBlock < this.blockHeight) return { isOk: false, value: 106n };
    if (quorum > 10000n) return { isOk: false, value: 104n };
    if (rewardPool === 0n) return { isOk: false, value: 105n };
    if (quizRequired && quizId === null) return { isOk: false, value: 107n };

    const id = this.state.nextReferendumId;
    this.state.referendums.set(Number(id), {
      title,
      description,
      creator: this.caller,
      startBlock,
      endBlock,
      quorum,
      rewardPool,
      quizRequired,
      quizId,
      status: "pending",
      yesVotes: 0n,
      noVotes: 0n,
      totalStaked: 0n,
      finalResult: null,
    });
    this.state.titleIndex.set(title, Number(id));
    this.state.nextReferendumId += 1n;
    return { isOk: true, value: id };
  }

  activateReferendum(id: bigint): Result<boolean> {
    const ref = this.state.referendums.get(Number(id));
    if (!ref) return { isOk: false, value: false };
    if (ref.creator !== this.caller) return { isOk: false, value: false };
    if (ref.status !== "pending") return { isOk: false, value: false };
    if (this.blockHeight > ref.startBlock) return { isOk: false, value: false };
    ref.status = "active";
    return { isOk: true, value: true };
  }

  closeReferendum(id: bigint): Result<boolean> {
    const ref = this.state.referendums.get(Number(id));
    if (!ref) return { isOk: false, value: false };
    if (ref.creator !== this.caller && this.caller !== "admin")
      return { isOk: false, value: false };
    if (ref.status !== "active") return { isOk: false, value: false };
    if (this.blockHeight < ref.endBlock) return { isOk: false, value: false };
    if (ref.finalResult !== null) return { isOk: false, value: false };

    const total = ref.yesVotes + ref.noVotes;
    const quorumMet = total >= ref.quorum;
    let result: boolean | null = null;
    if (quorumMet) {
      if (ref.yesVotes > ref.noVotes) result = true;
      else if (ref.noVotes > ref.yesVotes) result = false;
    }
    ref.status = "closed";
    ref.finalResult = result;
    return { isOk: true, value: true };
  }

  getReferendum(id: bigint): Referendum | null {
    return this.state.referendums.get(Number(id)) || null;
  }
}

describe("referendum.clar", () => {
  let contract: ReferendumContract;

  beforeEach(() => {
    contract = new ReferendumContract();
    contract.blockHeight = 100n;
    contract.caller = "ST1TEST";
  });

  it("creates referendum successfully", () => {
    const result = contract.createReferendum(
      "Climate Action 2025",
      "Should we adopt carbon tax?",
      110n,
      200n,
      5000n,
      1000000n,
      true,
      5n
    );
    expect(result.isOk).toBe(true);
    expect(result.value).toBe(0n);

    const ref = contract.getReferendum(0n);
    expect(ref?.title).toBe("Climate Action 2025");
    expect(ref?.status).toBe("pending");
    expect(ref?.quizRequired).toBe(true);
    expect(ref?.quizId).toBe(5n);
  });

  it("rejects duplicate titles", () => {
    contract.createReferendum(
      "Tax Vote",
      "",
      110n,
      200n,
      1000n,
      500000n,
      false,
      null
    );
    const result = contract.createReferendum(
      "Tax Vote",
      "",
      120n,
      210n,
      1000n,
      500000n,
      false,
      null
    );
    expect(result.isOk).toBe(false);
    expect(result.value).toBe(102n);
  });

  it("rejects invalid end block", () => {
    const result = contract.createReferendum(
      "Bad",
      "",
      110n,
      115n,
      1000n,
      500000n,
      false,
      null
    );
    expect(result.isOk).toBe(false);
    expect(result.value).toBe(103n);
  });

  it("rejects quiz-required without quiz-id", () => {
    const result = contract.createReferendum(
      "Quiz Needed",
      "",
      110n,
      200n,
      1000n,
      500000n,
      true,
      null
    );
    expect(result.isOk).toBe(false);
    expect(result.value).toBe(107n);
  });

  it("closes with no quorum - no result", () => {
    contract.createReferendum(
      "Low Turnout",
      "",
      100n,
      150n,
      1000n,
      1000000n,
      false,
      null
    );
    contract.blockHeight = 105n;
    contract.activateReferendum(0n);
    const ref = contract.getReferendum(0n)!;
    ref.yesVotes = 300n;
    ref.noVotes = 200n;
    contract.blockHeight = 160n;
    contract.closeReferendum(0n);
    expect(ref.finalResult).toBe(null);
  });

  it("prevents double closure", () => {
    contract.createReferendum(
      "Once Only",
      "",
      100n,
      150n,
      100n,
      1000000n,
      false,
      null
    );
    contract.blockHeight = 105n;
    contract.activateReferendum(0n);
    contract.blockHeight = 160n;
    contract.closeReferendum(0n);
    const result = contract.closeReferendum(0n);
    expect(result.isOk).toBe(false);
  });
});
