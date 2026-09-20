import { describe, expect, it } from "vitest";
import Consumer from "../models/Consumer.js";
import Dac from "../models/Dac.js";
import Distributor from "../models/Distributor.js";
import User from "../models/User.js";
import { getDashboardStats } from "../controllers/dashboardController.js";

function mockRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

async function createOwner() {
  return User.create({
    name: "Owner",
    email: `owner-${Date.now()}-${Math.random().toString(16).slice(2)}@test.local`,
    password: "password123",
    role: "user",
  });
}

async function createConsumer(owner, distributor, consumerNumber) {
  return Consumer.create({
    owner: owner._id,
    distributor: distributor._id,
    consumerNumber,
    name: "RAMESH",
  });
}

async function createDac(owner, distributor, consumer, dacNumber, dacDate) {
  return Dac.create({
    owner: owner._id,
    consumer: consumer._id,
    dacNumber,
    dacDate: new Date(dacDate),
    amount: 900,
    paymentMethod: "CASH",
    deliveryDone: true,
    bookingInDistributor: distributor._id,
  });
}

describe("dashboard stats", () => {
  it("counts the owner's consumers and only the DACs dated today", async () => {
    const owner = await createOwner();
    const other = await createOwner();
    const distributor = await Distributor.create({
      owner: owner._id,
      name: "Supply Co",
      company: "IOCL",
      address: "Depot",
    });
    const otherDistributor = await Distributor.create({
      owner: other._id,
      name: "Other Co",
      company: "HPCL",
      address: "Depot",
    });

    const first = await createConsumer(owner, distributor, "CN-1");
    const second = await createConsumer(owner, distributor, "CN-2");
    const deleted = await createConsumer(owner, distributor, "CN-3");
    deleted.isDeleted = true;
    deleted.deletedAt = new Date();
    await deleted.save();

    const strangerConsumer = await createConsumer(other, otherDistributor, "CN-1");

    await createDac(owner, distributor, first, "D-1", "2026-09-20T00:00:00.000Z");
    await createDac(owner, distributor, second, "D-2", "2026-09-20T00:00:00.000Z");
    await createDac(owner, distributor, first, "D-3", "2026-09-19T00:00:00.000Z");
    await createDac(other, otherDistributor, strangerConsumer, "D-4", "2026-09-20T00:00:00.000Z");

    const res = mockRes();
    await getDashboardStats(
      { user: { _id: owner._id }, query: { date: "2026-09-20" } },
      res
    );

    expect(res.body).toEqual({ consumers: 2, dacsToday: 2, date: "2026-09-20" });
  });

  it("rejects an unparseable date", async () => {
    const owner = await createOwner();
    const res = mockRes();

    await getDashboardStats(
      { user: { _id: owner._id }, query: { date: "not-a-date" } },
      res
    );

    expect(res.statusCode).toBe(400);
  });
});
