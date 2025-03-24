const express = require("express");
const cors = require("cors");
const apiRoutes = require("./routes/api");
const dotenv = require("dotenv");
const connectDB = require("./config/db");
const rateLimit = require("express-rate-limit");
const authRoutes = require("./routes/authRoutes");
const verifyRoutes = require("./routes/verifyRoutes");
const contactRoutes = require("./routes/contactRoutes");
const subscribeRoutes = require("./routes/subscribeRoutes");
const errorHandler = require("./middleware/errorHandler");

// Load environment variables
dotenv.config();

// Validate required environment variables
const requiredEnvVars = [
  "MONGO_URI",
  "JWT_SECRET",
  "GOOGLE_API_KEY",
  "CLAIMBUSTER_API_KEY",
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

const app = express();

// Define allowed origins based on environment
const allowedOrigins =
  process.env.NODE_ENV === "production"
    ? [process.env.FRONTEND_URL]
    : [
        process.env.FRONTEND_URL || "http://localhost:3000",
        "http://localhost:5173",
      ];

// Update CORS configuration
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// Middleware
app.use(express.json({ limit: "10kb" }));

// Rate limiting (relaxed in development)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === "development" ? 100 : 10, // Allow 100 requests in development, 10 in production
  message: "Too many login attempts from this IP, please try again later.",
});
app.use("/api/auth", authLimiter);

const subscribeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message:
    "Too many subscription attempts from this IP, please try again later.",
});
app.use("/api/subscribe", subscribeLimiter);

const factCheckLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Too many fact-check requests from this IP, please try again later.",
});
app.use("/api/fact-check", factCheckLimiter);

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK", message: "Server is running" });
});

// Routes
app.use("/api/auth", authRoutes);
console.log("Auth routes mounted at /api/auth");

app.use("/api", apiRoutes);
console.log("API routes mounted at /api (includes /fact-check, /subscribe)");

app.use("/api/verify", verifyRoutes);
console.log("Verify routes mounted at /api/verify");

app.use("/api/contact", contactRoutes);
console.log("Contact routes mounted at /api/contact");

app.use("/api/subscribe", subscribeRoutes);
console.log("Subscribe routes mounted at /api/subscribe");

// Error Handler
app.use(errorHandler);

// Start the server after connecting to MongoDB
const PORT = process.env.PORT || 5000;
const startServer = async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer();
