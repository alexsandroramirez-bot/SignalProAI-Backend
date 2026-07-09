const { analyzeIndicators } = require("./indicators");

function toNumber(value) {
  if (value === null || value === undefined || value === "") return 0;

  const number = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function clamp(value, min, max) {
  const number = toNumber(value);
  return Math.max(min, Math.min(max, number));
}

function getLevel(score) {
  if (score >= 95) return "RARO";
  if (score >= 90) return "ELITE";
  if (score >= 85) return "PREMIUM";
  if (score >= 75) return "BOM";
  return "AGUARDAR";
}

function normalizeProfile(value) {
  const normalized = String(value || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  if (normalized.includes("SCALP")) return "SCALPING";
  if (normalized.includes("SWING")) return "SWING";

  return "DAY_TRADE";
}

function isTradeDirection(direction) {
  return direction === "COMPRA" || direction === "VENDA";
}

function isUpTrend(indicators) {
  return String(indicators?.trend || "").toUpperCase() === "ALTA";
}

function isDownTrend(indicators) {
  return String(indicators?.trend || "").toUpperCase() === "BAIXA";
}

function isNeutralTrend(indicators) {
  const trend = String(indicators?.trend || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  return ["NEUTRA", "LATERAL", "INDEFINIDA", ""].includes(trend);
}

function isBullishEma(indicators) {
  const ema20 = toNumber(indicators?.ema20);
  const ema50 = toNumber(indicators?.ema50);
  const ema200 = toNumber(indicators?.ema200);

  if (!ema20 || !ema50 || !ema200) return false;

  return ema20 > ema50 && ema50 > ema200;
}

function isBearishEma(indicators) {
  const ema20 = toNumber(indicators?.ema20);
  const ema50 = toNumber(indicators?.ema50);
  const ema200 = toNumber(indicators?.ema200);

  if (!ema20 || !ema50 || !ema200) return false;

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

function getCandleValue(candle, keys = [], arrayIndex = null) {
  if (!candle) return 0;

  if (typeof candle === "number") return toNumber(candle);

  if (Array.isArray(candle)) {
    return toNumber(candle[arrayIndex ?? candle.length - 1]);
  }

  for (const key of keys) {
    if (candle[key] !== undefined && candle[key] !== null) {
      return toNumber(candle[key]);
    }
  }

  return 0;
}

function getOpen(candle) {
  return getCandleValue(candle, ["open", "o"], 1);
}

function getHigh(candle) {
  return getCandleValue(candle, ["high", "h"], 2);
}

function getLow(candle) {
  return getCandleValue(candle, ["low", "l"], 3);
}

function getClose(candle) {
  return getCandleValue(candle, ["close", "c", "price", "last"], 4);
}

function getLastCandle(candles = []) {
  if (!Array.isArray(candles) || candles.length === 0) return null;
  return candles[candles.length - 1];
}

function getRecentCandles(candles = [], limit = 20) {
  if (!Array.isArray(candles)) return [];
  return candles.slice(-limit);
}

function getMovePercent(candles = [], lookback = 12) {
  if (!Array.isArray(candles) || candles.length < lookback + 1) return 0;

  const recent = candles.slice(-(lookback + 1));
  const firstClose = getClose(recent[0]);
  const lastClose = getClose(recent[recent.length - 1]);

  if (!firstClose || !lastClose) return 0;

  return ((lastClose - firstClose) / firstClose) * 100;
}

function getRangePercent(candles = [], lookback = 20) {
  const recent = getRecentCandles(candles, lookback);

  if (recent.length < 5) return 0;

  const highs = recent.map(getHigh).filter((value) => value > 0);
  const lows = recent.map(getLow).filter((value) => value > 0);
  const lastClose = getClose(recent[recent.length - 1]);

  if (!highs.length || !lows.length || !lastClose) return 0;

  const high = Math.max(...highs);
  const low = Math.min(...lows);

  return ((high - low) / lastClose) * 100;
}

function getSupportResistance(candles = [], lookback = 30) {
  const recent = getRecentCandles(candles, lookback);

  if (recent.length < 10) {
    return {
      support: 0,
      resistance: 0,
      close: 0,
      distanceToSupportPercent: 999,
      distanceToResistancePercent: 999,
    };
  }

  const highs = recent.map(getHigh).filter((value) => value > 0);
  const lows = recent.map(getLow).filter((value) => value > 0);
  const close = getClose(recent[recent.length - 1]);

  if (!highs.length || !lows.length || !close) {
    return {
      support: 0,
      resistance: 0,
      close: 0,
      distanceToSupportPercent: 999,
      distanceToResistancePercent: 999,
    };
  }

  const support = Math.min(...lows);
  const resistance = Math.max(...highs);

  return {
    support,
    resistance,
    close,
    distanceToSupportPercent: Math.abs((close - support) / close) * 100,
    distanceToResistancePercent: Math.abs((resistance - close) / close) * 100,
  };
}

function hasBullishRejection(candles = []) {
  const candle = getLastCandle(candles);

  if (!candle) return false;

  const open = getOpen(candle);
  const high = getHigh(candle);
  const low = getLow(candle);
  const close = getClose(candle);

  if (!open || !high || !low || !close || high <= low) return false;

  const range = high - low;
  const body = Math.max(Math.abs(close - open), range * 0.05);
  const lowerWick = Math.min(open, close) - low;
  const closePosition = (close - low) / range;

  return lowerWick >= body * 1.4 && closePosition >= 0.55;
}

function hasBearishRejection(candles = []) {
  const candle = getLastCandle(candles);

  if (!candle) return false;

  const open = getOpen(candle);
  const high = getHigh(candle);
  const low = getLow(candle);
  const close = getClose(candle);

  if (!open || !high || !low || !close || high <= low) return false;

  const range = high - low;
  const body = Math.max(Math.abs(close - open), range * 0.05);
  const upperWick = high - Math.max(open, close);
  const closePosition = (high - close) / range;

  return upperWick >= body * 1.4 && closePosition >= 0.55;
}

function isNearSupport(candles = [], maxDistancePercent = 0.35) {
  const sr = getSupportResistance(candles);
  return sr.distanceToSupportPercent <= maxDistancePercent;
}

function isNearResistance(candles = [], maxDistancePercent = 0.35) {
  const sr = getSupportResistance(candles);
  return sr.distanceToResistancePercent <= maxDistancePercent;
}

function hasHealthyVolume(indicators) {
  const volume = getVolume(indicators);
  return volume === "FORTE" || volume === "NORMAL";
}

function hasHealthyVolatility(indicators) {
  const volatility = getVolatility(indicators);
  return volatility === "SAUDAVEL" || volatility === "ALTA";
}

function calculateTrendBuyScore(indicators, indicators15m, indicators1h) {
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

  if (getVolume(indicators) === "FORTE") score += 8;
  if (getVolume(indicators) === "NORMAL") score += 2;

  if (getVolatility(indicators) === "SAUDAVEL") score += 6;
  if (getVolatility(indicators) === "ALTA") score += 2;
  if (getVolatility(indicators) === "BAIXA") score -= 5;

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

function calculateTrendSellScore(indicators, indicators15m, indicators1h) {
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

  if (getVolume(indicators) === "FORTE") score += 8;
  if (getVolume(indicators) === "NORMAL") score += 2;

  if (getVolatility(indicators) === "SAUDAVEL") score += 6;
  if (getVolatility(indicators) === "ALTA") score += 2;
  if (getVolatility(indicators) === "BAIXA") score -= 5;

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

function calculateReversalBuyScore(indicators, indicators15m, indicators1h, candles) {
  let score = 42;

  const rsi = toNumber(indicators.rsi);
  const adx = toNumber(indicators.adx);
  const recentMove = getMovePercent(candles, 12);
  const range = getRangePercent(candles, 20);

  if (recentMove <= -0.8) score += 12;
  else if (recentMove <= -0.35) score += 7;
  else if (recentMove > 0.4) score -= 10;

  if (rsi <= 28) score += 15;
  else if (rsi > 28 && rsi <= 35) score += 12;
  else if (rsi > 35 && rsi <= 42) score += 6;
  else if (rsi >= 55) score -= 8;

  if (hasBullishRejection(candles)) score += 13;
  else score -= 8;

  if (isNearSupport(candles)) score += 11;
  else score -= 4;

  if (getMacdSignal(indicators) === "COMPRA") score += 9;
  if (getMacdSignal(indicators) === "VENDA") score -= 5;

  if (getMomentum(indicators) === "FORTE") score += 6;
  if (getMomentum(indicators) === "NEUTRO") score += 3;
  if (getMomentum(indicators) === "FRACO") score -= 5;
  if (getMomentum(indicators) === "ESTICADO") score -= 8;

  if (indicators.choch) score += 9;
  if (indicators.breakerBullish) score += 8;
  if (indicators.orderBlockBullish) score += 7;
  if (indicators.liquidityBullish) score += 7;
  if (indicators.fvgBullish) score += 4;

  if (indicators.breakerBearish) score -= 6;
  if (indicators.orderBlockBearish) score -= 6;
  if (indicators.liquidityBearish) score -= 5;

  if (isUpTrend(indicators15m)) score += 5;
  if (isDownTrend(indicators15m)) score -= 4;

  if (isUpTrend(indicators1h)) score += 6;
  if (isDownTrend(indicators1h)) score -= 8;

  if (adx >= 35 && isDownTrend(indicators1h)) score -= 8;
  if (adx < 15) score -= 5;

  if (hasHealthyVolume(indicators)) score += 5;
  if (hasHealthyVolatility(indicators)) score += 4;
  if (getLiquidity(indicators) === "OK") score += 4;

  if (range < 0.15) score -= 5;

  return score;
}

function calculateReversalSellScore(indicators, indicators15m, indicators1h, candles) {
  let score = 42;

  const rsi = toNumber(indicators.rsi);
  const adx = toNumber(indicators.adx);
  const recentMove = getMovePercent(candles, 12);
  const range = getRangePercent(candles, 20);

  if (recentMove >= 0.8) score += 12;
  else if (recentMove >= 0.35) score += 7;
  else if (recentMove < -0.4) score -= 10;

  if (rsi >= 72) score += 15;
  else if (rsi >= 65 && rsi < 72) score += 12;
  else if (rsi >= 58 && rsi < 65) score += 6;
  else if (rsi <= 45) score -= 8;

  if (hasBearishRejection(candles)) score += 13;
  else score -= 8;

  if (isNearResistance(candles)) score += 11;
  else score -= 4;

  if (getMacdSignal(indicators) === "VENDA") score += 9;
  if (getMacdSignal(indicators) === "COMPRA") score -= 5;

  if (getMomentum(indicators) === "FORTE") score += 6;
  if (getMomentum(indicators) === "NEUTRO") score += 3;
  if (getMomentum(indicators) === "FRACO") score -= 5;
  if (getMomentum(indicators) === "ESTICADO") score -= 8;

  if (indicators.choch) score += 9;
  if (indicators.breakerBearish) score += 8;
  if (indicators.orderBlockBearish) score += 7;
  if (indicators.liquidityBearish) score += 7;
  if (indicators.fvgBearish) score += 4;

  if (indicators.breakerBullish) score -= 6;
  if (indicators.orderBlockBullish) score -= 6;
  if (indicators.liquidityBullish) score -= 5;

  if (isDownTrend(indicators15m)) score += 5;
  if (isUpTrend(indicators15m)) score -= 4;

  if (isDownTrend(indicators1h)) score += 6;
  if (isUpTrend(indicators1h)) score -= 8;

  if (adx >= 35 && isUpTrend(indicators1h)) score -= 8;
  if (adx < 15) score -= 5;

  if (hasHealthyVolume(indicators)) score += 5;
  if (hasHealthyVolatility(indicators)) score += 4;
  if (getLiquidity(indicators) === "OK") score += 4;

  if (range < 0.15) score -= 5;

  return score;
}

function calculateScalpingBuyScore(indicators, indicators15m, indicators1h, candlesFast, candles5m) {
  let score = 43;

  const rsi = toNumber(indicators.rsi);
  const adx = toNumber(indicators.adx);
  const fastMove = getMovePercent(candlesFast, 5);
  const range = getRangePercent(candlesFast, 12);

  if (isUpTrend(indicators)) score += 10;
  if (isDownTrend(indicators)) score -= 12;

  if (isBullishEma(indicators)) score += 10;
  else if (isMixedEma(indicators)) score -= 4;
  else score -= 9;

  if (isUpTrend(indicators15m)) score += 5;
  if (isDownTrend(indicators15m)) score -= 5;

  if (getMacdSignal(indicators) === "COMPRA") score += 10;
  if (getMacdSignal(indicators) === "VENDA") score -= 8;

  if (rsi >= 48 && rsi <= 64) score += 10;
  else if (rsi >= 42 && rsi < 48) score += 4;
  else if (rsi > 64 && rsi <= 70) score += 2;
  else if (rsi > 70) score -= 10;
  else if (rsi < 38) score -= 6;

  if (adx >= 22 && adx <= 45) score += 8;
  else if (adx > 45) score += 3;
  else if (adx < 16) score -= 8;

  if (fastMove > 0 && fastMove <= 0.6) score += 5;
  if (fastMove > 1.2) score -= 6;

  if (hasBullishRejection(candlesFast) || hasBullishRejection(candles5m)) score += 5;

  if (indicators.bos) score += 5;
  if (indicators.fvgBullish) score += 4;
  if (indicators.orderBlockBullish) score += 4;
  if (indicators.breakerBullish) score += 4;
  if (indicators.liquidityBullish) score += 4;

  if (indicators.fvgBearish) score -= 4;
  if (indicators.orderBlockBearish) score -= 5;
  if (indicators.breakerBearish) score -= 5;

  if (getMomentum(indicators) === "FORTE") score += 8;
  if (getMomentum(indicators) === "NEUTRO") score += 3;
  if (getMomentum(indicators) === "FRACO") score -= 6;
  if (getMomentum(indicators) === "ESTICADO") score -= 8;

  if (hasHealthyVolume(indicators)) score += 7;
  if (hasHealthyVolatility(indicators)) score += 4;
  if (getLiquidity(indicators) === "OK") score += 4;

  if (range < 0.08) score -= 5;

  if (isDownTrend(indicators1h) && !isUpTrend(indicators15m)) score -= 6;

  return score;
}

function calculateScalpingSellScore(indicators, indicators15m, indicators1h, candlesFast, candles5m) {
  let score = 43;

  const rsi = toNumber(indicators.rsi);
  const adx = toNumber(indicators.adx);
  const fastMove = getMovePercent(candlesFast, 5);
  const range = getRangePercent(candlesFast, 12);

  if (isDownTrend(indicators)) score += 10;
  if (isUpTrend(indicators)) score -= 12;

  if (isBearishEma(indicators)) score += 10;
  else if (isMixedEma(indicators)) score -= 4;
  else score -= 9;

  if (isDownTrend(indicators15m)) score += 5;
  if (isUpTrend(indicators15m)) score -= 5;

  if (getMacdSignal(indicators) === "VENDA") score += 10;
  if (getMacdSignal(indicators) === "COMPRA") score -= 8;

  if (rsi >= 36 && rsi <= 52) score += 10;
  else if (rsi > 52 && rsi <= 58) score += 4;
  else if (rsi >= 30 && rsi < 36) score += 2;
  else if (rsi < 30) score -= 10;
  else if (rsi > 62) score -= 6;

  if (adx >= 22 && adx <= 45) score += 8;
  else if (adx > 45) score += 3;
  else if (adx < 16) score -= 8;

  if (fastMove < 0 && fastMove >= -0.6) score += 5;
  if (fastMove < -1.2) score -= 6;

  if (hasBearishRejection(candlesFast) || hasBearishRejection(candles5m)) score += 5;

  if (indicators.bos) score += 5;
  if (indicators.fvgBearish) score += 4;
  if (indicators.orderBlockBearish) score += 4;
  if (indicators.breakerBearish) score += 4;
  if (indicators.liquidityBearish) score += 4;

  if (indicators.fvgBullish) score -= 4;
  if (indicators.orderBlockBullish) score -= 5;
  if (indicators.breakerBullish) score -= 5;

  if (getMomentum(indicators) === "FORTE") score += 8;
  if (getMomentum(indicators) === "NEUTRO") score += 3;
  if (getMomentum(indicators) === "FRACO") score -= 6;
  if (getMomentum(indicators) === "ESTICADO") score -= 8;

  if (hasHealthyVolume(indicators)) score += 7;
  if (hasHealthyVolatility(indicators)) score += 4;
  if (getLiquidity(indicators) === "OK") score += 4;

  if (range < 0.08) score -= 5;

  if (isUpTrend(indicators1h) && !isDownTrend(indicators15m)) score -= 6;

  return score;
}

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

function isEliteTrendBuy(indicators, indicators15m, indicators1h, score) {
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
    hasHealthyVolume(indicators) &&
    getMomentum(indicators) === "FORTE"
  );
}

function isEliteTrendSell(indicators, indicators15m, indicators1h, score) {
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
    hasHealthyVolume(indicators) &&
    getMomentum(indicators) === "FORTE"
  );
}

function capTrendScore(score, direction, indicators, indicators15m, indicators1h) {
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

  const eliteBuy = isEliteTrendBuy(indicators, indicators15m, indicators1h, finalScore);
  const eliteSell = isEliteTrendSell(indicators, indicators15m, indicators1h, finalScore);

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

function capReversalScore(score, direction, indicators, indicators15m, indicators1h, candles) {
  let finalScore = score;

  const bullishQuality =
    direction === "COMPRA" &&
    hasBullishRejection(candles) &&
    isNearSupport(candles) &&
    toNumber(indicators.rsi) <= 42 &&
    getMacdSignal(indicators) !== "VENDA" &&
    (indicators.choch ||
      indicators.breakerBullish ||
      indicators.orderBlockBullish ||
      indicators.liquidityBullish);

  const bearishQuality =
    direction === "VENDA" &&
    hasBearishRejection(candles) &&
    isNearResistance(candles) &&
    toNumber(indicators.rsi) >= 58 &&
    getMacdSignal(indicators) !== "COMPRA" &&
    (indicators.choch ||
      indicators.breakerBearish ||
      indicators.orderBlockBearish ||
      indicators.liquidityBearish);

  if (finalScore >= 90 && !(bullishQuality || bearishQuality)) {
    finalScore = 89;
  }

  if (finalScore >= 86 && !(bullishQuality || bearishQuality)) {
    finalScore = 84;
  }

  if (direction === "COMPRA" && isDownTrend(indicators1h) && toNumber(indicators.adx) >= 35) {
    finalScore = Math.min(finalScore, 82);
  }

  if (direction === "VENDA" && isUpTrend(indicators1h) && toNumber(indicators.adx) >= 35) {
    finalScore = Math.min(finalScore, 82);
  }

  if (direction === "COMPRA" && !hasBullishRejection(candles)) {
    finalScore = Math.min(finalScore, 78);
  }

  if (direction === "VENDA" && !hasBearishRejection(candles)) {
    finalScore = Math.min(finalScore, 78);
  }

  if (getVolume(indicators) !== "FORTE" && finalScore >= 90) {
    finalScore = 89;
  }

  return finalScore;
}

function capScalpingScore(
  score,
  direction,
  indicators,
  indicators15m,
  indicators1h,
  candlesFast,
  candles5m,
  profile
) {
  let finalScore = score;

  const bullishQuality =
    direction === "COMPRA" &&
    isUpTrend(indicators) &&
    getMacdSignal(indicators) === "COMPRA" &&
    toNumber(indicators.rsi) >= 45 &&
    toNumber(indicators.rsi) <= 68 &&
    hasHealthyVolume(indicators) &&
    hasHealthyVolatility(indicators);

  const bearishQuality =
    direction === "VENDA" &&
    isDownTrend(indicators) &&
    getMacdSignal(indicators) === "VENDA" &&
    toNumber(indicators.rsi) >= 32 &&
    toNumber(indicators.rsi) <= 55 &&
    hasHealthyVolume(indicators) &&
    hasHealthyVolatility(indicators);

  if (profile !== "SCALPING") {
    finalScore = Math.min(finalScore, 82);
  }

  if (finalScore >= 90 && !(bullishQuality || bearishQuality)) {
    finalScore = 89;
  }

  if (finalScore >= 86 && !(bullishQuality || bearishQuality)) {
    finalScore = 84;
  }

  if (toNumber(indicators.adx) < 16) {
    finalScore = Math.min(finalScore, 76);
  }

  if (getRangePercent(candlesFast, 12) < 0.08) {
    finalScore = Math.min(finalScore, 78);
  }

  if (direction === "COMPRA" && isDownTrend(indicators15m) && isDownTrend(indicators1h)) {
    finalScore = Math.min(finalScore, 80);
  }

  if (direction === "VENDA" && isUpTrend(indicators15m) && isUpTrend(indicators1h)) {
    finalScore = Math.min(finalScore, 80);
  }

  return finalScore;
}

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

function normalizeScore(score) {
  return Math.round(clamp(score, 40, 96));
}

function normalizeDetailScore(score) {
  return Math.round(clamp(score, 0, 100));
}

function getProfileOpportunityThresholds(profile) {
  if (profile === "SCALPING") {
    return {
      observe: 68,
      preparing: 76,
      entry: 86,
    };
  }

  if (profile === "SWING") {
    return {
      observe: 78,
      preparing: 85,
      entry: 90,
    };
  }

  return {
    observe: 72,
    preparing: 80,
    entry: 88,
  };
}

function getBiasVotes(indicators, weight = 1) {
  let bullish = 0;
  let bearish = 0;

  if (isUpTrend(indicators)) bullish += 2 * weight;
  if (isDownTrend(indicators)) bearish += 2 * weight;

  if (isBullishEma(indicators)) bullish += 2 * weight;
  if (isBearishEma(indicators)) bearish += 2 * weight;

  if (getMacdSignal(indicators) === "COMPRA") bullish += 1 * weight;
  if (getMacdSignal(indicators) === "VENDA") bearish += 1 * weight;

  if (indicators?.bosBullish || indicators?.structure === "ALTA") bullish += 1 * weight;
  if (indicators?.bosBearish || indicators?.structure === "BAIXA") bearish += 1 * weight;

  if (indicators?.liquidityBullish || indicators?.orderBlockBullish || indicators?.fvgBullish) {
    bullish += 1 * weight;
  }

  if (indicators?.liquidityBearish || indicators?.orderBlockBearish || indicators?.fvgBearish) {
    bearish += 1 * weight;
  }

  return { bullish, bearish };
}

function getMarketBias(indicators, indicatorsFast, indicators15m, indicators1h, profile) {
  const fastWeight = profile === "SCALPING" ? 1.4 : 0.7;
  const mainWeight = profile === "SCALPING" ? 1.2 : 1.4;
  const m15Weight = profile === "SCALPING" ? 0.9 : 1.3;
  const h1Weight = profile === "SCALPING" ? 0.5 : 1.2;

  const fast = getBiasVotes(indicatorsFast, fastWeight);
  const main = getBiasVotes(indicators, mainWeight);
  const m15 = getBiasVotes(indicators15m, m15Weight);
  const h1 = getBiasVotes(indicators1h, h1Weight);

  const bullish = fast.bullish + main.bullish + m15.bullish + h1.bullish;
  const bearish = fast.bearish + main.bearish + m15.bearish + h1.bearish;
  const diff = bullish - bearish;

  let bias = "LATERAL";

  if (diff >= 3) bias = "ALTA";
  if (diff <= -3) bias = "BAIXA";

  return {
    bias,
    bullishScore: Math.round(bullish),
    bearishScore: Math.round(bearish),
    confidence: Math.round(clamp(50 + Math.abs(diff) * 5, 0, 100)),
  };
}

function getEntryType(candidate, indicators, indicatorsFast, candles, candlesFast, profile) {
  const direction = candidate?.direction;
  const setupType = candidate?.setupType;

  if (setupType === "SMC") return "SMC";

  if (setupType === "REVERSAO") {
    if (
      (direction === "COMPRA" && indicators?.liquidityBullish) ||
      (direction === "VENDA" && indicators?.liquidityBearish)
    ) {
      return "REVERSAO_LIQUIDEZ";
    }

    return "REVERSAO";
  }

  if (setupType === "SCALPING") {
    const rangeFast = getRangePercent(candlesFast, 12);
    const fastMove = getMovePercent(candlesFast, 5);

    if (rangeFast > 0 && rangeFast < 0.18) return "SCALPING_RANGE";

    if (direction === "COMPRA" && fastMove > 0.12) return "ROMPIMENTO";
    if (direction === "VENDA" && fastMove < -0.12) return "ROMPIMENTO";

    if (
      (direction === "COMPRA" && (hasBullishRejection(candlesFast) || indicatorsFast?.bullishRejection)) ||
      (direction === "VENDA" && (hasBearishRejection(candlesFast) || indicatorsFast?.bearishRejection))
    ) {
      return "PULLBACK";
    }

    return "SCALPING";
  }

  if (setupType === "TENDENCIA") {
    if (
      (direction === "COMPRA" && (indicators?.bosBullish || indicators?.structure === "ALTA")) ||
      (direction === "VENDA" && (indicators?.bosBearish || indicators?.structure === "BAIXA"))
    ) {
      return "ROMPIMENTO";
    }

    if (
      (direction === "COMPRA" && isNearSupport(candles, 0.45)) ||
      (direction === "VENDA" && isNearResistance(candles, 0.45))
    ) {
      return "PULLBACK";
    }

    return "RETESTE";
  }

  return "AGUARDAR";
}

function getOpportunityStatus(candidate, finalDirection, profile) {
  const thresholds = getProfileOpportunityThresholds(profile);
  const score = toNumber(candidate?.score);

  if (!candidate || score < thresholds.observe) return "AGUARDAR";

  if (isTradeDirection(finalDirection) && score >= thresholds.entry) {
    return "ENTRADA";
  }

  if (score >= thresholds.preparing) {
    return "PREPARANDO";
  }

  return "OBSERVAR";
}

function getAiReason({ candidate, marketBias, entryType, indicators, indicatorsFast }) {
  const setupType = candidate?.setupType || "AGUARDAR";
  const direction = candidate?.direction || "AGUARDAR";

  if (setupType === "AGUARDAR") {
    return "Nenhum setup com força suficiente no momento.";
  }

  const reasons = [];

  if (marketBias?.bias === "ALTA") reasons.push("viés principal de alta");
  if (marketBias?.bias === "BAIXA") reasons.push("viés principal de baixa");
  if (marketBias?.bias === "LATERAL") reasons.push("mercado lateral ou sem direção limpa");

  if (entryType === "ROMPIMENTO") reasons.push("rompimento de estrutura/pivô recente");
  if (entryType === "PULLBACK") reasons.push("pullback em região técnica");
  if (entryType === "RETESTE") reasons.push("possível reteste de região rompida");
  if (entryType === "REVERSAO") reasons.push("possível reversão após movimento esticado");
  if (entryType === "REVERSAO_LIQUIDEZ") reasons.push("varredura de liquidez com tentativa de reversão");
  if (entryType === "SCALPING_RANGE") reasons.push("scalping em faixa curta de preço");
  if (entryType === "SMC") reasons.push("confluência de Smart Money");

  if (getMacdSignal(indicators) === direction) reasons.push(`MACD a favor da ${direction.toLowerCase()}`);
  if (getMacdSignal(indicatorsFast) === direction) reasons.push(`M1/M5 confirmando ${direction.toLowerCase()}`);

  if (indicators?.liquidityBullish && direction === "COMPRA") reasons.push("liquidez compradora detectada");
  if (indicators?.liquidityBearish && direction === "VENDA") reasons.push("liquidez vendedora detectada");

  if (indicators?.fvgBullish && direction === "COMPRA") reasons.push("FVG comprador recente");
  if (indicators?.fvgBearish && direction === "VENDA") reasons.push("FVG vendedor recente");

  if (indicators?.orderBlockBullish && direction === "COMPRA") reasons.push("order block comprador");
  if (indicators?.orderBlockBearish && direction === "VENDA") reasons.push("order block vendedor");

  return reasons.length
    ? `${direction}: ${reasons.join(", ")}.`
    : `${direction}: setup ${setupType} com score em desenvolvimento.`;
}

function getMissingConfirmation({ status, candidate, entryType, marketBias }) {
  const direction = candidate?.direction || "AGUARDAR";
  const score = toNumber(candidate?.score);

  if (status === "ENTRADA") {
    return "Entrada validada pelo score e pelas confirmações principais.";
  }

  if (status === "AGUARDAR") {
    return "Aguardando score mínimo e direção mais clara.";
  }

  if (status === "OBSERVAR") {
    return "Ativo começou a ficar interessante, mas ainda precisa de mais confluência.";
  }

  if (entryType === "ROMPIMENTO") {
    return `Aguardando candle confirmar o rompimento e manter força para ${direction}.`;
  }

  if (entryType === "PULLBACK") {
    return `Aguardando pullback terminar e candle de confirmação para ${direction}.`;
  }

  if (entryType === "RETESTE") {
    return `Aguardando reteste respeitar a região rompida para ${direction}.`;
  }

  if (entryType === "REVERSAO" || entryType === "REVERSAO_LIQUIDEZ") {
    return `Aguardando confirmação de reversão para ${direction}, sem voltar contra a estrutura.`;
  }

  if (entryType === "SCALPING_RANGE") {
    return `Aguardando rompimento curto do range ou rejeição clara para ${direction}.`;
  }

  if (entryType === "SMC") {
    return `Aguardando confirmação SMC adicional para ${direction}, como CHOCH/BOS, FVG ou rejeição.`;
  }

  if (marketBias?.bias === "LATERAL") {
    return "Mercado lateral; precisa romper ou rejeitar uma região com clareza.";
  }

  return `Score atual ${score}; falta confirmação para virar entrada.`;
}

function buildAiAnalysis({
  ticker,
  candidate,
  finalDirection,
  score,
  profile,
  indicators,
  indicatorsFast,
  indicators15m,
  indicators1h,
  candles,
  candlesFast,
}) {
  const marketBias = getMarketBias(indicators, indicatorsFast, indicators15m, indicators1h, profile);
  const entryType = getEntryType(candidate, indicators, indicatorsFast, candles, candlesFast, profile);
  const opportunityStatus = getOpportunityStatus(candidate, finalDirection, profile);

  const sr = getSupportResistance(candles, 30);
  const currentPrice = toNumber(ticker?.price) || sr.close || toNumber(indicators?.price);

  let entryZone = currentPrice;
  let invalidation = 0;
  let targetZone = 0;

  if (candidate?.direction === "COMPRA") {
    invalidation = sr.support || 0;
    targetZone = sr.resistance || 0;
  }

  if (candidate?.direction === "VENDA") {
    invalidation = sr.resistance || 0;
    targetZone = sr.support || 0;
  }

  const aiReason = getAiReason({
    candidate,
    marketBias,
    entryType,
    indicators,
    indicatorsFast,
  });

  const missingConfirmation = getMissingConfirmation({
    status: opportunityStatus,
    candidate,
    entryType,
    marketBias,
  });

  return {
    opportunityStatus,
    marketBias: marketBias.bias,
    marketBiasConfidence: marketBias.confidence,
    bullishBiasScore: marketBias.bullishScore,
    bearishBiasScore: marketBias.bearishScore,

    entryType,
    aiDirection: candidate?.direction || "AGUARDAR",
    aiScore: normalizeDetailScore(score),

    entryZone,
    invalidation,
    targetZone,

    aiReason,
    reason: aiReason,
    missingConfirmation,

    profile,
    selectedSetup: candidate?.setupType || "AGUARDAR",
    selectedDirection: candidate?.direction || "AGUARDAR",
  };
}

function createCandidate({
  setupType,
  direction,
  score,
  oppositeScore,
  profile,
  indicators,
  indicators15m,
  indicators1h,
  candles,
  candlesFast,
}) {
  let finalScore = normalizeScore(score);

  if (setupType === "TENDENCIA") {
    finalScore = capTrendScore(finalScore, direction, indicators, indicators15m, indicators1h);
  }

  if (setupType === "REVERSAO") {
    finalScore = capReversalScore(
      finalScore,
      direction,
      indicators,
      indicators15m,
      indicators1h,
      candles
    );
  }

  if (setupType === "SCALPING") {
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

  finalScore = normalizeScore(finalScore);

  return {
    setupType,
    direction,
    score: finalScore,
    rawScore: Math.round(score),
    oppositeScore: Math.round(oppositeScore),
    difference: Math.abs(Math.round(score) - Math.round(oppositeScore)),
  };
}

function selectBestCandidate(candidates = [], profile = "DAY_TRADE") {
  const validCandidates = candidates
    .filter((candidate) => candidate && ["COMPRA", "VENDA"].includes(candidate.direction))
    .sort((a, b) => b.score - a.score);

  if (validCandidates.length === 0) {
    return {
      setupType: "AGUARDAR",
      direction: "AGUARDAR",
      score: 55,
      rawScore: 55,
      oppositeScore: 55,
      difference: 0,
    };
  }

  if (profile === "SCALPING") {
    const scalpCandidate = validCandidates.find((candidate) => candidate.setupType === "SCALPING");

    if (scalpCandidate && scalpCandidate.score >= 76) {
      return scalpCandidate;
    }
  }

  return validCandidates[0];
}

function getFinalDirection(candidate) {
  if (!candidate || candidate.score < 75) return "AGUARDAR";

  if (candidate.difference < 7) {
    return "OBSERVAR";
  }

  if (candidate.setupType === "REVERSAO" && candidate.score < 82) {
    return "OBSERVAR";
  }

  if (candidate.setupType === "SCALPING" && candidate.score < 84) {
    return "OBSERVAR";
  }

  if (candidate.setupType === "TENDENCIA" && candidate.score < 80) {
    return "OBSERVAR";
  }

  if (candidate.setupType === "SMC" && candidate.score < 84) {
    return "OBSERVAR";
  }

  return candidate.direction;
}

function getCandleCount(candles) {
  return Array.isArray(candles) ? candles.length : 0;
}

function buildInsufficientDataAnalysis({
  ticker,
  profile,
  indicators,
  indicatorsFast,
  indicators15m,
  indicators1h,
  candlesFastCount,
  candles5mCount,
  candles15mCount,
  candles1hCount,
}) {
  return {
    opportunityStatus: "AGUARDAR",
    marketBias: "INDEFINIDA",
    marketBiasConfidence: 0,
    entryType: "AGUARDAR",
    aiDirection: "AGUARDAR",
    aiScore: 55,
    entryZone: toNumber(ticker?.price),
    invalidation: 0,
    targetZone: 0,
    aiReason: "Poucos candles para validar o setup com segurança.",
    reason: "Poucos candles para validar o setup com segurança.",
    missingConfirmation: "Aguardando histórico suficiente de candles nos timeframes principais.",
    profile,
    selectedSetup: "AGUARDAR",
    selectedDirection: "AGUARDAR",
    candlesFast: candlesFastCount,
    candles5m: candles5mCount,
    candles15m: candles15mCount,
    candles1h: candles1hCount,
  };
}

function calculateScore(ticker, timeframes = {}) {
  const profile = normalizeProfile(timeframes.profile || timeframes.mode || ticker?.profile);

  const candlesFast = timeframes.candles1m || timeframes.candlesM1 || timeframes.candles5m || [];
  const candles = timeframes.candles5m || [];
  const candles15m = timeframes.candles15m || [];
  const candles1h = timeframes.candles1h || [];

  const indicators = analyzeIndicators(ticker, candles);
  const indicatorsFast = analyzeIndicators(ticker, candlesFast);
  const indicators15m = analyzeIndicators(ticker, candles15m);
  const indicators1h = analyzeIndicators(ticker, candles1h);

  const candlesFastCount = getCandleCount(candlesFast);
  const candles5mCount = getCandleCount(candles);
  const candles15mCount = getCandleCount(candles15m);
  const candles1hCount = getCandleCount(candles1h);

  if (candles5mCount < 50 || candles15mCount < 50 || candles1hCount < 50) {
    const aiAnalysis = buildInsufficientDataAnalysis({
      ticker,
      profile,
      indicators,
      indicatorsFast,
      indicators15m,
      indicators1h,
      candlesFastCount,
      candles5mCount,
      candles15mCount,
      candles1hCount,
    });

    return {
      indicators,
      indicatorsFast,
      indicators15m,
      indicators1h,
      score: 55,
      direction: "AGUARDAR",
      level: "AGUARDAR",
      setupType: "AGUARDAR",
      strategy: "AGUARDAR",
      profile,

      opportunityStatus: aiAnalysis.opportunityStatus,
      marketBias: aiAnalysis.marketBias,
      entryType: aiAnalysis.entryType,
      aiAnalysis,

      scoreDetails: {
        reason: "Poucos candles para validar o setup.",
        setupType: "AGUARDAR",
        strategy: "AGUARDAR",
        profile,
        candlesFast: candlesFastCount,
        candles5m: candles5mCount,
        candles15m: candles15mCount,
        candles1h: candles1hCount,
        aiAnalysis,
        opportunityStatus: aiAnalysis.opportunityStatus,
        marketBias: aiAnalysis.marketBias,
        entryType: aiAnalysis.entryType,
        missingConfirmation: aiAnalysis.missingConfirmation,
      },
    };
  }

  const trendBuyScore = calculateTrendBuyScore(indicators, indicators15m, indicators1h);
  const trendSellScore = calculateTrendSellScore(indicators, indicators15m, indicators1h);

  const reversalBuyScore = calculateReversalBuyScore(
    indicators,
    indicators15m,
    indicators1h,
    candles
  );

  const reversalSellScore = calculateReversalSellScore(
    indicators,
    indicators15m,
    indicators1h,
    candles
  );

  const scalpingBuyScore = calculateScalpingBuyScore(
    indicatorsFast,
    indicators15m,
    indicators1h,
    candlesFast,
    candles
  );

  const scalpingSellScore = calculateScalpingSellScore(
    indicatorsFast,
    indicators15m,
    indicators1h,
    candlesFast,
    candles
  );

  const smcBuyScore = calculateSmcBuyScore(indicators, indicators15m, indicators1h, candles);
  const smcSellScore = calculateSmcSellScore(indicators, indicators15m, indicators1h, candles);

  const candidates = [
    createCandidate({
      setupType: "TENDENCIA",
      direction: "COMPRA",
      score: trendBuyScore,
      oppositeScore: trendSellScore,
      profile,
      indicators,
      indicators15m,
      indicators1h,
      candles,
      candlesFast,
    }),

    createCandidate({
      setupType: "TENDENCIA",
      direction: "VENDA",
      score: trendSellScore,
      oppositeScore: trendBuyScore,
      profile,
      indicators,
      indicators15m,
      indicators1h,
      candles,
      candlesFast,
    }),

    createCandidate({
      setupType: "REVERSAO",
      direction: "COMPRA",
      score: reversalBuyScore,
      oppositeScore: reversalSellScore,
      profile,
      indicators,
      indicators15m,
      indicators1h,
      candles,
      candlesFast,
    }),

    createCandidate({
      setupType: "REVERSAO",
      direction: "VENDA",
      score: reversalSellScore,
      oppositeScore: reversalBuyScore,
      profile,
      indicators,
      indicators15m,
      indicators1h,
      candles,
      candlesFast,
    }),

    createCandidate({
      setupType: "SCALPING",
      direction: "COMPRA",
      score: scalpingBuyScore,
      oppositeScore: scalpingSellScore,
      profile,
      indicators: indicatorsFast,
      indicators15m,
      indicators1h,
      candles,
      candlesFast,
    }),

    createCandidate({
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
  ];

  const bestCandidate = selectBestCandidate(candidates, profile);

  const score = normalizeScore(bestCandidate.score);
  const direction = getFinalDirection(bestCandidate);
  const rawDirection = bestCandidate.direction;
  const setupType = direction === "AGUARDAR" ? "AGUARDAR" : bestCandidate.setupType;
  const strategy = setupType;

  const aiAnalysis = buildAiAnalysis({
    ticker,
    candidate: bestCandidate,
    finalDirection: direction,
    score,
    profile,
    indicators,
    indicatorsFast,
    indicators15m,
    indicators1h,
    candles,
    candlesFast,
  });

  return {
    indicators,
    indicatorsFast,
    indicators15m,
    indicators1h,

    score,
    direction,
    level: getLevel(score),
    setupType,
    strategy,
    profile,

    opportunityStatus: aiAnalysis.opportunityStatus,
    marketBias: aiAnalysis.marketBias,
    entryType: aiAnalysis.entryType,
    aiAnalysis,

    scoreDetails: {
      profile,
      setupType,
      strategy,
      selectedSetup: bestCandidate.setupType,
      selectedDirection: bestCandidate.direction,
      rawDirection,
      rawScore: bestCandidate.rawScore,
      finalScore: score,
      difference: bestCandidate.difference,

      opportunityStatus: aiAnalysis.opportunityStatus,
      marketBias: aiAnalysis.marketBias,
      marketBiasConfidence: aiAnalysis.marketBiasConfidence,
      entryType: aiAnalysis.entryType,
      aiDirection: aiAnalysis.aiDirection,
      aiScore: aiAnalysis.aiScore,
      aiReason: aiAnalysis.aiReason,
      missingConfirmation: aiAnalysis.missingConfirmation,
      aiAnalysis,

      buyScore: normalizeDetailScore(trendBuyScore),
      sellScore: normalizeDetailScore(trendSellScore),

      trendBuyScore: normalizeDetailScore(trendBuyScore),
      trendSellScore: normalizeDetailScore(trendSellScore),

      reversalBuyScore: normalizeDetailScore(reversalBuyScore),
      reversalSellScore: normalizeDetailScore(reversalSellScore),

      scalpingBuyScore: normalizeDetailScore(scalpingBuyScore),
      scalpingSellScore: normalizeDetailScore(scalpingSellScore),

      smcBuyScore: normalizeDetailScore(smcBuyScore),
      smcSellScore: normalizeDetailScore(smcSellScore),

      candidates,

      candlesFast: candlesFastCount,
      candles5m: candles5mCount,
      candles15m: candles15mCount,
      candles1h: candles1hCount,

      recentMove5m: Number(getMovePercent(candles, 12).toFixed(3)),
      fastMove: Number(getMovePercent(candlesFast, 5).toFixed(3)),
      range5m: Number(getRangePercent(candles, 20).toFixed(3)),

      bullishRejection: hasBullishRejection(candles),
      bearishRejection: hasBearishRejection(candles),
      nearSupport: isNearSupport(candles),
      nearResistance: isNearResistance(candles),
    },
  };
}

module.exports = {
  calculateScore,
  getLevel,
};