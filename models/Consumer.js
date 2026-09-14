import mongoose from "mongoose";

const consumerSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    distributor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Distributor",
      required: true,
    },
    consumerNumber: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    fatherName: { type: String, required: false, trim: true },
    phone: { type: String, required: false, trim: true },
    address: { type: String, required: false, trim: true },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

consumerSchema.index(
  { owner: 1, consumerNumber: 1, distributor: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } }
);

const Consumer = mongoose.model("Consumer", consumerSchema);

export default Consumer;
