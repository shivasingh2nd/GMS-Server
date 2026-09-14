import User from "../models/User.js";

export async function bootstrapAdmin() {
  const email = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD are required in environment");
  }

  let admin = await User.findOne({ email });
  if (!admin) {
    admin = await User.create({
      name: "Admin",
      email,
      password,
      role: "admin",
      isActive: true,
    });
    console.log(`Bootstrapped admin user: ${email}`);
  } else {
    let changed = false;
    if (admin.role !== "admin") {
      admin.role = "admin";
      changed = true;
    }
    if (!admin.isActive) {
      admin.isActive = true;
      changed = true;
    }
    if (changed) {
      await admin.save();
      console.log(`Ensured admin role for: ${email}`);
    }
  }

  await User.updateMany(
    { email: { $ne: email }, role: "admin" },
    { $set: { role: "user" } }
  );

  return admin;
}
