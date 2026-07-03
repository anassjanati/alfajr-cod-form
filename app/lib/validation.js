import { z } from "zod";

const PhoneSchema = z
  .string()
  .min(8, "Phone must be at least 8 characters")
  .max(20, "Phone must be at most 20 characters")
  .regex(/^[\d+\s\-()]+$/, "Phone contains invalid characters");

const ItemSchema = z.object({
  variantId: z.string().regex(/^\d+$/, "Invalid variant ID"),
  quantity: z.coerce.number().int().min(1).max(100),
});

const OptionalTrackingString = z.string().trim().max(500).optional().or(z.literal(""));

const CodOrderSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    phone: PhoneSchema.trim(),
    city: z.string().trim().min(2).max(100),
    address: z.string().trim().min(5).max(500),

    quantity: z.coerce.number().int().min(1).max(100).optional(),
    variantId: z.string().regex(/^\d+$/, "Invalid variant ID format").optional(),
    items: z.array(ItemSchema).min(1).max(50).optional(),

    email: z.string().email("Invalid email").max(254).optional().or(z.literal("")),
    notes: z.string().trim().max(1000).optional().or(z.literal("")),

    idempotencyKey: z.string().trim().min(16).max(128).optional(),
    formStartedAt: z.coerce.number().int().positive().optional(),
    website: z.string().trim().max(200).optional().or(z.literal("")),

    utmSource: OptionalTrackingString,
    utmMedium: OptionalTrackingString,
    utmCampaign: OptionalTrackingString,
    utmContent: OptionalTrackingString,
    utmTerm: OptionalTrackingString,
    fbclid: OptionalTrackingString,
    landingPage: OptionalTrackingString,
    referrer: OptionalTrackingString,
  })
  .refine(
    (data) => data.variantId || (data.items && data.items.length > 0),
    {
      message: "Either variantId or items is required",
      path: ["variantId"],
    },
  );

export function validateCodOrder(data) {
  const result = CodOrderSchema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data, errors: null };
  }

  const errors = {};
  for (const issue of result.error.issues) {
    errors[issue.path.join(".") || "form"] = issue.message;
  }

  return { success: false, data: null, errors };
}
