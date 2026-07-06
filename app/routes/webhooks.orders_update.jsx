import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { createLogger } from "../lib/logger";

export const action = async ({ request }) => {
  // التحقق من صحة ومصدر الـ Webhook أمنياً
  const { payload, shop, topic } = await authenticate.webhook(request);
  const logger = createLogger({ webhook: topic, shop });

  try {
    logger.info(`Webhook ${topic} received for order ${payload.id}`);

    // Shopify يرسل المعرف بصيغة GraphQL داخل هذا الحقل
    const shopifyOrderId = payload.admin_graphql_api_id; 

    if (!shopifyOrderId) {
      return new Response("OK", { status: 200 });
    }

    // تحديد الحالة الجديدة للطلب بناءً على بيانات Shopify
    let newStatus = "pending";
    
    if (payload.cancelled_at !== null) {
      newStatus = "cancelled"; // الطلب ملغي
    } else if (payload.financial_status === "paid") {
      newStatus = "paid"; // تم الدفع (تم تسليم الـ COD)
    } else if (payload.fulfillment_status === "fulfilled") {
      newStatus = "fulfilled"; // تم شحن الطلب
    }

    // تحديث حالة الطلب في قاعدة بيانات تطبيقك
    await prisma.codOrder.updateMany({
      where: { 
        shop: shop,
        shopifyOrderId: shopifyOrderId 
      },
      data: { status: newStatus }
    });

    logger.info("Order status updated automatically", { shopifyOrderId, newStatus });

    // يجب دائماً الرد بـ 200 OK لكي يعلم Shopify أننا استلمنا الإشعار بنجاح
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
    
  } catch (error) {
    logger.error("Webhook processing failed", error);
    // نرد بـ 200 حتى لو حدث خطأ داخلي لكي لا يكرر Shopify إرسال نفس الإشعار مئات المرات
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }
};