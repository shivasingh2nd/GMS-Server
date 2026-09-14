import AccountEntry from "../models/AccountEntry.js";
import { activeFilter } from "./activeFilter.js";
import { toIsoDateString } from "./dateUtils.js";

export function purchaseDateString(date) {
  return toIsoDateString(date);
}

export function purchaseParticular(purchase) {
  const invoice = purchase.invoiceNumber?.trim();
  const base = invoice ? `Invoice ${invoice}` : "";
  if (purchase.remarks?.trim()) {
    return base ? `${base} — ${purchase.remarks.trim()}` : purchase.remarks.trim();
  }
  return base || "Purchase";
}

export async function createPurchaseLedgerEntry(purchase, partyId, ownerId, session = null) {
  const options = session ? { session } : {};
  const [entry] = await AccountEntry.create(
    [
      {
        owner: ownerId,
        party: partyId,
        purchase: purchase._id,
        source: "purchase",
        date: purchaseDateString(purchase.purchaseDate),
        type: "credit",
        amount: purchase.totalAmount,
        particular: purchaseParticular(purchase),
      },
    ],
    options
  );
  return entry;
}

export async function createPurchasePaymentEntry(
  purchase,
  partyId,
  ownerId,
  session = null,
  options = {}
) {
  const sessionOpts = session ? { session } : {};
  const amount =
    options.amount !== undefined && options.amount !== null
      ? Number(options.amount)
      : purchase.totalAmount;
  const particular =
    options.particular !== undefined
      ? String(options.particular).trim()
      : purchaseParticular(purchase);

  const [entry] = await AccountEntry.create(
    [
      {
        owner: ownerId,
        party: partyId,
        purchase: null,
        source: "manual",
        date: purchaseDateString(purchase.purchaseDate),
        type: "debit",
        amount,
        particular,
      },
    ],
    sessionOpts
  );
  return entry;
}

export async function syncPurchaseLedgerEntry(purchase, partyId, ownerId, session = null) {
  const query = AccountEntry.findOne({
    owner: ownerId,
    purchase: purchase._id,
    source: "purchase",
    ...activeFilter,
  });
  if (session) query.session(session);

  const entry = await query;
  if (entry) {
    entry.party = partyId;
    entry.date = purchaseDateString(purchase.purchaseDate);
    entry.amount = purchase.totalAmount;
    entry.particular = purchaseParticular(purchase);
    await entry.save(session ? { session } : undefined);
    return entry;
  }

  return createPurchaseLedgerEntry(purchase, partyId, ownerId, session);
}

export async function deletePurchaseLedgerEntries(purchase, ownerId, session = null) {
  const options = session ? { session } : {};
  await AccountEntry.updateMany(
    { owner: ownerId, purchase: purchase._id, ...activeFilter },
    { isDeleted: true, deletedAt: new Date() },
    options
  );
}
