const express = require("express");
const router = express.Router();
const subscribeController = require("../controllers/subscribeController");
const factCheckController = require("../controllers/factCheckController");

if (!subscribeController.subscribe) {
  throw new Error("subscribeController.subscribe is not defined");
}
if (!factCheckController.factCheck) {
  throw new Error("factCheckController.factCheck is not defined");
}

router.post("/subscribe", subscribeController.subscribe);
router.post("/fact-check", factCheckController.factCheck);

module.exports = router;
