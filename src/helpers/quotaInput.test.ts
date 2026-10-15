import { megabytesToBytes, bytesToMegabytes } from "./quotaInput";

describe("a quota typed in megabytes", () => {
  it("reads whole and fractional megabytes as decimal bytes", () => {
    expect(megabytesToBytes("100")).toBe(100_000_000);
    expect(megabytesToBytes(" 2000 ")).toBe(2_000_000_000);
    expect(megabytesToBytes("1.5")).toBe(1_500_000);
  });

  it("allows a quota of nothing", () => {
    expect(megabytesToBytes("0")).toBe(0);
  });

  it("refuses text that is not a nonnegative number", () => {
    expect(megabytesToBytes("")).toBeUndefined();
    expect(megabytesToBytes("-1")).toBeUndefined();
    expect(megabytesToBytes("lots")).toBeUndefined();
    expect(megabytesToBytes("1e400")).toBeUndefined();
  });

  it("refuses a quota too large to count in bytes", () => {
    expect(megabytesToBytes("99999999999999")).toBeUndefined();
  });
});

describe("a quota shown in megabytes", () => {
  it("writes decimal megabytes without trailing zeros", () => {
    expect(bytesToMegabytes(100_000_000)).toBe("100");
    expect(bytesToMegabytes(2_000_000_000)).toBe("2000");
    expect(bytesToMegabytes(1_500_000)).toBe("1.5");
  });

  it("reads back as the same quota", () => {
    for (const bytes of [0, 1, 123_456_789, 2_000_000_000]) {
      expect(megabytesToBytes(bytesToMegabytes(bytes))).toBe(bytes);
    }
  });
});
