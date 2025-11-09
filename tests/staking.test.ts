// tests/staking.test.ts
import { describe, it, expect, beforeEach } from "vitest";

interface UserStake {
  amount: bigint;
  locked: boolean;
  stakedAt: bigint;
  lastRefund: bigint;
  refundCount: bigint;
}

class MockContracts {
  voting = {
    validateStakeAvailability: (
      user: string,
      refId: bigint,
      amount: bigint
    ) => ({ isOk: true, value: true }),
    getAdmin: () => "ST1ADMIN",
  };
  treasury = {
    transferFrom: (from: string, to: string, amount: bigint) => ({
      isOk: true,
      value: true,
    }),
    transfer: (from: string, to: string, amount: bigint) => ({
      isOk: true,
      value: true,
    }),
  };
}

class StakingContract {
  state = {
    userStakes: new Map<string, UserStake>(),
    globalStaked: new Map<number, bigint>(),
    pendingRefunds: new Map<string, bigint>(),
  };
  blockHeight = 1000n;
  caller = "ST1TEST";
  admin = "ST1ADMIN";
  mocks = new MockContracts();

  lockStake(referendumId: bigint, amount: bigint): any {
    const key = `${this.caller}-${referendumId}`;
    if (this.state.userStakes.has(key)) return { isOk: false, value: 203n };
    if (amount < 100n) return { isOk: false, value: 206n };

    this.mocks.treasury.transferFrom(this.caller, "contract", amount);

    this.state.userStakes.set(key, {
      amount,
      locked: true,
      stakedAt: this.blockHeight,
      lastRefund: 0n,
      refundCount: 0n,
    });

    const global = this.state.globalStaked.get(Number(referendumId)) || 0n;
    this.state.globalStaked.set(Number(referendumId), global + amount);

    return { isOk: true, value: true };
  }

  unlockStake(referendumId: bigint, user: string, amount: bigint): any {
    if (this.caller !== this.admin) return { isOk: false, value: 200n };

    const key = `${user}-${referendumId}`;
    const stake = this.state.userStakes.get(key);
    if (!stake || !stake.locked) return { isOk: false, value: 204n };

    this.state.userStakes.set(key, { ...stake, locked: false });

    const global = this.state.globalStaked.get(Number(referendumId)) || 0n;
    this.state.globalStaked.set(Number(referendumId), global - amount);

    this.mocks.treasury.transfer("contract", user, amount);

    return { isOk: true, value: true };
  }

  requestRefund(referendumId: bigint): any {
    const key = `${this.caller}-${referendumId}`;
    const stake = this.state.userStakes.get(key);
    if (!stake) return { isOk: false, value: 204n };
    if (stake.locked) return { isOk: false, value: 205n };
    if (stake.refundCount >= 5n) return { isOk: false, value: 208n };
    if (this.state.pendingRefunds.has(key)) return { isOk: false, value: 209n };

    const lastRefund = stake.lastRefund;
    if (this.blockHeight - lastRefund < 1440n)
      return { isOk: false, value: 207n };

    this.state.pendingRefunds.set(key, this.blockHeight);
    this.state.userStakes.set(key, {
      ...stake,
      lastRefund: this.blockHeight,
      refundCount: stake.refundCount + 1n,
    });

    return { isOk: true, value: true };
  }

  claimRefund(referendumId: bigint): any {
    const key = `${this.caller}-${referendumId}`;
    const pending = this.state.pendingRefunds.get(key);
    const stake = this.state.userStakes.get(key);

    if (!pending || !stake) return { isOk: false, value: 201n };
    if (this.blockHeight - pending < 1440n) return { isOk: false, value: 207n };

    const amount = stake.amount;
    this.state.pendingRefunds.delete(key);
    this.state.userStakes.delete(key);

    const global = this.state.globalStaked.get(Number(referendumId)) || 0n;
    this.state.globalStaked.set(Number(referendumId), global - amount);

    this.mocks.treasury.transfer("contract", this.caller, amount);

    return { isOk: true, value: amount };
  }

