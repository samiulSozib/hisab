import { describe, expect, it } from "vitest";
import { balanceEffects, computeNetWorth, directionFor, mergeEffects } from "@/lib/finance/ledger";

describe("ledger rules", () => {
  it("maps types to directions", () => {
    expect(directionFor("INCOME")).toBe("INFLOW");
    expect(directionFor("LOAN_RECEIVED")).toBe("INFLOW");
    expect(directionFor("EMI_PAYMENT")).toBe("OUTFLOW");
    expect(directionFor("TRANSFER")).toBe("TRANSFER");
    expect(directionFor("ADJUSTMENT", "OUTFLOW")).toBe("OUTFLOW");
    expect(() => directionFor("OPENING_BALANCE")).toThrow();
  });

  it("transfers are net zero", () => {
    const fx = balanceEffects({ direction: "TRANSFER", amount: "500", accountId: "a", toAccountId: "b" });
    expect(fx.map((e) => [e.accountId, e.delta.toFixed(2)])).toEqual([["a", "-500.00"], ["b", "500.00"]]);
    expect(fx.reduce((s, e) => s.plus(e.delta), fx[0].delta.minus(fx[0].delta)).toFixed(2)).toBe("0.00");
  });

  it("reversal negates effects and merge collapses them", () => {
    const old = balanceEffects({ direction: "OUTFLOW", amount: "300", accountId: "a" }, -1);
    const next = balanceEffects({ direction: "OUTFLOW", amount: "250", accountId: "a" });
    const merged = mergeEffects([...old, ...next]);
    expect(merged).toHaveLength(1);
    expect(merged[0].delta.toFixed(2)).toBe("50.00");
    expect(mergeEffects([...old, ...balanceEffects({ direction: "OUTFLOW", amount: "300", accountId: "a" })])).toHaveLength(0);
  });

  it("EMI purchase financing does not create income and nets to the down payment", () => {
    // Purchase 1,20,000; down payment 20,000; financed 1,00,000
    const effects = mergeEffects([
      ...balanceEffects({ direction: "OUTFLOW", amount: "120000", accountId: "bank" }), // EXPENSE (full price)
      ...balanceEffects({ direction: directionFor("LOAN_RECEIVED"), amount: "100000", accountId: "bank" }), // financing
    ]);
    expect(effects[0].delta.toFixed(2)).toBe("-20000.00");
  });
});

describe("computeNetWorth", () => {
  it("rolls up assets, liabilities and net worth", () => {
    const nw = computeNetWorth({
      accounts: [
        { currentBalance: "50000", includeInNetWorth: true },
        { currentBalance: "25000.50", includeInNetWorth: true },
        { currentBalance: "-5000", includeInNetWorth: true }, // credit card
        { currentBalance: "99999", includeInNetWorth: true, isArchived: true },
      ],
      loans: [
        { direction: "BORROWED", status: "ACTIVE", outstandingPrincipal: "30000" },
        { direction: "LENT", status: "ACTIVE", outstandingPrincipal: "10000" },
        { direction: "BORROWED", status: "CLOSED", outstandingPrincipal: "0" },
      ],
    });
    expect(nw.availableBalance.toFixed(2)).toBe("70000.50");
    expect(nw.totalAssets.toFixed(2)).toBe("85000.50");
    expect(nw.totalLiabilities.toFixed(2)).toBe("35000.00");
    expect(nw.netWorth.toFixed(2)).toBe("50000.50");
  });
});
