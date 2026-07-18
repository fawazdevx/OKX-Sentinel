import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodePaymentPayload, verifyAndSettle, isFacilitatorConfigured, type X402Requirements } from "../src/server/x402";

const requirements: X402Requirements = {
  scheme: "exact",
  network: "eip155:196",
  resource: "https://okxsentinel.vercel.app/api/premium/tools/deep_scan_token",
  description: "Token risk scan",
  payTo: "0xrecipient",
  asset: "0xasset",
  maxAmountRequired: "250000",
  maxTimeoutSeconds: 60
};

const ORIGINAL_ENV = { ...process.env };

// A valid X-PAYMENT header the SDK decoder accepts (base64 JSON PaymentPayload).
function paymentHeader(): string {
  const payload = {
    x402Version: 2,
    accepted: {
      scheme: "exact",
      network: "eip155:196",
      asset: "0xasset",
      amount: "250000",
      payTo: "0xrecipient",
      maxTimeoutSeconds: 60,
      extra: {}
    },
    payload: { signature: "0xabc" }
  };
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

function setCredentials(): void {
  process.env.OKX_SENTINEL_OKX_API_KEY = "test-key";
  process.env.OKX_SENTINEL_OKX_SECRET_KEY = "test-secret";
  process.env.OKX_SENTINEL_OKX_PASSPHRASE = "test-pass";
}

describe("x402 OKX facilitator client", () => {
  beforeEach(() => {
    setCredentials();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...ORIGINAL_ENV };
  });

  it("decodes a base64 JSON X-PAYMENT payload", () => {
    const decoded = decodePaymentPayload(paymentHeader());
    expect(decoded).not.toBeNull();
    expect(decoded?.payload).toEqual({ signature: "0xabc" });
  });

  it("decodes a payload carrying an x402 scheme prefix", () => {
    const header = `x402 ${paymentHeader()}`;
    const decoded = decodePaymentPayload(header);
    expect(decoded).not.toBeNull();
    expect((decoded as any)?.x402Version).toBe(2);
  });

  it("returns null for a missing or unparseable header", () => {
    expect(decodePaymentPayload(undefined)).toBeNull();
    expect(decodePaymentPayload("not-valid-@@@")).toBeNull();
  });

  it("reports configured only when OKX credentials are present", () => {
    expect(isFacilitatorConfigured()).toBe(true);
    delete process.env.OKX_SENTINEL_OKX_SECRET_KEY;
    expect(isFacilitatorConfigured()).toBe(false);
  });

  it("does not settle when credentials are not configured", async () => {
    delete process.env.OKX_SENTINEL_OKX_API_KEY;
    delete process.env.OKX_SENTINEL_OKX_SECRET_KEY;
    delete process.env.OKX_SENTINEL_OKX_PASSPHRASE;
    const result = await verifyAndSettle(paymentHeader(), requirements);
    expect(result.verified).toBe(false);
    expect(result.settled).toBe(false);
  });

  it("settles only when verify AND settle both succeed", async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const target = url.toString();
      if (target.endsWith("/verify")) {
        return new Response(JSON.stringify({ data: { isValid: true } }), { status: 200 });
      }
      return new Response(
        JSON.stringify({ data: { success: true, status: "success", transaction: "0xtx", network: "eip155:196" } }),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await verifyAndSettle(paymentHeader(), requirements);
    expect(result.verified).toBe(true);
    expect(result.settled).toBe(true);
    expect(result.transaction).toBe("0xtx");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not settle when verification fails, and never calls settle", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: { isValid: false, invalidReason: "insufficient funds" } }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await verifyAndSettle(paymentHeader(), requirements);
    expect(result.verified).toBe(false);
    expect(result.settled).toBe(false);
    expect(result.reason).toBe("insufficient funds");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports verified-but-not-settled when settlement is not confirmed", async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const target = url.toString();
      if (target.endsWith("/verify")) {
        return new Response(JSON.stringify({ data: { isValid: true } }), { status: 200 });
      }
      return new Response(
        JSON.stringify({ data: { success: false, status: "timeout", errorReason: "settlement reverted" } }),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await verifyAndSettle(paymentHeader(), requirements);
    expect(result.verified).toBe(true);
    expect(result.settled).toBe(false);
    expect(result.reason).toBe("settlement reverted");
  });
});
