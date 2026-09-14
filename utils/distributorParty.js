import Party from "../models/Party.js";
import { activeFilter } from "./activeFilter.js";

export async function ensurePartyForDistributor(distributor, ownerId, session = null) {
  const filter = {
    owner: ownerId,
    distributor: distributor._id,
    ...activeFilter,
  };

  let query = Party.findOne(filter);
  if (session) query = query.session(session);
  let party = await query;

  if (!party) {
    const payload = {
      owner: ownerId,
      distributor: distributor._id,
      name: "",
      phone: "",
      notes: "Linked distributor account",
    };
    if (session) {
      const [created] = await Party.create([payload], { session });
      party = created;
    } else {
      party = await Party.create(payload);
    }
  }

  return party;
}

export async function softDeletePartyForDistributor(distributorId, ownerId) {
  await Party.findOneAndUpdate(
    { owner: ownerId, distributor: distributorId, ...activeFilter },
    { isDeleted: true, deletedAt: new Date() }
  );
}

export async function getPartyForDistributor(distributorId, ownerId) {
  return Party.findOne({
    owner: ownerId,
    distributor: distributorId,
    ...activeFilter,
  });
}
