const fs = require("fs");
const path = require("path");

const scorePath = path.join(__dirname, "scoreEngine.js");
const backupPath = path.join(__dirname, "scoreEngine.backup_smc.js");

function fail(message) {
  console.log("❌ " + message);
  process.exit(1);
}

function replaceOnce(code, search, replacement, label) {
  if (!code.includes(search)) {
    fail(`Não encontrei o trecho: ${label}`);
  }

  return code.replace(search, replacement);
}

if (!fs.existsSync(scorePath)) {
  fail("scoreEngine.js não encontrado. Coloque este arquivo dentro da pasta SignalProAI-Backend.");
}

let code = fs.readFileSync(scorePath, "utf8").replace(/\r\n/g, "\n");

fs.copyFileSync(scorePath, backupPath);

if (code.includes("function calculateSmcBuyScore")) {
  console.log("✅ O scoreEngine.js já tem SMC. Nenhuma alteração necessária.");
  process.exit(0);
}

const smcFunctions = `
function calculateSmcBuyScore(indicators, indicators15m, indicators1h, candles) {
  let score = 40;

  const rsi = toNumber(indicators.rsi);
  const adx = toNumber(indicators.adx);
  const range = getRangePercent(candles, 20);

  const confirmations = [
    indicators.liquidityBullish,
    indicators.choch,
    indicators.fvgBullish,
    indicators.orderBlockBullish,
    indicators.breakerBullish,
    hasBullishRejection(candles),
    isNearSupport(candles, 0.45),
  ].filter(Boolean).length;

  if (indicators.liquidityBullish) score += 14;
  if (indicators.choch) score += 12;
  if (indicators.fvgBullish) score += 8;
  if (indicators.orderBlockBullish) score += 10;
  if (indicators.breakerBullish) score += 10;
  if (hasBullishRejection(candles)) score += 10;
  if (isNearSupport(candles, 0.45)) score += 8;

  if (confirmations >= 5) score += 10;
  else if (confirmations >= 4) score += 7;
  else if (confirmations >= 3) score += 4;
  else score -= 18;

  if (getMacdSignal(indicators) === "COMPRA") score += 6;
  if (getMacdSignal(indicators) === "VENDA") score -= 8;

  if (rsi >= 32 && rsi <= 55) score += 8;
  else if (rsi > 55 && rsi <= 64) score += 3;
  else if (rsi < 25 || rsi > 72) score -= 8;

  if (isUpTrend(indicators15m)) score += 5;
  if (isUpTrend(indicators1h)) score += 6;
  if (isDownTrend(indicators15m) && isDownTrend(indicators1h) && adx >= 30) score -= 10;

  if (indicators.fvgBearish) score -= 6;
  if (indicators.orderBlockBearish) score -= 7;
  if (indicators.breakerBearish) score -= 7;
  if (indicators.liquidityBearish) score -= 8;

  if (hasHealthyVolume(indicators)) score += 5;
  if (hasHealthyVolatility(indicators)) score += 4;
  if (getLiquidity(indicators) === "OK") score += 3;

  if (range < 0.12) score -= 5;

  return score;
}

function calculateSmcSellScore(indicators, indicators15m, indicators1h, candles) {
  let score = 40;

  const rsi = toNumber(indicators.rsi);
  const adx = toNumber(indicators.adx);
  const range = getRangePercent(candles, 20);

  const confirmations = [
    indicators.liquidityBearish,
    indicators.choch,
    indicators.fvgBearish,
    indicators.orderBlockBearish,
    indicators.breakerBearish,
    hasBearishRejection(candles),
    isNearResistance(candles, 0.45),
  ].filter(Boolean).length;

  if (indicators.liquidityBearish) score += 14;
  if (indicators.choch) score += 12;
  if (indicators.fvgBearish) score += 8;
  if (indicators.orderBlockBearish) score += 10;
  if (indicators.breakerBearish) score += 10;
  if (hasBearishRejection(candles)) score += 10;
  if (isNearResistance(candles, 0.45)) score += 8;

  if (confirmations >= 5) score += 10;
  else if (confirmations >= 4) score += 7;
  else if (confirmations >= 3) score += 4;
  else score -= 18;

  if (getMacdSignal(indicators) === "VENDA") score += 6;
  if (getMacdSignal(indicators) === "COMPRA") score -= 8;

  if (rsi >= 45 && rsi <= 68) score += 8;
  else if (rsi >= 36 && rsi < 45) score += 3;
  else if (rsi < 28 || rsi > 75) score -= 8;

  if (isDownTrend(indicators15m)) score += 5;
  if (isDownTrend(indicators1h)) score += 6;
  if (isUpTrend(indicators15m) && isUpTrend(indicators1h) && adx >= 30) score -= 10;

  if (indicators.fvgBullish) score -= 6;
  if (indicators.orderBlockBullish) score -= 7;
  if (indicators.breakerBullish) score -= 7;
  if (indicators.liquidityBullish) score -= 8;

  if (hasHealthyVolume(indicators)) score += 5;
  if (hasHealthyVolatility(indicators)) score += 4;
  if (getLiquidity(indicators) === "OK") score += 3;

  if (range < 0.12) score -= 5;

  return score;
}
`;

