import mongoose from "mongoose";

const dacSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    consumer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Consumer",
      required: true,
      index: true,
    },
    dacNumber: {
      type: String,
      required: true,
      trim: true,
    },
    dacDate: {
      type: Date,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    paymentMethod: {
      type: String,
      required: true,
    },
    deliveryDone: {
      type: Boolean,
      required: true,
    },
    remarks: {
      type: String,
    },
    bookingInDistributor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Distributor",
      required: true,
    },
    intervalDays: {
      type: Number,
      required: true,
      default: 25,
      min: 1,
    },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

dacSchema.index({ owner: 1, bookingInDistributor: 1, dacDate: -1 });
dacSchema.index({ owner: 1, consumer: 1, dacDate: -1 });
dacSchema.index({ owner: 1, dacDate: -1 });

const Dac = mongoose.model("Dac", dacSchema);

export default Dac;
