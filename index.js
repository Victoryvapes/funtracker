const axios = require('axios');

const WEBHOOK_URL = 'https://discord.com/api/webhooks/1371399420180172852/_8Q6GCxYJXEFV8wHuKUf4d3Z9qkzJFrRY-9h06N9EQHY-8bnWhnO9j448fD15-tSKYpB'; // Replace with your webhook
const CHECK_INTERVAL_MS = 30_000;
const checkedTokens = new Set();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getTokenProfiles() {
  const res = await axios.get('https://api.dexscreener.com/token-profiles/latest/v1');
  return res.data.filter(
    (t) => t.chainId === 'solana' &&
           t.tokenAddress.toLowerCase().endsWith('bonk') &&
           !checkedTokens.has(t.tokenAddress)
  );
}

async function getTokenData(tokenAddress) {
  try {
    const res = await axios.get(`https://api.dexscreener.com/tokens/v1/solana/${tokenAddress}`);
    return res.data?.[0];
  } catch (err) {
    console.error(`Failed to fetch token data for ${tokenAddress}`);
    return null;
  }
}

function isEligible(token) {
  const ageMin = (Date.now() - token.pairCreatedAt) / 60000;
  return token.marketCap > 15000 && ageMin < 10;
}

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

async function runCheck() {
  const tokens = await getTokenProfiles();

  for (const t of tokens) {
    const tokenAddress = t.tokenAddress;
    checkedTokens.add(tokenAddress);

    const data = await getTokenData(tokenAddress);
    if (data && isEligible(data)) {
      await sendToDiscord(data);
    }

    await sleep(1500); // avoid burst API calls
  }
}

(async function loopForever() {
  while (true) {
    console.log("🔄 Checking for new bonk tokens...");
    try {
      await runCheck();
    } catch (e) {
      console.error("❌ Error during check:", e.message);
    }
    await sleep(CHECK_INTERVAL_MS);
  }
})();
