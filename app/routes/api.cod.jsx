import { unauthenticated } from "../shopify.server";
import { validateCodOrder } from "../lib/validation";
import { createLogger } from "../lib/logger";
import { checkRateLimit } from "../lib/rateLimiter";
import prisma from "../db.server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, idempotency-key, x-shopify-shop-domain",
  "Content-Type": "application/json"
};

export async function loader({ request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  return new Response(JSON.stringify({
    success: true,
    message: "COD API is working"
  }), {
    status: 200,
    headers: corsHeaders
  });
}

function generateIdempotencyKey() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export async function action({ request }) {
  const logger = createLogger({ endpoint: "api.cod", method: request.method });

  try {
    const data = await request.json();
    const shop =
  data.shop ||
  new URL(request.url).searchParams.get("shop") ||
  "alfajr-wex5ddvj.myshopify.com";

    logger.info("COD order request received", { shop });

    if (!shop) {
      logger.warn("Missing shop domain in request");
      return new Response(JSON.stringify({
        success: false,
        message: "Missing shop domain"
      }), {
        status: 422,
        headers: corsHeaders
      });
    }

    const { allowed, remaining, resetTime } = checkRateLimit(shop, 20, 60);
    if (!allowed) {
      logger.warn("Rate limit exceeded", { shop, remaining });
      return new Response(JSON.stringify({
        success: false,
        message: "Rate limit exceeded. Please try again later."
      }), {
        status: 429,
        headers: {
          ...corsHeaders,
          "Retry-After": Math.ceil((resetTime - Date.now()) / 1000).toString()
        }
      });
    }

    const idempotencyKey = request.headers.get("idempotency-key") || generateIdempotencyKey();

    const existingRequest = await prisma.idempotentRequest.findUnique({
      where: { idempotencyKey }
    });

    if (existingRequest) {
      logger.info("Idempotent request detected", { idempotencyKey, status: existingRequest.status });

      if (existingRequest.status === "completed") {
        return new Response(JSON.stringify(existingRequest.response), {
          status: 200,
          headers: corsHeaders
        });
      } else if (existingRequest.status === "failed") {
        return new Response(JSON.stringify(existingRequest.response), {
          status: 400,
          headers: corsHeaders
        });
      } else {
        return new Response(JSON.stringify({
          success: false,
          message: "Request is still processing. Please retry."
        }), {
          status: 409,
          headers: corsHeaders
        });
      }
    }

    const validation = validateCodOrder(data);
    if (!validation.success) {
      logger.warn("Validation failed", { errors: validation.errors });

      const response = {
        success: false,
        message: "Validation failed",
        errors: validation.errors
      };

      await prisma.idempotentRequest.create({
        data: {
          idempotencyKey,
          shop,
          status: "failed",
          response,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        }
      });

      return new Response(JSON.stringify(response), {
        status: 422,
        headers: corsHeaders
      });
    }

    const validatedData = validation.data;

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

    const items = validatedData.items && validatedData.items.length > 0
      ? validatedData.items
      : [{
        variantId: validatedData.variantId,
        quantity: validatedData.quantity || 1
      }];

    const variables = {
      order: {
        lineItems: items.map(item => ({
          variantId: `gid://shopify/ProductVariant/${item.variantId}`,
          quantity: Number(item.quantity || 1)
        })),
        financialStatus: "PENDING",
        tags: ["COD", "ALFAJR-COD-FORM"],
        note: `COD Order
Nom: ${validatedData.fullName}
Téléphone: ${validatedData.phone}
Ville: ${validatedData.city}
Adresse: ${validatedData.address}
Livraison: ${validatedData.shippingFee} DH`,
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
          { key: "Source", value: "AL FAJR COD Form" }
        ]
      }
    };

    const response = await admin.graphql(mutation, { variables });
    const responseJson = await response.json();

    const result = responseJson?.data?.orderCreate;

    if (!result) {
      throw new Error("orderCreate mutation did not return expected response");
    }

    if (result.userErrors && result.userErrors.length > 0) {
      logger.warn("GraphQL user errors", { errors: result.userErrors });

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

    logger.info("Order created successfully", {
      orderId: result.order?.id,
      orderName: result.order?.name
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

    return new Response(JSON.stringify(successResponse), {
      status: 200,
      headers: corsHeaders
    });

  } catch (error) {
    logger.error("COD API error", error);

    const errorResponse = {
      success: false,
      message: "Internal server error"
    };

    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: corsHeaders
    });
  }
}
