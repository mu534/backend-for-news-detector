const mongoose = require("mongoose");

const subscriberSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true, // This creates the index
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, "Please use a valid email address"],
    },
  },
  { timestamps: true }
);

// Remove the redundant schema.index() call

module.exports = mongoose.model("Subscriber", subscriberSchema);
