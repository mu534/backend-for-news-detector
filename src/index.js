const dotenv = require("dotenv");
dotenv.config();

const express = require("express");
const cors = require("cors");
const { connect } = require("mongoose");
const factCheckRoutes = require("./routes/fact-check");
const authRoutes = require("./routes/authRoutes");

const app = express();

const requiredEnvVars = [
  "MONGO_URI",
  "JWT_SECRET",
  "GOOGLE_API_KEY",
  "GNEWS_API_KEY",
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

console.log("MONGO_URI:", process.env.MONGO_URI);

connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  });

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

app.use(express.json());

app.use("/api/fact-check", factCheckRoutes);
app.use("/api/auth", authRoutes);

app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK" });
});

app.use((req, res) => {
  res.status(404).json({ message: "Endpoint not found" });
});

app.use((err, req, res, next) => {
  console.error("Global error:", err.message);
  res
    .status(500)
    .json({ message: "An unexpected error occurred. Please try again later." });
});

app.post("/api/fact-check", async (req, res) => {
  const { query } = req.body;
  if (!query) {
    return res.status(400).json({ message: "Please provide a valid query" });
  }
  res.status(200).json({ message: "Success", query });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
