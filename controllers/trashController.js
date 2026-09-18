import AccountEntry from "../models/AccountEntry.js";
import Consumer from "../models/Consumer.js";
import Dac from "../models/Dac.js";
import Distributor from "../models/Distributor.js";
import Item from "../models/Item.js";
import Party from "../models/Party.js";
import Purchase from "../models/Purchase.js";
import User from "../models/User.js";
import { ownerId } from "../utils/ownedFilter.js";

function distributorLabel(distributor) {
  if (!distributor || typeof distributor !== "object") return "";
  return distributor.company
    ? `${distributor.name} (${distributor.company})`
    : distributor.name;
}

const MODULES = [
  {
    key: "dac",
    label: "DAC",
    model: Dac,
    populate: [
      { path: "consumer", select: "consumerNumber name" },
      { path: "bookingInDistributor", select: "name company" },
    ],
    map: (row) => ({
      title: `DAC ${row.dacNumber}`,
      subtitle: row.consumer
        ? `${row.consumer.consumerNumber} · ${row.consumer.name}`
        : "",
      detail: distributorLabel(row.bookingInDistributor),
      amount: row.amount,
      date: row.dacDate,
    }),
  },
  {
    key: "consumer",
    label: "Consumer",
    model: Consumer,
    populate: [{ path: "distributor", select: "name company" }],
    map: (row) => ({
      title: `${row.consumerNumber} · ${row.name}`,
      subtitle: distributorLabel(row.distributor),
      detail: row.phone || "",
      amount: null,
      date: null,
    }),
  },
  {
    key: "distributor",
    label: "Distributor",
    model: Distributor,
    populate: [],
    map: (row) => ({
      title: distributorLabel(row),
      subtitle: row.address || "",
      detail: row.phone || "",
      amount: null,
      date: null,
    }),
  },
  {
    key: "purchase",
    label: "Purchase",
    model: Purchase,
    populate: [{ path: "distributor", select: "name company" }],
    map: (row) => ({
      title: row.invoiceNumber ? `Invoice ${row.invoiceNumber}` : "Purchase",
      subtitle: distributorLabel(row.distributor),
      detail: `${row.items?.length || 0} item(s)`,
      amount: row.totalAmount,
      date: row.purchaseDate,
    }),
  },
  {
    key: "accountEntry",
    label: "Account Entry",
    model: AccountEntry,
    populate: [{ path: "party", select: "name" }],
    map: (row) => ({
      title: row.type === "credit" ? "Credit" : "Debit",
      subtitle: row.party?.name || "",
      detail: row.particular || "",
      amount: row.amount,
      date: row.date,
    }),
  },
  {
    key: "party",
    label: "Party",
    model: Party,
    populate: [{ path: "distributor", select: "name company" }],
    map: (row) => ({
      title: row.distributor ? distributorLabel(row.distributor) : row.name,
      subtitle: row.phone || "",
      detail: row.notes || "",
      amount: null,
      date: null,
    }),
  },
  {
    key: "item",
    label: "Item",
    model: Item,
    populate: [],
    map: (row) => ({
      title: row.name,
      subtitle: row.unit || "",
      detail: "",
      amount: null,
      date: null,
    }),
  },
];

export const listTrash = async (req, res) => {
  try {
    const owner = ownerId(req);

    const groups = await Promise.all(
      MODULES.map(async (module) => {
        let query = module.model.find({ owner, isDeleted: true });
        if (module.populate.length) {
          query = query.populate(module.populate);
        }

        const rows = await query.sort({ deletedAt: -1, updatedAt: -1 }).lean();

        return rows.map((row) => ({
          _id: String(row._id),
          module: module.key,
          moduleLabel: module.label,
          deletedAt: row.deletedAt || row.updatedAt || null,
          ...module.map(row),
        }));
      })
    );

    const items = groups.flat().sort((a, b) => {
      const left = a.deletedAt ? new Date(a.deletedAt).getTime() : 0;
      const right = b.deletedAt ? new Date(b.deletedAt).getTime() : 0;
      return right - left;
    });

    const counts = {};
    for (const module of MODULES) {
      counts[module.key] = 0;
    }
    for (const item of items) {
      counts[item.module] += 1;
    }

    res.json({ items, total: items.length, counts });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

function moduleByKey(key) {
  return MODULES.find((module) => module.key === key) || null;
}

export const purgeTrashEntry = async (req, res) => {
  try {
    const module = moduleByKey(req.params.module);
    if (!module) {
      return res.status(400).json({ message: "Invalid module" });
    }

    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!password) {
      return res.status(400).json({ message: "Password is required" });
    }

    const user = await User.findById(req.user._id);
    if (!user || !(await user.comparePassword(password))) {
      return res.status(403).json({ message: "Incorrect password" });
    }

    const deleted = await module.model.findOneAndDelete({
      _id: req.params.id,
      owner: ownerId(req),
      isDeleted: true,
    });

    if (!deleted) {
      return res.status(404).json({ message: "Deleted entry not found" });
    }

    res.json({ message: "Entry permanently deleted" });
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(404).json({ message: "Deleted entry not found" });
    }
    res.status(500).json({ message: err.message });
  }
};
