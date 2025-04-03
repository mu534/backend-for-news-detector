const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const signup = async (req, res, next) => {
  const { email, password, role } = req.body;

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({
      email,
      password: hashedPassword,
      role: role || "user", // Default to "user" if role is not provided
    });
    await user.save();

    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is not defined");
    }

    const token = jwt.sign(
      { userId: user._id, role: user.role }, // Include role in the token
      process.env.JWT_SECRET,
      { expiresIn: "30d" } // Token expires in 30 days
    );

    res.status(201).json({
      message: "User created",
      token,
      email: user.email,
      role: user.role,
    });
  } catch (error) {
    next(error);
  }
};

const login = async (req, res, next) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is not defined");
    }

    const token = jwt.sign(
      { userId: user._id, role: user.role }, // Include role in the token
      process.env.JWT_SECRET,
      { expiresIn: "30d" } // Token expires in 30 days
    );

    res.status(200).json({
      message: "Login successful",
      token,
      email: user.email,
      role: user.role,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { signup, login };
