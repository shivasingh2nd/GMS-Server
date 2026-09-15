import Consumer from "../models/Consumer.js";
import Distributor from "../models/Distributor.js";
import Dac from "../models/Dac.js";
import { addUtcDays } from "../utils/dateUtils.js";
import { ownedFilter, ownerId } from "../utils/ownedFilter.js";

export const lookupConsumer = async (req, res) => {
  try {
    const { distributorId, consumerNumber } = req.query;

    if (!distributorId || !consumerNumber?.trim()) {
      return res
        .status(400)
        .json({ message: "distributorId and consumerNumber are required" });
    }

    const distributor = await Distributor.findOne(
      ownedFilter(req, { _id: distributorId })
    );
    if (!distributor) {
      return res.status(404).json({ message: "Distributor not found" });
    }

    const consumer = await Consumer.findOne(
      ownedFilter(req, {
        distributor: distributorId,
        consumerNumber: consumerNumber.trim(),
      })
    );

    if (!consumer) {
      return res.json({
        found: false,
        consumer: null,
        lastDac: null,
        nextEligibleDate: null,
      });
    }

    const lastDac = await Dac.findOne(
      ownedFilter(req, { consumer: consumer._id })
    )
      .sort({ dacDate: -1 })
      .lean();

    let nextEligibleDate = null;
    if (lastDac) {
      nextEligibleDate = addUtcDays(lastDac.dacDate, lastDac.intervalDays);
    }

    res.json({
      found: true,
      consumer,
      lastDac,
      nextEligibleDate,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const createConsumer = async (req, res) => {
  try {
    const { distributor: distributorId, consumerNumber, name, fatherName, phone, address } =
      req.body;

    if (!distributorId || !consumerNumber?.trim() || !name?.trim()) {
      return res.status(400).json({
        message: "Distributor, consumerNumber and name are required",
      });
    }

    const distributor = await Distributor.findOne(
      ownedFilter(req, { _id: distributorId })
    );
    if (!distributor) {
      return res.status(404).json({ message: "Distributor not found" });
    }

    const exists = await Consumer.findOne(
      ownedFilter(req, {
        distributor: distributorId,
        consumerNumber: consumerNumber.trim(),
      })
    );
    if (exists) {
      return res.status(409).json({
        message: "Consumer already exists for this distributor",
        consumer: exists,
      });
    }

    const consumer = await Consumer.create({
      owner: ownerId(req),
      distributor: distributorId,
      consumerNumber: consumerNumber.trim(),
      name: name.trim(),
      fatherName: fatherName?.trim() || undefined,
      phone: phone?.trim() || undefined,
      address: address?.trim() || undefined,
    });

    await consumer.populate({
      path: "distributor",
      select: "name company",
    });

    res.status(201).json(consumer);
  } catch (err) {
    if (err.code === 11000) {
      return res
        .status(409)
        .json({ message: "Consumer already exists for this distributor" });
    }
    res.status(500).json({ message: err.message });
  }
};

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const listConsumers = async (req, res) => {
  try {
    const filter = ownedFilter(req);
    if (req.query.distributor) {
      filter.distributor = req.query.distributor;
    }

    const consumerNumber = req.query.consumerNumber?.trim();
    const phone = req.query.phone?.trim();
    const name = req.query.name?.trim();

    if (consumerNumber) {
      filter.consumerNumber = {
        $regex: escapeRegex(consumerNumber),
        $options: "i",
      };
    }
    if (phone) {
      filter.phone = { $regex: escapeRegex(phone), $options: "i" };
    }
    if (name) {
      filter.name = { $regex: escapeRegex(name), $options: "i" };
    }

    const page = Math.max(1, Number.parseInt(String(req.query.page || "1"), 10) || 1);
    const requestedLimit = Number.parseInt(String(req.query.limit || "50"), 10) || 50;
    const limit = Math.min(Math.max(requestedLimit, 1), 5000);
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      Consumer.find(filter)
        .populate({
          path: "distributor",
          select: "name company",
        })
        .sort({ consumerNumber: 1 })
        .skip(skip)
        .limit(limit),
      Consumer.countDocuments(filter),
    ]);

    res.json({ items, total, page, limit });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getConsumer = async (req, res) => {
  try {
    const consumer = await Consumer.findOne(
      ownedFilter(req, { _id: req.params.id })
    ).populate({
      path: "distributor",
      select: "name company",
    });

    if (!consumer) {
      return res.status(404).json({ message: "Consumer not found" });
    }

    res.json(consumer);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const updateConsumer = async (req, res) => {
  try {
    const updates = {};
    const fields = ["name", "fatherName", "phone", "address", "consumerNumber"];

    for (const field of fields) {
      if (req.body[field] !== undefined) {
        updates[field] =
          typeof req.body[field] === "string"
            ? req.body[field].trim()
            : req.body[field];
      }
    }

    if (req.body.distributor) {
      const distributor = await Distributor.findOne(
        ownedFilter(req, { _id: req.body.distributor })
      );
      if (!distributor) {
        return res.status(404).json({ message: "Distributor not found" });
      }
      updates.distributor = req.body.distributor;
    }

    if (updates.name === "") {
      return res.status(400).json({ message: "Name cannot be empty" });
    }
    if (updates.consumerNumber === "") {
      return res.status(400).json({ message: "Consumer number cannot be empty" });
    }

    const consumer = await Consumer.findOneAndUpdate(
      ownedFilter(req, { _id: req.params.id }),
      updates,
      { new: true, runValidators: true }
    ).populate({
      path: "distributor",
      select: "name company",
    });

    if (!consumer) {
      return res.status(404).json({ message: "Consumer not found" });
    }

    res.json(consumer);
  } catch (err) {
    if (err.code === 11000) {
      return res
        .status(409)
        .json({ message: "Consumer number already used for this distributor" });
    }
    res.status(500).json({ message: err.message });
  }
};

export const deleteConsumer = async (req, res) => {
  try {
    const consumer = await Consumer.findOneAndUpdate(
      ownedFilter(req, { _id: req.params.id }),
      { isDeleted: true, deletedAt: new Date() },
      { new: true }
    );
    if (!consumer) {
      return res.status(404).json({ message: "Consumer not found" });
    }
    res.json({ message: "Consumer deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
