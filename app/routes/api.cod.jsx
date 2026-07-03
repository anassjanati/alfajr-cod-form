import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import { authenticate } from "../shopify.server";
import { validateCodOrder } from "../lib/validation";
import { createLogger } from "../lib/logger";
import {
  checkCodRateLimits,
  getClientIp,
} from "../lib/rateLimiter";
import {
  buildShippingTag,
  getShippingFee,
} from "../lib/shipping";
import prisma from "../db.server";

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

const MAX_BODY_BYTES = 32 * 1024;
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...JSON_HEADERS,
      ...extraHeaders,
    },
  });
}

function normalizePhone(phone) {
  let value = String(phone || "")
    .replace(/[\s\-()]/g, "")
    .trim();

  if (value.startsWith("+212")) value = `0${value.slice(4)}`;
  if (value.startsWith("212")) value = `0${value.slice(3)}`;

  return value;
}

function splitFullName(fullName) {
  const parts = String(fullName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return {
    firstName: parts.shift() || "Client",
    lastName: parts.join(" ") || undefined,
  };
}

function buildOrderNote(data) {
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

function buildTrackingAttributes(data) {
  const pairs = [
    ["UTM Source", data.utmSource],
    ["UTM Medium", data.utmMedium],
    ["UTM Campaign", data.utmCampaign],
    ["UTM Content", data.utmContent],
    ["UTM Term", data.utmTerm],
    ["Facebook Click ID", data.fbclid],
    ["Landing page", data.landingPage],
    ["Referrer", data.referrer],
  ];

  return pairs
    .filter(([, value]) => Boolean(value))
    .map(([key, value]) => ({ key, value: String(value).slice(0, 500) }));
}

async function readJsonBody(request) {
  const rawBody = await request.text();

  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
    const error = new Error("Request body is too large");
    error.status = 413;
    throw error;
  }

  try {
    return JSON.parse(rawBody || "{}");
  } catch {
    const error = new Error("Invalid JSON body");
    error.status = 400;
    throw error;
  }
}

async function claimIdempotency({ idempotencyKey, shop }) {
  try {
    await prisma.idempotentRequest.create({
      data: {
        idempotencyKey,
        shop,
        status: "processing",
        expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
      },
    });

    return { claimed: true, existing: null };
  } catch (error) {
    if (error?.code !== "P2002") throw error;

    const existing = await prisma.idempotentRequest.findUnique({
      where: { idempotencyKey },
    });

    return { claimed: false, existing };
  }
}

export async function loader() {
  return json(
    {
      success: false,
      message: "Method not allowed",
    },
    405,
    { Allow: "POST" },
  );
}

export async function action({ request }) {
  const logger = createLogger({ endpoint: "api.cod", method: request.method });

  let idempotencyKey;
  let shop;
  let orderWasCreated = false;

  try {
    const proxyContext = await authenticate.public.appProxy(request);
    const { admin, session } = proxyContext;

    if (!admin || !session?.shop) {
      return json(
        {
          success: false,
          message: "Application non autorisée pour cette boutique.",
        },
        401,
      );
    }

    shop = session.shop;
    const clientIp = getClientIp(request);
    const rateLimit = checkCodRateLimits({ shop, clientIp });

    if (!rateLimit.allowed) {
      logger.warn("COD rate limit exceeded", { shop, clientIp });

      return json(
        {
          success: false,
          message: "Trop de tentatives. Veuillez réessayer dans un moment.",
        },
        429,
        {
          "Retry-After": Math.max(
            1,
            Math.ceil((rateLimit.resetTime - Date.now()) / 1000),
          ).toString(),
        },
      );
    }

    const submittedData = await readJsonBody(request);
    const validation = validateCodOrder(submittedData);

    if (!validation.success) {
      logger.warn("COD validation failed", {
        shop,
        errors: validation.errors,
      });

      return json(
        {
          success: false,
          message: "Veuillez vérifier les informations saisies.",
          errors: validation.errors,
        },
        422,
      );
    }

    const data = validation.data;

    // Honeypot and timing checks are intentionally generic to bots.
    if (data.website) {
      return json({ success: true, message: "Order received" });
    }

    if (
      data.formStartedAt &&
      Date.now() - data.formStartedAt >= 0 &&
      Date.now() - data.formStartedAt < 650
    ) {
      return json(
        {
          success: false,
          message: "Veuillez vérifier les informations saisies.",
        },
        422,
      );
    }

    idempotencyKey =
      data.idempotencyKey ||
      request.headers.get("idempotency-key") ||
      randomUUID();

    const idempotency = await claimIdempotency({ idempotencyKey, shop });

    if (!idempotency.claimed) {
      const existing = idempotency.existing;

      if (existing?.status === "completed" && existing.response) {
        return json(existing.response, 200);
      }

      if (existing?.status === "failed" && existing.response) {
        return json(existing.response, 400);
      }

      return json(
        {
          success: false,
          processing: true,
          message: "Votre commande est déjà en cours de traitement.",
        },
        409,
      );
    }

    const phone = normalizePhone(data.phone);
    const shippingFee = getShippingFee(data.city);
    const shippingTag = buildShippingTag(data.city);
    const { firstName, lastName } = splitFullName(data.fullName);

    const items =
      data.items?.length > 0
        ? data.items
        : [
            {
              variantId: data.variantId,
              quantity: data.quantity || 1,
            },
          ];

    const mutation = `
      mutation orderCreate($order: OrderCreateOrderInput!) {
        orderCreate(order: $order) {
          order {
            id
            name
            displayFinancialStatus
            displayFulfillmentStatus
            totalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const customAttributes = [
      { key: "Nom complet", value: data.fullName },
      { key: "Téléphone", value: phone },
      { key: "Ville", value: data.city },
      { key: "Adresse", value: data.address },
      { key: "Livraison", value: `${shippingFee} DH` },
      { key: "Email", value: data.email || "-" },
      { key: "Note client", value: data.notes || "-" },
      { key: "Source", value: "AL FAJR COD Express" },
      { key: "COD Request ID", value: idempotencyKey },
      ...buildTrackingAttributes(data),
    ];

    const variables = {
      order: {
        lineItems: items.map((item) => ({
          variantId: `gid://shopify/ProductVariant/${item.variantId}`,
          quantity: Number(item.quantity || 1),
        })),
        financialStatus: "PENDING",
        fulfillmentStatus: "UNFULFILLED",
        currency: "MAD",
        phone,
        ...(data.email ? { email: data.email } : {}),
        tags: [
          "COD",
          "ALFAJR-COD-EXPRESS",
          shippingTag,
          `CITY-${data.city}`.slice(0, 255),
          `COD-ID-${idempotencyKey.slice(0, 36)}`,
        ],
        note: buildOrderNote({
          ...data,
          phone,
          shippingFee,
        }),
        shippingAddress: {
          firstName,
          ...(lastName ? { lastName } : {}),
          address1: data.address,
          city: data.city,
          phone,
          countryCode: "MA",
        },
        shippingLines: [
          {
            title:
              shippingFee === 20
                ? "Livraison Fès"
                : "Livraison Maroc",
            code: shippingTag,
            source: "AL FAJR COD",
            priceSet: {
              shopMoney: {
                amount: shippingFee.toFixed(2),
                currencyCode: "MAD",
              },
            },
          },
        ],
        customAttributes,
      },
    };

    const shopifyResponse = await admin.graphql(mutation, { variables });
    const responseJson = await shopifyResponse.json();
    const result = responseJson?.data?.orderCreate;

    if (!result) {
      throw new Error("Shopify did not return an orderCreate result");
    }

    if (result.userErrors?.length > 0) {
      const errorResponse = {
        success: false,
        message: "La commande n'a pas pu être créée.",
        errors: result.userErrors,
      };

      await prisma.idempotentRequest.update({
        where: { idempotencyKey },
        data: { status: "failed", response: errorResponse },
      });

      logger.warn("Shopify orderCreate returned user errors", {
        shop,
        errors: result.userErrors,
      });

      return json(errorResponse, 400);
    }

    orderWasCreated = true;

    const totalAmount = Number(
      result.order?.totalPriceSet?.shopMoney?.amount || shippingFee,
    );

    const successResponse = {
      success: true,
      message: "Votre commande a été enregistrée avec succès.",
      order: {
        id: result.order?.id,
        name: result.order?.name,
        financialStatus: result.order?.displayFinancialStatus,
        fulfillmentStatus: result.order?.displayFulfillmentStatus,
        total: totalAmount,
        currency:
          result.order?.totalPriceSet?.shopMoney?.currencyCode || "MAD",
      },
      shippingFee,
    };

    // The Shopify order is the source of truth. A secondary logging failure
    // must never tell the customer that a successfully-created order failed.
    try {
      await prisma.$transaction([
        prisma.codOrder.create({
          data: {
            shop,
            shopifyOrderId: result.order?.id || null,
            customerName: data.fullName,
            customerPhone: phone,
            city: data.city,
            shippingFee,
            total: totalAmount,
            status: "pending",
          },
        }),
        prisma.idempotentRequest.update({
          where: { idempotencyKey },
          data: { status: "completed", response: successResponse },
        }),
      ]);
    } catch (databaseLoggingError) {
      logger.error("Order created but post-order database logging failed", {
        shop,
        orderId: result.order?.id,
        message: databaseLoggingError?.message,
      });
    }

    logger.info("COD order created successfully", {
      shop,
      orderId: result.order?.id,
      orderName: result.order?.name,
      shippingFee,
    });

    return json(successResponse, 200);
  } catch (error) {
    if (error instanceof Response) return error;

    const status = Number(error?.status) || 500;
    logger.error("COD API error", {
      shop,
      idempotencyKey,
      orderWasCreated,
      message: error?.message,
      stack: error?.stack,
    });

    if (idempotencyKey && !orderWasCreated) {
      const failureResponse = {
        success: false,
        message:
          status < 500
            ? error.message
            : "Une erreur temporaire est survenue. Veuillez réessayer.",
      };

      try {
        await prisma.idempotentRequest.update({
          where: { idempotencyKey },
          data: { status: "failed", response: failureResponse },
        });
      } catch {
        // Nothing else to do; the original error is already logged.
      }
    }

    // If Shopify created the order, never encourage the customer to submit it
    // again even if optional post-processing failed.
    if (orderWasCreated) {
      return json({
        success: true,
        message: "Votre commande a été enregistrée avec succès.",
      });
    }

    return json(
      {
        success: false,
        message:
          status < 500
            ? error.message
            : "Une erreur temporaire est survenue. Veuillez réessayer.",
      },
      status,
    );
  }
}
