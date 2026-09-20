import express from "express";
import cors from "cors";
import accountRoutes from "./routes/accountRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import distributorRoutes from "./routes/distributorRoutes.js";
import consumerRoutes from "./routes/consumerRoutes.js";
import dacRoutes from "./routes/dacRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import purchaseRoutes from "./routes/purchaseRoutes.js";
import itemRoutes from "./routes/itemRoutes.js";
import trashRoutes from "./routes/trashRoutes.js";
import userRoutes from "./routes/userRoutes.js";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/accounts", accountRoutes);
  app.use("/api/distributors", distributorRoutes);
  app.use("/api/consumers", consumerRoutes);
  app.use("/api/dacs", dacRoutes);
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/purchases", purchaseRoutes);
  app.use("/api/items", itemRoutes);
  app.use("/api/trash", trashRoutes);

  return app;
}
