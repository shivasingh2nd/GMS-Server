import Consumer from "../models/Consumer.js";
import Dac from "../models/Dac.js";
import { buildDateRangeFilter } from "../utils/dateRangeFilter.js";
import { ownedFilter } from "../utils/ownedFilter.js";

/** Counts only: the dashboard never needs the documents themselves. */
export const getDashboardStats = async (req, res) => {
  try {
    const date = String(req.query.date || "").trim() || new Date().toISOString().slice(0, 10);
    const range = buildDateRangeFilter(date, date, "dacDate");
    if (range.error) {
      return res.status(400).json({ message: range.error });
    }

    const [consumers, dacsToday] = await Promise.all([
      Consumer.countDocuments(ownedFilter(req)),
      Dac.countDocuments(ownedFilter(req, range.filter)),
    ]);

    res.json({ consumers, dacsToday, date });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
