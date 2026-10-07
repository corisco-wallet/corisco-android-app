import { beforeEach, describe, expect, it, vi } from "vitest";
import { KeyDerivationType, type SignFrostParams } from "@buildonspark/spark-sdk";

vi.mock("react-native", () => ({ PermissionsAndroid: {}, Platform: { OS: "android" } }));
vi.mock("react-native-ble-plx", () => ({ BleManager: class {} }));

import { BleHardwareSigner } from "../src/ble-hardware-signer";

type SignRequest = { type: string; requiresConfirmation?: boolean; amountSats?: bigint; destination?: string };

function setup() {
  const requests: SignRequest[] = [];
  const conn = {
    request: vi.fn(async (req: SignRequest) => {
      if (req.type === "Commit") {
        return { type: "Commit", hiding: new Uint8Array(33), binding: new Uint8Array(33), commitmentId: 1 };
      }
      requests.push(req);
      return { type: "Sign", signatureShare: new Uint8Array(32) };
    }),
  };
  const signer = new BleHardwareSigner(conn as never);

  const sign = async () => {
    const { commitment } = await signer.getRandomSigningCommitment();
    await signer.signFrost({
      message: new Uint8Array(32),
      keyDerivation: { type: KeyDerivationType.LEAF, path: "leaf-1" },
      publicKey: new Uint8Array(33),
      verifyingKey: new Uint8Array(33),
      selfCommitment: { commitment },
      statechainCommitments: {},
      adaptorPubKey: new Uint8Array(0),
    } as unknown as SignFrostParams);
    return requests[requests.length - 1];
  };
  return { signer, sign };
}

describe("spend confirmation wrappers", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it("requires confirmation by default", async () => {
    const req = await ctx.sign();
    expect(req.requiresConfirmation).toBe(true);
  });

  it("attaches amount and destination to every Sign in a spend context", async () => {
    await ctx.signer.withSpendContext({ amountSats: 2100n, destination: "lnbc…abcd" }, async () => {
      for (let i = 0; i < 2; i++) {
        const req = await ctx.sign();
        expect(req.requiresConfirmation).toBe(true);
        expect(req.amountSats).toBe(2100n);
        expect(req.destination).toBe("lnbc…abcd");
      }
    });
  });

  it("clears the spend context afterward, even when the payment throws", async () => {
    await expect(
      ctx.signer.withSpendContext({ amountSats: 1n, destination: "x" }, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    const req = await ctx.sign();
    expect(req.amountSats).toBeUndefined();
    expect(req.destination).toBeUndefined();
  });

  it("skips confirmation only inside withoutSpendConfirmation", async () => {
    await ctx.signer.withoutSpendConfirmation(async () => {
      const req = await ctx.sign();
      expect(req.requiresConfirmation).toBe(false);
    });
    expect((await ctx.sign()).requiresConfirmation).toBe(true);
  });

  it("keeps confirmation skipped until every nested claim call finishes", async () => {
    await ctx.signer.withoutSpendConfirmation(async () => {
      await ctx.signer.withoutSpendConfirmation(async () => {});
      expect((await ctx.sign()).requiresConfirmation).toBe(false);
    });
  });

  it("restores confirmation after a claim throws", async () => {
    await expect(
      ctx.signer.withoutSpendConfirmation(async () => {
        throw new Error("claim failed");
      }),
    ).rejects.toThrow("claim failed");
    expect((await ctx.sign()).requiresConfirmation).toBe(true);
  });
});

describe("sign progress", () => {
  it("reports confirmed signatures out of the commitments fetched up front, then clears", async () => {
    const { signer } = setup();
    const seen: Array<{ confirmed: number; total: number } | null> = [];
    signer.onSignProgress = (p) => seen.push(p);

    await signer.withSpendContext({ amountSats: 1n, destination: "d" }, async () => {
      const commitments = [];
      for (let i = 0; i < 3; i++) commitments.push((await signer.getRandomSigningCommitment()).commitment);
      for (const commitment of commitments) {
        await signer.signFrost({
          message: new Uint8Array(32),
          keyDerivation: { type: KeyDerivationType.LEAF, path: "leaf-1" },
          publicKey: new Uint8Array(33),
          verifyingKey: new Uint8Array(33),
          selfCommitment: { commitment },
          statechainCommitments: {},
          adaptorPubKey: new Uint8Array(0),
        } as unknown as SignFrostParams);
      }
    });

    expect(seen).toEqual([
      { confirmed: 0, total: 3 },
      { confirmed: 1, total: 3 },
      { confirmed: 2, total: 3 },
      { confirmed: 3, total: 3 },
      null,
    ]);
  });
});
