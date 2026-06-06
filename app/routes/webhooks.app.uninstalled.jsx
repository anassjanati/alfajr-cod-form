import { authenticate } from "../shopify.server";
import db from "../db.server";
import { createLogger } from "../lib/logger";

export const action = async ({ request }) => {
  const { shop, session, topic } = await authenticate.webhook(request);
  const logger = createLogger({ webhook: topic, shop });

  try {
    logger.info("Webhook received");

    if (!session) {
      logger.warn("Webhook received but session already deleted (may be duplicate)");
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    await db.session.deleteMany({ where: { shop } });

    logger.info("Sessions deleted for uninstalled shop");

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (error) {
    logger.error("Webhook processing failed", error);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }
};
