import { beforeAll, describe, expect, it } from "vitest";
import Consumer from "../models/Consumer.js";
import Distributor from "../models/Distributor.js";
import User from "../models/User.js";
import {
  IMPORT_ROW_LIMIT,
  importConsumers,
} from "../controllers/consumerController.js";

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

async function createDistributor(owner) {
  return Distributor.create({
    owner: owner._id,
    name: "Supply Co",
    company: "IOCL",
    address: "Depot",
  });
}

function reqFor(owner, body) {
  return { user: { _id: owner._id }, body };
}

describe("consumer import", () => {
  beforeAll(async () => {
    await Consumer.createIndexes();
  });

  it("creates the rows and reports them back", async () => {
    const owner = await createOwner();
    const distributor = await createDistributor(owner);
    const res = mockRes();

    await importConsumers(
      reqFor(owner, {
        distributor: distributor._id,
        consumers: [
          {
            consumerNumber: "606939",
            name: "GYANTI DEVI",
            fatherName: "OM PRAKASH SINGH",
            phone: "6201250615",
            address: "DONE",
          },
          { consumerNumber: "606941", name: "RAJ BHAVATI DEVI" },
        ],
      }),
      res
    );

    expect(res.statusCode).toBe(201);
    expect(res.body.created).toEqual(["606939", "606941"]);
    expect(res.body.skipped).toEqual([]);
    expect(res.body.failed).toEqual([]);

    const saved = await Consumer.findOne({
      owner: owner._id,
      consumerNumber: "606939",
    });
    expect(saved.fatherName).toBe("OM PRAKASH SINGH");
    expect(saved.phone).toBe("6201250615");
  });

  it("skips consumers that already exist on the distributor", async () => {
    const owner = await createOwner();
    const distributor = await createDistributor(owner);
    await Consumer.create({
      owner: owner._id,
      distributor: distributor._id,
      consumerNumber: "606939",
      name: "GYANTI DEVI",
    });
    const res = mockRes();

    await importConsumers(
      reqFor(owner, {
        distributor: distributor._id,
        consumers: [
          { consumerNumber: "606939", name: "SOMEONE ELSE" },
          { consumerNumber: "606941", name: "RAJ BHAVATI DEVI" },
        ],
      }),
      res
    );

    expect(res.body.created).toEqual(["606941"]);
    expect(res.body.skipped).toEqual([
      { consumerNumber: "606939", reason: "Already exists" },
    ]);

    const untouched = await Consumer.findOne({
      owner: owner._id,
      consumerNumber: "606939",
    });
    expect(untouched.name).toBe("GYANTI DEVI");
  });

  it("skips repeats within the same file and fails rows without required fields", async () => {
    const owner = await createOwner();
    const distributor = await createDistributor(owner);
    const res = mockRes();

    await importConsumers(
      reqFor(owner, {
        distributor: distributor._id,
        consumers: [
          { consumerNumber: "606939", name: "GYANTI DEVI" },
          { consumerNumber: "606939", name: "GYANTI DEVI" },
          { consumerNumber: "606941", name: "  " },
          { consumerNumber: "", name: "NO NUMBER" },
        ],
      }),
      res
    );

    expect(res.body.created).toEqual(["606939"]);
    expect(res.body.skipped).toEqual([
      { consumerNumber: "606939", reason: "Duplicate row in file" },
    ]);
    expect(res.body.failed).toHaveLength(2);
  });

  it("rejects another owner's distributor", async () => {
    const owner = await createOwner();
    const other = await createOwner();
    const distributor = await createDistributor(other);
    const res = mockRes();

    await importConsumers(
      reqFor(owner, {
        distributor: distributor._id,
        consumers: [{ consumerNumber: "606939", name: "GYANTI DEVI" }],
      }),
      res
    );

    expect(res.statusCode).toBe(404);
    expect(await Consumer.countDocuments({})).toBe(0);
  });

  it("rejects a batch over the row limit", async () => {
    const owner = await createOwner();
    const distributor = await createDistributor(owner);
    const res = mockRes();

    await importConsumers(
      reqFor(owner, {
        distributor: distributor._id,
        consumers: Array.from({ length: IMPORT_ROW_LIMIT + 1 }, (_, i) => ({
          consumerNumber: `CN-${i}`,
          name: "SOMEONE",
        })),
      }),
      res
    );

    expect(res.statusCode).toBe(400);
    expect(await Consumer.countDocuments({})).toBe(0);
  });
});
