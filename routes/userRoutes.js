import { Router } from "express";
import { createUser, listUsers, setUserActive } from "../controllers/userController.js";
import { protect, requireAdmin } from "../middleware/auth.js";

const router = Router();

router.use(protect, requireAdmin);

router.get("/", listUsers);
router.post("/", createUser);
router.patch("/:id/active", setUserActive);

export default router;
