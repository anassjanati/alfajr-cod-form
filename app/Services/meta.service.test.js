import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  buildMetaPurchasePayload,
  getMetaConfig,
  normalizeMetaPhone,
  sendMetaPurchase,
} from "./meta.service";

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

describe("Meta Conversions API service", () => {
  it("normalizes Moroccan phone numbers for matching", () => {
    expect(normalizeMetaPhone("06 12 34 56 78")).toBe("212612345678");
    expect(normalizeMetaPhone("+212 6 12 34 56 78")).toBe("212612345678");
    expect(normalizeMetaPhone("00212 6 12 34 56 78")).toBe("212612345678");
  });

  it("builds a Purchase payload with hashed PII and un-hashed browser IDs", () => {
    const payload = buildMetaPurchasePayload({
      eventId: "alfajr_cod_123",
      orderId: "gid://shopify/Order/123",
      value: 135,
      currency: "MAD",
      items: [{ id: "456", quantity: 2 }],
      phone: "0612345678",
      email: "Client@Example.com",
      firstName: "Ahmed",
      lastName: "Alami",
      city: "Fès",
      externalId: "request-123",
      clientIp: "203.0.113.20",
      userAgent: "Unit Test",
      fbp: "fb.1.123.456",
      fbc: "fb.1.123.click-id",
      eventSourceUrl: "https://al-fajr.ma/products/notebook",
    });

    const event = payload.data[0];
    expect(event.event_name).toBe("Purchase");
    expect(event.event_id).toBe("alfajr_cod_123");
    expect(event.custom_data.value).toBe(135);
    expect(event.custom_data.currency).toBe("MAD");
    expect(event.custom_data.contents).toEqual([{ id: "456", quantity: 2 }]);
    expect(event.user_data.em).toEqual([hash("client@example.com")]);
    expect(event.user_data.ph).toEqual([hash("212612345678")]);
    expect(event.user_data.fbp).toBe("fb.1.123.456");
    expect(event.user_data.fbc).toBe("fb.1.123.click-id");
  });

  it("uses the current default Graph API version when no override is set", () => {
    const config = getMetaConfig({
      META_PIXEL_ID: "123",
      META_CAPI_ACCESS_TOKEN: "token",
    });

    expect(config.graphApiVersion).toBe("v25.0");
    expect(config.configured).toBe(true);
  });

  it("does not fail an order when Meta is not configured", async () => {
    const result = await sendMetaPurchase(
      { eventId: "event-1" },
      { env: {}, fetchImpl: vi.fn() },
    );

    expect(result.sent).toBe(false);
    expect(result.reason).toBe("not_configured");
  });

  it("sends the Purchase event to the configured pixel", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ events_received: 1 }),
    });

    const result = await sendMetaPurchase(
      {
        eventId: "event-2",
        orderId: "order-2",
        value: 70,
        currency: "MAD",
        items: [{ id: "99", quantity: 1 }],
        phone: "0612345678",
        eventSourceUrl: "https://al-fajr.ma/products/test",
      },
      {
        env: {
          META_PIXEL_ID: "123456",
          META_CAPI_ACCESS_TOKEN: "secret-token",
          META_GRAPH_API_VERSION: "v25.0",
          META_TEST_EVENT_CODE: "TEST123",
        },
        fetchImpl,
        maxAttempts: 1,
      },
    );

    expect(result.sent).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const [url, options] = fetchImpl.mock.calls[0];
    expect(url.pathname).toBe("/v25.0/123456/events");
    expect(url.searchParams.get("access_token")).toBe("secret-token");
    expect(JSON.parse(options.body).test_event_code).toBe("TEST123");
  });
});
