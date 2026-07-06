export class ShopifyService {
  constructor(admin) {
    this.admin = admin;
  }

  async graphql(query, variables = {}) {
    const response = await this.admin.graphql(query, {
      variables,
    });

    const json = await response.json();

    if (json.errors?.length) {
      throw new Error(JSON.stringify(json.errors));
    }

    return json.data;
  }

  async getVariant(variantId) {
    const query = `
      query GetVariant($id: ID!) {
        productVariant(id: $id) {
          id
          title
          price
          availableForSale
          inventoryQuantity

          product {
            id
            title
          }
        }
      }
    `;
    
    

    const data = await this.graphql(query, {
      id: `gid://shopify/ProductVariant/${variantId}`,
    });

    return data.productVariant;
  }

  async createDraftOrder(input) {

  const mutation = `
    mutation DraftOrderCreate($input: DraftOrderInput!) {

      draftOrderCreate(input: $input) {

        draftOrder {

          id

          invoiceUrl

          totalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }

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

  const data = await this.graphql(
    mutation,
    {
      input,
    },
  );

  return data.draftOrderCreate;

}

  buildOrderInput({
  data,
  phone,
  firstName,
  lastName,
  items,
  shippingFee,
  shippingTag,
  note,
  attributes,
  idempotencyKey,
}) {
  return {
    lineItems: items.map((item) => ({
      variantId: `gid://shopify/ProductVariant/${item.variantId}`,
      quantity: Number(item.quantity),
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
      `CITY-${data.city}`,
      `COD-ID-${idempotencyKey}`,
    ],

    note,

    customAttributes: attributes,

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
  };
}
buildDraftOrderInput({
  data,
  phone,
  firstName,
  lastName,
  items,
  shippingFee,
  shippingTag,
  note,
  attributes,
}) {
  return {
    lineItems: items.map((item) => ({
      variantId: `gid://shopify/ProductVariant/${item.variantId}`,
      quantity: Number(item.quantity),
    })),

    note,

    tags: [
      "COD",
      "ALFAJR-COD-EXPRESS",
      shippingTag,
      `CITY-${data.city}`,
    ],

    email: data.email || undefined,

    shippingAddress: {
      firstName,
      ...(lastName ? { lastName } : {}),
      address1: data.address,
      city: data.city,
      phone,
      countryCode: "MA",
    },

    customAttributes: attributes,

    shippingLine: {
      title:
        shippingFee === 20
          ? "Livraison Fès"
          : "Livraison Maroc",

      price: shippingFee.toFixed(2),
    },

    useCustomerDefaultAddress: false,
  };
}

async createCodOrder(input) {

  const result =
    await this.createDraftOrder(input);

  if (!result) {
    throw new Error("Draft order creation failed.");
  }

  if (result.userErrors?.length) {
    throw new Error(
      result.userErrors
        .map((e) => e.message)
        .join(", ")
    );
  }

  return result.draftOrder;
}
}