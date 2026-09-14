import dotenv from "dotenv";

import { createApp } from "./app.js";
import connectDB from "./config/db.js";
import { bootstrapAdmin } from "./utils/bootstrapAdmin.js";

dotenv.config();

const app = createApp();
const PORT = process.env.PORT || 3000;

async function start() {
  await connectDB();
  console.log("Connected to MongoDB");
  await bootstrapAdmin();

  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err.message);
  process.exit(1);
});
