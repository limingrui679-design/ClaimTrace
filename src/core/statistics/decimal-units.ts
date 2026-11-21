export type DecimalParts = { coefficient: bigint; places: number };

// Work in decimal units of the normalized inputs so equality at the tolerance is stable.
export function decimalParts(value: number): DecimalParts {
  const [mantissa, exponent = "0"] = value.toString().split("e");
  const [whole, fraction = ""] = mantissa.split(".");
  return { coefficient: BigInt(whole + fraction), places: fraction.length - Number(exponent) };
}

export function units(value: DecimalParts, places: number): bigint {
  return value.coefficient * (BigInt(10) ** BigInt(places - value.places));
}

export function relativeBand(baselineUnits: bigint, tolerancePct: number) {
  const tolerance = decimalParts(tolerancePct);
  const places = Math.max(0, tolerance.places);
  const baselineMagnitude = baselineUnits < BigInt(0) ? -baselineUnits : baselineUnits;
  return { band: baselineMagnitude * units(tolerance, places), scale: BigInt(100) * BigInt(10) ** BigInt(places) };
}
