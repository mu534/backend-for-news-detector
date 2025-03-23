const { Router } = require("express");
const { verify } = require("../controllers/verifyController");
const auth = require("../middleware/auth");

const router = Router();

router.post("/", auth, verify);

module.exports = router;