  adminForceUnlock(user: string, referendumId: bigint): any {
    if (this.caller !== this.admin) return { isOk: false, value: 200n };

    const key = `${user}-${referendumId}`;
    const stake = this.state.userStakes.get(key);
    if (!stake) return { isOk: false, value: 204n };

    this.state.userStakes.set(key, { ...stake, locked: false });
    return { isOk: true, value: true };
  }
}

describe("staking.clar", () => {
  let contract: StakingContract;

  beforeEach(() => {
    contract = new StakingContract();
    contract.blockHeight = 1000n;
    contract.caller = "ST1TEST";
  });

  it("locks stake successfully", () => {
    const result = contract.lockStake(1n, 200n);
    expect(result.isOk).toBe(true);
    const stake = contract.state.userStakes.get("ST1TEST-1");
    expect(stake?.amount).toBe(200n);
    expect(stake?.locked).toBe(true);
    expect(contract.state.globalStaked.get(1)).toBe(200n);
  });

  it("rejects stake below minimum", () => {
    const result = contract.lockStake(2n, 99n);
    expect(result.isOk).toBe(false);
    expect(result.value).toBe(206n);
  });

  it("prevents double staking", () => {
    contract.lockStake(3n, 100n);
    const result = contract.lockStake(3n, 100n);
    expect(result.isOk).toBe(false);
    expect(result.value).toBe(203n);
  });

  it("rejects non-admin unlock", () => {
    contract.lockStake(5n, 100n);
    const result = contract.unlockStake(5n, "ST1TEST", 100n);
    expect(result.isOk).toBe(false);
    expect(result.value).toBe(200n);
  });

  it("requests refund successfully", () => {
    contract.lockStake(6n, 100n);
    contract.state.userStakes.get("ST1TEST-6")!.locked = false;
    // advance block height past the refund timeout so the refund can be requested
    contract.blockHeight = 2500n;
    const result = contract.requestRefund(6n);
    expect(result.isOk).toBe(true);
    expect(contract.state.pendingRefunds.has("ST1TEST-6")).toBe(true);
  });

  it("blocks refund while locked", () => {
    contract.lockStake(7n, 100n);
    const result = contract.requestRefund(7n);
    expect(result.isOk).toBe(false);
    expect(result.value).toBe(205n);
  });

  it("limits max refunds", () => {
    contract.lockStake(10n, 100n);
    contract.state.userStakes.get("ST1TEST-10")!.locked = false;
    contract.state.userStakes.get("ST1TEST-10")!.refundCount = 5n;
    const result = contract.requestRefund(10n);
    expect(result.isOk).toBe(false);
    expect(result.value).toBe(208n);
  });

  it("blocks refund timeout", () => {
    contract.lockStake(11n, 100n);
    contract.state.userStakes.get("ST1TEST-11")!.locked = false;
    contract.state.userStakes.get("ST1TEST-11")!.lastRefund = 800n;
    const result = contract.requestRefund(11n);
    expect(result.isOk).toBe(false);
    expect(result.value).toBe(207n);
  });

  it("rejects non-admin force unlock", () => {
    contract.lockStake(13n, 100n);
    const result = contract.adminForceUnlock("ST1TEST", 13n);
    expect(result.isOk).toBe(false);
    expect(result.value).toBe(200n);
  });

  it("tracks global staking", () => {
    contract.lockStake(14n, 500n);
    contract.caller = "ST2TEST";
    contract.lockStake(14n, 300n);
    expect(contract.state.globalStaked.get(14)).toBe(800n);
  });

  it("rejects refund without pending", () => {
    contract.lockStake(15n, 100n);
    contract.state.userStakes.get("ST1TEST-15")!.locked = false;
    const result = contract.claimRefund(15n);
    expect(result.isOk).toBe(false);
    expect(result.value).toBe(201n);
  });

  it("increments refund count", () => {
    contract.lockStake(16n, 100n);
    contract.state.userStakes.get("ST1TEST-16")!.locked = false;
    contract.blockHeight = 2500n;
    contract.requestRefund(16n);
    const stake = contract.state.userStakes.get("ST1TEST-16");
    expect(stake?.refundCount).toBe(1n);
  });
});
