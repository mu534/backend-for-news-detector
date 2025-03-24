const { Router } = require("express");
const { subscribe } = require("../controllers/subscribeController");

const router = Router();

router.post("/", subscribe);

module.exports = router;
