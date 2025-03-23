const { verifyNews } = require("../services/verifyNewsService");

const verify = async (req, res, next) => {
  const { input } = req.body;
  const userId = req.user?.userId;

  if (!input) {
    return res.status(400).json({ message: "Input is required" });
  }

  try {
    const result = await verifyNews(input, userId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = { verify };
