import prisma from "../db.server";
import { isFesCity, normalizeCity } from "../lib/shipping";

export async function getShippingInfo(city, shop) {
  // 1. أول حاجة نتحققوا واش المدينة هي فاس (بأي طريقة كتبها الكليان)
  if (isFesCity(city)) {
    return { fee: 20, tag: "FES-20DH" };
  }

  // 2. إلا ما كانتش فاس، هنا عاد نقّلبو في قاعدة البيانات (للمدن الأخرى)
  const zones = await prisma.shippingZone.findMany({
    where: { shop },
  });

  const normInputCity = normalizeCity(city);
  const specificZone = zones.find(
    (z) => normalizeCity(z.zone) === normInputCity
  );

  if (specificZone) {
    return { fee: specificZone.fee, tag: `CITY-${normInputCity.toUpperCase().replace(/\s+/g, "")}-${specificZone.fee}DH` };
  }

  // 3. إلا ما كانت لا فاس ولا مدينة مسجلة في القاعدة، نديرو 35 درهم (الافتراضي)
  const defaultZone = zones.find(
    (z) => normalizeCity(z.zone) === "maroc" || normalizeCity(z.zone) === "المغرب"
  );
  
  const defaultFee = defaultZone ? defaultZone.fee : 35;
  return { fee: defaultFee, tag: `MAROC-${defaultFee}DH` };
}