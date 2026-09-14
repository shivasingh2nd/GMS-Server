import mongoose from "mongoose";

const purchaseItemSchema = new mongoose.Schema(
  {
    item: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Item",
      required: true,
    },
    quantity: { type: Number, required: true, min: 0 },
    rate: { type: Number, required: true, min: 0 },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const purchaseSchema = new mongoose.Schema(
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
      index: true,
    },
    purchaseDate: { type: Date, required: true },
    invoiceNumber: { type: String, trim: true, default: "" },
    items: {
      type: [purchaseItemSchema],
      required: true,
      validate: [(v) => v.length > 0, "At least one item required"],
    },
    totalAmount: { type: Number, required: true, min: 0 },
    remarks: { type: String, trim: true, default: "" },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

purchaseSchema.index({ owner: 1, distributor: 1, purchaseDate: -1 });
purchaseSchema.index({ owner: 1, purchaseDate: -1 });

const Purchase = mongoose.model("Purchase", purchaseSchema);

export default Purchase;
