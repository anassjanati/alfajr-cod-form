import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { resolveMetaTrackingConfig } from "../Services/meta-settings.service";

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: HEADERS });
}

export async function loader({ request }) {
  try {
    const { admin, session } = await authenticate.public.appProxy(request);
    if (!admin || !session?.shop) return json({ browserEnabled: false }, 401);

    const settings = await prisma.metaTrackingSettings.findUnique({
      where: { shop: session.shop },
    });
    const config = resolveMetaTrackingConfig({ shop: session.shop, settings });

    if (!config.configured || !config.browserPixelEnabled) {
      return json({ browserEnabled: false });
    }

    // This storefront endpoint never sends server-side CAPI credentials.
    return json({ browserEnabled: true, pixelId: config.pixelId });
  } catch (_) {
    return json({ browserEnabled: false }, 503);
  }
}
