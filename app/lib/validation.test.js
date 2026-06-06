import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { validateCodOrder, ShopDomainSchema } from "./validation";

describe("Validation", () => {
  describe("validateCodOrder", () => {
    const validData = {
      shop: "test-store.myshopify.com",
      fullName: "Ahmed Alami",
      phone: "+212 612 345 678",
      city: "Casablanca",
      address: "123 Rue Ahmed, Apt 5, Casablanca, 20000",
      quantity: 2,
      shippingFee: 35,
      variantId: "12345"
    };

    it("should pass validation with valid data", () => {
      const result = validateCodOrder(validData);
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.errors).toBeNull();
    });

    it("should fail with missing shop", () => {
      const data = { ...validData, shop: undefined };
      const result = validateCodOrder(data);
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it("should fail with invalid shop domain", () => {
      const data = { ...validData, shop: "invalid-shop" };
      const result = validateCodOrder(data);
      expect(result.success).toBe(false);
      expect(result.errors.shop).toBeDefined();
    });

    it("should fail with empty fullName", () => {
      const data = { ...validData, fullName: "" };
      const result = validateCodOrder(data);
      expect(result.success).toBe(false);
      expect(result.errors.fullName).toBeDefined();
    });

    it("should fail with fullName exceeding max length", () => {
      const data = { ...validData, fullName: "A".repeat(256) };
      const result = validateCodOrder(data);
      expect(result.success).toBe(false);
      expect(result.errors.fullName).toBeDefined();
    });

    it("should fail with invalid phone format", () => {
      const data = { ...validData, phone: "abc" };
      const result = validateCodOrder(data);
      expect(result.success).toBe(false);
      expect(result.errors.phone).toBeDefined();
    });

    it("should fail with address too short", () => {
      const data = { ...validData, address: "ABC" };
      const result = validateCodOrder(data);
      expect(result.success).toBe(false);
      expect(result.errors.address).toBeDefined();
    });

    it("should fail with quantity 0", () => {
      const data = { ...validData, quantity: 0 };
      const result = validateCodOrder(data);
      expect(result.success).toBe(false);
      expect(result.errors.quantity).toBeDefined();
    });

    it("should fail with negative shippingFee", () => {
      const data = { ...validData, shippingFee: -10 };
      const result = validateCodOrder(data);
      expect(result.success).toBe(false);
      expect(result.errors.shippingFee).toBeDefined();
    });

    it("should pass with optional items array", () => {
      const data = {
        ...validData,
        items: [
          { variantId: "12345", quantity: 1 },
          { variantId: "67890", quantity: 2 }
        ]
      };
      const result = validateCodOrder(data);
      expect(result.success).toBe(true);
    });
  });

  describe("ShopDomainSchema", () => {
    it("should accept valid Shopify shop domain", () => {
      const result = ShopDomainSchema.safeParse("test-store.myshopify.com");
      expect(result.success).toBe(true);
    });

    it("should accept shop with hyphens", () => {
      const result = ShopDomainSchema.safeParse("my-test-store-2024.myshopify.com");
      expect(result.success).toBe(true);
    });

    it("should reject invalid domain", () => {
      const result = ShopDomainSchema.safeParse("not-a-shopify-domain.com");
      expect(result.success).toBe(false);
    });

    it("should reject empty string", () => {
      const result = ShopDomainSchema.safeParse("");
      expect(result.success).toBe(false);
    });
  });
});
