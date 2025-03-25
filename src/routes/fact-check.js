const express = require("express");
const axios = require("axios");
const metascraper = require("metascraper")([
  require("metascraper-image")(),
  require("metascraper-url")(),
]);
const authenticateToken = require("../middleware/authenticateToken");

const router = express.Router();

// Fact-check route
router.post("/fact-check", authenticateToken, async (req, res) => {
  const { query, includeNews = false } = req.body;
  try {
    if (!query) {
      return res.status(400).json({ message: "Query is required" });
    }

    console.log(`Fact-check query: ${query}`);

    // Fetch fact-check data
    let factCheckResults = [];
    try {
      const factCheckResponse = await axios.get(
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

      console.log("Google Fact Check API response:", factCheckResponse.data);

      const claims = factCheckResponse.data.claims || [];
      factCheckResults = await Promise.all(
        claims.map(async (claim) => {
          const url = claim.claimReview?.[0]?.url || "#";
          const publisher =
            claim.claimReview?.[0]?.publisher?.name || "Unknown";
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
                ? `/api/proxy-image?url=${encodeURIComponent(metadata.image)}`
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
    } catch (error) {
      console.error("Fact-check API error:", error.message);
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
            message:
              "Invalid Google API key. Please contact the administrator.",
          });
        }
      }
      factCheckResults = [];
    }

    let newsResults = [];
    if (includeNews) {
      try {
        const newsResponse = await axios.get("https://gnews.io/api/v4/search", {
          params: {
            q: query,
            lang: "en",
            country: "us",
            max: 5,
            apikey: process.env.GNEWS_API_KEY,
          },
          timeout: 10000,
        });

        console.log("GNews API response:", newsResponse.data);

        newsResults = newsResponse.data.articles.map((article) => ({
          title: article.title,
          description: article.description,
          url: article.url,
          image: article.image
            ? `/api/proxy-image?url=${encodeURIComponent(article.image)}`
            : null,
          publishedAt: article.publishedAt,
          source: article.source.name,
        }));
      } catch (error) {
        console.error("News API error:", error.message);
        if (axios.isAxiosError(error)) {
          console.error("Axios error details:", {
            status: error.response?.status,
            data: error.response?.data,
          });
          if (error.response?.status === 429) {
            return res.status(429).json({
              message: "GNews API rate limit exceeded. Please try again later.",
            });
          }
          if (error.response?.status === 403) {
            return res.status(403).json({
              message:
                "Invalid GNews API key. Please contact the administrator.",
            });
          }
        }
        newsResults = [];
      }
    }

    const response = {
      factCheckResults,
      newsResults,
    };

    console.log("Combined results:", response);
    res.json(response);
  } catch (error) {
    console.error("Fact-check endpoint error:", error.message);
    return res.status(500).json({
      message:
        "An error occurred while processing your request. Please try again later.",
    });
  }
});

// Proxy image endpoint
router.get("/proxy-image", async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ message: "Image URL is required" });
  }

  try {
    const response = await axios.get(url, {
      responseType: "stream",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
    });

    res.set("Content-Type", response.headers["content-type"]);
    response.data.pipe(res);
  } catch (error) {
    console.error("Image proxy error:", error.message);
    res.status(500).json({ message: "Failed to fetch image" });
  }
});

module.exports = router;
