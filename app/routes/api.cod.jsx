import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { authenticate } from "../shopify.server";
import { createLogger } from "../lib/logger";
import prisma from "../db.server";
import { validateCodOrder } from "../lib/validation";
import { getClientIp, checkCodRateLimits } from "../lib/rateLimiter";
import { getShippingInfo } from "../Services/shipping.service";

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

export async function loader() {
  return json({ success: false, message: "Method not allowed" }, 405, { Allow: "POST" });
}

export async function action({ request }) {
  const logger = createLogger({ endpoint: "api.cod", method: request.method });
  let idempotencyKeyStr;
  let shop;
  let orderWasCreated = false;

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
      return json({ success: false, message: "Commande en cours." }, 409);
    }

    await prisma.idempotentRequest.create({
      data: {
        idempotencyKey: idempotencyKeyStr,
        shop,
        status: "processing",
        expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
      },
    });

    // 1. حساب الشحن الجديد (من الداتا بيز أو فاس 20 درهم)
    const { fee: shippingFee, tag: shippingTag } = await getShippingInfo(data.city, shop);
    const phone = normalizePhone(data.phone);
    const { firstName, lastName } = splitFullName(data.fullName);

    const items = data.items?.length > 0 ? data.items : [{ variantId: data.variantId, quantity: data.quantity || 1 }];

    // 2. حل مشكل الكليان (Customer): إعطاء إيميل وهمي إذا لم يقم بإدخاله لكي ينشئ Shopify حساب العميل
    const customerEmail = data.email || `${phone.replace(/\D/g, '')}@cod.al-fajr.ma`;

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

    // 3. إنشاء Draft Order أولا (كي يقوم Shopify بجمع ثمن المنتجات + الشحن)
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

    if (draftResult?.userErrors?.length > 0) {
      const errResp = { success: false, message: "Erreur lors de la création de la commande." };
      await prisma.idempotentRequest.update({ where: { idempotencyKey: idempotencyKeyStr }, data: { status: "failed", response: errResp }});
      return json(errResp, 400);
    }

    // 4. تحويل الـ Draft Order إلى Order حقيقي
    const completeMutation = `
      mutation draftOrderComplete($id: ID!) {
        draftOrderComplete(id: $id, paymentPending: true) {
          draftOrder {
            id
            order {
              id
              name
              totalPriceSet { shopMoney { amount } }
            }
          }
          userErrors { field message }
        }
      }
    `;

    const completeResponse = await admin.graphql(completeMutation, { variables: { id: draftResult.draftOrder.id } });
    const completeJson = await completeResponse.json();
    const completeResult = completeJson?.data?.draftOrderComplete;

    orderWasCreated = true;

    const finalOrder = completeResult?.draftOrder?.order;
    const finalTotal = finalOrder?.totalPriceSet?.shopMoney?.amount || draftResult.draftOrder.totalPrice;

    const successResponse = {
      success: true,
      message: "Votre commande a été enregistrée avec succès.",
      order: {
        id: finalOrder?.id || draftResult.draftOrder.id,
        name: finalOrder?.name || draftResult.draftOrder.name,
        total: Number(finalTotal),
        currency: "MAD",
      },
      shippingFee,
    };

    // 5. تسجيل الطلب في قاعدة البيانات لعرضه في الداشبورد
    await prisma.$transaction([
      prisma.codOrder.create({
        data: {
          shop,
          shopifyOrderId: finalOrder?.id || draftResult.draftOrder.id,
          customerName: data.fullName,
          customerPhone: phone,
          city: data.city,
          shippingFee,
          total: Number(finalTotal),
          status: "pending",
        },
      }),
      prisma.idempotentRequest.update({
        where: { idempotencyKey: idempotencyKeyStr },
        data: { status: "completed", response: successResponse },
      }),
    ]);

    return json(successResponse, 200);

  } catch (error) {
    logger.error("API Error", { message: error.message });
    if (!orderWasCreated && idempotencyKeyStr) {
      await prisma.idempotentRequest.update({
        where: { idempotencyKey: idempotencyKeyStr },
        data: { status: "failed", response: { success: false, message: "Erreur serveur." } }
      }).catch(() => {});
    }
    return json({ success: false, message: "Erreur serveur." }, 500);
  }
}