/* eslint-env node */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const ENCRYPTED_PREFIX = "enc:v1";
const DEFAULT_GRAPH_API_VERSION = "v25.0";

function clean(value, maxLength = 4096) {
  if (value === undefined || value === null) return undefined;
  const result = String(value).trim();
  return result ? result.slice(0, maxLength) : undefined;
}

function encryptionKey(env = process.env) {
  const secret = clean(
    env.META_SETTINGS_ENCRYPTION_KEY || env.SHOPIFY_API_SECRET,
    8192,
  );

  if (!secret) {
    throw new Error(
      "META_SETTINGS_ENCRYPTION_KEY or SHOPIFY_API_SECRET is required to store Meta credentials.",
    );
  }

  return createHash("sha256").update(secret).digest();
}

export function encryptMetaAccessToken(value, env = process.env) {
  const token = clean(value);
  if (!token) return null;

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(env), iv);
  const encrypted = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    ENCRYPTED_PREFIX,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

export function decryptMetaAccessToken(value, env = process.env) {
  const stored = clean(value);
  if (!stored) return undefined;

  const parts = stored.split(":");
  if (parts.length !== 5 || `${parts[0]}:${parts[1]}` !== ENCRYPTED_PREFIX) {
    throw new Error("Stored Meta access token has an unsupported format.");
  }

  const iv = Buffer.from(parts[2], "base64url");
  const authTag = Buffer.from(parts[3], "base64url");
  const encrypted = Buffer.from(parts[4], "base64url");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(env), iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString("utf8");
}

export function validateMetaPixelId(value) {
  const pixelId = clean(value, 64) || "";
  return /^\d{5,30}$/.test(pixelId);
}

export function publicMetaSettings(settings) {
  return {
    enabled: Boolean(settings?.enabled),
    pixelId: settings?.pixelId || "",
    hasAccessToken: Boolean(settings?.accessTokenEncrypted),
    browserPixelEnabled: settings?.browserPixelEnabled !== false,
    testEventCode: settings?.testEventCode || "",
    lastEventStatus: settings?.lastEventStatus || "",
    lastEventAt: settings?.lastEventAt || null,
    lastEventError: settings?.lastEventError || "",
  };
}

export function resolveMetaTrackingConfig({
  shop,
  settings,
  env = process.env,
}) {
  if (settings?.enabled) {
    const accessToken = decryptMetaAccessToken(
      settings.accessTokenEncrypted,
      env,
    );

    return {
      configured: Boolean(settings.pixelId && accessToken),
      pixelId: clean(settings.pixelId, 64),
      accessToken,
      graphApiVersion:
        clean(env.META_GRAPH_API_VERSION, 16) || DEFAULT_GRAPH_API_VERSION,
      testEventCode: clean(settings.testEventCode, 128),
      browserPixelEnabled: settings.browserPixelEnabled !== false,
      source: "shop_settings",
    };
  }

  // Optional migration bridge for the original AL FAJR installation only.
  // Requiring an explicit shop prevents other merchants from sending events
  // to the app owner's legacy Pixel credentials.
  if (clean(env.META_LEGACY_SHOP, 255) === shop) {
    const pixelId = clean(env.META_PIXEL_ID, 64);
    const accessToken = clean(env.META_CAPI_ACCESS_TOKEN);

    return {
      configured: Boolean(pixelId && accessToken),
      pixelId,
      accessToken,
      graphApiVersion:
        clean(env.META_GRAPH_API_VERSION, 16) || DEFAULT_GRAPH_API_VERSION,
      testEventCode: clean(env.META_TEST_EVENT_CODE, 128),
      browserPixelEnabled: true,
      source: "legacy_environment",
    };
  }

  return {
    configured: false,
    browserPixelEnabled: false,
    source: "disabled",
  };
}
