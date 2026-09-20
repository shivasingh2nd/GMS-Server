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
      const otherMatches = (
        await Consumer.find(
          ownedFilter(req, {
            consumerNumber: consumerNumber.trim(),
            distributor: { $ne: distributorId },
          })
        ).populate({
          path: "distributor",
          select: "name company",
          match: { isDeleted: { $ne: true } },
        })
      ).filter((row) => row.distributor);

      return res.json({
        found: false,
        consumer: null,
        lastDac: null,
        nextEligibleDate: null,
        otherMatches,
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
      otherMatches: [],
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

export const IMPORT_ROW_LIMIT = 700;

function trimmed(value) {
  return typeof value === "string" ? value.trim() : "";
}

export const importConsumers = async (req, res) => {
  try {
    const { distributor: distributorId, consumers } = req.body;

    if (!distributorId) {
      return res.status(400).json({ message: "Distributor is required" });
    }
    if (!Array.isArray(consumers) || !consumers.length) {
      return res.status(400).json({ message: "No consumers to import" });
    }
    if (consumers.length > IMPORT_ROW_LIMIT) {
      return res.status(400).json({
        message: `Import at most ${IMPORT_ROW_LIMIT} consumers at a time`,
      });
    }

    const distributor = await Distributor.findOne(
      ownedFilter(req, { _id: distributorId })
    );
    if (!distributor) {
      return res.status(404).json({ message: "Distributor not found" });
    }

    const existing = await Consumer.find(
      ownedFilter(req, { distributor: distributorId })
    )
      .select("consumerNumber")
      .lean();
    const takenNumbers = new Set(
      existing.map((row) => String(row.consumerNumber).toUpperCase())
    );

    const seenInPayload = new Set();
    const docs = [];
    const created = [];
    const skipped = [];
    const failed = [];

    for (const row of consumers) {
      const consumerNumber = trimmed(row?.consumerNumber);
      const name = trimmed(row?.name);

      if (!consumerNumber || !name) {
        failed.push({
          consumerNumber,
          reason: "Consumer number and name are required",
        });
        continue;
      }

      const key = consumerNumber.toUpperCase();

      if (seenInPayload.has(key)) {
        skipped.push({ consumerNumber, reason: "Duplicate row in file" });
        continue;
      }
      if (takenNumbers.has(key)) {
        skipped.push({ consumerNumber, reason: "Already exists" });
        continue;
      }

      seenInPayload.add(key);
      docs.push({
        owner: ownerId(req),
        distributor: distributorId,
        consumerNumber,
        name,
        fatherName: trimmed(row?.fatherName) || undefined,
        phone: trimmed(row?.phone) || undefined,
        address: trimmed(row?.address) || undefined,
      });
    }

    if (docs.length) {
      try {
        const inserted = await Consumer.insertMany(docs, { ordered: false });
        created.push(...inserted.map((doc) => doc.consumerNumber));
      } catch (err) {
        const writeErrors = err.writeErrors || err.result?.result?.writeErrors || [];
        if (!writeErrors.length) throw err;

        const failedIndexes = new Set();
        for (const writeError of writeErrors) {
          const index = writeError.index ?? writeError.err?.index;
          failedIndexes.add(index);
          const doc = docs[index];
          const code = writeError.code ?? writeError.err?.code;
          if (code === 11000) {
            skipped.push({
              consumerNumber: doc?.consumerNumber,
              reason: "Already exists",
            });
          } else {
            failed.push({
              consumerNumber: doc?.consumerNumber,
              reason: writeError.errmsg || "Could not be saved",
            });
          }
        }

        docs.forEach((doc, index) => {
          if (!failedIndexes.has(index)) created.push(doc.consumerNumber);
        });
      }
    }

    res.status(201).json({ created, skipped, failed });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const listConsumers = async (req, res) => {
  try {
    const filter = ownedFilter(req);
    const duplicatesOnly =
      req.query.duplicates === "true" || req.query.duplicates === "1";

    if (!duplicatesOnly && req.query.distributor) {
      filter.distributor = req.query.distributor;
    }

    const consumerNumber = req.query.consumerNumber?.trim();
    const phone = duplicatesOnly ? "" : req.query.phone?.trim();
    const name = duplicatesOnly ? "" : req.query.name?.trim();

    const duplicateCountByNumber = {};

    if (duplicatesOnly) {
      const duplicateNumbers = await Consumer.aggregate([
        { $match: ownedFilter(req) },
        {
          $group: {
            _id: { $toUpper: "$consumerNumber" },
            count: { $sum: 1 },
            values: { $addToSet: "$consumerNumber" },
          },
        },
        { $match: { count: { $gt: 1 } } },
      ]);

      let groups = duplicateNumbers;
      if (consumerNumber) {
        const needle = consumerNumber.toUpperCase();
        groups = groups.filter((row) => String(row._id).includes(needle));
      }

      for (const group of groups) {
        duplicateCountByNumber[group._id] = group.count;
      }

      const values = groups.flatMap((row) => row.values);
      if (!values.length) {
        const page = Math.max(1, Number.parseInt(String(req.query.page || "1"), 10) || 1);
        const requestedLimit = Number.parseInt(String(req.query.limit || "50"), 10) || 50;
        const limit = Math.min(Math.max(requestedLimit, 1), 5000);
        return res.json({ items: [], total: 0, page, limit });
      }
      filter.consumerNumber = { $in: values };
    } else if (consumerNumber) {
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

    const [docs, total] = await Promise.all([
      Consumer.find(filter)
        .populate({
          path: "distributor",
          select: "name company",
        })
        .sort({ consumerNumber: 1, name: 1 })
        .skip(skip)
        .limit(limit),
      Consumer.countDocuments(filter),
    ]);

    const items = docs.map((row) => {
      const json = row.toJSON();
      if (duplicatesOnly) {
        json.duplicateCount =
          duplicateCountByNumber[String(row.consumerNumber).toUpperCase()] || 0;
      }
      return json;
    });

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
