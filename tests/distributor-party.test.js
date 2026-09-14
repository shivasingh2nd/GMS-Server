import { describe, expect, it } from "vitest";
import Distributor from "../models/Distributor.js";
import Party from "../models/Party.js";
import User from "../models/User.js";
import { ensurePartyForDistributor } from "../utils/distributorParty.js";

async function createOwner() {
  return User.create({
    name: "Owner",
    email: `owner-${Date.now()}@test.local`,
    password: "password123",
    role: "user",
  });
}

describe("distributor → party sync", () => {
  it("creates a linked party without copying distributor name", async () => {
    const owner = await createOwner();
    const distributor = await Distributor.create({
      owner: owner._id,
      name: "Test Gas",
      company: "HPCL",
      address: "Main Road",
      phone: "9876543210",
    });

    const party = await ensurePartyForDistributor(distributor, owner._id);

    expect(party).toBeTruthy();
    expect(String(party.distributor)).toBe(String(distributor._id));
    expect(String(party.owner)).toBe(String(owner._id));
    expect(party.name).toBe("");
    expect(party.phone).toBe("");

    const stored = await Party.findById(party._id);
    expect(stored).toBeTruthy();
  });

  it("scopes parties per owner", async () => {
    const ownerA = await createOwner();
    const ownerB = await createOwner();
    const distributor = await Distributor.create({
      owner: ownerA._id,
      name: "Shared Name Co",
      company: "BPCL",
      address: "Street 1",
    });

    await ensurePartyForDistributor(distributor, ownerA._id);

    const other = await Party.findOne({
      owner: ownerB._id,
      distributor: distributor._id,
    });
    expect(other).toBeNull();
  });
});
