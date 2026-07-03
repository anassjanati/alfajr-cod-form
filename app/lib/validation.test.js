import { describe, it, expect } from "vitest";
import { validateCodOrder } from "./validation";

describe("COD order validation", () => {
  const validData = {
    fullName: "Ahmed Alami",
    phone: "+212 612 345 678",
    city: "Casablanca",
    address: "123 Rue Ahmed, Casablanca",
    quantity: 2,
    variantId: "12345",
    idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
    formStartedAt: Date.now() - 3000,
  };

  it("accepts valid product-form data", () => {
    const result = validateCodOrder(validData);
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.errors).toBeNull();
  });

  it("does not require or trust a client-provided shop", () => {
    const result = validateCodOrder({
      ...validData,
      shop: "attacker.myshopify.com",
    });

    expect(result.success).toBe(true);
    expect(result.data.shop).toBeUndefined();
  });

  it("strips a client-provided shipping fee and totals", () => {
    const result = validateCodOrder({
      ...validData,
      shippingFee: -500,
      subtotal: 1,
      total: 1,
    });

    expect(result.success).toBe(true);
    expect(result.data.shippingFee).toBeUndefined();
    expect(result.data.subtotal).toBeUndefined();
    expect(result.data.total).toBeUndefined();
  });

  it("rejects an empty full name", () => {
    const result = validateCodOrder({ ...validData, fullName: "" });
    expect(result.success).toBe(false);
    expect(result.errors.fullName).toBeDefined();
  });

  it("rejects an excessively long full name", () => {
    const result = validateCodOrder({ ...validData, fullName: "A".repeat(121) });
    expect(result.success).toBe(false);
    expect(result.errors.fullName).toBeDefined();
  });

  it("rejects an invalid phone format", () => {
    const result = validateCodOrder({ ...validData, phone: "abc" });
    expect(result.success).toBe(false);
    expect(result.errors.phone).toBeDefined();
  });

  it("rejects an address that is too short", () => {
    const result = validateCodOrder({ ...validData, address: "ABC" });
    expect(result.success).toBe(false);
    expect(result.errors.address).toBeDefined();
  });

  it("rejects a zero quantity", () => {
    const result = validateCodOrder({ ...validData, quantity: 0 });
    expect(result.success).toBe(false);
    expect(result.errors.quantity).toBeDefined();
  });

  it("rejects a quantity above the operational limit", () => {
    const result = validateCodOrder({ ...validData, quantity: 101 });
    expect(result.success).toBe(false);
    expect(result.errors.quantity).toBeDefined();
  });

  it("accepts a cart items array", () => {
    const base = { ...validData };
    delete base.variantId;
    delete base.quantity;
    const result = validateCodOrder({
      ...base,
      items: [
        { variantId: "12345", quantity: 1 },
        { variantId: "67890", quantity: 2 },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("rejects a request with no variant or cart items", () => {
    const data = { ...validData };
    delete data.variantId;
    delete data.quantity;
    const result = validateCodOrder(data);
    expect(result.success).toBe(false);
    expect(result.errors.variantId).toBeDefined();
  });

  it("accepts supported campaign attribution fields", () => {
    const result = validateCodOrder({
      ...validData,
      utmSource: "facebook",
      utmCampaign: "notebook-july",
      fbclid: "example-click-id",
      landingPage: "https://al-fajr.ma/products/notebook",
    });

    expect(result.success).toBe(true);
    expect(result.data.utmSource).toBe("facebook");
  });
});
