import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodePaymentPayload, verifyAndSettle, type X402Requirements } from "../src/server/x402";

const requirements: X402Requirements = {
  scheme: "exact",
  network: "x-layer",
  resource: "https://okxsentinel.vercel.app/api/premium/tools/deep_scan_token",
  description: "Token risk scan",
  payTo: "0xrecipient",
  asset: "0xasset",
  maxAmountRequired: "250000",
  maxTimeoutSeconds: 60
};

const ORIGINAL_ENV = { ...process.env };

describe("x402 facilitator client", () => {
  beforeEach(() => {
    process.env.OKX_SENTINEL_X402_FACILITATOR_URL = "https://facilitator.test";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...ORIGINAL_ENV };
  });

  it("decodes a base64 JSON X-PAYMENT payload", () => {
    const payload = { scheme: "exact", payload: { signature: "0xabc" } };
    const header = Buffer.from(JSON.stringify(payload)).toString("base64");
    expect(decodePaymentPayload(header)).toEqual(payload);
  });

  it("decodes a payload carrying an x402 scheme prefix", () => {
    const payload = { foo: "bar" };
    const header = `x402 ${Buffer.from(JSON.stringify(payload)).toString("base64")}`;
    expect(decodePaymentPayload(header)).toEqual(payload);
  });

  it("returns null for a missing or unparseable header", () => {
    expect(decodePaymentPayload(undefined)).toBeNull();
    expect(decodePaymentPayload("not-valid-@@@")).toBeNull();
  });

  it("does not settle when the facilitator is not configured", async () => {
    delete process.env.OKX_SENTINEL_X402_FACILITATOR_URL;
    const result = await verifyAndSettle("anything", requirements);
    expect(result.verified).toBe(false);
    expect(result.settled).toBe(false);
  });

  it("settles only when verify AND settle both succeed", async () => {
    const header = Buffer.from(JSON.stringify({ scheme: "exact" })).toString("base64");
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/verify")) {
        return new Response(JSON.stringify({ isValid: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ success: true, transaction: "0xtx" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await verifyAndSettle(header, requirements);
    expect(result.verified).toBe(true);
    expect(result.settled).toBe(true);
    expect(result.transaction).toBe("0xtx");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not settle when verification fails, and never calls settle", async () => {
    const header = Buffer.from(JSON.stringify({ scheme: "exact" })).toString("base64");
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ isValid: false, invalidReason: "insufficient funds" }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await verifyAndSettle(header, requirements);
    expect(result.verified).toBe(false);
    expect(result.settled).toBe(false);
    expect(result.reason).toBe("insufficient funds");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports verified-but-not-settled when settlement fails", async () => {
    const header = Buffer.from(JSON.stringify({ scheme: "exact" })).toString("base64");
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/verify")) {
        return new Response(JSON.stringify({ isValid: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ success: false, errorReason: "settlement reverted" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await verifyAndSettle(header, requirements);
    expect(result.verified).toBe(true);
    expect(result.settled).toBe(false);
    expect(result.reason).toBe("settlement reverted");
  });
});
