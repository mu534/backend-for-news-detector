const { google } = require("googleapis");
const axios = require("axios");

const factCheck = async (req, res, next) => {
  let { query } = req.body;

  if (!query) {
    return res
      .status(400)
      .json({ message: "Please provide a query to fact-check" });
  }

  // Preprocess the query
  query = query.trim().replace(/\s+/g, " ");

  try {
    // Step 1: Try Google Fact Check Tools API
    const factCheckTools = google.factchecktools({
      version: "v1alpha1",
      auth: process.env.GOOGLE_API_KEY,
    });
    const response = await factCheckTools.claims.search({
      query: query,
      pageSize: 10,
    });

    const claims = response.data.claims || [];
    if (claims.length > 0) {
      const results = claims.map((claim) => ({
        text: claim.text,
        claimant: claim.claimant,
        claimDate: claim.claimDate,
        factCheck:
          claim.claimReview?.map((review) => ({
            publisher: review.publisher?.name,
            url: review.url,
            title: review.title,
            rating: review.textualRating,
          })) || [],
      }));
      return res.status(200).json({ message: "Fact-check results", results });
    }

    // Step 2: Fallback to ClaimBuster if no results from Google
    const claimBusterResponse = await axios.post(
      "https://idir.uta.edu/claimbuster/api/v1/score/text/",
      { text: query },
      { headers: { "x-api-key": process.env.CLAIMBUSTER_API_KEY } }
    );

    const claimBusterResult = claimBusterResponse.data;
    if (claimBusterResult.results && claimBusterResult.results.length > 0) {
      const checkWorthyClaims = claimBusterResult.results
        .filter((result) => result.score > 0.5)
        .map((result) => result.text);
      if (checkWorthyClaims.length > 0) {
        return res.status(200).json({
          message:
            "No fact-checks found, but here are some check-worthy claims to investigate further",
          checkWorthyClaims,
        });
      }
    }

    // Step 3: If no results from either API
    res
      .status(404)
      .json({
        message: "No fact-checks or check-worthy claims found for this query",
      });
  } catch (error) {
    console.error(`Fact-check error for query ${query}:`, error);
    next(error);
  }
};

module.exports = { factCheck };
