const { analyzeIndicators } = require("./indicators");

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function getLevel(score) {
  if (score >= 95) return "RARO";
  if (score >= 90) return "ELITE";
  if (score >= 85) return "PREMIUM";
  if (score >= 75) return "BOM";
  return "AGUARDAR";
}

function isUpTrend(indicators) {
  return String(indicators?.trend || "").toUpperCase() === "ALTA";
}

function isDownTrend(indicators) {
  return String(indicators?.trend || "").toUpperCase() === "BAIXA";
}

function isNeutralTrend(indicators) {
  return String(indicators?.trend || "").toUpperCase() === "NEUTRA";
}

function isBullishEma(indicators) {
  const ema20 = toNumber(indicators?.ema20);
  const ema50 = toNumber(indicators?.ema50);
  const ema200 = toNumber(indicators?.ema200);

  return ema20 > ema50 && ema50 > ema200;
}

function isBearishEma(indicators) {
  const ema20 = toNumber(indicators?.ema20);
  const ema50 = toNumber(indicators?.ema50);
  const ema200 = toNumber(indicators?.ema200);

  return ema20 < ema50 && ema50 < ema200;
}

function isMixedEma(indicators) {
  const ema20 = toNumber(indicators?.ema20);
  const ema50 = toNumber(indicators?.ema50);
  const ema200 = toNumber(indicators?.ema200);

  if (!ema20 || !ema50 || !ema200) return true;

  const bullish = isBullishEma(indicators);
  const bearish = isBearishEma(indicators);

  return !bullish && !bearish;
}

function getMacdSignal(indicators) {
  return String(indicators?.macdSignal || "").toUpperCase();
}

function getMomentum(indicators) {
  return String(indicators?.momentum || "").toUpperCase();
}

function getVolume(indicators) {
  return String(indicators?.volume || "").toUpperCase();
}

function getVolatility(indicators) {
  return String(indicators?.volatility || "").toUpperCase();
}

function getLiquidity(indicators) {
  return String(indicators?.liquidity || "").toUpperCase();
}

function calculateBuyScore(indicators, indicators15m, indicators1h) {
  let score = 45;

  const rsi = toNumber(indicators.rsi);
  const adx = toNumber(indicators.adx);

  if (isUpTrend(indicators)) score += 12;
  if (isDownTrend(indicators)) score -= 16;
  if (isNeutralTrend(indicators)) score -= 12;

  if (isBullishEma(indicators)) score += 14;
  else if (isMixedEma(indicators)) score -= 8;
  else score -= 14;

  if (isUpTrend(indicators15m)) score += 8;
  else score -= 8;

  if (isUpTrend(indicators1h)) score += 12;
  else score -= 12;

  if (isUpTrend(indicators) && isUpTrend(indicators15m) && isUpTrend(indicators1h)) {
    score += 6;
  }

  if (getMacdSignal(indicators) === "COMPRA") score += 8;
  if (getMacdSignal(indicators) === "VENDA") score -= 8;

  if (adx >= 40) score += 12;
  else if (adx >= 30) score += 9;
  else if (adx >= 25) score += 5;
  else if (adx < 20) score -= 12;

  if (rsi >= 50 && rsi <= 68) score += 8;
  else if (rsi >= 45 && rsi < 50) score += 3;
  else if (rsi > 68 && rsi <= 75) score += 2;
  else if (rsi > 75) score -= 10;
  else if (rsi < 35) score -= 6;

  const momentum = getMomentum(indicators);
  if (momentum === "FORTE") score += 8;
  if (momentum === "NEUTRO") score += 3;
  if (momentum === "ESTICADO") score -= 10;
  if (momentum === "FRACO") score -= 7;

  const volume = getVolume(indicators);
  if (volume === "FORTE") score += 8;
  if (volume === "NORMAL") score += 2;

  const volatility = getVolatility(indicators);
  if (volatility === "SAUDAVEL") score += 6;
  if (volatility === "ALTA") score += 2;
  if (volatility === "BAIXA") score -= 5;

  if (getLiquidity(indicators) === "OK") score += 4;

  if (indicators.bos) score += 5;
  if (indicators.choch) score -= 6;

  if (indicators.fvgBullish) score += 4;
  if (indicators.fvgBearish) score -= 6;

  if (indicators.orderBlockBullish) score += 5;
  if (indicators.orderBlockBearish) score -= 8;

  if (indicators.breakerBullish) score += 6;
  if (indicators.breakerBearish) score -= 7;

  if (indicators.liquidityBullish) score += 5;
  if (indicators.liquidityBearish) score -= 6;

  return score;
}

