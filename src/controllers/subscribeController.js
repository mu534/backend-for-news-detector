const Subscriber = require("../models/Subscriber");

// Utility function to validate email format
const isValidEmail = (email) => {
  const emailRegex = /^\S+@\S+\.\S+$/;
  return emailRegex.test(email);
};

const subscribe = async (req, res, next) => {
  const { email } = req.body;

  try {
    // Validate email
    if (!email || !isValidEmail(email)) {
      return res
        .status(400)
        .json({ message: "Please provide a valid email address" });
    }

    const normalizedEmail = email.toLowerCase();

    // Check if the email is already subscribed in the database
    const existingSubscriber = await Subscriber.findOne({
      email: normalizedEmail,
    });
    if (existingSubscriber) {
      return res
        .status(400)
        .json({ message: "This email is already subscribed" });
    }

    // Create and save the new subscriber
    const subscriber = new Subscriber({ email: normalizedEmail });
    await subscriber.save();

    // Log the successful subscription (for debugging/monitoring)
    console.log(`New subscription: ${normalizedEmail}`);

    res
      .status(201)
      .json({ message: "Successfully subscribed to the newsletter" });
  } catch (error) {
    // Log the error for debugging
    console.error(`Subscription error for email ${email}:`, error);
    next(error); // Pass the error to the error handler middleware
  }
};

module.exports = { subscribe };
