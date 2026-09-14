import { Router } from "express";
import {
  createDac,
  deleteDac,
  getDac,
  listDacs,
  updateDac,
} from "../controllers/dacController.js";
import { protect } from "../middleware/auth.js";

const router = Router();

router.use(protect);

router.post("/", createDac);
router.get("/", listDacs);
router.get("/:id", getDac);
router.put("/:id", updateDac);
router.delete("/:id", deleteDac);

export default router;
