import Item from "../models/Item.js";
import { ownedFilter, ownerId } from "../utils/ownedFilter.js";

export const createItem = async (req, res) => {
  try {
    const { name, unit, defaultRate } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ message: "Item name is required" });
    }

    const item = await Item.create({
      owner: ownerId(req),
      name: name.trim(),
      unit: unit?.trim() || "",
      defaultRate:
        defaultRate !== undefined && defaultRate !== null && defaultRate !== ""
          ? Number(defaultRate)
          : null,
    });

    res.status(201).json(item);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "An item with this name already exists" });
    }
    res.status(500).json({ message: err.message });
  }
};

export const listItems = async (req, res) => {
  try {
    const items = await Item.find(ownedFilter(req)).sort({ name: 1 });
    res.json(items);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getItem = async (req, res) => {
  try {
    const item = await Item.findOne(ownedFilter(req, { _id: req.params.id }));
    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }
    res.json(item);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const updateItem = async (req, res) => {
  try {
    const updates = {};

    if (req.body.name !== undefined) {
      if (!req.body.name?.trim()) {
        return res.status(400).json({ message: "Item name cannot be empty" });
      }
      updates.name = req.body.name.trim();
    }

    if (req.body.unit !== undefined) {
      updates.unit = req.body.unit?.trim() || "";
    }

    if (req.body.defaultRate !== undefined) {
      updates.defaultRate =
        req.body.defaultRate !== null && req.body.defaultRate !== ""
          ? Number(req.body.defaultRate)
          : null;
    }

    const item = await Item.findOneAndUpdate(
      ownedFilter(req, { _id: req.params.id }),
      updates,
      { new: true, runValidators: true }
    );

    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }

    res.json(item);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "An item with this name already exists" });
    }
    res.status(500).json({ message: err.message });
  }
};

export const deleteItem = async (req, res) => {
  try {
    const item = await Item.findOneAndUpdate(
      ownedFilter(req, { _id: req.params.id }),
      { isDeleted: true, deletedAt: new Date() },
      { new: true }
    );
    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }
    res.json({ message: "Item deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
