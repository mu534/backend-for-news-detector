const { google } = require("googleapis");
const axios = require("axios");
const metascraper = require("metascraper")([
  require("metascraper-image")(),
  require("metascraper-url")(),
]);

const factCheck = async (req, res, next) => {
  let { query, includeNews = false } = req.body;

  if (!query) {
    return res
      .status(400)
      .json({ message: "Please provide a query to fact-check" });
  }

  // Preprocess the query
  query = query.trim().replace(/\s+/g, " ");

  try {
    // Step 1: Try Google Fact Check Tools API
    let factCheckResults = [];
    try {
      const factCheckTools = google.factchecktools({
        version: "v1alpha1",
        auth: process.env.GOOGLE_API_KEY,
      });
      const response = await factCheckTools.claims.search({
        query: query,
        pageSize: 10,
      });

      const claims = response.data.claims || [];
      factCheckResults = await Promise.all(
        claims.map(async (claim) => {
          const url = claim.claimReview?.[0]?.url || "#";
          const publisher =
            claim.claimReview?.[0]?.publisher?.name || "Unknown";
          let image = null;

          // Fallback images for known publishers
          const publisherImages = {
            "usa today": "http://localhost:5173/images/usa-today-logo.png",
            aap: "http://localhost:5173/images/aap-logo.png",
            "full fact": "http://localhost:5173/images/full-fact-logo.png",
            default: "http://localhost:5173/images/placeholder.png",
          };

          // Fetch image from the fact-check article
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
      // Continue with empty fact-check results if the API fails
      factCheckResults = [];
    }

    // Step 2: Fallback to ClaimBuster if no results from Google
    if (factCheckResults.length === 0) {
      try {
        const claimBusterResponse = await axios.post(
          "https://idir.uta.edu/claimbuster/api/v1/score/text/",
          { text: query },
          { headers: { "x-api-key": process.env.CLAIMBUSTER_API_KEY } }
        );

        const claimBusterResult = claimBusterResponse.data;
        if (claimBusterResult.results && claimBusterResult.results.length > 0) {
          const checkWorthyClaims = claimBusterResult.results
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

          if (checkWorthyClaims.length > 0) {
            factCheckResults = checkWorthyClaims;
          }
        }
      } catch (error) {
        console.error("ClaimBuster API error:", error.message);
        if (axios.isAxiosError(error)) {
          console.error("Axios error details:", {
            status: error.response?.status,
            data: error.response?.data,
          });
          if (error.response?.status === 429) {
            return res.status(429).json({
              message:
                "ClaimBuster API rate limit exceeded. Please try again later.",
            });
          }
          if (error.response?.status === 403) {
            return res.status(403).json({
              message:
                "Invalid ClaimBuster API key. Please contact the administrator.",
            });
          }
        }
        // Continue with empty fact-check results if the API fails
      }
    }

    // Step 3: Fetch news articles if requested
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
        // Continue with empty news results if the API fails
        newsResults = [];
      }
    }

    // Step 4: Return combined results
    const response = {
      factCheckResults,
      newsResults,
    };

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
    return res.status(500).json({
      message:
        "An error occurred while processing your request. Please try again later.",
    });
  }
};

module.exports = { factCheck };
