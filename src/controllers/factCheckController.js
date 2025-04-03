const { google } = require("googleapis");
const axios = require("axios");
const metascraper = require("metascraper")([
  require("metascraper-image")(),
  require("metascraper-url")(),
]);

// In-memory cache for image proxying (consider Redis for production)
const imageCache = new Map();

// Fetch fact-check results from Google Fact Check Tools
const fetchGoogleFactCheck = async (query) => {
  const factCheckTools = google.factchecktools({
    version: "v1alpha1",
    auth: process.env.GOOGLE_API_KEY,
  });

  const response = await factCheckTools.claims.search({
    query,
    pageSize: 10,
  });

  const claims = response.data.claims || [];
  const publisherImages = {
    "usa today": "http://localhost:5173/images/usa-today-logo.png",
    aap: "http://localhost:5173/images/aap-logo.png",
    "full fact": "http://localhost:5173/images/full-fact-logo.png",
    default: "http://localhost:5173/images/placeholder.png",
  };

  return Promise.all(
    claims.map(async (claim) => {
      const url = claim.claimReview?.[0]?.url || "#";
      const publisher = claim.claimReview?.[0]?.publisher?.name || "Unknown";
      let image =
        publisherImages[publisher.toLowerCase()] || publisherImages["default"];

      if (url !== "#") {
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
            : image;
          console.log(`Fetched image for URL ${url}: ${image}`);
        } catch (error) {
          console.error(
            `Failed to fetch image for URL ${url}: ${error.message}`
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
        image,
      };
    })
  );
};

// Fetch fact-check results from ClaimBuster (fallback)
const fetchClaimBuster = async (query) => {
  const { data } = await axios.post(
    "https://idir.uta.edu/claimbuster/api/v1/score/text/",
    { text: query },
    { headers: { "x-api-key": process.env.CLAIMBUSTER_API_KEY } }
  );

  return (data.results || [])
    .filter((result) => result.score > 0.5)
    .map((result) => ({
      claim: result.text,
      claimant: "N/A (ClaimBuster)",
      date: new Date().toISOString(),
      publisher: "ClaimBuster",
      rating: `Check-Worthy (Score: ${result.score})`,
      url: "#",
      image: "http://localhost:5173/images/placeholder.png",
    }));
};

// Fetch news results from GNews
const fetchNews = async (query) => {
  const { data } = await axios.get("https://gnews.io/api/v4/search", {
    params: {
      q: query,
      lang: "en",
      country: "us",
      max: 5,
      apikey: process.env.GNEWS_API_KEY,
    },
    timeout: 10000,
  });

  console.log("GNews API response:", data);
  return data.articles.map((article) => ({
    title: article.title,
    description: article.description,
    url: article.url,
    image: article.image
      ? `/api/proxy-image?url=${encodeURIComponent(article.image)}`
      : null,
    publishedAt: article.publishedAt,
    source: article.source.name,
  }));
};

// Main fact-check handler
const factCheck = async (req, res, next) => {
  let { query, includeNews = false } = req.body;

  if (!query || typeof query !== "string" || query.trim() === "") {
    return res
      .status(400)
      .json({ message: "Please provide a valid query to fact-check" });
  }

  query = query.trim().replace(/\s+/g, " ");

  try {
    let factCheckResults = [];
    try {
      factCheckResults = await fetchGoogleFactCheck(query);
    } catch (error) {
      console.error("Google Fact Check API error:", error.message);
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
    }

    if (factCheckResults.length === 0) {
      try {
        factCheckResults = await fetchClaimBuster(query);
      } catch (error) {
        console.error("ClaimBuster API error:", error.message);
      }
    }

    let newsResults = [];
    if (includeNews) {
      try {
        newsResults = await fetchNews(query);
      } catch (error) {
        console.error("News API error:", error.message);
      }
    }

    const response = { factCheckResults, newsResults };
    if (factCheckResults.length === 0 && newsResults.length === 0) {
      return res.status(404).json({
        message:
          "No fact-checks, check-worthy claims, or news articles found for this query",
      });
    }

    console.log("Combined results:", response);
    res.status(200).json(response);
  } catch (error) {
    console.error("Fact-check endpoint error:", error.message);
    res.status(500).json({
      message:
        "An error occurred while processing your request. Please try again later.",
    });
  }
};

// Image proxy handler
const proxyImage = async (req, res) => {
  const imageUrl = req.query.url;
  if (!imageUrl) {
    return res.status(400).json({ message: "Image URL is required" });
  }

  try {
    if (imageCache.has(imageUrl)) {
      console.log(`Serving cached image for ${imageUrl}`);
      res.set("Content-Type", "image/jpeg"); // Adjust based on actual type if needed
      return res.send(imageCache.get(imageUrl));
    }

    const response = await axios.get(imageUrl, { responseType: "arraybuffer" });
    res.set("Content-Type", response.headers["content-type"]);
    imageCache.set(imageUrl, response.data);
    console.log(`Fetched and cached image for ${imageUrl}`);
    res.send(response.data);
  } catch (error) {
    console.error("Image proxy error:", error.message);
    res.status(500).send("Error fetching image");
  }
};

// Export both functions
module.exports = { factCheck, proxyImage };
