import { describe, expect, it } from "vitest";
import AccountEntry from "../models/AccountEntry.js";
import Distributor from "../models/Distributor.js";
import Item from "../models/Item.js";
import Purchase from "../models/Purchase.js";
import User from "../models/User.js";
import { ensurePartyForDistributor } from "../utils/distributorParty.js";
import {
  createPurchaseLedgerEntry,
  createPurchasePaymentEntry,
} from "../utils/purchaseLedger.js";
import { withTransaction } from "../utils/transactions.js";

async function createOwner() {
  return User.create({
    name: "Buyer",
    email: `buyer-${Date.now()}-${Math.random().toString(16).slice(2)}@test.local`,
    password: "password123",
    role: "user",
  });
}

describe("purchase → ledger", () => {
  it("creates purchase credit entry with explicit source", async () => {
    const owner = await createOwner();
    const distributor = await Distributor.create({
      owner: owner._id,
      name: "Supply Co",
      company: "IOCL",
      address: "Depot",
    });
    const party = await ensurePartyForDistributor(distributor, owner._id);
    const item = await Item.create({
      owner: owner._id,
      name: "14.2kg cylinder",
      unit: "cylinder",
    });

    const purchase = await withTransaction(async (session) => {
      const [created] = await Purchase.create(
        [
          {
            owner: owner._id,
            distributor: distributor._id,
            purchaseDate: new Date("2026-03-01T00:00:00.000Z"),
            items: [{ item: item._id, quantity: 2, rate: 1000, amount: 2000 }],
            totalAmount: 2000,
          },
        ],
        { session }
      );

      await createPurchaseLedgerEntry(created, party._id, owner._id, session);
      return created;
    });

    const entry = await AccountEntry.findOne({
      purchase: purchase._id,
      source: "purchase",
    });
    expect(entry).toBeTruthy();
    expect(entry.type).toBe("credit");
    expect(entry.source).toBe("purchase");
    expect(entry.amount).toBe(2000);
    expect(entry.date).toBe("2026-03-01");
    expect(entry.particular).toBe("Purchase");
    expect(String(entry.party)).toBe(String(party._id));
    expect(String(entry.owner)).toBe(String(owner._id));
    expect(entry.isDeleted).not.toBe(true);
  });

  it("lists purchase entries in the same-day party date filter used by Today", async () => {
    const owner = await createOwner();
    const distributor = await Distributor.create({
      owner: owner._id,
      name: "Today Co",
      company: "BPCL",
      address: "Depot",
    });
    const party = await ensurePartyForDistributor(distributor, owner._id);
    const item = await Item.create({
      owner: owner._id,
      name: "Regulator",
      unit: "pcs",
    });

    const purchase = await withTransaction(async (session) => {
      const [created] = await Purchase.create(
        [
          {
            owner: owner._id,
            distributor: distributor._id,
            purchaseDate: new Date("2026-09-14T00:00:00.000Z"),
            items: [{ item: item._id, quantity: 1, rate: 400, amount: 400 }],
            totalAmount: 400,
          },
        ],
        { session }
      );
      await createPurchaseLedgerEntry(created, party._id, owner._id, session);
      return created;
    });

    await AccountEntry.create({
      owner: owner._id,
      party: party._id,
      date: "2026-09-14",
      type: "debit",
      amount: 100,
      particular: "Cash",
      source: "manual",
    });

    const { buildStringDateRangeFilter } = await import("../utils/dateRangeFilter.js");
    const { activeFilter } = await import("../utils/activeFilter.js");

    const filter = {
      owner: owner._id,
      party: party._id,
      ...activeFilter,
      ...buildStringDateRangeFilter("2026-09-14", "2026-09-14", "date").filter,
    };
    const rows = await AccountEntry.find(filter).sort({ createdAt: -1 });
    const sources = rows.map((r) => r.source);

    expect(sources).toContain("purchase");
    expect(sources).toContain("manual");
    expect(rows.find((r) => r.source === "purchase")?.purchase?.toString()).toBe(
      String(purchase._id)
    );
  });

  it("creates Pay Now payment as a manual debit entry", async () => {
    const owner = await createOwner();
    const distributor = await Distributor.create({
      owner: owner._id,
      name: "Pay Now Co",
      company: "HPCL",
      address: "Yard",
    });
    const party = await ensurePartyForDistributor(distributor, owner._id);
    const item = await Item.create({
      owner: owner._id,
      name: "19kg cylinder",
      unit: "cylinder",
    });

    const purchase = await withTransaction(async (session) => {
      const [created] = await Purchase.create(
        [
          {
            owner: owner._id,
            distributor: distributor._id,
            purchaseDate: new Date("2026-03-02T00:00:00.000Z"),
            items: [{ item: item._id, quantity: 1, rate: 1500, amount: 1500 }],
            totalAmount: 1500,
          },
        ],
        { session }
      );

      await createPurchaseLedgerEntry(created, party._id, owner._id, session);
      await createPurchasePaymentEntry(created, party._id, owner._id, session, {
        amount: 500,
        particular: "UPI partial",
      });
      return created;
    });

    const credit = await AccountEntry.findOne({
      purchase: purchase._id,
      source: "purchase",
    });
    const payment = await AccountEntry.findOne({
      party: party._id,
      source: "manual",
      particular: "UPI partial",
    });

    expect(credit.type).toBe("credit");
    expect(payment.type).toBe("debit");
    expect(payment.source).toBe("manual");
    expect(payment.purchase).toBeNull();
    expect(payment.amount).toBe(500);
    expect(payment.particular).toBe("UPI partial");
  });
});
