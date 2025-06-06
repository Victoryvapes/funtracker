const axios = require('axios');

// Global error handlers to catch unhandled exceptions and rejections
process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection:", reason);
});

const WEBHOOK_URL =// Replace with your webhook
const CHECK_INTERVAL_MS = 30_000; // 30 seconds interval for checking tokens
const checkedTokens = new Set();

// Function to pause execution for a certain period
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Function to fetch token profiles from DexScreener
async function getTokenProfiles() {
  const res = await axios.get('https://api.dexscreener.com/token-profiles/latest/v1');
  return res.data.filter(
    (t) => t.chainId === 'solana' &&
           t.tokenAddress.toLowerCase().endsWith('bonk') &&
           !checkedTokens.has(t.tokenAddress)
  );
}

// Function to fetch data for a specific token address
async function getTokenData(tokenAddress) {
  try {
    const res = await axios.get(`https://api.dexscreener.com/tokens/v1/solana/${tokenAddress}`);
    return res.data?.[0];
  } catch (err) {
    console.error(`❌ Failed to fetch token data for ${tokenAddress}:`, err.message);
    return null;
  }
}

// Function to check if the token is eligible based on specific conditions
function isEligible(token) {
  const ageMin = (Date.now() - token.pairCreatedAt) / 60000; // Calculate token age in minutes
  return token.marketCap > 15000 && ageMin < 180; // Token must have market cap > 15k and age < 10 minutes
}

// Function to send the token data to Discord via webhook
async function sendToDiscord(token) {
  const photonLink = `https://photon-sol.tinyastro.io/en/lp/${token.pairAddress}`;
  const embed = {
    title: `${token.baseToken.name} (${token.baseToken.symbol})`,
    url: token.url,
    thumbnail: { url: token.info?.imageUrl },
    fields: [
      { name: "Market Cap", value: `$${Math.round(token.marketCap)}`, inline: true },
      { name: "Price (USD)", value: `$${token.priceUsd}`, inline: true },
      { name: "Liquidity", value: `$${Math.round(token.liquidity?.usd)}`, inline: true },
      { name: "Contract Address", value: `\`${token.baseToken.address}\`` },
      { name: "Photon Link", value: `[Open in Photon](${photonLink})` },
    ],
    timestamp: new Date().toISOString(),
    color: 0xffa500,
  };

  await axios.post(WEBHOOK_URL, { embeds: [embed] });
  console.log(`✅ Alert sent for: ${token.baseToken.name}`);
}

// Main function to check tokens and send alerts
async function runCheck() {
  const tokens = await getTokenProfiles();

  for (const t of tokens) {
    const tokenAddress = t.tokenAddress;

    // Skip if already checked
    if (checkedTokens.has(tokenAddress)) continue;

    const data = await getTokenData(tokenAddress);
    if (data && isEligible(data)) {
      await sendToDiscord(data);
      checkedTokens.add(tokenAddress); // Only mark as checked if alert is sent
    }

    await sleep(1500); // Avoid burst API calls
  }
}

// Loop forever and keep checking tokens
(async function loopForever() {
  while (true) {
    console.log("🔄 Checking for new bonk tokens...");
    console.log(`⏰ Time: ${new Date().toLocaleTimeString()}`);
    try {
      await runCheck();
    } catch (e) {
      console.error("❌ Error during check:", e.message);
    }
    await sleep(CHECK_INTERVAL_MS); // Wait for the defined interval before the next check
  }
})();
