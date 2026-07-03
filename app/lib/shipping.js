const FES_ALIASES = new Set([
  "fes",
  "fez",
  "fas",
  "فاس",
  "فس"
]);

/**
 * Normalize Moroccan city input for delivery-price matching.
 *
 * Handles:
 * - Upper/lower case: FES, Fes, fes
 * - French accents: Fès, Fés
 * - Common spelling: Fez, Fas
 * - Arabic variants and diacritics: فاس، فَاس
 * - Repeated letters: فااس, فاسس, Fess
 * - Extra spaces/punctuation: "Ville de Fès", "فاس، المغرب"
 */
export function normalizeCity(city) {
  return String(city || "")
    .toLocaleLowerCase("fr-MA")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ـ/g, "")
    .replace(/[،؛؟]/g, " ")
    .replace(/([a-z\u0600-\u06ff])\1+/gu, "$1")
    .replace(/[^a-z0-9\u0600-\u06ff]+/gu, " ")
    .trim();
}

export function isFesCity(city) {
  const normalizedCity = normalizeCity(city);
  if (!normalizedCity) return false;

  return normalizedCity
    .split(/\s+/)
    .some((token) => FES_ALIASES.has(token));
}

export function getShippingFee(city) {
  return isFesCity(city) ? 20 : 35;
}

export function buildShippingTag(city) {
  return isFesCity(city) ? "FES-20DH" : "MAROC-35DH";
}
