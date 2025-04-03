const jwt = require("jsonwebtoken");

// Middleware to authenticate the token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Bearer <token>

  console.log("Received Token:", token); // Debugging

  if (!token) {
    return res.status(401).json({ message: "No token, authorization denied" });
  }

  try {
    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is not defined");
    }

    // Verify the access token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: decoded.id };
    return next();
  } catch (error) {
    console.error("Token verification error:", error.message);

    // If token is expired, check for refresh token
    if (error.message === "jwt expired") {
      const refreshToken = req.body.refreshToken || req.query.refreshToken;

      if (!refreshToken) {
        return res
          .status(401)
          .json({ message: "Token expired. No refresh token provided." });
      }

      // Verify the refresh token
      try {
        const decodedRefresh = jwt.verify(refreshToken, process.env.JWT_SECRET);

        // Generate a new access token
        const newAccessToken = jwt.sign(
          { id: decodedRefresh.id },
          process.env.JWT_SECRET,
          {
            expiresIn: "1h", // Set your expiration time here
          }
        );

        // Send back the new access token
        return res.status(200).json({ accessToken: newAccessToken });
      } catch (refreshError) {
        console.error(
          "Refresh token verification failed:",
          refreshError.message
        );
        return res.status(401).json({ message: "Invalid refresh token" });
      }
    }

    return res.status(401).json({ message: "Token is not valid" });
  }
};

module.exports = authenticateToken;
