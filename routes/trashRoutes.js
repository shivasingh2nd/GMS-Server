import { Router } from "express";
import { listTrash, purgeTrashEntry } from "../controllers/trashController.js";
import { protect } from "../middleware/auth.js";

const router = Router();

router.use(protect);

router.get("/", listTrash);
router.delete("/:module/:id", purgeTrashEntry);

export default router;
