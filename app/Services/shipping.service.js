import prisma from "../db.server";
import { isFesCity, normalizeCity } from "../lib/shipping";

export async function getShippingInfo(city, shop) {
  // 1. جلب جميع مناطق الشحن الخاصة بهذا المتجر من قاعدة البيانات
  const zones = await prisma.shippingZone.findMany({
    where: { shop },
  });

  // 2. الأسعار الافتراضية
  let fee = 35;
  let tag = "MAROC-35DH";

  // 3. التحقق الذكي مما إذا كانت المدينة هي "فاس" بأي صيغة
  const isFes = isFesCity(city);

  if (isFes) {
    // التحقق إذا كان التاجر قد أضاف "فاس" في لوحة التحكم لتعديل السعر مستقبلاً
    const fesZone = zones.find((z) => isFesCity(z.zone));
    fee = fesZone ? fesZone.fee : 20; // 20 درهم افتراضياً لفاس
    tag = `FES-${fee}DH`;
  } else {
    // إذا لم تكن فاس، نبحث عن اسم المدينة في قاعدة البيانات
    const normInputCity = normalizeCity(city);
    const specificZone = zones.find(
      (z) => normalizeCity(z.zone) === normInputCity
    );

    if (specificZone) {
      // المدينة موجودة في لوحة التحكم
      fee = specificZone.fee;
      tag = `CITY-${normInputCity.toUpperCase().replace(/\s+/g, "")}-${fee}DH`;
    } else {
      // المدينة غير موجودة في لوحة التحكم -> نطبق سعر المغرب الافتراضي 35 درهم
      // أو نتحقق إذا أضفت منطقة باسم "Maroc" في لوحة التحكم
      const defaultZone = zones.find(
        (z) =>
          normalizeCity(z.zone) === "maroc" ||
          normalizeCity(z.zone) === "المغرب"
      );
      
      if (defaultZone) {
        fee = defaultZone.fee;
      }
      tag = `MAROC-${fee}DH`;
    }
  }

  return { fee, tag };
}