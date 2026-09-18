import mongoose from "mongoose";

const itemSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    unit: { type: String, trim: true, default: "" },
    defaultRate: { type: Number, min: 0, default: null },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// `isDeleted: false` and not `$ne: true`: partial filters reject `$ne`, which
// makes the whole index silently fail to build.
itemSchema.index(
  { owner: 1, name: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } }
);

const Item = mongoose.model("Item", itemSchema);

export default Item;
