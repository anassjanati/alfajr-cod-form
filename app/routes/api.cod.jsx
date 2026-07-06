import { OrderService } from "../services/order.service";
import { Buffer } from "node:buffer";
import { authenticate } from "../shopify.server";
import { createLogger } from "../lib/logger";
import prisma from "../db.server";

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

const MAX_BODY_BYTES = 32 * 1024;

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...JSON_HEADERS,
      ...extraHeaders,
    },
  });
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

export async function loader() {
  return json(
    { success: false, message: "Method not allowed" },
    405,
    { Allow: "POST" }
  );
}

export async function action({ request }) {
  const logger = createLogger({ endpoint: "api.cod", method: request.method });

  let idempotencyKeyStr; // Renamed to avoid collision with destructured variable
  let shop;
  let orderWasCreated = false;

  try {
    const proxyContext = await authenticate.public.appProxy(request);
    const { admin, session } = proxyContext;

    if (!admin || !session?.shop) {
      return json(
        { success: false, message: "Application non autorisée pour cette boutique." },
        401
      );
    }

    shop = session.shop;

    const submittedData = await readJsonBody(request);

    const orderService = new OrderService({
      request,
      admin,
      shop,
    });

    const processed = await orderService.process(submittedData);

    if (!processed.ok) {
      return json(processed.body, processed.status);
    }

    const {
      data,
      phone,
      firstName,
      lastName,
      items,
      shippingFee,
      shippingTag,
      idempotencyKey,
    } = processed;

    idempotencyKeyStr = idempotencyKey;

    // Switched to draftOrderCreate mutation
    const mutation = `
      mutation draftOrderCreate($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) {
          draftOrder {
            id
            name
            totalPrice
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

    // Formatted for DraftOrderInput
    const variables = {
      input: {
        lineItems: items.map((item) => ({
          variantId: `gid://shopify/ProductVariant/${item.variantId}`,
          quantity: Number(item.quantity || 1),
        })),
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
        shippingLine: {
          title: shippingFee === 20 ? "Livraison Fès" : "Livraison Maroc",
          custom: true,
          price: shippingFee.toFixed(2),
        },
        customAttributes,
      },
    };

    const shopifyResponse = await admin.graphql(mutation, { variables });
    const responseJson = await shopifyResponse.json();
    const result = responseJson?.data?.draftOrderCreate;

    if (!result) {
      throw new Error("Shopify did not return a draftOrderCreate result");
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

      logger.warn("Shopify draftOrderCreate returned user errors", {
        shop,
        errors: result.userErrors,
      });

      return json(errorResponse, 400);
    }

    orderWasCreated = true;
    // --- بدء كود تحويل المسودة إلى طلب نهائي ---
    const completeMutation = `
      mutation draftOrderComplete($id: ID!) {
        draftOrderComplete(id: $id, paymentPending: true) {
          draftOrder {
            id
            order {
              id
              name
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const completeResponse = await admin.graphql(completeMutation, {
      variables: { id: result.draftOrder.id }
    });

    const completeJson = await completeResponse.json();
    const completeResult = completeJson?.data?.draftOrderComplete;

    if (completeResult?.userErrors?.length > 0) {
      logger.warn("Erreur lors de la conversion du Draft Order en Order", { 
        errors: completeResult.userErrors 
      });
    }

    // استخراج رقم واسم الطلب النهائي (أو العودة للمسودة في حال حدوث خطأ)
    const finalOrderId = completeResult?.draftOrder?.order?.id || result.draftOrder.id;
    const finalOrderName = completeResult?.draftOrder?.order?.name || result.draftOrder.name;
    // --- نهاية كود التحويل ---

    const totalAmount = Number(result.draftOrder?.totalPrice || shippingFee);

    const successResponse = {
      success: true,
      message: "Votre commande a été enregistrée avec succès.",
      order: {
        id: result.draftOrder?.id,
        name: result.draftOrder?.name,
        total: totalAmount,
        currency: "MAD",
      },
      shippingFee,
    };

    try {
      await prisma.$transaction([
        prisma.codOrder.create({
          data: {
            shop,
            shopifyOrderId: result.draftOrder?.id || null, // Now stores Draft Order ID
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
        orderId: result.draftOrder?.id,
        message: databaseLoggingError?.message,
      });
    }

    logger.info("COD Draft Order created successfully", {
      shop,
      orderId: result.draftOrder?.id,
      orderName: result.draftOrder?.name,
      shippingFee,
    });

    return json(successResponse, 200);
  } catch (error) {
    if (error instanceof Response) return error;

    const status = Number(error?.status) || 500;
    logger.error("COD API error", {
      shop,
      idempotencyKey: idempotencyKeyStr,
      orderWasCreated,
      message: error?.message,
      stack: error?.stack,
    });

    if (idempotencyKeyStr && !orderWasCreated) {
      const failureResponse = {
        success: false,
        message:
          status < 500
            ? error.message
            : "Une erreur temporaire est survenue. Veuillez réessayer.",
      };

      try {
        await prisma.idempotentRequest.update({
          where: { idempotencyKey: idempotencyKeyStr },
          data: { status: "failed", response: failureResponse },
        });
      } catch {
        // Nothing else to do
      }
    }

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
      status
    );
  }
}