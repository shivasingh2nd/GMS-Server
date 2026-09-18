import { describe, expect, it } from "vitest";
import Consumer from "../models/Consumer.js";
import Dac from "../models/Dac.js";
import Distributor from "../models/Distributor.js";
import Item from "../models/Item.js";
import User from "../models/User.js";
import { listTrash, purgeTrashEntry } from "../controllers/trashController.js";

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

describe("trash listing", () => {
  it("returns soft-deleted records from every module for the owner only", async () => {
    const owner = await createOwner();
    const other = await createOwner();

    const distributor = await Distributor.create({
      owner: owner._id,
      name: "Supply Co",
      company: "IOCL",
      address: "Depot",
    });
    const consumer = await Consumer.create({
      owner: owner._id,
      distributor: distributor._id,
      consumerNumber: "CN-1001",
      name: "Ramesh",
    });
    const dac = await Dac.create({
      owner: owner._id,
      consumer: consumer._id,
      dacNumber: "D-1",
      dacDate: new Date("2026-01-10T00:00:00.000Z"),
      amount: 900,
      paymentMethod: "CASH",
      deliveryDone: true,
      bookingInDistributor: distributor._id,
    });

    await Item.create({
      owner: other._id,
      name: "SOMEONE ELSE ITEM",
      isDeleted: true,
      deletedAt: new Date(),
    });

    const active = await Item.create({ owner: owner._id, name: "REGULATOR" });

    for (const doc of [consumer, dac]) {
      doc.isDeleted = true;
      doc.deletedAt = new Date();
      await doc.save();
    }

    const res = mockRes();
    await listTrash({ user: owner, query: {} }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.counts).toMatchObject({ dac: 1, consumer: 1, item: 0 });

    const modules = res.body.items.map((row) => row.module);
    expect(modules).toContain("dac");
    expect(modules).toContain("consumer");

    const dacRow = res.body.items.find((row) => row.module === "dac");
    expect(dacRow.title).toBe("DAC D-1");
    expect(dacRow.subtitle).toBe("CN-1001 · Ramesh");
    expect(dacRow.detail).toBe("Supply Co (IOCL)");
    expect(dacRow.amount).toBe(900);

    const consumerRow = res.body.items.find((row) => row.module === "consumer");
    expect(consumerRow.title).toBe("CN-1001 · Ramesh");
    expect(consumerRow.subtitle).toBe("Supply Co (IOCL)");

    expect(res.body.items.every((row) => row._id !== String(active._id))).toBe(true);
    expect(
      res.body.items.some((row) => row.title === "SOMEONE ELSE ITEM")
    ).toBe(false);
  });

  it("returns an empty list when nothing is deleted", async () => {
    const owner = await createOwner();

    const res = mockRes();
    await listTrash({ user: owner, query: {} }, res);

    expect(res.body.total).toBe(0);
    expect(res.body.items).toEqual([]);
  });
});

describe("trash hard delete", () => {
  it("permanently removes a soft-deleted entry when the password is correct", async () => {
    const owner = await createOwner();
    const item = await Item.create({
      owner: owner._id,
      name: "REGULATOR",
      isDeleted: true,
      deletedAt: new Date(),
    });

    const res = mockRes();
    await purgeTrashEntry(
      { user: owner, params: { module: "item", id: String(item._id) }, body: { password: "password123" } },
      res
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("Entry permanently deleted");
    expect(await Item.findById(item._id)).toBeNull();
  });

  it("rejects an incorrect password without deleting the entry", async () => {
    const owner = await createOwner();
    const item = await Item.create({
      owner: owner._id,
      name: "HOSE",
      isDeleted: true,
      deletedAt: new Date(),
    });

    const res = mockRes();
    await purgeTrashEntry(
      { user: owner, params: { module: "item", id: String(item._id) }, body: { password: "wrong-password" } },
      res
    );

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toBe("Incorrect password");
    expect(await Item.findById(item._id)).not.toBeNull();
  });

  it("requires a password", async () => {
    const owner = await createOwner();
    const res = mockRes();
    await purgeTrashEntry(
      { user: owner, params: { module: "item", id: "64a1b2c3d4e5f67890123456" }, body: {} },
      res
    );

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Password is required");
  });

  it("does not delete another owner's trash or an active record", async () => {
    const owner = await createOwner();
    const other = await createOwner();
    const foreign = await Item.create({
      owner: other._id,
      name: "FOREIGN",
      isDeleted: true,
      deletedAt: new Date(),
    });
    const active = await Item.create({ owner: owner._id, name: "ACTIVE" });

    const foreignRes = mockRes();
    await purgeTrashEntry(
      {
        user: owner,
        params: { module: "item", id: String(foreign._id) },
        body: { password: "password123" },
      },
      foreignRes
    );
    expect(foreignRes.statusCode).toBe(404);
    expect(await Item.findById(foreign._id)).not.toBeNull();

    const activeRes = mockRes();
    await purgeTrashEntry(
      {
        user: owner,
        params: { module: "item", id: String(active._id) },
        body: { password: "password123" },
      },
      activeRes
    );
    expect(activeRes.statusCode).toBe(404);
    expect(await Item.findById(active._id)).not.toBeNull();
  });

  it("rejects an unknown module", async () => {
    const owner = await createOwner();
    const res = mockRes();
    await purgeTrashEntry(
      { user: owner, params: { module: "unknown", id: "1" }, body: { password: "password123" } },
      res
    );

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Invalid module");
  });
});