const capSmcFunction = `
function capSmcScore(score, direction, indicators, indicators15m, indicators1h, candles) {
  let finalScore = score;

  const bullishConfirmations = [
    indicators.liquidityBullish,
    indicators.choch,
    indicators.fvgBullish,
    indicators.orderBlockBullish,
    indicators.breakerBullish,
    hasBullishRejection(candles),
    isNearSupport(candles, 0.45),
  ].filter(Boolean).length;

  const bearishConfirmations = [
    indicators.liquidityBearish,
    indicators.choch,
    indicators.fvgBearish,
    indicators.orderBlockBearish,
    indicators.breakerBearish,
    hasBearishRejection(candles),
    isNearResistance(candles, 0.45),
  ].filter(Boolean).length;

  const bullishQuality =
    direction === "COMPRA" &&
    bullishConfirmations >= 3 &&
    (indicators.liquidityBullish || indicators.choch) &&
    (indicators.fvgBullish || indicators.orderBlockBullish || indicators.breakerBullish) &&
    (hasBullishRejection(candles) || isNearSupport(candles, 0.45));

  const bearishQuality =
    direction === "VENDA" &&
    bearishConfirmations >= 3 &&
    (indicators.liquidityBearish || indicators.choch) &&
    (indicators.fvgBearish || indicators.orderBlockBearish || indicators.breakerBearish) &&
    (hasBearishRejection(candles) || isNearResistance(candles, 0.45));

  if (finalScore >= 90 && !(bullishQuality || bearishQuality)) {
    finalScore = 89;
  }

  if (finalScore >= 86 && !(bullishQuality || bearishQuality)) {
    finalScore = 84;
  }

  if (direction === "COMPRA" && isDownTrend(indicators15m) && isDownTrend(indicators1h)) {
    finalScore = Math.min(finalScore, 82);
  }

  if (direction === "VENDA" && isUpTrend(indicators15m) && isUpTrend(indicators1h)) {
    finalScore = Math.min(finalScore, 82);
  }

  if (getLiquidity(indicators) === "BAIXA" && finalScore >= 86) {
    finalScore = 84;
  }

  return finalScore;
}
`;

code = replaceOnce(
  code,
  "function isEliteTrendBuy(indicators, indicators15m, indicators1h, score) {",
  `${smcFunctions}\nfunction isEliteTrendBuy(indicators, indicators15m, indicators1h, score) {`,
  "inserir funções de score SMC"
);

code = replaceOnce(
  code,
  "function normalizeScore(score) {",
  `${capSmcFunction}\nfunction normalizeScore(score) {`,
  "inserir capSmcScore"
);

