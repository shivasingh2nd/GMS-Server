import { Router } from "express";
import {
  createItem,
  deleteItem,
  getItem,
  listItems,
  updateItem,
} from "../controllers/itemController.js";
import { protect } from "../middleware/auth.js";

const router = Router();

router.use(protect);

router.post("/", createItem);
router.get("/", listItems);
router.get("/:id", getItem);
router.put("/:id", updateItem);
router.delete("/:id", deleteItem);

export default router;
