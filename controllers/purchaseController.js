import Distributor from "../models/Distributor.js";
import Item from "../models/Item.js";
import Purchase from "../models/Purchase.js";
import { buildDateRangeFilter } from "../utils/dateRangeFilter.js";
import { startOfUtcDay } from "../utils/dateUtils.js";
import { ensurePartyForDistributor } from "../utils/distributorParty.js";
import { ownedFilter, ownerId } from "../utils/ownedFilter.js";
import {
  createPurchaseLedgerEntry,
  createPurchasePaymentEntry,
  deletePurchaseLedgerEntries,
  syncPurchaseLedgerEntry,
} from "../utils/purchaseLedger.js";
import { withTransaction } from "../utils/transactions.js";

async function normalizeItems(items, owner) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("At least one item is required");
  }

  const normalized = [];

  for (const line of items) {
    const itemId = line.item;
    const quantity = Number(line.quantity);
    const rate = Number(line.rate);

    if (!itemId) {
      throw new Error("Item is required for each line");
    }

    const masterItem = await Item.findOne({ _id: itemId, owner, isDeleted: { $ne: true } });
    if (!masterItem) {
      throw new Error("One or more items were not found");
    }

    if (Number.isNaN(quantity) || quantity <= 0) {
      throw new Error("Item quantity must be greater than zero");
    }
    if (Number.isNaN(rate) || rate < 0) {
      throw new Error("Item rate is invalid");
    }

    const amount =
      line.amount !== undefined && line.amount !== null
        ? Number(line.amount)
        : quantity * rate;

    normalized.push({
      item: masterItem._id,
      quantity,
      rate,
      amount: Number.isNaN(amount) ? quantity * rate : amount,
    });
  }

  return normalized;
}

const purchaseItemPopulate = {
  path: "items.item",
  select: "name unit defaultRate",
};

function sumItems(items) {
  return items.reduce((sum, item) => sum + item.amount, 0);
}

