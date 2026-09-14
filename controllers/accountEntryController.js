import AccountEntry from "../models/AccountEntry.js";
import Party from "../models/Party.js";
import { buildStringDateRangeFilter } from "../utils/dateRangeFilter.js";
import { ownedFilter, ownerId } from "../utils/ownedFilter.js";

const partyPopulate = {
  path: "party",
  select: "name phone distributor",
  populate: { path: "distributor", select: "name company phone" },
};

function withPartyDisplay(entry) {
  const obj = entry.toObject ? entry.toObject() : entry;
  if (obj.party && typeof obj.party === "object" && obj.party.distributor) {
    const d = obj.party.distributor;
    if (typeof d === "object" && d) {
      obj.party = {
        ...obj.party,
        name: d.company ? `${d.name} (${d.company})` : d.name,
        phone: d.phone || "",
      };
    }
  }
  return obj;
}

export const listAccountEntries = async (req, res) => {
  try {
    const filter = ownedFilter(req);
    if (req.query.party) filter.party = req.query.party;

    const range = buildStringDateRangeFilter(req.query.from, req.query.to, "date");
    Object.assign(filter, range.filter);

    const limit = req.query.limit ? Number(req.query.limit) : null;

    let query = AccountEntry.find(filter)
      .populate(partyPopulate)
      .sort({ date: -1, createdAt: -1 });

    if (limit && Number.isFinite(limit) && limit > 0) {
      query = query.limit(Math.min(Math.floor(limit), 50));
    }

    const entries = await query;
    res.json(entries.map(withPartyDisplay));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getAccountEntry = async (req, res) => {
  try {
    const entry = await AccountEntry.findOne(
      ownedFilter(req, { _id: req.params.id })
    ).populate(partyPopulate);
    if (!entry) {
      return res.status(404).json({ message: "Entry not found" });
    }
    res.json(withPartyDisplay(entry));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const createAccountEntry = async (req, res) => {
  try {
    const { party: partyId, date, type, amount, particular } = req.body;

    if (!partyId || !date || !type || amount === undefined || amount === null) {
      return res.status(400).json({
        message: "party, date, type and amount are required",
      });
    }

    if (!["debit", "credit"].includes(type)) {
      return res.status(400).json({ message: "type must be debit or credit" });
    }

    const parsedAmount = Number(amount);
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ message: "amount must be greater than zero" });
    }

    const party = await Party.findOne(ownedFilter(req, { _id: partyId }));
    if (!party) {
      return res.status(404).json({ message: "Party not found" });
    }

    const entry = await AccountEntry.create({
      owner: ownerId(req),
      party: partyId,
      date: String(date).trim(),
      type,
      amount: parsedAmount,
      particular: particular?.trim() || "",
      source: "manual",
      purchase: null,
    });

    await entry.populate(partyPopulate);
    res.status(201).json(withPartyDisplay(entry));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const updateAccountEntry = async (req, res) => {
  try {
    const entry = await AccountEntry.findOne(ownedFilter(req, { _id: req.params.id }));
    if (!entry) {
      return res.status(404).json({ message: "Entry not found" });
    }
    if (entry.source !== "manual") {
      return res.status(400).json({
        message: "Edit the purchase record instead — this entry is linked to a purchase",
      });
    }

    const updates = {};

    if (req.body.party !== undefined) {
      const party = await Party.findOne(ownedFilter(req, { _id: req.body.party }));
      if (!party) {
        return res.status(404).json({ message: "Party not found" });
      }
      updates.party = req.body.party;
    }

    if (req.body.date !== undefined) updates.date = String(req.body.date).trim();
    if (req.body.type !== undefined) {
      if (!["debit", "credit"].includes(req.body.type)) {
        return res.status(400).json({ message: "type must be debit or credit" });
      }
      updates.type = req.body.type;
    }
    if (req.body.amount !== undefined) {
      const parsedAmount = Number(req.body.amount);
      if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ message: "amount must be greater than zero" });
      }
      updates.amount = parsedAmount;
    }
    if (req.body.particular !== undefined) {
      updates.particular = req.body.particular?.trim() || "";
    }

    Object.assign(entry, updates);
    await entry.save();
    await entry.populate(partyPopulate);
    res.json(withPartyDisplay(entry));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const deleteAccountEntry = async (req, res) => {
  try {
    const entry = await AccountEntry.findOne(ownedFilter(req, { _id: req.params.id }));
    if (!entry) {
      return res.status(404).json({ message: "Entry not found" });
    }
    if (entry.source !== "manual") {
      return res.status(400).json({
        message: "Delete the purchase record instead — this entry is linked to a purchase",
      });
    }
    await AccountEntry.findOneAndUpdate(
      ownedFilter(req, { _id: req.params.id }),
      { isDeleted: true, deletedAt: new Date() }
    );
    res.json({ message: "Entry deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
