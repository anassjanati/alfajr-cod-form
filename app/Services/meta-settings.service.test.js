import { describe, expect, it } from "vitest";
import {
  decryptMetaAccessToken,
  encryptMetaAccessToken,
  publicMetaSettings,
  resolveMetaTrackingConfig,
  validateMetaPixelId,
} from "./meta-settings.service";

const env = {
  META_SETTINGS_ENCRYPTION_KEY: "unit-test-secret",
  META_GRAPH_API_VERSION: "v25.0",
};

describe("merchant Meta settings", () => {
  it("encrypts and decrypts the access token", () => {
    const encrypted = encryptMetaAccessToken("EAAB-secret-token", env);
    expect(encrypted).not.toContain("EAAB-secret-token");
    expect(decryptMetaAccessToken(encrypted, env)).toBe("EAAB-secret-token");
  });

  it("validates numeric Pixel IDs", () => {
    expect(validateMetaPixelId("123456789012345")).toBe(true);
    expect(validateMetaPixelId("pixel-123")).toBe(false);
  });

  it("never exposes the encrypted token to the loader", () => {
    const result = publicMetaSettings({
      enabled: true,
      pixelId: "123456",
      accessTokenEncrypted: "encrypted-value",
    });

    expect(result.hasAccessToken).toBe(true);
    expect(result).not.toHaveProperty("accessTokenEncrypted");
  });

  it("resolves one shop's saved Meta credentials", () => {
    const accessTokenEncrypted = encryptMetaAccessToken("merchant-token", env);
    const config = resolveMetaTrackingConfig({
      shop: "merchant.myshopify.com",
      env,
      settings: {
        enabled: true,
        pixelId: "123456",
        accessTokenEncrypted,
        browserPixelEnabled: true,
        testEventCode: "TEST123",
      },
    });

    expect(config.configured).toBe(true);
    expect(config.accessToken).toBe("merchant-token");
    expect(config.source).toBe("shop_settings");
  });

  it("does not leak legacy app credentials to another shop", () => {
    const config = resolveMetaTrackingConfig({
      shop: "other.myshopify.com",
      settings: null,
      env: {
        META_LEGACY_SHOP: "al-fajr.myshopify.com",
        META_PIXEL_ID: "123456",
        META_CAPI_ACCESS_TOKEN: "legacy-token",
      },
    });

    expect(config.configured).toBe(false);
  });
});
