import Distributor from "../models/Distributor.js";
import {
  COMPANIES,
  isValidCompany,
  normalizeCompany,
} from "../constants/companies.js";
import {
  ensurePartyForDistributor,
  softDeletePartyForDistributor,
} from "../utils/distributorParty.js";
import { ownedFilter, ownerId } from "../utils/ownedFilter.js";

export const createDistributor = async (req, res) => {
  try {
    const { company, name, address, phone } = req.body;

    if (!company || !name?.trim() || !address?.trim()) {
      return res
        .status(400)
        .json({ message: "Company, name and address are required" });
    }

    if (!isValidCompany(company)) {
      return res.status(400).json({
        message: `Company must be one of: ${COMPANIES.join(", ")}`,
      });
    }

    const distributor = await Distributor.create({
      owner: ownerId(req),
      company: normalizeCompany(company),
      name: name.trim(),
      phone: phone?.trim() || "",
      address: address.trim(),
    });

    await ensurePartyForDistributor(distributor, ownerId(req));

    res.status(201).json(distributor);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const listDistributors = async (req, res) => {
  try {
    const filter = ownedFilter(req);
    if (req.query.company) {
      filter.company = normalizeCompany(req.query.company);
    }

    const distributors = await Distributor.find(filter).sort({ name: 1 });
    res.json(distributors);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getDistributor = async (req, res) => {
  try {
    const distributor = await Distributor.findOne(ownedFilter(req, { _id: req.params.id }));
    if (!distributor) {
      return res.status(404).json({ message: "Distributor not found" });
    }
    res.json(distributor);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const updateDistributor = async (req, res) => {
  try {
    const updates = {};

    if (req.body.company !== undefined) {
      if (!isValidCompany(req.body.company)) {
        return res.status(400).json({
          message: `Company must be one of: ${COMPANIES.join(", ")}`,
        });
      }
      updates.company = normalizeCompany(req.body.company);
    }

    if (req.body.name !== undefined) {
      if (!req.body.name?.trim()) {
        return res.status(400).json({ message: "Name cannot be empty" });
      }
      updates.name = req.body.name.trim();
    }

    if (req.body.address !== undefined) {
      if (!req.body.address?.trim()) {
        return res.status(400).json({ message: "Address cannot be empty" });
      }
      updates.address = req.body.address.trim();
    }

    if (req.body.phone !== undefined) {
      updates.phone = req.body.phone?.trim() || "";
    }

    const distributor = await Distributor.findOneAndUpdate(
      ownedFilter(req, { _id: req.params.id }),
      updates,
      { new: true, runValidators: true }
    );

    if (!distributor) {
      return res.status(404).json({ message: "Distributor not found" });
    }

    res.json(distributor);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const deleteDistributor = async (req, res) => {
  try {
    const distributor = await Distributor.findOneAndUpdate(
      ownedFilter(req, { _id: req.params.id }),
      { isDeleted: true, deletedAt: new Date() },
      { new: true }
    );
    if (!distributor) {
      return res.status(404).json({ message: "Distributor not found" });
    }

    await softDeletePartyForDistributor(distributor._id, ownerId(req));

    res.json({ message: "Distributor deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
