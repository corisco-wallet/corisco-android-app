import { describe, expect, it } from "vitest";
import type { WalletTransfer } from "@buildonspark/spark-sdk/types";
import { transferLabel, transferMemo } from "../src/transfer-memo";

// Real mainnet invoices taken from a wallet's transfer list.
const WITH_NOTE_TEST =
  "lnbc10u1p4v7jmypp5cjk2xxan5ffe9hen8qn7sd4vpua9c00t33s4pkrahxzdsp09ar0ssp5r66wmgg74jdt5zhn9psjawtj4p2265f704fhp6jgkr40fl4yu2rsxq9z0rgqnp4qvyndeaqzman7h898jxm98dzkm0mlrsx36s93smrur7h0azyyuxc5rzjq25carzepgd4vqsyn44jrk85ezrpju92xyrk9apw4cdjh6yrwt5jgqqqqrt49lmtcqqqqqqqqqqq86qq9qcqzpudq823jhxaq9qyyssqj9gt9zl6ckzsu6lrag6pre0w0k9kpale5xtgdqjw9a3c58lt67uhwfd5wwspv57udkdn8jsme0t3jwm9qmhmaxf8m269mqqf57aryzsqsg39dq";
const DESCRIPTION_HASH_ONLY =
  "lnbc1u1p4dfh5ypp5flvr6fag2kq7krxwhehcqg66mh78ffj69y3dx80u9z7juk8cp7yqsp5atap43a0t6dngffnk6jz5ye9dwf6d33pkwencylnsq2qpkrr0d4qxqrrssnp4qvyndeaqzman7h898jxm98dzkm0mlrsx36s93smrur7h0azyyuxc5rzjq25carzepgd4vqsyn44jrk85ezrpju92xyrk9apw4cdjh6yrwt5jgqqqqrt49lmtcqqqqqqqqqqq86qq9qcqzpuhp53vld3ldare83mlvmw7w7kyxjxrl5l6lxzsscwvrngw4v57pkz0lq9qyyssqt96pjxkk5cau6eaj55pz4fzgaremm4neqnqkwsnwk0mcuy8a3efrmruqce7yvrla30zdlqsvm2y2c9mvfx9tz8gr4mqzwmgj9m28v8cqsjtn6d";
const PAYEE_DESCRIPTION =
  "lnbc980n1p4dfhmdpp534zsnrqkqdsgv6f4dykaqlv86nuf4786rxxfgunkw2jdw2hkxk4qsp52uuvmpp6l8usd6nueflxgnwxcxd20xl3ekqfqxktrac2wvrkhjuqxq9z0rgqnp4qvyndeaqzman7h898jxm98dzkm0mlrsx36s93smrur7h0azyyuxc5rzjq25carzepgd4vqsyn44jrk85ezrpju92xyrk9apw4cdjh6yrwt5jgqqqqrt49lmtcqqqqqqqqqqq86qq9qrzjqglfh5e5566mew0sf0fda07c43kcx4ganfv3gtzmh8727h2ej4sa8apyqr6zgqqqq8hxk2qqae4jsqyugqcqzpudps2askcmr9wssx7e3q2dshgmmndp5n5grsv9kx2en4v4krsvp59qyyssq530hm6raafssx0uf2p6y5vs6whj3an4jkg50p24d4haaptscuwlpnzxnuz6qtljjk3n78dr8fk8geka46ax2mtrd6yuyfdhndh9t3fqq3n902y";
const EMPTY_DESCRIPTION =
  "lnbc5u1p4vl8azpp5lw6tzk39nj3ge2cnd4jw2qhh83aqzalwm656dc4ryps095gq90assp58dqxysrrj3m86egs0dqcvk4ajhr7m7j49ye79rf2qzrq7jxtm2tqxqyz5vqnp4qvyndeaqzman7h898jxm98dzkm0mlrsx36s93smrur7h0azyyuxc5rzjq25carzepgd4vqsyn44jrk85ezrpju92xyrk9apw4cdjh6yrwt5jgqqqqrt49lmtcqqqqqqqqqqq86qq9qrzjqglfh5e5566mew0sf0fda07c43kcx4ganfv3gtzmh8727h2ej4sa8apyqr6zgqqqq8hxk2qqae4jsqyugqcqzpudqq9qyyssqrhz7r9nmv5ykqr288ztux4uepy5t3v2tfjhfrdmrmrrsu4w9kggj4vlmrw5qjp3dyjwwm753l7wtmpzzv88w3mmkfjkrlkjt94uqpfcpxl9xvk";

const incoming = (encodedInvoice: string, memo: string | null = null) =>
  ({ transferDirection: "INCOMING", userRequest: { invoice: { encodedInvoice, memo } } }) as unknown as WalletTransfer;
const outgoing = (encodedInvoice: string) =>
  ({ transferDirection: "OUTGOING", userRequest: { encodedInvoice } }) as unknown as WalletTransfer;

describe("transferMemo", () => {
  it("reads the note from the invoice description, not the base64 memo field", () => {
    expect(transferMemo(incoming(WITH_NOTE_TEST, "VGVzdA=="))).toBe("Test");
  });

  it("reads the description of an invoice that was paid", () => {
    expect(transferMemo(outgoing(PAYEE_DESCRIPTION))).toBe("Wallet of Satoshi: palefuel804");
  });

  it("is null for an invoice that only carries a description hash or an empty description", () => {
    expect(transferMemo(incoming(DESCRIPTION_HASH_ONLY))).toBeNull();
    expect(transferMemo(outgoing(EMPTY_DESCRIPTION))).toBeNull();
  });

  it("is null when there is no invoice or it can't be decoded", () => {
    expect(transferMemo({ transferDirection: "INCOMING" } as unknown as WalletTransfer)).toBeNull();
    expect(transferMemo(outgoing("not an invoice"))).toBeNull();
  });
});

describe("transferLabel", () => {
  it("uses the note when there is one", () => {
    expect(transferLabel(incoming(WITH_NOTE_TEST, "VGVzdA=="))).toBe("Test");
    expect(transferLabel(outgoing(PAYEE_DESCRIPTION))).toBe("Wallet of Satoshi: palefuel804");
  });

  it("falls back to Payment Received or Payment Sent", () => {
    expect(transferLabel(incoming(DESCRIPTION_HASH_ONLY))).toBe("Payment Received");
    expect(transferLabel(outgoing(EMPTY_DESCRIPTION))).toBe("Payment Sent");
    expect(transferLabel({ transferDirection: "OUTGOING" } as unknown as WalletTransfer)).toBe("Payment Sent");
  });
});
