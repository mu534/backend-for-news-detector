require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/User");

// Connect to MongoDB using the MONGO_URI from .env
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const migrate = async () => {
  try {
    const result = await User.updateMany(
      { role: { $exists: false } },
      { $set: { role: "user" } }
    );
    console.log(`Migration complete. Updated ${result.modifiedCount} users.`);
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    mongoose.connection.close();
  }
};

migrate();
