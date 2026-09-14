import mongoose from "mongoose";
import { COMPANIES } from "../constants/companies.js";

const distributorSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    company: {
      type: String,
      required: true,
      enum: COMPANIES,
      trim: true,
      uppercase: true,
    },
    name: { type: String, required: true, trim: true },
    phone: { type: String, default: "", trim: true },
    address: { type: String, required: true, trim: true },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

distributorSchema.index({ owner: 1, isDeleted: 1 });

const Distributor = mongoose.model("Distributor", distributorSchema);

export default Distributor;
