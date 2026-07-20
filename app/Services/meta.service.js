/* eslint-env node */
/* global globalThis */

import { createHash } from "node:crypto";

const DEFAULT_GRAPH_API_VERSION = "v25.0";
const DEFAULT_TIMEOUT_MS = 2500;
const DEFAULT_MAX_ATTEMPTS = 2;
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

function sha256(value) {
  return createHash("sha256")
    .update(String(value).trim().toLowerCase())
    .digest("hex");
}

function addHashed(userData, key, value) {
  if (value === undefined || value === null || String(value).trim() === "") return;
  userData[key] = [sha256(value)];
}

function cleanString(value, maxLength = 1000) {
  if (value === undefined || value === null) return undefined;
  const cleaned = String(value).trim();
  return cleaned ? cleaned.slice(0, maxLength) : undefined;
}

export function normalizeMetaPhone(phone) {
  let digits = String(phone || "").replace(/\D/g, "");

  if (digits.startsWith("00212")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = `212${digits.slice(1)}`;

  return digits;
}

export function normalizeMetaConfig(config = {}) {
  const pixelId = cleanString(config.pixelId, 64);
  const accessToken = cleanString(config.accessToken, 4096);
  const graphApiVersion =
    cleanString(config.graphApiVersion, 16) || DEFAULT_GRAPH_API_VERSION;
  const testEventCode = cleanString(config.testEventCode, 128);

  return {
    ...config,
    configured: Boolean(pixelId && accessToken),
    pixelId,
    accessToken,
    graphApiVersion,
    testEventCode,
  };
}

export function getMetaConfig(env = process.env) {
  return normalizeMetaConfig({
    pixelId: env.META_PIXEL_ID,
    accessToken: env.META_CAPI_ACCESS_TOKEN,
    graphApiVersion: env.META_GRAPH_API_VERSION,
    testEventCode: env.META_TEST_EVENT_CODE,
  });
}

export function buildMetaPurchasePayload(input) {
  const userData = {};
  const normalizedPhone = normalizeMetaPhone(input.phone);

  addHashed(userData, "em", input.email);
  addHashed(userData, "ph", normalizedPhone);
  addHashed(userData, "fn", input.firstName);
  addHashed(userData, "ln", input.lastName);
  addHashed(userData, "ct", input.city);
  addHashed(userData, "country", input.countryCode || "ma");
  addHashed(userData, "external_id", input.externalId);

  const clientIp = cleanString(input.clientIp, 128);
  const userAgent = cleanString(input.userAgent, 1000);
  const fbp = cleanString(input.fbp, 255);
  const fbc = cleanString(input.fbc, 255);

  if (clientIp && clientIp !== "unknown") userData.client_ip_address = clientIp;
  if (userAgent) userData.client_user_agent = userAgent;
  if (fbp) userData.fbp = fbp;
  if (fbc) userData.fbc = fbc;

  const contents = (input.items || [])
    .map((item) => {
      const id = cleanString(item.id, 255);
      if (!id) return null;

      const content = {
        id,
        quantity: Math.max(1, Number(item.quantity || 1)),
      };

      const itemPrice = Number(item.itemPrice);
      if (Number.isFinite(itemPrice) && itemPrice >= 0) {
        content.item_price = itemPrice;
      }

      return content;
    })
    .filter(Boolean);

  const contentIds = [...new Set(contents.map((item) => item.id))];
  const value = Number(input.value);
  const orderId = cleanString(input.orderId, 255);

  return {
    data: [
      {
        event_name: "Purchase",
        event_time: Math.floor(Date.now() / 1000),
        event_id: cleanString(input.eventId, 255),
        action_source: "website",
        event_source_url: cleanString(input.eventSourceUrl, 1000),
        user_data: userData,
        custom_data: {
          currency: cleanString(input.currency, 8) || "MAD",
          value: Number.isFinite(value) ? value : 0,
          order_id: orderId,
          content_type: "product",
          content_ids: contentIds,
          contents,
          num_items: contents.reduce((sum, item) => sum + item.quantity, 0),
        },
      },
    ],
  };
}

function parseResponseBody(rawBody) {
  if (!rawBody) return null;
  try {
    return JSON.parse(rawBody);
  } catch {
    return { raw: rawBody.slice(0, 1000) };
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sends a Meta Conversions API Purchase event.
 *
 * A Meta outage must never prevent a valid Shopify COD order from succeeding,
 * so this function returns a structured result instead of throwing.
 */
export async function sendMetaPurchase(
  input,
  {
    env = process.env,
    config,
    fetchImpl = globalThis.fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
  } = {},
) {
  const resolvedConfig = config
    ? normalizeMetaConfig(config)
    : getMetaConfig(env);

  if (!resolvedConfig.configured) {
    return {
      sent: false,
      configured: false,
      reason: "not_configured",
      eventId: input.eventId,
    };
  }

  if (typeof fetchImpl !== "function") {
    return {
      sent: false,
      configured: true,
      reason: "fetch_unavailable",
      eventId: input.eventId,
    };
  }

  const payload = buildMetaPurchasePayload(input);
  if (resolvedConfig.testEventCode) {
    payload.test_event_code = resolvedConfig.testEventCode;
  }

  const endpoint = new URL(
    `https://graph.facebook.com/${resolvedConfig.graphApiVersion}/${resolvedConfig.pixelId}/events`,
  );
  endpoint.searchParams.set("access_token", resolvedConfig.accessToken);

  let lastError = null;
  const attempts = Math.max(1, Number(maxAttempts) || 1);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const rawBody = await response.text();
      const responseBody = parseResponseBody(rawBody);

      if (response.ok) {
        return {
          sent: true,
          configured: true,
          eventId: input.eventId,
          attempts: attempt,
          response: responseBody,
        };
      }

      lastError = {
        type: "http_error",
        status: response.status,
        response: responseBody,
      };

      if (!RETRYABLE_STATUS_CODES.has(response.status)) break;
    } catch (error) {
      lastError = {
        type: error?.name === "AbortError" ? "timeout" : "network_error",
        message: cleanString(error?.message, 500) || "Unknown Meta CAPI error",
      };
    } finally {
      clearTimeout(timer);
    }

    if (attempt < attempts) await wait(200 * attempt);
  }

  return {
    sent: false,
    configured: true,
    reason: lastError?.type || "unknown_error",
    eventId: input.eventId,
    error: lastError,
  };
}
