import { Router } from "express";
import {
  createConsumer,
  deleteConsumer,
  getConsumer,
  importConsumers,
  listConsumers,
  lookupConsumer,
  updateConsumer,
} from "../controllers/consumerController.js";
import { protect } from "../middleware/auth.js";

const router = Router();

router.use(protect);

router.get("/lookup", lookupConsumer);
router.post("/import", importConsumers);
router.post("/", createConsumer);
router.get("/", listConsumers);
router.get("/:id", getConsumer);
router.put("/:id", updateConsumer);
router.delete("/:id", deleteConsumer);

export default router;
