import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { authenticate } from "../shopify.server";
import { createLogger } from "../lib/logger";
import prisma from "../db.server";
import { validateCodOrder } from "../lib/validation";
import { getClientIp, checkCodRateLimits } from "../lib/rateLimiter";
import { getShippingInfo } from "../Services/shipping.service";
import { sendMetaPurchase } from "../Services/meta.service";
import { resolveMetaTrackingConfig } from "../Services/meta-settings.service";

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
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

function normalizePhone(phone) {
  let value = String(phone || "").replace(/[\s\-()]/g, "").trim();
  if (value.startsWith("+212")) value = `0${value.slice(4)}`;
  if (value.startsWith("212")) value = `0${value.slice(3)}`;
  return value;
}

function splitFullName(fullName) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts.shift() || "Client",
    lastName: parts.join(" ") || "COD",
  };
}

function shopifyNumericId(gid) {
  const value = String(gid || "");
  return value.split("/").filter(Boolean).pop() || "";
}

function buildOrderNote(data, phone, shippingFee) {
  return [
    "AL FAJR COD Express",
    "",
    `Nom: ${data.fullName}`,
    `Téléphone: ${phone}`,
    `Ville: ${data.city}`,
    `Adresse: ${data.address}`,
    `Livraison: ${shippingFee} DH`,
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

async function markIdempotencyFailed(idempotencyKey, response) {
  if (!idempotencyKey) return;
  await prisma.idempotentRequest
    .update({
      where: { idempotencyKey },
      data: { status: "failed", response },
    })
    .catch(() => {});
}

export async function loader() {
  return json({ success: false, message: "Method not allowed" }, 405, { Allow: "POST" });
}

export async function action({ request }) {
  const logger = createLogger({ endpoint: "api.cod", method: request.method });
  let idempotencyKeyStr;
  let shop;
  let successResponse;

  try {
    const proxyContext = await authenticate.public.appProxy(request);
    const { admin, session } = proxyContext;

    if (!admin || !session?.shop) {
      return json({ success: false, message: "Non autorisé." }, 401);
    }
    shop = session.shop;

    const clientIp = getClientIp(request);
    const rateLimit = checkCodRateLimits({ shop, clientIp });
    if (!rateLimit.allowed) {
      return json({ success: false, message: "Trop de tentatives." }, 429);
    }

    const submittedData = await readJsonBody(request);
    const validation = validateCodOrder(submittedData);
    if (!validation.success) {
      return json({ success: false, message: "Vérifiez vos infos.", errors: validation.errors }, 422);
    }

    const data = validation.data;
    idempotencyKeyStr = data.idempotencyKey || randomUUID();

    const alreadyExists = await prisma.idempotentRequest.findUnique({
      where: { idempotencyKey: idempotencyKeyStr },
    });

    if (alreadyExists) {
      if (alreadyExists.status === "completed") return json(alreadyExists.response, 200);
      return json({ success: false, message: "Commande en cours.", processing: true }, 409);
    }

    await prisma.idempotentRequest.create({
      data: {
        idempotencyKey: idempotencyKeyStr,
        shop,
        status: "processing",
        expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
      },
    });

    const { fee: shippingFee, tag: shippingTag } = await getShippingInfo(data.city, shop);
    const phone = normalizePhone(data.phone);
    const { firstName, lastName } = splitFullName(data.fullName);

    const items = data.items?.length > 0
      ? data.items
      : [{ variantId: data.variantId, quantity: data.quantity || 1 }];

    // Shopify requires an email for the draft-order customer in this flow.
    // The generated fallback address is never sent to Meta.
    const customerEmail = data.email || `${phone.replace(/\D/g, "")}@cod.al-fajr.ma`;

    const customAttributes = [
      { key: "Nom complet", value: data.fullName },
      { key: "Téléphone", value: phone },
      { key: "Ville", value: data.city },
      { key: "Adresse", value: data.address },
      { key: "Livraison", value: `${shippingFee} DH` },
      { key: "Email", value: data.email || "-" },
      { key: "Note client", value: data.notes || "-" },
      { key: "Source", value: "AL FAJR COD Express" },
      { key: "COD Request ID", value: idempotencyKeyStr },
      ...buildTrackingAttributes(data),
    ];

    const draftMutation = `
      mutation draftOrderCreate($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) {
          draftOrder { id name totalPrice }
          userErrors { field message }
        }
      }
    `;

    const draftVariables = {
      input: {
        lineItems: items.map((item) => ({
          variantId: `gid://shopify/ProductVariant/${item.variantId}`,
          quantity: Number(item.quantity || 1),
        })),
        email: customerEmail,
        tags: ["COD", "ALFAJR-COD-EXPRESS", shippingTag, `CITY-${data.city}`.slice(0, 255)],
        note: buildOrderNote(data, phone, shippingFee),
        shippingAddress: {
          firstName,
          lastName,
          address1: data.address || "Maroc",
          city: data.city,
          phone,
          countryCode: "MA",
        },
        shippingLine: {
          title: shippingFee === 20 ? "Livraison Fès" : "Livraison Maroc",
          price: shippingFee.toFixed(2),
        },
        customAttributes,
      },
    };

    const draftResponse = await admin.graphql(draftMutation, { variables: draftVariables });
    const draftJson = await draftResponse.json();
    const draftResult = draftJson?.data?.draftOrderCreate;

    if (draftResult?.userErrors?.length > 0 || !draftResult?.draftOrder?.id) {
      logger.warn("Shopify draft order creation failed", {
        shop,
        userErrors: draftResult?.userErrors || [],
      });
      const errResp = { success: false, message: "Erreur lors de la création de la commande." };
      await markIdempotencyFailed(idempotencyKeyStr, errResp);
      return json(errResp, 400);
    }

    const completeMutation = `
      mutation draftOrderComplete($id: ID!) {
        draftOrderComplete(id: $id, paymentPending: true) {
          draftOrder {
            id
            order {
              id
              name
              totalPriceSet { shopMoney { amount currencyCode } }
            }
          }
          userErrors { field message }
        }
      }
    `;

    const completeResponse = await admin.graphql(completeMutation, {
      variables: { id: draftResult.draftOrder.id },
    });
    const completeJson = await completeResponse.json();
    const completeResult = completeJson?.data?.draftOrderComplete;
    const finalOrder = completeResult?.draftOrder?.order;

    if (completeResult?.userErrors?.length > 0 || !finalOrder?.id) {
      logger.warn("Shopify draft order completion failed", {
        shop,
        draftOrderId: draftResult.draftOrder.id,
        userErrors: completeResult?.userErrors || [],
      });
      const errResp = { success: false, message: "La commande Shopify n’a pas pu être finalisée." };
      await markIdempotencyFailed(idempotencyKeyStr, errResp);
      return json(errResp, 400);
    }

    const finalTotalRaw = finalOrder.totalPriceSet?.shopMoney?.amount || draftResult.draftOrder.totalPrice;
    const finalTotal = Number(finalTotalRaw);
    const currency = finalOrder.totalPriceSet?.shopMoney?.currencyCode || "MAD";
    const orderNumericId = shopifyNumericId(finalOrder.id);
    const metaEventId = `alfajr_cod_${orderNumericId || idempotencyKeyStr}`;
    const metaContents = items.map((item) => ({
      id: String(item.variantId),
      quantity: Number(item.quantity || 1),
    }));

    let metaTrackingSettings = null;
    let metaConfig = {
      configured: false,
      browserPixelEnabled: false,
      source: "disabled",
    };

    try {
      metaTrackingSettings = await prisma.metaTrackingSettings.findUnique({
        where: { shop },
      });
      metaConfig = resolveMetaTrackingConfig({
        shop,
        settings: metaTrackingSettings,
      });
    } catch (error) {
      logger.error("Could not load merchant Meta settings", error, { shop });
    }

    successResponse = {
      success: true,
      message: "Votre commande a été enregistrée avec succès.",
      order: {
        id: finalOrder.id,
        name: finalOrder.name,
        total: Number.isFinite(finalTotal) ? finalTotal : 0,
        currency,
      },
      shippingFee,
      meta: {
        eventId: metaEventId,
        eventName: "Purchase",
        serverSent: false,
        browserEnabled: Boolean(
          metaConfig.configured && metaConfig.browserPixelEnabled,
        ),
        pixelId:
          metaConfig.configured && metaConfig.browserPixelEnabled
            ? metaConfig.pixelId
            : undefined,
        contentIds: metaContents.map((item) => item.id),
        contents: metaContents,
      },
    };

    // The Shopify order is already real at this point. Analytics/database
    // failures are non-critical and must never encourage a duplicate order.
    try {
      await prisma.codOrder.create({
        data: {
          shop,
          shopifyOrderId: finalOrder.id,
          customerName: data.fullName,
          customerPhone: phone,
          city: data.city,
          shippingFee,
          total: successResponse.order.total,
          status: "pending",
        },
      });
    } catch (error) {
      logger.error("Could not save COD order in local dashboard", error, {
        shop,
        shopifyOrderId: finalOrder.id,
      });
    }

    const metaResult = await sendMetaPurchase({
      eventId: metaEventId,
      orderId: finalOrder.id,
      value: successResponse.order.total,
      currency,
      items: metaContents,
      phone,
      email: data.email || undefined,
      firstName,
      lastName,
      city: data.city,
      countryCode: "ma",
      externalId: data.externalId || idempotencyKeyStr,
      clientIp,
      userAgent: request.headers.get("user-agent") || undefined,
      fbp: data.fbp || undefined,
      fbc: data.fbc || undefined,
      eventSourceUrl: data.eventSourceUrl || data.landingPage || `https://${shop}`,
    }, { config: metaConfig });

    successResponse.meta.serverSent = metaResult.sent;
    successResponse.meta.serverStatus = metaResult.sent
      ? "sent"
      : metaResult.reason || "not_sent";

    if (metaTrackingSettings?.enabled) {
      const lastEventError = metaResult.sent
        ? null
        : JSON.stringify(metaResult.error || { reason: metaResult.reason }).slice(0, 2000);

      await prisma.metaTrackingSettings
        .update({
          where: { shop },
          data: {
            lastEventStatus: metaResult.sent ? "sent" : metaResult.reason || "failed",
            lastEventAt: new Date(),
            lastEventError,
          },
        })
        .catch((error) => {
          logger.error("Could not save Meta delivery status", error, { shop });
        });
    }

    if (!metaResult.sent) {
      logger.warn("Meta Purchase event was not sent", {
        shop,
        shopifyOrderId: finalOrder.id,
        eventId: metaEventId,
        configured: metaResult.configured,
        reason: metaResult.reason,
        error: metaResult.error,
      });
    } else {
      logger.info("Meta Purchase event sent", {
        shop,
        shopifyOrderId: finalOrder.id,
        eventId: metaEventId,
        attempts: metaResult.attempts,
      });
    }

    try {
      await prisma.idempotentRequest.update({
        where: { idempotencyKey: idempotencyKeyStr },
        data: { status: "completed", response: successResponse },
      });
    } catch (error) {
      logger.error("Could not finalize idempotency record", error, {
        shop,
        shopifyOrderId: finalOrder.id,
        idempotencyKey: idempotencyKeyStr,
      });
    }

    return json(successResponse, 200);
  } catch (error) {
    logger.error("API Error", error, { shop, idempotencyKey: idempotencyKeyStr });

    // Once Shopify has returned a real order, never ask the buyer to submit it again.
    if (successResponse?.success) {
      return json(successResponse, 200);
    }

    const status = Number(error?.status) || 500;
    const errResp = {
      success: false,
      message: status === 413 ? "La requête est trop volumineuse." : "Erreur serveur.",
    };
    await markIdempotencyFailed(idempotencyKeyStr, errResp);
    return json(errResp, status);
  }
}
