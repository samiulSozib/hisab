import { describe, expect, it } from "vitest";
import { d, formatMoney, parseMoneyInput, round2, sum, toMoneyString } from "@/lib/money";

describe("money", () => {
  it("avoids floating point errors", () => {
    expect(d("0.1").plus("0.2").toFixed(2)).toBe("0.30");
    expect(d("0.1").plus("0.2").equals("0.3")).toBe(true);
    expect(sum(["1000.10", "2000.20", "0.01"]).toFixed(2)).toBe("3000.31");
  });

  it("rounds half-up to 2 dp", () => {
    expect(round2("1.005").toFixed(2)).toBe("1.01");
    expect(round2("2.675").toFixed(2)).toBe("2.68");
    expect(toMoneyString("10")).toBe("10.00");
  });

  it("formats Bangladeshi Taka with lakh/crore grouping", () => {
    expect(formatMoney("125000")).toBe("৳1,25,000.00");
    expect(formatMoney("12345678.9")).toBe("৳1,23,45,678.90");
    expect(formatMoney("-500")).toBe("−৳500.00");
    expect(formatMoney("500", { signed: true })).toBe("+৳500.00");
    expect(formatMoney("1234.5", { symbol: false, decimals: 0 })).toBe("1,235");
  });

  it("parses user input strictly", () => {
    expect(parseMoneyInput("1,25,000.5")).toBe("125000.50");
    expect(parseMoneyInput("৳ 99")).toBe("99.00");
    expect(parseMoneyInput("1.234")).toBeNull();
    expect(parseMoneyInput("abc")).toBeNull();
  });
});
