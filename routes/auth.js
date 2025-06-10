const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const role = require("../middleware/role");
const auth = require("../middleware/auth");

// Password validation function
const validatePassword = (password) => {
  if (password.length < 6) {
    return "Password must be at least 6 characters long";
  }
  if (!/[A-Z]/.test(password)) {
    return "Password must contain at least one uppercase letter";
  }
  if (!/[0-9]/.test(password)) {
    return "Password must contain at least one number";
  }
  return null;
};

// Register user (only admin can register other admins)
router.post("/register", async (req, res) => {
  console.log("Registration attempt:", {
    email: req.body.email,
    name: req.body.name,
    role: req.body.role,
  });
  try {
    const { email, password, name, role: requestedRole } = req.body;

    // Validate input
    if (!email || !password || !name) {
      console.log("Registration failed: Missing required fields");
      return res
        .status(400)
        .json({ message: "Please provide all required fields" });
    }

    // Validate password
    const passwordError = validatePassword(password);
    if (passwordError) {
      console.log("Registration failed: Password validation failed", {
        error: passwordError,
      });
      return res.status(400).json({ message: passwordError });
    }

    // Check if user already exists
    let user = await User.findOne({ email });
    if (user) {
      console.log("Registration failed: User already exists", { email });
      return res.status(400).json({ message: "User already exists" });
    }

    // Create new user
    user = new User({
      name,
      email,
      password,
      role: requestedRole || "user", // Default to 'user' if no role specified
    });

    // Hash password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);

    await user.save();
    console.log("User registered successfully", {
      userId: user._id,
      email,
      role: user.role,
    });

    // Create JWT token
    const payload = {
      user: {
        id: user.id,
        role: user.role,
      },
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "24h",
    });

    // Set cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "none",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });

    console.log("Registration completed successfully", { userId: user._id });
    res.status(201).json({
      message: "Registration successful",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Login user
router.post("/login", async (req, res) => {
  console.log("Login attempt:", { email: req.body.email });
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      console.log("Login failed: Missing credentials");
      return res
        .status(400)
        .json({ message: "Please provide email and password" });
    }

    // Check if user exists
    let user = await User.findOne({ email });
    if (!user) {
      console.log("Login failed: User not found", { email });
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // Check if user is active
    if (!user.isActive) {
      console.log("Login failed: User account is inactive", { email });
      return res.status(403).json({ message: "Account is inactive" });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.log("Login failed: Invalid password", { email });
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Create JWT token
    const payload = {
      user: {
        id: user.id,
        role: user.role,
      },
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "24h",
    });

    // Set cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "none",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });

    console.log("Login successful", {
      userId: user._id,
      email,
      role: user.role,
    });
    res.json({
      message: "Login successful",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
});
router.patch("/:id/membership", auth, async (req, res) => {
  try {
    const loggedInUserId = req.user.id; // from auth middleware
    const targetUserId = req.params.id;

    // Only allow user to update their own membership
    if (loggedInUserId !== targetUserId) {
      return res
        .status(403)
        .json({
          message: "Forbidden: You can only update your own membership.",
        });
    }

    const user = await User.findById(targetUserId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check user role
    if (user.role !== "user") {
      return res
        .status(403)
        .json({
          message: 'Only users with role "user" can update membership.',
        });
    }

    // Update membership to paid for 1 month
    user.membership = "paid";
    user.membershipExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await user.save();

    res.json({ message: "Membership updated to paid for 1 month", user });
  } catch (err) {
    console.error("Error updating membership:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Get current user profile
router.get("/profile", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Auto downgrade membership if expired
    if (
      user.membership === "paid" &&
      user.membershipExpiry &&
      user.membershipExpiry < new Date()
    ) {
      user.membership = "not paid";
      user.membershipExpiry = null;
      await user.save();
    }

    res.json(user);
  } catch (err) {
    console.error("Error fetching user profile:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Update user role (admin only)
router.patch("/:id/role", auth, role(["admin"]), async (req, res) => {
  try {
    const { role: newRole } = req.body;
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.role = newRole;
    await user.save();

    res.json({ message: "User role updated successfully", user });
  } catch (err) {
    console.error("Error updating user role:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Logout
router.post("/logout", (req, res) => {
  console.log("Logout attempt:", { userId: req.user?.id });
  res.clearCookie("token");
  console.log("Logout successful");
  res.json({ message: "Logout successful" });
});

// Check user permissions
router.get("/permissions", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isAdmin: user.role === "admin",
        permissions: {
          canAccessAdminDashboard: user.role === "admin",
          canManageUsers: user.role === "admin",
          canManageMembers: user.role === "admin",
        },
      },
    });
  } catch (err) {
    console.error("Error checking permissions:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Get all users (admin only)
router.get("/all-users", auth, role(["admin"]), async (req, res) => {
  try {
    console.log("Getting all users by admin:", { adminId: req.user.id });

    const users = await User.find().select("-password");

    // Check membership expiration for each user
    const updatedUsers = await Promise.all(
      users.map(async (user) => {
        if (
          user.membership === "paid" &&
          user.membershipExpiry &&
          user.membershipExpiry < new Date()
        ) {
          user.membership = "not paid";
          user.membershipExpiry = null;
          await user.save();
        }
        return user;
      })
    );

    res.json(updatedUsers);
  } catch (err) {
    console.error("Error fetching all users:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Get stats for admin dashboard
router.get("/stats", auth, role(["admin"]), async (req, res) => {
  try {
    // Get total users count
    const totalMembers = await User.countDocuments();

    // Get paid members count
    const paidMembers = await User.countDocuments({ membership: "paid" });

    // Get unpaid members count (either explicitly not paid or null)
    const unpaidMembers = await User.countDocuments({
      $or: [
        { membership: "not paid" },
        { membership: { $exists: false } },
        { membership: null },
      ],
    });

    // Calculate total revenue (assuming 100 per paid membership)
    const totalRevenue = paidMembers * 100;

    // Get recent activity (last 5 registrations)
    const recentUsers = await User.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select("name email role createdAt");

    res.json({
      totalMembers,
      paidMembers,
      unpaidMembers,
      totalRevenue,
      recentUsers,
    });
  } catch (err) {
    console.error("Error fetching admin stats:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Get a specific user by ID (admin only)
router.get("/user/:id", auth, role(["admin"]), async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if membership is expired
    if (
      user.membership === "paid" &&
      user.membershipExpiry &&
      user.membershipExpiry < new Date()
    ) {
      user.membership = "not paid";
      user.membershipExpiry = null;
      await user.save();
    }

    res.json(user);
  } catch (err) {
    console.error("Error fetching user:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
