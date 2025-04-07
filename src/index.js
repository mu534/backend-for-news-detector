const dotenv = require("dotenv");
dotenv.config();

const express = require("express");
const cors = require("cors");
const { connect } = require("mongoose");
const factCheck = require("./routes/fact-check"); // Rename to match your file
const authRoutes = require("./routes/authRoutes");

const app = express();

// Check required environment variables
const requiredEnvVars = [
  "MONGO_URI",
  "JWT_SECRET",
  "GOOGLE_API_KEY",
  "GNEWS_API_KEY",
  "CLAIMBUSTER_API_KEY", // Added since factCheck.js uses it
];
const missingEnvVars = requiredEnvVars.filter(
  (varName) => !process.env[varName]
);
if (missingEnvVars.length > 0) {
  console.error(
    `Missing required environment variables: ${missingEnvVars.join(", ")}`
  );
  process.exit(1);
}

// MongoDB connection
console.log("MONGO_URI:", process.env.MONGO_URI);
connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  });

// CORS configuration
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://newsdetector-livid.vercel.app",
      "https://newsdetector-jd1h3nj8w-mu534s-projects.vercel.app",
    ],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);

// Middleware
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes); // Handles /api/auth/* routes
app.use("/api/auth/fact-check", factCheck); // Mount fact-check at /api/auth/fact-check

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK" });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: "Endpoint not found" });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Global error:", err.message);
  res
    .status(500)
    .json({ message: "An unexpected error occurred. Please try again later." });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
