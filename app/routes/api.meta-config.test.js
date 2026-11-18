import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../shopify.server", () => ({
  authenticate: { public: { appProxy: vi.fn() } },
}));
vi.mock("../db.server", () => ({
  default: { metaTrackingSettings: { findUnique: vi.fn() } },
}));
vi.mock("../Services/meta-settings.service", () => ({
  resolveMetaTrackingConfig: vi.fn(),
}));

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { resolveMetaTrackingConfig } from "../Services/meta-settings.service";
import { loader } from "./api.meta-config";

const request = new Request("https://shop.example/apps/alfajr-cod/api/meta-config");

describe("public COD Meta browser configuration", () => {
  beforeEach(() => vi.resetAllMocks());

  it("rejects requests without a verified shop", async () => {
    authenticate.public.appProxy.mockResolvedValue({ session: null });

    const response = await loader({ request });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ browserEnabled: false });
    expect(prisma.metaTrackingSettings.findUnique).not.toHaveBeenCalled();
  });

  it("returns only the verified merchant's public Pixel ID", async () => {
    authenticate.public.appProxy.mockResolvedValue({
      admin: {},
      session: { shop: "merchant.myshopify.com" },
    });
    const settings = { enabled: true, accessTokenEncrypted: "secret" };
    prisma.metaTrackingSettings.findUnique.mockResolvedValue(settings);
    resolveMetaTrackingConfig.mockReturnValue({
      configured: true,
      browserPixelEnabled: true,
      pixelId: "123456789",
      accessToken: "private-CAPI-token",
    });

    const response = await loader({ request });

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(prisma.metaTrackingSettings.findUnique).toHaveBeenCalledWith({
      where: { shop: "merchant.myshopify.com" },
    });
    expect(resolveMetaTrackingConfig).toHaveBeenCalledWith({
      shop: "merchant.myshopify.com", settings,
    });
    expect(await response.json()).toEqual({
      browserEnabled: true,
      pixelId: "123456789",
    });
  });

  it("does not expose a Pixel when browser tracking is disabled", async () => {
    authenticate.public.appProxy.mockResolvedValue({
      admin: {},
      session: { shop: "merchant.myshopify.com" },
    });
    prisma.metaTrackingSettings.findUnique.mockResolvedValue(null);
    resolveMetaTrackingConfig.mockReturnValue({
      configured: true,
      browserPixelEnabled: false,
      pixelId: "123456789",
    });

    const response = await loader({ request });

    expect(await response.json()).toEqual({ browserEnabled: false });
  });

  it("fails closed when app proxy verification fails", async () => {
    authenticate.public.appProxy.mockRejectedValue(new Error("bad signature"));

    const response = await loader({ request });

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ browserEnabled: false });
  });
});