function calculateSellScore(indicators, indicators15m, indicators1h) {
  let score = 45;

  const rsi = toNumber(indicators.rsi);
  const adx = toNumber(indicators.adx);

  if (isDownTrend(indicators)) score += 12;
  if (isUpTrend(indicators)) score -= 16;
  if (isNeutralTrend(indicators)) score -= 12;

  if (isBearishEma(indicators)) score += 14;
  else if (isMixedEma(indicators)) score -= 8;
  else score -= 14;

  if (isDownTrend(indicators15m)) score += 8;
  else score -= 8;

  if (isDownTrend(indicators1h)) score += 12;
  else score -= 12;

  if (isDownTrend(indicators) && isDownTrend(indicators15m) && isDownTrend(indicators1h)) {
    score += 6;
  }

  if (getMacdSignal(indicators) === "VENDA") score += 8;
  if (getMacdSignal(indicators) === "COMPRA") score -= 8;

  if (adx >= 40) score += 12;
  else if (adx >= 30) score += 9;
  else if (adx >= 25) score += 5;
  else if (adx < 20) score -= 12;

  if (rsi >= 32 && rsi <= 50) score += 8;
  else if (rsi > 50 && rsi <= 58) score += 3;
  else if (rsi >= 25 && rsi < 32) score += 2;
  else if (rsi < 25) score -= 10;
  else if (rsi > 65) score -= 6;

  const momentum = getMomentum(indicators);
  if (momentum === "FORTE") score += 8;
  if (momentum === "NEUTRO") score += 3;
  if (momentum === "ESTICADO") score -= 10;
  if (momentum === "FRACO") score -= 7;

  const volume = getVolume(indicators);
  if (volume === "FORTE") score += 8;
  if (volume === "NORMAL") score += 2;

  const volatility = getVolatility(indicators);
  if (volatility === "SAUDAVEL") score += 6;
  if (volatility === "ALTA") score += 2;
  if (volatility === "BAIXA") score -= 5;

  if (getLiquidity(indicators) === "OK") score += 4;

  if (indicators.bos) score += 5;
  if (indicators.choch) score -= 6;

  if (indicators.fvgBearish) score += 4;
  if (indicators.fvgBullish) score -= 6;

  if (indicators.orderBlockBearish) score += 5;
  if (indicators.orderBlockBullish) score -= 8;

  if (indicators.breakerBearish) score += 6;
  if (indicators.breakerBullish) score -= 7;

  if (indicators.liquidityBearish) score += 5;
  if (indicators.liquidityBullish) score -= 6;

  return score;
}

function isEliteBuy(indicators, indicators15m, indicators1h, score) {
  const rsi = toNumber(indicators.rsi);
  const adx = toNumber(indicators.adx);

  return (
    score >= 90 &&
    isUpTrend(indicators) &&
    isUpTrend(indicators15m) &&
    isUpTrend(indicators1h) &&
    isBullishEma(indicators) &&
    toNumber(indicators15m.ema20) > toNumber(indicators15m.ema50) &&
    toNumber(indicators1h.ema20) > toNumber(indicators1h.ema50) &&
    getMacdSignal(indicators) === "COMPRA" &&
    adx >= 30 &&
    rsi >= 52 &&
    rsi <= 68 &&
    (getVolume(indicators) === "FORTE" || getVolume(indicators) === "NORMAL") &&
    getMomentum(indicators) === "FORTE"
  );
}

function isEliteSell(indicators, indicators15m, indicators1h, score) {
  const rsi = toNumber(indicators.rsi);
  const adx = toNumber(indicators.adx);

  return (
    score >= 90 &&
    isDownTrend(indicators) &&
    isDownTrend(indicators15m) &&
    isDownTrend(indicators1h) &&
    isBearishEma(indicators) &&
    toNumber(indicators15m.ema20) < toNumber(indicators15m.ema50) &&
    toNumber(indicators1h.ema20) < toNumber(indicators1h.ema50) &&
    getMacdSignal(indicators) === "VENDA" &&
    adx >= 30 &&
    rsi >= 32 &&
    rsi <= 50 &&
    (getVolume(indicators) === "FORTE" || getVolume(indicators) === "NORMAL") &&
    getMomentum(indicators) === "FORTE"
  );
}

