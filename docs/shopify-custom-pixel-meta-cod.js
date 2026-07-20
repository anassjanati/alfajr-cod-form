/* global analytics, fbq */

/*
 * Shopify Admin > Settings > Customer events > Add custom pixel
 * Name: AL FAJR COD Purchase
 * Replace YOUR_META_PIXEL_ID before connecting the pixel.
 *
 * This pixel listens only to the custom event emitted after a real COD order
 * is created. Do not add PageView, ViewContent, AddToCart or checkout events
 * here because the official Facebook & Instagram channel can already send them.
 */

!function(f,b,e,v,n,t,s) {
  if (f.fbq) return;
  n = f.fbq = function() {
    n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
  };
  if (!f._fbq) f._fbq = n;
  n.push = n;
  n.loaded = true;
  n.version = '2.0';
  n.queue = [];
  t = b.createElement(e);
  t.async = true;
  t.src = v;
  s = b.getElementsByTagName(e)[0];
  s.parentNode.insertBefore(t, s);
}(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');

fbq('init', 'YOUR_META_PIXEL_ID');

analytics.subscribe('alfajr_cod_purchase', (event) => {
  const data = event.customData || {};
  if (!data.event_id) return;

  fbq(
    'track',
    'Purchase',
    {
      value: Number(data.value || 0),
      currency: data.currency || 'MAD',
      content_type: data.content_type || 'product',
      content_ids: Array.isArray(data.content_ids) ? data.content_ids : [],
      contents: Array.isArray(data.contents) ? data.contents : [],
      order_id: data.order_id || ''
    },
    { eventID: data.event_id }
  );
});
