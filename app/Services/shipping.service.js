import prisma from "../db.server";
import { isFesCity, normalizeCity } from "../lib/shipping";

export async function getShippingInfo(city, shop) {
  const zones = await prisma.shippingZone.findMany({
    where: { shop },
  });

  let fee = 35;
  let tag = "MAROC-35DH";

  const isFes = isFesCity(city);

  if (isFes) {
    const fesZone = zones.find((z) => isFesCity(z.zone));
    fee = fesZone ? fesZone.fee : 20; 
    tag = `FES-${fee}DH`;
  } else {
    const normInputCity = normalizeCity(city);
    const specificZone = zones.find(
      (z) => normalizeCity(z.zone) === normInputCity
    );

    if (specificZone) {
      fee = specificZone.fee;
      tag = `CITY-${normInputCity.toUpperCase().replace(/\s+/g, "")}-${fee}DH`;
    } else {
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