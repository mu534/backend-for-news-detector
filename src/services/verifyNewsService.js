const axios = require("axios");
const cheerio = require("cheerio");
const Result = require("../models/Result");

const extractTextFromUrl = async (url) => {
  try {
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);
    const text = $("p, h1, h2, h3, h4, h5, h6")
      .map((i, el) => $(el).text())
      .get()
      .join(" ");
    if (!text) throw new Error("No text extracted from URL");
    return text;
  } catch (error) {
    throw new Error("Failed to fetch or parse URL");
  }
};

const verifyNews = async (input, userId) => {
  let textToVerify = input;

  // If input is a URL, fetch and extract text
  if (/^https?:\/\//i.test(input)) {
    textToVerify = await extractTextFromUrl(input);
  }

  // Call ClaimBuster API
  const API_KEY = process.env.CLAIMBUSTER_API_KEY;
  if (!API_KEY) {
    throw new Error("CLAIMBUSTER_API_KEY is not defined");
  }

  try {
    const response = await axios.post(
      "https://idir.uta.edu/claimbuster/api/v1/score/text/",
      { input_text: textToVerify },
      { headers: { "x-api-key": API_KEY, "Content-Type": "application/json" } }
    );

    const score = response.data.score;

    // Save result to MongoDB
    const result = new Result({
      userId,
      input,
      text: textToVerify,
      score,
    });
    await result.save();

    return { score, text: textToVerify };
  } catch (error) {
    throw new Error("ClaimBuster API call failed");
  }
};

module.exports = { verifyNews };
