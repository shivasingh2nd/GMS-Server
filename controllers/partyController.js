import Party from "../models/Party.js";
import { resolveBalancesForParties, resolveCurrentBalance } from "../utils/accountBalance.js";
import { ownedFilter, ownerId } from "../utils/ownedFilter.js";

function partyDisplayFields(party) {
  const obj = party.toObject ? party.toObject() : party;
  if (obj.distributor && typeof obj.distributor === "object") {
    return {
      ...obj,
      name: obj.distributor.company
        ? `${obj.distributor.name} (${obj.distributor.company})`
        : obj.distributor.name,
      phone: obj.distributor.phone || "",
    };
  }
  return obj;
}

export const listParties = async (req, res) => {
  try {
    const parties = await Party.find(ownedFilter(req))
      .populate("distributor", "name company phone")
      .sort({ name: 1 });
    const balances = await resolveBalancesForParties(parties);
    const data = parties.map((party) => {
      const display = partyDisplayFields(party);
      return {
        ...display,
        currentBalance: balances.get(String(party._id)) ?? party.openingBalance,
      };
    });
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getParty = async (req, res) => {
  try {
    const party = await Party.findOne(ownedFilter(req, { _id: req.params.id })).populate(
      "distributor",
      "name company phone"
    );
    if (!party) {
      return res.status(404).json({ message: "Party not found" });
    }
    res.json({
      ...partyDisplayFields(party),
      currentBalance: await resolveCurrentBalance(party),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const createParty = async (req, res) => {
  try {
    const { name, phone, notes, openingBalance } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ message: "Party name is required" });
    }

    const party = await Party.create({
      owner: ownerId(req),
      name: name.trim(),
      phone: phone?.trim() || "",
      notes: notes?.trim() || "",
      openingBalance: Number(openingBalance) || 0,
    });

    res.status(201).json({
      ...party.toObject(),
      currentBalance: party.openingBalance,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const updateParty = async (req, res) => {
  try {
    const existing = await Party.findOne(ownedFilter(req, { _id: req.params.id }));
    if (!existing) {
      return res.status(404).json({ message: "Party not found" });
    }

    const updates = {};
    if (req.body.name !== undefined) {
      if (existing.distributor) {
        return res.status(400).json({
          message: "Distributor party name comes from the distributor record",
        });
      }
      if (!req.body.name?.trim()) {
        return res.status(400).json({ message: "Party name cannot be empty" });
      }
      updates.name = req.body.name.trim();
    }
    if (req.body.phone !== undefined) {
      if (existing.distributor) {
        return res.status(400).json({
          message: "Distributor party phone comes from the distributor record",
        });
      }
      updates.phone = req.body.phone?.trim() || "";
    }
    if (req.body.notes !== undefined) updates.notes = req.body.notes?.trim() || "";
    if (req.body.openingBalance !== undefined) {
      updates.openingBalance = Number(req.body.openingBalance) || 0;
    }

    const party = await Party.findOneAndUpdate(
      ownedFilter(req, { _id: req.params.id }),
      updates,
      { new: true, runValidators: true }
    ).populate("distributor", "name company phone");

    if (!party) {
      return res.status(404).json({ message: "Party not found" });
    }

    res.json({
      ...partyDisplayFields(party),
      currentBalance: await resolveCurrentBalance(party),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const deleteParty = async (req, res) => {
  try {
    const party = await Party.findOne(ownedFilter(req, { _id: req.params.id }));
    if (!party) {
      return res.status(404).json({ message: "Party not found" });
    }
    if (party.distributor) {
      return res.status(400).json({
        message: "Delete the distributor instead — this party is linked to it",
      });
    }

    await Party.findOneAndUpdate(
      ownedFilter(req, { _id: req.params.id }),
      { isDeleted: true, deletedAt: new Date() }
    );
    res.json({ message: "Party deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
