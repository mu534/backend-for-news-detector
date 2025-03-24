const express = require("express");
const router = express.Router();

router.post("/", async (req, res, next) => {
  const { name, email, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    // In a real app, you might save this to a database or send an email
    console.log("Contact form submission:", { name, email, message });
    res.status(200).json({ message: "Message sent successfully" });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
