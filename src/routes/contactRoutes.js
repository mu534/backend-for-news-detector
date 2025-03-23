const { Router } = require("express");
const {
  submitContact,
  validateContact,
} = require("../controllers/contactController");

const router = Router();

router.post("/", validateContact, submitContact);

module.exports = router;
