const express = require("express");
const router = express.Router();
const { google } = require("googleapis");
const axios = require("axios");
const metascraper = require("metascraper")([
  require("metascraper-image")(),
  require("metascraper-url")(),
]);

const rateLimitStore = new Map();
const RATE_LIMIT = 15;
const TIME_WINDOW = 60 * 60 * 1000; // 1 hour

const checkRateLimit = (userIp) => {
  const now = Date.now();
  let userLimit = rateLimitStore.get(userIp);

  if (!userLimit || now > userLimit.resetTime) {
    userLimit = { count: 0, resetTime: now + TIME_WINDOW };
    rateLimitStore.set(userIp, userLimit);
  }

  if (userLimit.count >= RATE_LIMIT) {
    const timeLeft = Math.ceil((userLimit.resetTime - now) / 1000 / 60);
    return {
      exceeded: true,
      message: `Rate limit exceeded. Please wait ${timeLeft} minutes.`,
    };
  }

  userLimit.count += 1;
  rateLimitStore.set(userIp, userLimit);
  return { exceeded: false };
};

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
  return Promise.all(
    claims.map(async (claim) => {
      const url = claim.claimReview?.[0]?.url || "#";
      const publisher = claim.claimReview?.[0]?.publisher?.name || "Unknown";
      const publisherImages = {
        "usa today": "/images/usa-today-logo.png",
        aap: "/images/aap-logo.png",
        "full fact": "/images/full-fact-logo.png",
        default: "/images/placeholder.png",
      };
      let image =
        publisherImages[publisher.toLowerCase()] || publisherImages["default"];

      if (url !== "#") {
        try {
          const { data: html } = await axios.get(url, {
            timeout: 15000,
            headers: {
              "User-Agent": "Mozilla/5.0 (compatible; TruthGuard/1.0)",
            },
          });
          const metadata = await metascraper({ html, url });
          image = metadata.image
            ? `/api/proxy-image?url=${encodeURIComponent(metadata.image)}`
            : image;
        } catch (error) {
          console.warn(
            `Failed to scrape metadata for ${url}: ${error.message}`
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
      claimant: "N/A",
      date: new Date().toISOString(),
      publisher: "ClaimBuster",
      rating: `Check-Worthy (Score: ${result.score.toFixed(2)})`,
      url: "#",
      image: "/images/placeholder.png",
    }));
};

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

// Define the route
router.post("/", async (req, res) => {
  const { content, includeNews = false } = req.body;
  const userIp = req.ip;

  if (!content || typeof content !== "string" || content.trim() === "") {
    return res
      .status(400)
      .json({ message: "Please provide valid content to verify" });
  }

  const rateLimitResult = checkRateLimit(userIp);
  if (rateLimitResult.exceeded) {
    return res.status(429).json({ message: rateLimitResult.message });
  }

  const trimmedContent = content.trim().replace(/\s+/g, " ");

  try {
    let factCheckResults = [];
    try {
      factCheckResults = await fetchGoogleFactCheck(trimmedContent);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 429) {
          return res
            .status(429)
            .json({ message: "Google API rate limit exceeded" });
        }
        if (error.response?.status === 403) {
          return res.status(403).json({ message: "Invalid Google API key" });
        }
      }
      console.warn(`Google Fact Check failed: ${error.message}`);
    }

    if (factCheckResults.length === 0) {
      try {
        factCheckResults = await fetchClaimBuster(trimmedContent);
      } catch (error) {
        console.warn(`ClaimBuster failed: ${error.message}`);
      }
    }

    let newsResults = [];
    if (includeNews) {
      try {
        newsResults = await fetchNews(trimmedContent);
      } catch (error) {
        console.warn(`GNews failed: ${error.message}`);
      }
    }

    if (factCheckResults.length === 0 && newsResults.length === 0) {
      return res
        .status(404)
        .json({ message: "No fact-check results found for this content" });
    }

    res.status(200).json({ factCheckResults, newsResults });
  } catch (error) {
    console.error(`Unexpected error in fact-check: ${error.message}`);
    res.status(500).json({ message: "Server error. Please try again later." });
  }
});

module.exports = router;
