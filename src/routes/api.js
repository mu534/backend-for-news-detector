const express = require("express");
const router = express.Router();
const axios = require("axios");
const authenticateToken = require("../middleware/authenticateToken");
const metascraper = require("metascraper")([require("metascraper-image")()]);

router.post("/fact-check", authenticateToken, async (req, res, next) => {
  const { query } = req.body;
  try {
    if (!query) {
      return res.status(400).json({ message: "Query is required" });
    }

    console.log(`Fact-check query: ${query}`);

    const response = await axios.get(
      "https://factchecktools.googleapis.com/v1alpha1/claims:search",
      {
        params: {
          query,
          key: process.env.GOOGLE_API_KEY,
          languageCode: "en",
        },
        timeout: 10000,
      }
    );

    console.log("Google Fact Check API response:", response.data);

    const claims = response.data.claims || [];
    const results = await Promise.all(
      claims.map(async (claim) => {
        const url = claim.claimReview?.[0]?.url || "#";
        const publisher = claim.claimReview?.[0]?.publisher?.name || "Unknown";
        let image = null;

        const publisherImages = {
          "usa today": "http://localhost:5173/images/usa-today-logo.png",
          aap: "http://localhost:5173/images/aap-logo.png",
          "full fact": "http://localhost:5173/images/full-fact-logo.png",
          default: "http://localhost:5173/images/placeholder.png",
        };

        if (url && url !== "#") {
          try {
            console.log(`Fetching image for URL: ${url}`);
            const { data: html } = await axios.get(url, {
              timeout: 15000,
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
              },
            });
            const metadata = await metascraper({ html, url });
            image = metadata.image
              ? `http://localhost:3000/api/proxy-image?url=${encodeURIComponent(
                  metadata.image
                )}`
              : null;
            console.log(`Fetched image for URL ${url}: ${image}`);
          } catch (error) {
            console.error(
              `Failed to fetch image for URL ${url}:`,
              error.message
            );
            image =
              publisherImages[publisher.toLowerCase()] ||
              publisherImages["default"];
            console.log(
              `Falling back to publisher image for ${publisher}: ${image}`
            );
          }
        }

        return {
          claim: claim.text,
          claimant: claim.claimant || "Unknown",
          date: claim.claimDate || "Unknown",
          publisher,
          rating: claim.claimReview?.[0]?.textualRating || "Unknown",
          url,
          image: image || publisherImages["default"],
        };
      })
    );

    console.log("Fact-check results:", results);
    res.json(results);
  } catch (error) {
    console.error("Fact-check error:", error.message);
    if (axios.isAxiosError(error)) {
      console.error("Axios error details:", {
        status: error.response?.status,
        data: error.response?.data,
      });
      if (error.response?.status === 429) {
        return res.status(429).json({
          message: "Google API rate limit exceeded. Please try again later.",
        });
      }
      if (error.response?.status === 403) {
        return res.status(403).json({
          message: "Invalid Google API key. Please contact the administrator.",
        });
      }
    }
    next(error);
  }
});

router.get("/proxy-image", async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).send("Image URL is required");
  }

  try {
    const response = await axios.get(url, {
      responseType: "arraybuffer",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
    });
    const contentType = response.headers["content-type"] || "image/png";
    res.set("Content-Type", contentType);
    res.send(response.data);
  } catch (error) {
    console.error(`Failed to proxy image ${url}:`, error.message);
    // Fallback to serving the placeholder image directly
    try {
      const fallbackResponse = await axios.get(
        "http://localhost:5173/images/placeholder.png",
        {
          responseType: "arraybuffer",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
          },
        }
      );
      res.set("Content-Type", "image/png");
      res.send(fallbackResponse.data);
    } catch (fallbackError) {
      console.error(
        "Failed to load fallback placeholder:",
        fallbackError.message
      );
      res.status(500).send("Failed to load image");
    }
  }
});

module.exports = router;
