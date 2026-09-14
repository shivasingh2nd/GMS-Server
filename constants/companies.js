export const COMPANIES = ["HPCL", "BPCL", "IOCL"];

export function isValidCompany(value) {
  return COMPANIES.includes(String(value || "").trim().toUpperCase());
}

export function normalizeCompany(value) {
  return String(value || "").trim().toUpperCase();
}
