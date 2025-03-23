const { body, validationResult } = require("express-validator");
const Contact = require("../models/Contact");

const validateContact = [
  body("firstName").notEmpty().withMessage("First name is required"),
  body("lastName").notEmpty().withMessage("Last name is required"),
  body("email").isEmail().withMessage("Valid email is required"),
  body("companyName").optional().isString(),
  body("companySize").optional().isString(),
  body("topic").optional().isString(),
  body("message").optional().isString(),
];

const submitContact = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const {
    firstName,
    lastName,
    email,
    companyName,
    companySize,
    topic,
    message,
  } = req.body;

  try {
    const contact = new Contact({
      firstName,
      lastName,
      email,
      companyName,
      companySize,
      topic,
      message,
    });
    await contact.save();

    res.status(201).json({ message: "Contact form submitted successfully" });
  } catch (error) {
    next(error);
  }
};

module.exports = { validateContact, submitContact };
