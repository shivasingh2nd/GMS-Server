import { Router } from "express";
import {
  createAccountEntry,
  deleteAccountEntry,
  getAccountEntry,
  listAccountEntries,
  updateAccountEntry,
} from "../controllers/accountEntryController.js";
import { getAccountLedger, getAccountSummary } from "../controllers/accountReportController.js";
import {
  createParty,
  deleteParty,
  getParty,
  listParties,
  updateParty,
} from "../controllers/partyController.js";
import { protect } from "../middleware/auth.js";

const router = Router();

router.use(protect);

router.get("/summary", getAccountSummary);
router.get("/ledger", getAccountLedger);

router.get("/parties", listParties);
router.post("/parties", createParty);
router.get("/parties/:id", getParty);
router.put("/parties/:id", updateParty);
router.delete("/parties/:id", deleteParty);

router.get("/entries", listAccountEntries);
router.post("/entries", createAccountEntry);
router.get("/entries/:id", getAccountEntry);
router.put("/entries/:id", updateAccountEntry);
router.delete("/entries/:id", deleteAccountEntry);

export default router;
