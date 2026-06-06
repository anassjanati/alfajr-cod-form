import { authenticate } from "../shopify.server";
import db from "../db.server";
import { createLogger } from "../lib/logger";

export const action = async ({ request }) => {
  const { payload, session, topic, shop } = await authenticate.webhook(request);
  const logger = createLogger({ webhook: topic, shop });

  try {
    logger.info("Webhook received");

    if (!session) {
      logger.warn("Webhook received but no session found");
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    const current = payload.current;

    if (!current) {
      logger.warn("Missing current scope in payload");
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    await db.session.update({
      where: {
        id: session.id,
      },
      data: {
        scope: current.toString(),
      },
    });

    logger.info("Session scope updated", { scopes: current.toString() });

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (error) {
    logger.error("Webhook processing failed", error);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }
};
