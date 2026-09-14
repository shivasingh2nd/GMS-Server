import { endOfUtcDay, startOfUtcDay } from "./dateUtils.js";

export function buildDateRangeFilter(fromQuery, toQuery, fieldName = "date") {
  const from = fromQuery ? startOfUtcDay(new Date(fromQuery)) : null;
  const to = toQuery ? startOfUtcDay(new Date(toQuery)) : null;

  if (
    (fromQuery && Number.isNaN(from?.getTime())) ||
    (toQuery && Number.isNaN(to?.getTime()))
  ) {
    return { error: "Invalid from/to date" };
  }

  if (!from && !to) {
    return { filter: {} };
  }

  const filter = { [fieldName]: {} };
  if (from) filter[fieldName].$gte = from;
  if (to) filter[fieldName].$lte = endOfUtcDay(to);

  return { filter };
}

export function buildStringDateRangeFilter(fromQuery, toQuery, fieldName = "date") {
  if (!fromQuery && !toQuery) {
    return { filter: {} };
  }

  const filter = { [fieldName]: {} };
  if (fromQuery) filter[fieldName].$gte = String(fromQuery).trim();
  if (toQuery) filter[fieldName].$lte = String(toQuery).trim();

  return { filter };
}
