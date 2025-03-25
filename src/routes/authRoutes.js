const express = require("express");
const router = express.Router();
const User = require("../models/User");
const jwt = require("jsonwebtoken");
const authenticateToken = require("../middleware/authenticateToken");

// Store refresh tokens (in-memory for this example; use a database in production)
const refreshTokens = [];

// Register a new user
router.post("/signup", async (req, res, next) => {
  const { email, password } = req.body;
  try {
    // Validate input
    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    if (password.length < 8) {
      return res
        .status(400)
        .json({ message: "Password must be at least 8 characters long" });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Create new user
    const user = new User({ email, password });
    await user.save();

    // Generate JWT tokens
    const accessToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "15m", // Short-lived access token
    });
    const refreshToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d", // Long-lived refresh token
    });

    refreshTokens.push(refreshToken);

    // Optionally set refresh token as an HTTP-only cookie (uncomment in production)
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });

    res.status(201).json({
      message: "User registered successfully",
      user: { id: user._id, email: user.email, role: user.role },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error("Signup error:", error.message);
    next(error);
  }
});

// Login user
router.post("/login", async (req, res, next) => {
  const { email, password } = req.body;
  try {
    // Validate input
    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required" });
    }

    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const accessToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "15m",
    });
    const refreshToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    refreshTokens.push(refreshToken);

    // Optionally set refresh token as an HTTP-only cookie (uncomment in production)
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });

    res.json({
      accessToken,
      refreshToken,
      user: { id: user._id, email: user.email, role: user.role },
    });
  } catch (error) {
    console.error("Login error:", error.message);
    next(error);
  }
});

// Refresh token endpoint
router.post("/refresh", (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken || !refreshTokens.includes(refreshToken)) {
    return res.status(403).json({ message: "Invalid refresh token" });
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    const accessToken = jwt.sign({ id: decoded.id }, process.env.JWT_SECRET, {
      expiresIn: "15m",
    });
    res.json({ accessToken });
  } catch (error) {
    console.error("Refresh token error:", error.message);
    return res
      .status(403)
      .json({ message: "Invalid or expired refresh token" });
  }
});

// Get current user
router.get("/me", authenticateToken, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json({ user: { id: user._id, email: user.email, role: user.role } });
  } catch (error) {
    console.error("Get current user error:", error.message);
    next(error);
  }
});

// Logout user
router.post("/logout", (req, res) => {
  const { refreshToken } = req.body;
  const index = refreshTokens.indexOf(refreshToken);
  if (index !== -1) {
    refreshTokens.splice(index, 1);
  }
  // Optionally clear the refresh token cookie (uncomment if using cookies)
  // res.clearCookie("refreshToken");
  res.json({ message: "Logged out successfully" });
});

module.exports = router;
