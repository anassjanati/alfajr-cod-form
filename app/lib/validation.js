import { z } from "zod";

const ShopDomainSchema = z
  .string()
  .min(3)
  .refine((shop) => {
    return (
      shop === "alfajr-wex5ddvj.myshopify.com" ||
      /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop)
    );
  }, "Invalid Shopify shop domain");

const PhoneSchema = z.string()
  .min(8, "Phone must be at least 8 characters")
  .max(20, "Phone must be at most 20 characters")
  .regex(/^[\d+\s\-()]+$/, "Phone contains invalid characters");

const ItemSchema = z.object({
  variantId: z.string().regex(/^\d+$/, "Invalid variant ID"),
  quantity: z.coerce.number().int().min(1)
});

const CodOrderSchema = z.object({
  shop: z.string().optional(),

  fullName: z.string()
    .min(2, "Full name must be at least 2 characters")
    .max(255, "Full name must be at most 255 characters")
    .trim(),

  phone: PhoneSchema.trim(),

  city: z.string()
    .min(2, "City must be at least 2 characters")
    .max(100, "City must be at most 100 characters")
    .trim(),

  address: z.string()
    .min(5, "Address must be at least 5 characters")
    .max(500, "Address must be at most 500 characters")
    .trim(),

  quantity: z.coerce.number()
    .int("Quantity must be an integer")
    .min(1, "Quantity must be at least 1")
    .max(10000, "Quantity must be at most 10000")
    .optional(),

  shippingFee: z.coerce.number()
    .min(0, "Shipping fee must be non-negative")
    .max(9999, "Shipping fee must be at most 9999")
    .default(35),

  variantId: z.string()
    .regex(/^\d+$/, "Invalid variant ID format")
    .optional(),

  items: z.array(ItemSchema).optional(),

  productId: z.string().optional(),
  productTitle: z.string().optional(),
  productImage: z.string().optional(),
  subtotal: z.coerce.number().optional(),
  total: z.coerce.number().optional()
}).refine((data) => {
  return data.variantId || (data.items && data.items.length > 0);
}, {
  message: "Either variantId or items is required",
  path: ["variantId"]
});

export function validateCodOrder(data) {
  try {
    const validated = CodOrderSchema.parse(data);
    return { success: true, data: validated, errors: null };
  } catch (error) {
    const errors = {};

    if (error.errors) {
      error.errors.forEach(err => {
        const path = err.path.join(".");
        errors[path] = err.message;
      });
    }

    return { success: false, data: null, errors };
  }
}

export { ShopDomainSchema };