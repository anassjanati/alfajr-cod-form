import { randomUUID } from "node:crypto";

import { getShippingInfo } from "./shipping.service";

import prisma from "../db.server";
import { validateCodOrder } from "../lib/validation";
import { createLogger } from "../lib/logger";
import {
  getClientIp,
  checkCodRateLimits,
} from "../lib/rateLimiter";

import {
  getShippingFee,
  buildShippingTag,
} from "./shipping.service";

import { ShopifyService } from "./shopify.service";

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export class OrderService {
  constructor({ request, admin, shop }) {
    this.request = request;
    this.admin = admin;
    this.shop = shop;

    this.logger = createLogger({
      endpoint: "api.cod",
      method: request.method,
    });

    this.shopify = new ShopifyService(admin);
  }

  normalizePhone(phone) {
  let value = String(phone || "")
    .replace(/[\s\-()]/g, "")
    .trim();

  if (value.startsWith("+212")) {
    value = `0${value.slice(4)}`;
  }

  if (value.startsWith("212")) {
    value = `0${value.slice(3)}`;
  }

  return value;
}

splitFullName(fullName) {
  const parts = String(fullName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return {
    firstName: parts.shift() || "Client",
    lastName: parts.join(" ") || "",
  };
}

buildOrderNote(data) {
  return [
    "AL FAJR COD Express",
    "",
    `Nom: ${data.fullName}`,
    `Téléphone: ${data.phone}`,
    `Ville: ${data.city}`,
    `Adresse: ${data.address}`,
    `Livraison: ${data.shippingFee} DH`,
    `Email: ${data.email || "-"}`,
    `Note client: ${data.notes || "-"}`,
    "",
    "Source: AL FAJR COD Express",
  ].join("\n");
}

buildTrackingAttributes(data) {
  const attributes = [
    ["UTM Source", data.utmSource],
    ["UTM Medium", data.utmMedium],
    ["UTM Campaign", data.utmCampaign],
    ["UTM Content", data.utmContent],
    ["UTM Term", data.utmTerm],
    ["Facebook Click ID", data.fbclid],
    ["Landing Page", data.landingPage],
    ["Referrer", data.referrer],
  ];

  return attributes
    .filter(([, value]) => Boolean(value))
    .map(([key, value]) => ({
      key,
      value: String(value).slice(0, 500),
    }));
}

  async process(body) {
    const validation = validateCodOrder(body);

    if (!validation.success) {
      return {
        ok: false,
        status: 422,
        body: {
          success: false,
          errors: validation.errors,
          message: "Veuillez vérifier les informations saisies.",
        },
      };
    }

    const data = validation.data;

    const rateLimit = checkCodRateLimits({
      shop: this.shop,
      clientIp: getClientIp(this.request),
    });

    if (!rateLimit.allowed) {
      return {
        ok: false,
        status: 429,
        body: {
          success: false,
          message: "Trop de tentatives.",
        },
      };
    }

    // استدعاء معلومات الشحن ديناميكياً من قاعدة البيانات
        const { fee: shippingFee, tag: shippingTag } = await getShippingInfo(
        data.city,
        this.shop
        );

    const phone = this.normalizePhone(data.phone);

const { firstName, lastName } =
  this.splitFullName(data.fullName);

const items =
  data.items?.length
    ? data.items
    : [
        {
          variantId: data.variantId,
          quantity: data.quantity || 1,
        },
      ];

      const note = this.buildOrderNote({
  ...data,
  phone,
  shippingFee,
});

const attributes =
  this.buildTrackingAttributes(data);

    const idempotencyKey =
      data.idempotencyKey ||
      randomUUID();

    const alreadyExists =
      await prisma.idempotentRequest.findUnique({
        where: {
          idempotencyKey,
        },
      });

    if (alreadyExists) {
      return {
        ok: false,
        status: 409,
        body: {
          success: false,
          message:
            "Commande déjà en cours.",
        },
      };
    }

    await prisma.idempotentRequest.create({
      data: {
        idempotencyKey,
        shop: this.shop,
        status: "processing",
        expiresAt: new Date(
          Date.now() + IDEMPOTENCY_TTL_MS,
        ),
      },
    });

    const draftInput =
  this.shopify.buildDraftOrderInput({
    data,
    phone,
    firstName,
    lastName,
    items,
    shippingFee,
    shippingTag,
    note,
    attributes,
  });

const draftOrder =
  await this.shopify.createCodOrder(
    draftInput
  );

    return {
  ok: true,

  data,

  phone,

  firstName,

  lastName,

  items,

  shippingFee,

  shippingTag,

  idempotencyKey,

  draftOrder,
};
  }
}