code = replaceOnce(
  code,
  `  if (setupType === "SCALPING") {
    finalScore = capScalpingScore(
      finalScore,
      direction,
      indicators,
      indicators15m,
      indicators1h,
      candlesFast,
      candles,
      profile
    );
  }

  finalScore = normalizeScore(finalScore);`,
  `  if (setupType === "SCALPING") {
    finalScore = capScalpingScore(
      finalScore,
      direction,
      indicators,
      indicators15m,
      indicators1h,
      candlesFast,
      candles,
      profile
    );
  }

  if (setupType === "SMC") {
    finalScore = capSmcScore(
      finalScore,
      direction,
      indicators,
      indicators15m,
      indicators1h,
      candles
    );
  }

  finalScore = normalizeScore(finalScore);`,
  "adicionar cap SMC no createCandidate"
);

code = replaceOnce(
  code,
  `  if (candidate.setupType === "TENDENCIA" && candidate.score < 80) {
    return "OBSERVAR";
  }

  return candidate.direction;`,
  `  if (candidate.setupType === "TENDENCIA" && candidate.score < 80) {
    return "OBSERVAR";
  }

  if (candidate.setupType === "SMC" && candidate.score < 84) {
    return "OBSERVAR";
  }

  return candidate.direction;`,
  "adicionar regra final de SMC"
);

code = replaceOnce(
  code,
  `  const scalpingSellScore = calculateScalpingSellScore(
    indicatorsFast,
    indicators15m,
    indicators1h,
    candlesFast,
    candles
  );

  const candidates = [`,
  `  const scalpingSellScore = calculateScalpingSellScore(
    indicatorsFast,
    indicators15m,
    indicators1h,
    candlesFast,
    candles
  );

  const smcBuyScore = calculateSmcBuyScore(indicators, indicators15m, indicators1h, candles);
  const smcSellScore = calculateSmcSellScore(indicators, indicators15m, indicators1h, candles);

  const candidates = [`,
  "calcular smcBuyScore e smcSellScore"
);

code = replaceOnce(
  code,
  `    createCandidate({
      setupType: "SCALPING",
      direction: "VENDA",
      score: scalpingSellScore,
      oppositeScore: scalpingBuyScore,
      profile,
      indicators: indicatorsFast,
      indicators15m,
      indicators1h,
      candles,
      candlesFast,
    }),
  ];`,
  `    createCandidate({
      setupType: "SCALPING",
      direction: "VENDA",
      score: scalpingSellScore,
      oppositeScore: scalpingBuyScore,
      profile,
      indicators: indicatorsFast,
      indicators15m,
      indicators1h,
      candles,
      candlesFast,
    }),

    createCandidate({
      setupType: "SMC",
      direction: "COMPRA",
      score: smcBuyScore,
      oppositeScore: smcSellScore,
      profile,
      indicators,
      indicators15m,
      indicators1h,
      candles,
      candlesFast,
    }),

    createCandidate({
      setupType: "SMC",
      direction: "VENDA",
      score: smcSellScore,
      oppositeScore: smcBuyScore,
      profile,
      indicators,
      indicators15m,
      indicators1h,
      candles,
      candlesFast,
    }),
  ];`,
  "adicionar candidatos SMC"
);

code = replaceOnce(
  code,
  `      scalpingBuyScore: Math.round(scalpingBuyScore),
      scalpingSellScore: Math.round(scalpingSellScore),

      candidates,`,
  `      scalpingBuyScore: Math.round(scalpingBuyScore),
      scalpingSellScore: Math.round(scalpingSellScore),

      smcBuyScore: Math.round(smcBuyScore),
      smcSellScore: Math.round(smcSellScore),

      candidates,`,
  "adicionar scores SMC nos detalhes"
);

fs.writeFileSync(scorePath, code, "utf8");

console.log("✅ SMC aplicado no scoreEngine.js");
console.log("✅ Backup criado em scoreEngine.backup_smc.js");
console.log("Agora rode: node server.js");