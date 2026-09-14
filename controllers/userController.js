import User from "../models/User.js";

function publicUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive !== false,
  };
}

export const listUsers = async (_req, res) => {
  try {
    const users = await User.find().select("-password").sort({ createdAt: -1 });
    res.json(users.map(publicUser));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const createUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name?.trim() || !email?.trim() || !password) {
      return res.status(400).json({ message: "Name, email and password are required" });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase().trim();
    if (adminEmail && normalizedEmail === adminEmail) {
      return res.status(400).json({ message: "Cannot create another account with the admin email" });
    }

    const exists = await User.findOne({ email: normalizedEmail });
    if (exists) {
      return res.status(409).json({ message: "Email already registered" });
    }

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password,
      role: "user",
      isActive: true,
    });

    res.status(201).json(publicUser(user));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const setUserActive = async (req, res) => {
  try {
    const { isActive } = req.body;
    if (typeof isActive !== "boolean") {
      return res.status(400).json({ message: "isActive boolean is required" });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.role === "admin") {
      return res.status(400).json({ message: "Cannot deactivate the admin account" });
    }

    if (String(user._id) === String(req.user._id)) {
      return res.status(400).json({ message: "Cannot deactivate your own account" });
    }

    user.isActive = isActive;
    await user.save();

    res.json(publicUser(user));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