export const createPurchase = async (req, res) => {
  try {
    const {
      distributor: distributorId,
      purchaseDate,
      invoiceNumber,
      items,
      remarks,
      recordPayment,
      paymentAmount,
      paymentParticular,
    } = req.body;

    if (!distributorId || !purchaseDate) {
      return res.status(400).json({
        message: "distributor and purchaseDate are required",
      });
    }

    const distributor = await Distributor.findOne(
      ownedFilter(req, { _id: distributorId })
    );
    if (!distributor) {
      return res.status(404).json({ message: "Distributor not found" });
    }

    const parsedDate = startOfUtcDay(new Date(purchaseDate));
    if (Number.isNaN(parsedDate.getTime())) {
      return res.status(400).json({ message: "Invalid purchaseDate" });
    }

    let normalizedItems;
    try {
      normalizedItems = await normalizeItems(items, ownerId(req));
    } catch (err) {
      return res.status(400).json({ message: err.message });
    }

    const computedTotal = sumItems(normalizedItems);
    if (Number.isNaN(computedTotal) || computedTotal <= 0) {
      return res.status(400).json({ message: "Purchase total must be greater than zero" });
    }

    const party = await ensurePartyForDistributor(distributor, ownerId(req));
    const payNow = Boolean(recordPayment);
    const owner = ownerId(req);

    let paymentOpts = null;
    if (payNow) {
      const parsedPaymentAmount = Number(paymentAmount);
      if (Number.isNaN(parsedPaymentAmount) || parsedPaymentAmount <= 0) {
        return res.status(400).json({
          message: "Payment amount must be greater than zero when Pay Now is Yes",
        });
      }
      if (!paymentParticular?.trim()) {
        return res.status(400).json({
          message: "Payment particulars are required when Pay Now is Yes",
        });
      }
      paymentOpts = {
        amount: parsedPaymentAmount,
        particular: paymentParticular.trim(),
      };
    }

    const purchase = await withTransaction(async (session) => {
      const [created] = await Purchase.create(
        [
          {
            owner,
            distributor: distributorId,
            purchaseDate: parsedDate,
            invoiceNumber: invoiceNumber?.trim() || "",
            items: normalizedItems,
            totalAmount: computedTotal,
            remarks: remarks?.trim() || "",
          },
        ],
        { session }
      );

      await createPurchaseLedgerEntry(created, party._id, owner, session);

      if (payNow && paymentOpts) {
        await createPurchasePaymentEntry(
          created,
          party._id,
          owner,
          session,
          paymentOpts
        );
      }

      return created;
    });

    await purchase.populate("distributor", "name company");
    await purchase.populate(purchaseItemPopulate);
    res.status(201).json(purchase);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const listPurchases = async (req, res) => {
  try {
    const filter = ownedFilter(req);

    if (req.query.distributor) {
      filter.distributor = req.query.distributor;
    }

    if (req.query.item) {
      filter["items.item"] = req.query.item;
    }

    const range = buildDateRangeFilter(req.query.from, req.query.to, "purchaseDate");
    if (range.error) {
      return res.status(400).json({ message: range.error });
    }
    Object.assign(filter, range.filter);

    const purchases = await Purchase.find(filter)
      .populate("distributor", "name company")
      .populate(purchaseItemPopulate)
      .sort({ purchaseDate: -1, createdAt: -1 });

    res.json(purchases);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getPurchase = async (req, res) => {
  try {
    const purchase = await Purchase.findOne(ownedFilter(req, { _id: req.params.id }))
      .populate("distributor", "name company")
      .populate(purchaseItemPopulate);

    if (!purchase) {
      return res.status(404).json({ message: "Purchase not found" });
    }
    res.json(purchase);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const updatePurchase = async (req, res) => {
  try {
    const purchase = await Purchase.findOne(ownedFilter(req, { _id: req.params.id }));
    if (!purchase) {
      return res.status(404).json({ message: "Purchase not found" });
    }

    const updates = {};
    let distributor = await Distributor.findOne(
      ownedFilter(req, { _id: purchase.distributor })
    );

    if (req.body.distributor) {
      distributor = await Distributor.findOne(
        ownedFilter(req, { _id: req.body.distributor })
      );
      if (!distributor) {
        return res.status(404).json({ message: "Distributor not found" });
      }
      updates.distributor = req.body.distributor;
    }

    if (req.body.purchaseDate !== undefined) {
      const parsedDate = startOfUtcDay(new Date(req.body.purchaseDate));
      if (Number.isNaN(parsedDate.getTime())) {
        return res.status(400).json({ message: "Invalid purchaseDate" });
      }
      updates.purchaseDate = parsedDate;
    }

    if (req.body.invoiceNumber !== undefined) {
      updates.invoiceNumber = req.body.invoiceNumber?.trim() || "";
    }

    if (req.body.items !== undefined) {
      try {
        updates.items = await normalizeItems(req.body.items, ownerId(req));
        updates.totalAmount = sumItems(updates.items);
        if (updates.totalAmount <= 0) {
          return res.status(400).json({ message: "Purchase total must be greater than zero" });
        }
      } catch (err) {
        return res.status(400).json({ message: err.message });
      }
    }

    if (req.body.remarks !== undefined) {
      updates.remarks = req.body.remarks?.trim() || "";
    }

    const owner = ownerId(req);

    await withTransaction(async (session) => {
      Object.assign(purchase, updates);
      await purchase.save({ session });

      const party = await ensurePartyForDistributor(distributor, owner, session);
      await syncPurchaseLedgerEntry(purchase, party._id, owner, session);
    });

    await purchase.populate("distributor", "name company");
    await purchase.populate(purchaseItemPopulate);
    res.json(purchase);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const deletePurchase = async (req, res) => {
  try {
    const purchase = await Purchase.findOne(ownedFilter(req, { _id: req.params.id }));
    if (!purchase) {
      return res.status(404).json({ message: "Purchase not found" });
    }

    const owner = ownerId(req);

    await withTransaction(async (session) => {
      await deletePurchaseLedgerEntries(purchase, owner, session);
      purchase.isDeleted = true;
      purchase.deletedAt = new Date();
      await purchase.save({ session });
    });

    res.json({ message: "Purchase deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
