import mongoose from "mongoose";

const partySchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: { type: String, trim: true, default: "" },
    phone: { type: String, trim: true, default: "" },
    notes: { type: String, trim: true, default: "" },
    openingBalance: { type: Number, default: 0 },
    distributor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Distributor",
      default: null,
      index: true,
    },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

partySchema.pre("validate", function () {
  if (!this.distributor && !this.name?.trim()) {
    this.invalidate("name", "Name is required for personal parties");
  }
});

partySchema.index({ owner: 1, name: 1, isDeleted: 1 });
partySchema.index(
  { owner: 1, distributor: 1 },
  {
    unique: true,
    partialFilterExpression: {
      isDeleted: false,
      distributor: { $type: "objectId" },
    },
  }
);

const Party = mongoose.model("Party", partySchema);

export default Party;
