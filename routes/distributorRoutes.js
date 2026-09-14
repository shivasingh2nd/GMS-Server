import { Router } from "express";
import {
  createDistributor,
  deleteDistributor,
  getDistributor,
  listDistributors,
  updateDistributor,
} from "../controllers/distributorController.js";
import { protect } from "../middleware/auth.js";

const router = Router();

router.use(protect);

router.post("/", createDistributor);
router.get("/", listDistributors);
router.get("/:id", getDistributor);
router.put("/:id", updateDistributor);
router.delete("/:id", deleteDistributor);

export default router;
