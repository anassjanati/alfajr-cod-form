import { describe, expect, it } from "vitest";
import {
  buildShippingTag,
  getShippingFee,
  isFesCity,
  normalizeCity
} from "./shipping";

describe("Fès shipping detection", () => {
  const fesInputs = [
    "fes",
    "FES",
    "Fes",
    "fès",
    "FÈS",
    "fés",
    "fez",
    "Fez",
    "fas",
    "Fess",
    "Ville de Fès",
    "Fès, Maroc",
    "Fès-Médina",
    "فاس",
    "فَاس",
    "فااس",
    "فاسس",
    "فس",
    "مدينة فاس",
    "فاس، المغرب"
  ];

  it.each(fesInputs)("charges 20 DH for %s", (city) => {
    expect(isFesCity(city)).toBe(true);
    expect(getShippingFee(city)).toBe(20);
    expect(buildShippingTag(city)).toBe("FES-20DH");
  });

  const otherCities = [
    "Casablanca",
    "Rabat",
    "Meknès",
    "Tanger",
    "Agadir",
    "Sefrou",
    "Tafersit",
    ""
  ];

  it.each(otherCities)("charges 35 DH for %s", (city) => {
    expect(isFesCity(city)).toBe(false);
    expect(getShippingFee(city)).toBe(35);
    expect(buildShippingTag(city)).toBe("MAROC-35DH");
  });

  it("normalizes repeated Arabic letters", () => {
    expect(normalizeCity(" فااس ")).toBe("فاس");
  });
});
