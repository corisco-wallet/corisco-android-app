import { describe, expect, it } from "vitest";
import { isSignerName } from "../src/signer-name";

describe("isSignerName", () => {
  it("accepts the advertised format", () => {
    expect(isSignerName("Corisco-A1667C")).toBe(true);
  });

  it("rejects other names", () => {
    expect(isSignerName("SparkHW")).toBe(false);
    expect(isSignerName("Corisco-a1667c")).toBe(false);
    expect(isSignerName("Corisco-A1667")).toBe(false);
    expect(isSignerName("Corisco")).toBe(false);
    expect(isSignerName(null)).toBe(false);
  });
});
