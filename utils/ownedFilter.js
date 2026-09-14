import { activeFilter } from "./activeFilter.js";

export function ownedFilter(req, extra = {}) {
  return { owner: req.user._id, ...activeFilter, ...extra };
}

export function ownerId(req) {
  return req.user._id;
}
