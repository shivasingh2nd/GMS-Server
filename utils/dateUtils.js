export function startOfUtcDay(date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export function endOfUtcDay(date) {
  const d = startOfUtcDay(date);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

export function toIsoDateString(date) {
  const d = startOfUtcDay(date);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function addUtcDays(date, days) {
  const result = startOfUtcDay(date);
  result.setUTCDate(result.getUTCDate() + Number(days));
  return result;
}