function capScoreByQuality(score, direction, indicators, indicators15m, indicators1h) {
  let finalScore = score;

  const alignedBuy =
    direction === "COMPRA" &&
    isUpTrend(indicators) &&
    isUpTrend(indicators15m) &&
    isUpTrend(indicators1h) &&
    isBullishEma(indicators);

  const alignedSell =
    direction === "VENDA" &&
    isDownTrend(indicators) &&
    isDownTrend(indicators15m) &&
    isDownTrend(indicators1h) &&
    isBearishEma(indicators);

  const eliteBuy = isEliteBuy(indicators, indicators15m, indicators1h, finalScore);
  const eliteSell = isEliteSell(indicators, indicators15m, indicators1h, finalScore);

  if (finalScore >= 90 && !(eliteBuy || eliteSell)) {
    finalScore = 89;
  }

  if (finalScore >= 85 && !(alignedBuy || alignedSell)) {
    finalScore = 82;
  }

  if (isNeutralTrend(indicators) || isMixedEma(indicators)) {
    finalScore = Math.min(finalScore, 78);
  }

  if (getMomentum(indicators) === "FRACO") {
    finalScore = Math.min(finalScore, 72);
  }

  if (toNumber(indicators.adx) < 20) {
    finalScore = Math.min(finalScore, 70);
  }

  return finalScore;
}

function getDirection(score, buyScore, sellScore, indicators, indicators15m, indicators1h) {
  if (score < 75) return "AGUARDAR";

  const difference = Math.abs(buyScore - sellScore);

  if (difference < 8) {
    return "OBSERVAR";
  }

  if (
    buyScore > sellScore &&
    score >= 80 &&
    isUpTrend(indicators) &&
    isUpTrend(indicators15m) &&
    isBullishEma(indicators) &&
    toNumber(indicators.rsi) < 75
  ) {
    return "COMPRA";
  }

  if (
    sellScore > buyScore &&
    score >= 80 &&
    isDownTrend(indicators) &&
    isDownTrend(indicators15m) &&
    isBearishEma(indicators) &&
    toNumber(indicators.rsi) > 25
  ) {
    return "VENDA";
  }

  return "OBSERVAR";
}

function getCandleCount(candles) {
  return Array.isArray(candles) ? candles.length : 0;
}

function calculateScore(ticker, timeframes = {}) {
  const candles = timeframes.candles5m || [];
  const candles15m = timeframes.candles15m || [];
  const candles1h = timeframes.candles1h || [];

  const indicators = analyzeIndicators(ticker, candles);
  const indicators15m = analyzeIndicators(ticker, candles15m);
  const indicators1h = analyzeIndicators(ticker, candles1h);

  const candles5mCount = getCandleCount(candles);
  const candles15mCount = getCandleCount(candles15m);
  const candles1hCount = getCandleCount(candles1h);

  if (candles5mCount < 50 || candles15mCount < 50 || candles1hCount < 50) {
    return {
      indicators,
      indicators15m,
      indicators1h,
      score: 55,
      direction: "AGUARDAR",
      level: "AGUARDAR",
      scoreDetails: {
        reason: "Poucos candles para validar o setup.",
        candles5m: candles5mCount,
        candles15m: candles15mCount,
        candles1h: candles1hCount,
      },
    };
  }

  const buyScore = calculateBuyScore(indicators, indicators15m, indicators1h);
  const sellScore = calculateSellScore(indicators, indicators15m, indicators1h);

  const rawDirection = buyScore >= sellScore ? "COMPRA" : "VENDA";
  const rawScore = Math.max(buyScore, sellScore);

  let score = Math.min(rawScore, 96);
  score = Math.max(score, 40);

  score = capScoreByQuality(score, rawDirection, indicators, indicators15m, indicators1h);
  score = Math.round(score);

  const direction = getDirection(
    score,
    buyScore,
    sellScore,
    indicators,
    indicators15m,
    indicators1h
  );

  return {
    indicators,
    indicators15m,
    indicators1h,
    score,
    direction,
    level: getLevel(score),
    scoreDetails: {
      buyScore: Math.round(buyScore),
      sellScore: Math.round(sellScore),
      rawDirection,
      candles5m: candles5mCount,
      candles15m: candles15mCount,
      candles1h: candles1hCount,
    },
  };
}

module.exports = {
  calculateScore,
  getLevel,
};