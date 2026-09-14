import mongoose from "mongoose";

let connectionPromise = null;
let listenersBound = false;

function bindConnectionListeners() {
  if (listenersBound) return;
  listenersBound = true;

  mongoose.connection.on("disconnected", () => {
    connectionPromise = null;
  });
}

export async function connectDB() {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (connectionPromise) {
    return connectionPromise;
  }

  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error("MONGO_URI is not set");
  }

  bindConnectionListeners();

  connectionPromise = mongoose
    .connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 10,
      minPoolSize: 1,
    })
    .then(() => mongoose.connection)
    .catch((err) => {
      connectionPromise = null;
      throw err;
    });

  return connectionPromise;
}

export default connectDB;
