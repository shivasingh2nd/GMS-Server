import mongoose from "mongoose";

const ENTRY_SOURCES = ["manual", "purchase"];

const accountEntrySchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    party: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Party",
      required: true,
      index: true,
    },
    date: { type: String, required: true, trim: true },
    type: { type: String, enum: ["debit", "credit"], required: true },
    amount: { type: Number, required: true, min: 0 },
    particular: { type: String, trim: true, default: "" },
    source: {
      type: String,
      enum: ENTRY_SOURCES,
      required: true,
      default: "manual",
    },
    purchase: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Purchase",
      default: null,
      index: true,
    },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

accountEntrySchema.pre("validate", function () {
  if (this.source === "manual") {
    if (this.purchase) {
      this.invalidate("purchase", "Manual entries cannot link to a purchase");
    }
  } else if (!this.purchase) {
    this.invalidate("purchase", "Purchase-linked entries require a purchase");
  }
});

accountEntrySchema.index({ owner: 1, party: 1, date: 1, createdAt: 1 });
accountEntrySchema.index({ owner: 1, party: 1, date: -1, createdAt: -1 });
accountEntrySchema.index({ owner: 1, purchase: 1, source: 1 });

export { ENTRY_SOURCES };

const AccountEntry = mongoose.model("AccountEntry", accountEntrySchema);

export default AccountEntry;
