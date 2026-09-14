import { Router } from "express";
import {
  createPurchase,
  deletePurchase,
  getPurchase,
  listPurchases,
  updatePurchase,
} from "../controllers/purchaseController.js";
import { protect } from "../middleware/auth.js";

const router = Router();

router.use(protect);

router.post("/", createPurchase);
router.get("/", listPurchases);
router.get("/:id", getPurchase);
router.put("/:id", updatePurchase);
router.delete("/:id", deletePurchase);

export default router;
