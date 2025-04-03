const { google } = require("googleapis");
const axios = require("axios");
const metascraper = require("metascraper")([
  require("metascraper-image")(),
  require("metascraper-url")(),
]);

// In-memory rate limit store (user IP -> { count, resetTime })
const rateLimitStore = new Map();
const RATE_LIMIT = 15; // Max requests per hour
const TIME_WINDOW = 60 * 60 * 1000; // 1 hour in milliseconds

// Utility function to check rate limit
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
      message: `Rate limit exceeded. You can make more requests in ${timeLeft} minutes.`,
    };
  }

  userLimit.count += 1;
  rateLimitStore.set(userIp, userLimit);
  return { exceeded: false };
};

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
  return Promise.all(
    claims.map(async (claim) => {
      const url = claim.claimReview?.[0]?.url || "#";
      const publisher = claim.claimReview?.[0]?.publisher?.name || "Unknown";
      const publisherImages = {
        "usa today": "http://localhost:5173/images/usa-today-logo.png",
        aap: "http://localhost:5173/images/aap-logo.png",
        "full fact": "http://localhost:5173/images/full-fact-logo.png",
        default: "http://localhost:5173/images/placeholder.png",
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
      claimant: "N/A",
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

const factCheck = async (req, res) => {
  const { query, includeNews = false } = req.body;
  const userIp = req.ip;

  if (!query || typeof query !== "string" || query.trim() === "") {
    return res.status(400).json({ message: "Please provide a valid query" });
  }

  const rateLimitResult = checkRateLimit(userIp);
  if (rateLimitResult.exceeded) {
    return res.status(429).json({ message: rateLimitResult.message });
  }

  const trimmedQuery = query.trim().replace(/\s+/g, " ");

  try {
    let factCheckResults = [];
    try {
      factCheckResults = await fetchGoogleFactCheck(trimmedQuery);
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

    // Fallback to ClaimBuster if no results
    if (factCheckResults.length === 0) {
      try {
        factCheckResults = await fetchClaimBuster(trimmedQuery);
      } catch (error) {
        console.warn(`ClaimBuster failed: ${error.message}`);
      }
    }

    let newsResults = [];
    if (includeNews) {
      try {
        newsResults = await fetchNews(trimmedQuery);
      } catch (error) {
        console.warn(`GNews failed: ${error.message}`);
      }
    }

    if (factCheckResults.length === 0 && newsResults.length === 0) {
      return res
        .status(404)
        .json({ message: "No results found for this query" });
    }

    res.status(200).json({ factCheckResults, newsResults });
  } catch (error) {
    console.error(`Unexpected error in fact-check: ${error.message}`);
    res.status(500).json({ message: "Server error. Please try again later." });
  }
};

module.exports = factCheck;
