import { beforeAll, describe, expect, it } from "vitest";
import Consumer from "../models/Consumer.js";
import Distributor from "../models/Distributor.js";
import Item from "../models/Item.js";
import User from "../models/User.js";

async function createOwner() {
  return User.create({
    name: "Owner",
    email: `owner-${Date.now()}-${Math.random().toString(16).slice(2)}@test.local`,
    password: "password123",
    role: "user",
  });
}

async function createDistributor(owner) {
  return Distributor.create({
    owner: owner._id,
    name: "Supply Co",
    company: "IOCL",
    address: "Depot",
  });
}

function consumerPayload(owner, distributor) {
  return {
    owner: owner._id,
    distributor: distributor._id,
    consumerNumber: "CN-1001",
    name: "Ramesh",
  };
}

async function softDelete(doc) {
  doc.isDeleted = true;
  doc.deletedAt = new Date();
  await doc.save();
}

describe("unique indexes ignore soft-deleted records", () => {
  beforeAll(async () => {
    await Promise.all([Consumer.createIndexes(), Item.createIndexes()]);
  });

  it("reuses a consumer number once the old consumer is deleted", async () => {
    const owner = await createOwner();
    const distributor = await createDistributor(owner);

    await softDelete(await Consumer.create(consumerPayload(owner, distributor)));

    const recreated = await Consumer.create(consumerPayload(owner, distributor));
    expect(recreated.consumerNumber).toBe("CN-1001");
  });

  it("still rejects a duplicate consumer number that is not deleted", async () => {
    const owner = await createOwner();
    const distributor = await createDistributor(owner);

    await Consumer.create(consumerPayload(owner, distributor));

    await expect(
      Consumer.create(consumerPayload(owner, distributor))
    ).rejects.toMatchObject({ code: 11000 });
  });

  it("keeps item names reusable after delete and unique while active", async () => {
    const owner = await createOwner();

    await softDelete(await Item.create({ owner: owner._id, name: "REGULATOR" }));
    await Item.create({ owner: owner._id, name: "REGULATOR" });

    await expect(
      Item.create({ owner: owner._id, name: "REGULATOR" })
    ).rejects.toMatchObject({ code: 11000 });
  });
});
