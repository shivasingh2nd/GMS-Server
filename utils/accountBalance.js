import AccountEntry from "../models/AccountEntry.js";
import Party from "../models/Party.js";
import { activeFilter } from "./activeFilter.js";

function applyEntriesToBalance(openingBalance, entries) {
  let balance = openingBalance;
  for (const entry of entries) {
    balance += entry.type === "debit" ? entry.amount : -entry.amount;
  }
  return balance;
}

export async function computePartyBalance(partyId, beforeDate) {
  const party = await Party.findOne({ _id: partyId, ...activeFilter });
  if (!party) return 0;

  const match = { party: party._id, ...activeFilter };
  if (beforeDate) {
    match.date = { $lt: beforeDate };
  }

  const entries = await AccountEntry.find(match).sort({ date: 1, createdAt: 1 });
  return applyEntriesToBalance(party.openingBalance, entries);
}

export async function computePartyBalanceUpTo(partyId, toDate) {
  const party = await Party.findOne({ _id: partyId, ...activeFilter });
  if (!party) return 0;

  const entries = await AccountEntry.find({
    party: partyId,
    date: { $lte: toDate },
    ...activeFilter,
  }).sort({ date: 1, createdAt: 1 });

  return applyEntriesToBalance(party.openingBalance, entries);
}

export async function resolveCurrentBalance(party) {
  const [result] = await AccountEntry.aggregate([
    { $match: { party: party._id, ...activeFilter } },
    {
      $group: {
        _id: null,
        debitTotal: {
          $sum: { $cond: [{ $eq: ["$type", "debit"] }, "$amount", 0] },
        },
        creditTotal: {
          $sum: { $cond: [{ $eq: ["$type", "credit"] }, "$amount", 0] },
        },
      },
    },
  ]);

  const debitTotal = result?.debitTotal ?? 0;
  const creditTotal = result?.creditTotal ?? 0;
  return party.openingBalance + debitTotal - creditTotal;
}

export async function resolveBalancesForParties(parties) {
  if (!parties.length) return new Map();

  const partyIds = parties.map((p) => p._id);
  const totals = await AccountEntry.aggregate([
    { $match: { party: { $in: partyIds }, ...activeFilter } },
    {
      $group: {
        _id: "$party",
        debitTotal: {
          $sum: { $cond: [{ $eq: ["$type", "debit"] }, "$amount", 0] },
        },
        creditTotal: {
          $sum: { $cond: [{ $eq: ["$type", "credit"] }, "$amount", 0] },
        },
      },
    },
  ]);

  const totalsByParty = new Map(
    totals.map((row) => [String(row._id), row.debitTotal - row.creditTotal])
  );

  return new Map(
    parties.map((party) => [
      String(party._id),
      party.openingBalance + (totalsByParty.get(String(party._id)) ?? 0),
    ])
  );
}
