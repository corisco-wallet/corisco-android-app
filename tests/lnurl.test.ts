import { describe, expect, it } from "vitest";
import { lightningAddressPayUrl, lnurlDecode, lnurlEncode } from "../src/lnurl";

// LUD-01's own example.
const SPEC_URL = "https://service.com/api?q=3fc3645b439ce8e7f2553a69e5267081d96dcd340693afabe04be7b0ccd178df";
const SPEC_LNURL =
  "LNURL1DP68GURN8GHJ7UM9WFMXJCM99E3K7MF0V9CXJ0M385EKVCENXC6R2C35XVUKXEFCV5MKVV34X5EKZD3EV56NYD3HXQURZEPEXEJXXEPNXSCRVWFNV9NXZCN9XQ6XYEFHVGCXXCMYXYMNSERXFQ5FNS";

// Produced by an independent bech32 implementation, not by this module.
const ADDRESS_URL = "https://corisco.org/.well-known/lnurlp/keen-viper-124";
const ADDRESS_LNURL = "lnurl1dp68gurn8ghj7cm0wf5hxcm09ehhyee09emk2mrv944kummhdchkcmn4wfk8qtmtv4jkuttkd9cx2u3dxyergps5pju";

describe("lnurlEncode", () => {
  it("matches the LUD-01 example", () => {
    expect(lnurlEncode(SPEC_URL)).toBe(SPEC_LNURL.toLowerCase());
  });

  it("matches an independent encoding of a pay URL", () => {
    expect(lnurlEncode(ADDRESS_URL)).toBe(ADDRESS_LNURL);
  });

  it("stays valid when uppercased for a QR code", () => {
    expect(lnurlDecode(lnurlEncode(ADDRESS_URL).toUpperCase())).toBe(ADDRESS_URL);
  });
});

describe("lnurlDecode", () => {
  it("decodes the LUD-01 example in either case", () => {
    expect(lnurlDecode(SPEC_LNURL)).toBe(SPEC_URL);
    expect(lnurlDecode(SPEC_LNURL.toLowerCase())).toBe(SPEC_URL);
  });

  it("round-trips long URLs without the default 90 character limit", () => {
    const url = `https://example.com/lnurl/${"a".repeat(300)}?x=1`;
    expect(lnurlDecode(lnurlEncode(url))).toBe(url);
  });

  it("rejects a bad checksum, mixed case and other prefixes", () => {
    expect(() => lnurlDecode(ADDRESS_LNURL.slice(0, -1) + "q")).toThrow();
    expect(() => lnurlDecode("Lnurl1" + ADDRESS_LNURL.slice(6))).toThrow();
    expect(() => lnurlDecode("lnbc1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdpl2pkx2ctnv5sxxmmwwd5kgetjypeh2ursdae8g6twvus8g6rfwvs8qun0dfjkxaq8rkx3yf5tcsyz3d73gafnh3cax9rn449d9p5uxz9ezhhypd0elx87sjle52x86fux2ypatgddc6k63n7erqz25le42c4u4ecky03ylcqca784w")).toThrow();
  });
});

describe("lightningAddressPayUrl", () => {
  it("builds the LUD-16 lookup URL", () => {
    expect(lightningAddressPayUrl("keen-viper-124", "corisco.org")).toBe(ADDRESS_URL);
  });

  it("uses http only for localhost", () => {
    expect(lightningAddressPayUrl("a", "localhost:3000")).toBe("http://localhost:3000/.well-known/lnurlp/a");
  });
});
