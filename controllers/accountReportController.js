import AccountEntry from "../models/AccountEntry.js";
import Party from "../models/Party.js";
import {
  computePartyBalance,
  computePartyBalanceUpTo,
  resolveBalancesForParties,
} from "../utils/accountBalance.js";
import { buildStringDateRangeFilter } from "../utils/dateRangeFilter.js";
import { ownedFilter } from "../utils/ownedFilter.js";

function partyDisplay(party) {
  const obj = party.toObject ? party.toObject() : party;
  if (obj.distributor && typeof obj.distributor === "object") {
    return {
      _id: obj._id,
      name: obj.distributor.company
        ? `${obj.distributor.name} (${obj.distributor.company})`
        : obj.distributor.name,
      phone: obj.distributor.phone || "",
      openingBalance: obj.openingBalance,
    };
  }
  return {
    _id: obj._id,
    name: obj.name,
    phone: obj.phone,
    openingBalance: obj.openingBalance,
  };
}

export const getAccountSummary = async (req, res) => {
  try {
    const parties = await Party.find(ownedFilter(req))
      .populate("distributor", "name company phone")
      .sort({ name: 1 });
    const balances = await resolveBalancesForParties(parties);
    const data = parties.map((party) => {
      const display = partyDisplay(party);
      return {
        ...display,
        currentBalance: balances.get(String(party._id)) ?? party.openingBalance,
      };
    });

    const totalReceivable = data
      .filter((row) => row.currentBalance > 0)
      .reduce((sum, row) => sum + row.currentBalance, 0);

    const totalPayable = data
      .filter((row) => row.currentBalance < 0)
      .reduce((sum, row) => sum + Math.abs(row.currentBalance), 0);

    res.json({
      data,
      totalReceivable,
      totalPayable,
      netBalance: totalReceivable - totalPayable,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getAccountLedger = async (req, res) => {
  try {
    const { party: partyId, from, to } = req.query;
    if (!partyId) {
      return res.status(400).json({ message: "party is required" });
    }

    const party = await Party.findOne(ownedFilter(req, { _id: partyId })).populate(
      "distributor",
      "name company phone"
    );
    if (!party) {
      return res.status(404).json({ message: "Party not found" });
    }

    const filter = ownedFilter(req, { party: partyId });
    const range = buildStringDateRangeFilter(from, to, "date");
    Object.assign(filter, range.filter);

    const openingBalance = from
      ? await computePartyBalance(partyId, from)
      : party.openingBalance;

    const entries = await AccountEntry.find(filter)
      .populate({
        path: "purchase",
        select: "invoiceNumber remarks items purchaseDate",
        populate: {
          path: "items.item",
          select: "name unit",
        },
      })
      .sort({ date: 1, createdAt: 1 });

    let runningBalance = openingBalance;
    let totalDebit = 0;
    let totalCredit = 0;

    const rows = entries.map((entry) => {
      if (entry.type === "debit") {
        runningBalance += entry.amount;
        totalDebit += entry.amount;
      } else {
        runningBalance -= entry.amount;
        totalCredit += entry.amount;
      }
      return {
        ...entry.toObject(),
        balance: runningBalance,
      };
    });

    const closingBalance = to
      ? await computePartyBalanceUpTo(partyId, to)
      : runningBalance;

    res.json({
      party: partyDisplay(party),
      openingBalance,
      totalDebit,
      totalCredit,
      closingBalance,
      rows,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
