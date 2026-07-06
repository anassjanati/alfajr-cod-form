import { randomUUID } from "node:crypto";
import { getShippingInfo } from "./shipping.service";
import prisma from "../db.server";
import { validateCodOrder } from "../lib/validation";
import { createLogger } from "../lib/logger";
import {
  getClientIp,
  checkCodRateLimits,
} from "../lib/rateLimiter";

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

  async process(body) {
    // 1. التحقق من صحة البيانات
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

    // 2. التحقق من حد الطلبات (Rate Limits) لمنع السبام
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

    // 3. جلب معلومات الشحن ديناميكياً
    const { fee: shippingFee, tag: shippingTag } = await getShippingInfo(
      data.city,
      this.shop
    );

    const phone = this.normalizePhone(data.phone);
    const { firstName, lastName } = this.splitFullName(data.fullName);

    const items = data.items?.length
      ? data.items
      : [
          {
            variantId: data.variantId,
            quantity: data.quantity || 1,
          },
        ];

    // 4. حجز مفتاح منع التكرار (Idempotency Key)
    const idempotencyKey = data.idempotencyKey || randomUUID();

    const alreadyExists = await prisma.idempotentRequest.findUnique({
      where: { idempotencyKey },
    });

    if (alreadyExists) {
      return {
        ok: false,
        status: 409,
        body: {
          success: false,
          message: "Commande déjà en cours.",
        },
      };
    }

    await prisma.idempotentRequest.create({
      data: {
        idempotencyKey,
        shop: this.shop,
        status: "processing",
        expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
      },
    });

    // 5. إرسال البيانات المجهزة إلى api.cod.jsx ليتكلف بإنشاء الطلب في Shopify
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
    };
  }
}