import { unauthenticated } from "../shopify.server";
import { validateCodOrder } from "../lib/validation";
import { createLogger } from "../lib/logger";
import { checkRateLimit } from "../lib/rateLimiter";
import prisma from "../db.server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, idempotency-key, x-shopify-shop-domain",
  "Content-Type": "application/json"
};

export async function loader({ request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({
      success: true,
      message: "COD API is working"
    }),
    {
      status: 200,
      headers: corsHeaders
    }
  );
}

function generateIdempotencyKey() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function normalizePhone(phone) {
  let value = String(phone || "").replace(/\s|-/g, "").trim();

  if (value.startsWith("+212")) {
    value = "0" + value.slice(4);
  }

  if (value.startsWith("212")) {
    value = "0" + value.slice(3);
  }

  return value;
}

function normalizeCity(city) {
  return String(city || "")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function buildShippingTag(city, shippingFee) {
  const normalizedCity = normalizeCity(city);

  if (
    normalizedCity.includes("fes") ||
    normalizedCity.includes("fez") ||
    normalizedCity.includes("فاس")
  ) {
    return "FES-20DH";
  }

  return `MAROC-${Number(shippingFee || 35)}DH`;
}

function buildOrderNote(data) {
  return `AL FAJR COD Express

Nom: ${data.fullName}
Téléphone: ${data.phone}
Ville: ${data.city}
Adresse: ${data.address}
Livraison: ${data.shippingFee} DH
Email: ${data.email || "-"}
Note client: ${data.notes || "-"}

Source: AL FAJR COD Express`;
}

export async function action({ request }) {
  const logger = createLogger({
    endpoint: "api.cod",
    method: request.method
  });

  let idempotencyKey;

  try {
    const data = await request.json();

    const shop =
      data.shop ||
      new URL(request.url).searchParams.get("shop") ||
      "alfajr-wex5ddvj.myshopify.com";

    logger.info("COD order request received", { shop });

    if (!shop) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Missing shop domain"
        }),
        {
          status: 422,
          headers: corsHeaders
        }
      );
    }

    const { allowed, remaining, resetTime } = checkRateLimit(shop, 20, 60);

    if (!allowed) {
      logger.warn("Rate limit exceeded", { shop, remaining });

      return new Response(
        JSON.stringify({
          success: false,
          message: "Trop de tentatives. Veuillez réessayer plus tard."
        }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            "Retry-After": Math.ceil((resetTime - Date.now()) / 1000).toString()
          }
        }
      );
    }

    idempotencyKey =
      request.headers.get("idempotency-key") || generateIdempotencyKey();

    const existingRequest = await prisma.idempotentRequest.findUnique({
      where: { idempotencyKey }
    });

    if (existingRequest) {
      if (existingRequest.status === "completed") {
        return new Response(JSON.stringify(existingRequest.response), {
          status: 200,
          headers: corsHeaders
        });
      }

      if (existingRequest.status === "failed") {
        return new Response(JSON.stringify(existingRequest.response), {
          status: 400,
          headers: corsHeaders
        });
      }

      return new Response(
        JSON.stringify({
          success: false,
          message: "La commande est encore en cours de traitement."
        }),
        {
          status: 409,
          headers: corsHeaders
        }
      );
    }

    const validation = validateCodOrder(data);

    if (!validation.success) {
      const failedResponse = {
        success: false,
        message: "Validation failed",
        errors: validation.errors
      };

      await prisma.idempotentRequest.create({
        data: {
          idempotencyKey,
          shop,
          status: "failed",
          response: failedResponse,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        }
      });

      return new Response(JSON.stringify(failedResponse), {
        status: 422,
        headers: corsHeaders
      });
    }

    const validatedData = {
      ...validation.data,
      phone: normalizePhone(validation.data.phone),
      shippingFee: Number(validation.data.shippingFee || 35),
      email: data.email || "",
      notes: data.notes || ""
    };

    await prisma.idempotentRequest.create({
      data: {
        idempotencyKey,
        shop,
        status: "processing",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      }
    });

    const { admin } = await unauthenticated.admin(shop);

    const mutation = `
      mutation orderCreate($order: OrderCreateOrderInput!) {
        orderCreate(order: $order) {
          order {
            id
            name
            displayFinancialStatus
            displayFulfillmentStatus
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const items =
      validatedData.items && validatedData.items.length > 0
        ? validatedData.items
        : [
            {
              variantId: validatedData.variantId,
              quantity: validatedData.quantity || 1
            }
          ];

    const shippingTag = buildShippingTag(
      validatedData.city,
      validatedData.shippingFee
    );

    const variables = {
      order: {
        lineItems: items.map((item) => ({
          variantId: `gid://shopify/ProductVariant/${item.variantId}`,
          quantity: Number(item.quantity || 1)
        })),

        financialStatus: "PENDING",

        tags: [
          "COD",
          "ALFAJR-COD-EXPRESS",
          shippingTag,
          validatedData.city ? `CITY-${validatedData.city}` : "CITY-UNKNOWN"
        ],

        note: buildOrderNote(validatedData),

        shippingAddress: {
          firstName: validatedData.fullName,
          address1: validatedData.address,
          city: validatedData.city,
          phone: validatedData.phone,
          countryCode: "MA"
        },

        customAttributes: [
          { key: "Nom complet", value: validatedData.fullName },
          { key: "Téléphone", value: validatedData.phone },
          { key: "Ville", value: validatedData.city },
          { key: "Adresse", value: validatedData.address },
          { key: "Livraison", value: `${validatedData.shippingFee} DH` },
          { key: "Email", value: validatedData.email || "-" },
          { key: "Note client", value: validatedData.notes || "-" },
          { key: "Source", value: "AL FAJR COD Express" }
        ]
      }
    };

    const shopifyResponse = await admin.graphql(mutation, { variables });
    const responseJson = await shopifyResponse.json();
    const result = responseJson?.data?.orderCreate;

    if (!result) {
      throw new Error("orderCreate mutation did not return expected response");
    }

    if (result.userErrors && result.userErrors.length > 0) {
      const errorResponse = {
        success: false,
        message: "Failed to create order",
        errors: result.userErrors
      };

      await prisma.idempotentRequest.update({
        where: { idempotencyKey },
        data: {
          status: "failed",
          response: errorResponse
        }
      });

      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: corsHeaders
      });
    }

    const orderTotal =
      Number(validatedData.total || 0) ||
      Number(validatedData.subtotal || 0) + Number(validatedData.shippingFee || 0);

    await prisma.codOrder.create({
      data: {
        shop,
        shopifyOrderId: result.order?.id || null,
        customerName: validatedData.fullName,
        customerPhone: validatedData.phone,
        city: validatedData.city,
        shippingFee: validatedData.shippingFee,
        total: orderTotal || validatedData.shippingFee || 0,
        status: "pending"
      }
    });

    const successResponse = {
      success: true,
      message: "Order created successfully",
      order: result.order
    };

    await prisma.idempotentRequest.update({
      where: { idempotencyKey },
      data: {
        status: "completed",
        response: successResponse
      }
    });

    logger.info("Order created successfully", {
      orderId: result.order?.id,
      orderName: result.order?.name
    });

    return new Response(JSON.stringify(successResponse), {
      status: 200,
      headers: corsHeaders
    });
  } catch (error) {
    logger.error("COD API error", error);

    if (idempotencyKey) {
      try {
        await prisma.idempotentRequest.update({
          where: { idempotencyKey },
          data: {
            status: "failed",
            response: {
              success: false,
              message: error.message || "Internal server error"
            }
          }
        });
      } catch (_) {}
    }

    return new Response(
      JSON.stringify({
        success: false,
        message: "Internal server error"
      }),
      {
        status: 500,
        headers: corsHeaders
      }
    );
  }
}