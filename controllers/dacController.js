import Consumer from "../models/Consumer.js";
import Distributor from "../models/Distributor.js";
import Dac from "../models/Dac.js";
import { buildDateRangeFilter } from "../utils/dateRangeFilter.js";
import { addUtcDays, startOfUtcDay } from "../utils/dateUtils.js";
import { ownedFilter, ownerId } from "../utils/ownedFilter.js";
import { withTransaction } from "../utils/transactions.js";

export const createDac = async (req, res) => {
  try {
    const {
      distributorId,
      bookingDistributorId,
      consumerNumber,
      consumer: consumerInput,
      dacNumber,
      dacDate,
      amount,
      paymentMethod,
      deliveryDone,
      intervalDays,
      remarks,
    } = req.body;

    if (!distributorId || !consumerNumber?.trim()) {
      return res
        .status(400)
        .json({ message: "distributorId and consumerNumber are required" });
    }

    if (
      !dacNumber?.trim() ||
      !dacDate ||
      amount === undefined ||
      amount === null ||
      !paymentMethod?.trim() ||
      deliveryDone === undefined ||
      deliveryDone === null
    ) {
      return res.status(400).json({
        message:
          "dacNumber, dacDate, amount, paymentMethod and deliveryDone are required",
      });
    }

    const distributor = await Distributor.findOne(
      ownedFilter(req, { _id: distributorId })
    );
    if (!distributor) {
      return res.status(404).json({ message: "Distributor not found" });
    }

    const bookingId = bookingDistributorId || distributorId;
    const bookingDistributor = await Distributor.findOne(
      ownedFilter(req, { _id: bookingId })
    );
    if (!bookingDistributor) {
      return res.status(404).json({ message: "DAC booking distributor not found" });
    }

    const parsedDate = startOfUtcDay(new Date(dacDate));
    if (Number.isNaN(parsedDate.getTime())) {
      return res.status(400).json({ message: "Invalid dacDate" });
    }

    const parsedAmount = Number(amount);
    if (Number.isNaN(parsedAmount) || parsedAmount < 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    const parsedInterval =
      intervalDays === undefined || intervalDays === null || intervalDays === ""
        ? 25
        : Number(intervalDays);

    if (!Number.isInteger(parsedInterval) || parsedInterval < 1) {
      return res
        .status(400)
        .json({ message: "intervalDays must be an integer >= 1" });
    }

    const owner = ownerId(req);

    if (!consumerInput?.name?.trim()) {
      const existing = await Consumer.findOne(
        ownedFilter(req, {
          distributor: distributorId,
          consumerNumber: consumerNumber.trim(),
        })
      );
      if (!existing) {
        return res.status(400).json({
          message:
            "Consumer not found. Provide consumer details (at least name) with the DAC entry",
          requiresConsumerInfo: true,
        });
      }
    }

    let createdConsumer = false;
    let dac;

    try {
      dac = await withTransaction(async (session) => {
        let consumer = await Consumer.findOne({
          owner,
          distributor: distributorId,
          consumerNumber: consumerNumber.trim(),
          isDeleted: { $ne: true },
        }).session(session);

        if (!consumer) {
          const [created] = await Consumer.create(
            [
              {
                owner,
                distributor: distributorId,
                consumerNumber: consumerNumber.trim(),
                name: consumerInput.name.trim(),
                fatherName: consumerInput.fatherName?.trim() || undefined,
                phone: consumerInput.phone?.trim() || undefined,
                address: consumerInput.address?.trim() || undefined,
              },
            ],
            { session }
          );
          consumer = created;
          createdConsumer = true;
        }

        const intervalCheck = await assertIntervalElapsed(
          owner,
          consumer._id,
          parsedDate
        );
        if (!intervalCheck.ok) {
          const err = new Error(intervalCheck.message);
          err.status = 409;
          err.payload = {
            lastDac: intervalCheck.lastDac,
            nextEligibleDate: intervalCheck.nextEligibleDate,
          };
          throw err;
        }

        const [createdDac] = await Dac.create(
          [
            {
              owner,
              consumer: consumer._id,
              dacNumber: dacNumber.trim(),
              dacDate: parsedDate,
              amount: parsedAmount,
              paymentMethod: paymentMethod.trim(),
              deliveryDone: Boolean(deliveryDone),
              remarks: remarks?.trim() || undefined,
              bookingInDistributor: bookingId,
              intervalDays: parsedInterval,
            },
          ],
          { session }
        );
        return createdDac;
      });
    } catch (err) {
      if (err.status === 409) {
        return res.status(409).json({
          message: err.message,
          ...err.payload,
        });
      }
      if (err.code === 11000) {
        return res.status(409).json({ message: "Consumer number already exists" });
      }
      throw err;
    }

    await dac.populate([
      {
        path: "consumer",
        populate: {
          path: "distributor",
          select: "name company",
        },
      },
      { path: "bookingInDistributor", select: "name company" },
    ]);

    res.status(201).json({
      dac,
      consumerCreated: createdConsumer,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const listDacs = async (req, res) => {
  try {
    const filter = ownedFilter(req);

    if (req.query.distributor) {
      filter.bookingInDistributor = req.query.distributor;
    }

    if (req.query.consumer) {
      filter.consumer = req.query.consumer;
    }

    if (req.query.consumerNumber && req.query.distributor) {
      const consumer = await Consumer.findOne(
        ownedFilter(req, {
          distributor: req.query.distributor,
          consumerNumber: String(req.query.consumerNumber).trim(),
        })
      );
      if (!consumer) {
        return res.json([]);
      }
      filter.consumer = consumer._id;
    }

    const range = buildDateRangeFilter(req.query.from, req.query.to, "dacDate");
    if (range.error) {
      return res.status(400).json({ message: range.error });
    }
    Object.assign(filter, range.filter);

    let query = Dac.find(filter)
      .populate({
        path: "consumer",
        populate: {
          path: "distributor",
          select: "name company",
        },
      })
      .populate({
        path: "bookingInDistributor",
        select: "name company",
      })
      .sort({ dacDate: -1, createdAt: -1 });

    const limit = req.query.limit ? Number(req.query.limit) : null;
    if (limit && Number.isFinite(limit) && limit > 0) {
      query = query.limit(Math.min(Math.floor(limit), 50));
    }

    const dacs = await query;
    res.json(dacs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getDac = async (req, res) => {
  try {
    const dac = await Dac.findOne(ownedFilter(req, { _id: req.params.id }))
      .populate({
        path: "consumer",
        populate: {
          path: "distributor",
          select: "name company",
        },
      })
      .populate("bookingInDistributor", "name company");

    if (!dac) {
      return res.status(404).json({ message: "DAC not found" });
    }

    res.json(dac);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const updateDac = async (req, res) => {
  try {
    const dac = await Dac.findOne(ownedFilter(req, { _id: req.params.id }));
    if (!dac) {
      return res.status(404).json({ message: "DAC not found" });
    }

    const updates = {};

    if (req.body.dacNumber !== undefined) {
      if (!req.body.dacNumber?.trim()) {
        return res.status(400).json({ message: "dacNumber cannot be empty" });
      }
      updates.dacNumber = req.body.dacNumber.trim();
    }

    if (req.body.dacDate !== undefined) {
      const parsedDate = startOfUtcDay(new Date(req.body.dacDate));
      if (Number.isNaN(parsedDate.getTime())) {
        return res.status(400).json({ message: "Invalid dacDate" });
      }

      const intervalCheck = await assertIntervalElapsed(
        ownerId(req),
        dac.consumer,
        parsedDate,
        dac._id
      );
      if (!intervalCheck.ok) {
        return res.status(409).json({
          message: intervalCheck.message,
          lastDac: intervalCheck.lastDac,
          nextEligibleDate: intervalCheck.nextEligibleDate,
        });
      }

      updates.dacDate = parsedDate;
    }

    if (req.body.amount !== undefined) {
      const parsedAmount = Number(req.body.amount);
      if (Number.isNaN(parsedAmount) || parsedAmount < 0) {
        return res.status(400).json({ message: "Invalid amount" });
      }
      updates.amount = parsedAmount;
    }

    if (req.body.paymentMethod !== undefined) {
      if (!req.body.paymentMethod?.trim()) {
        return res.status(400).json({ message: "paymentMethod cannot be empty" });
      }
      updates.paymentMethod = req.body.paymentMethod.trim();
    }

    if (req.body.deliveryDone !== undefined) {
      updates.deliveryDone = Boolean(req.body.deliveryDone);
    }

    if (req.body.intervalDays !== undefined) {
      const parsedInterval = Number(req.body.intervalDays);
      if (!Number.isInteger(parsedInterval) || parsedInterval < 1) {
        return res
          .status(400)
          .json({ message: "intervalDays must be an integer >= 1" });
      }
      updates.intervalDays = parsedInterval;
    }

    if (req.body.remarks !== undefined) {
      updates.remarks = req.body.remarks?.trim() || undefined;
    }

    if (req.body.bookingDistributorId) {
      const bookingDistributor = await Distributor.findOne(
        ownedFilter(req, { _id: req.body.bookingDistributorId })
      );
      if (!bookingDistributor) {
        return res.status(404).json({ message: "DAC booking distributor not found" });
      }
      updates.bookingInDistributor = req.body.bookingDistributorId;
    }

    Object.assign(dac, updates);
    await dac.save();

    await dac.populate([
      {
        path: "consumer",
        populate: {
          path: "distributor",
          select: "name company",
        },
      },
      { path: "bookingInDistributor", select: "name company" },
    ]);

    res.json(dac);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const deleteDac = async (req, res) => {
  try {
    const dac = await Dac.findOneAndUpdate(
      ownedFilter(req, { _id: req.params.id }),
      { isDeleted: true, deletedAt: new Date() },
      { new: true }
    );
    if (!dac) {
      return res.status(404).json({ message: "DAC not found" });
    }
    res.json({ message: "DAC deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

async function assertIntervalElapsed(owner, consumerId, proposedDate, excludeDacId) {
  const query = { owner, consumer: consumerId, isDeleted: { $ne: true } };
  if (excludeDacId) {
    query._id = { $ne: excludeDacId };
  }

  const lastDac = await Dac.findOne(query).sort({ dacDate: -1 }).lean();
  if (!lastDac) {
    return { ok: true };
  }

  const nextEligibleDate = addUtcDays(lastDac.dacDate, lastDac.intervalDays);
  const proposed = startOfUtcDay(proposedDate);

  if (proposed < nextEligibleDate) {
    return {
      ok: false,
      lastDac,
      nextEligibleDate,
      message: `Next DAC for this consumer can be entered on or after ${
        nextEligibleDate.toISOString().split("T")[0]
      } (interval ${lastDac.intervalDays} days from last DAC)`,
    };
  }

  return { ok: true, lastDac, nextEligibleDate };
}
