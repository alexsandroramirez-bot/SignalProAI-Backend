const { analyzeIndicators } = require("./indicators");

function getLevel(score) {
  if (score >= 95) return "RARO";
  if (score >= 90) return "ELITE";
  if (score >= 85) return "PREMIUM";
  if (score >= 75) return "BOM";
  return "AGUARDAR";
}

function getDirection(indicators, score) {
  if (score < 75) return "AGUARDAR";

  if (score >= 80 &&
    indicators.trend === "ALTA" &&
    indicators.ema20 > indicators.ema50 &&
    indicators.ema50 > indicators.ema200 &&
    indicators.rsi < 70) {
    return "COMPRA";
  }

 if (score >= 80 &&
    indicators.trend === "BAIXA" &&
    indicators.ema20 < indicators.ema50 &&
    indicators.ema50 < indicators.ema200 &&
    indicators.rsi > 30) {
    return "VENDA";
  }

  return "OBSERVAR";
}

function calculateScore(ticker, timeframes = {}) {
  const candles = timeframes.candles5m || [];
  const candles15m = timeframes.candles15m || [];
  const candles1h = timeframes.candles1h || [];

  const indicators = analyzeIndicators(ticker, candles);
  const indicators15m = analyzeIndicators(ticker, candles15m);
const indicators1h = analyzeIndicators(ticker, candles1h);

  let score = 50;

  if (indicators.trend === "ALTA") score += 20;
if (indicators.trend === "BAIXA") score += 20;
if (indicators.trend === "NEUTRA") score += 0;

  if (indicators.momentum === "FORTE") score += 10;
  if (indicators.momentum === "NEUTRO") score += 6;
  if (indicators.momentum === "ESTICADO") score -= 10;
  if (indicators.momentum === "FRACO") score -= 5;

  if (indicators.volume === "FORTE") score += 10;
  if (indicators.volume === "NORMAL") score += 4;

  if (indicators.volatility === "SAUDAVEL") score += 10;
  if (indicators.volatility === "ALTA") score += 5;
 
  if (indicators.volatility === "BAIXA") score -= 4;
  if (indicators.adx >= 40) score += 15;
else if (indicators.adx >= 30) score += 10;
else if (indicators.adx >= 25) score += 6;
else if (indicators.adx < 20) score -= 12;
if (indicators.rsi >= 50 && indicators.rsi <= 65) score += 8;
else if (indicators.rsi > 65 && indicators.rsi <= 75) score += 3;
else if (indicators.rsi > 75) score -= 8;
else if (indicators.rsi < 35) score -= 5;
  if (indicators.liquidity === "OK") score += 5;

  if (indicators.macdSignal === "COMPRA") score += 6;
  if (indicators.macdSignal === "VENDA") score -= 8;
   if (indicators.trend === indicators15m.trend) score += 8;
else score -= 8;

if (indicators.trend === indicators1h.trend) score += 12;
else score -= 12;
  if (indicators.bos) score += 8;
if (indicators.choch) score -= 6;
if (indicators.trend === "NEUTRA") score -= 15;

if (indicators.adx < 20) score -= 10;

if (
    indicators.ema20 > indicators.ema50 &&
    indicators.ema20 < indicators.ema200
) score -= 8;

if (
    indicators.ema20 < indicators.ema50 &&
    indicators.ema20 > indicators.ema200
) score -= 8;

if (indicators.fvgBullish) score += 3;
if (indicators.fvgBearish) score -= 6;

if (indicators.orderBlockBullish) score += 4;
if (indicators.orderBlockBearish) score -= 8;

if (indicators.breakerBullish) score += 7;
if (indicators.breakerBearish) score -= 7;

if (indicators.liquidityBullish) score += 6;
if (indicators.liquidityBearish) score -= 6;

  score = Math.min(score, 96);
  score = Math.max(score, 40);
const eliteBuy =
  indicators.trend === "ALTA" &&
  indicators15m.trend === "ALTA" &&
  indicators1h.trend === "ALTA" &&
  indicators.ema20 > indicators.ema50 &&
  indicators.ema50 > indicators.ema200 &&
  indicators15m.ema20 > indicators15m.ema50 &&
  indicators1h.ema20 > indicators1h.ema50 &&
  indicators.macdSignal === "COMPRA" &&
  indicators.adx >= 30 &&
indicators.rsi >= 55 &&
indicators.rsi <= 68 &&
  indicators.volume === "FORTE";
const eliteSell =
  indicators.trend === "BAIXA" &&
  indicators15m.trend === "BAIXA" &&
  indicators1h.trend === "BAIXA" &&
  indicators.ema20 < indicators.ema50 &&
  indicators.ema50 < indicators.ema200 &&
  indicators15m.ema20 < indicators15m.ema50 &&
  indicators1h.ema20 < indicators1h.ema50 &&
  indicators.macdSignal === "VENDA" &&
  indicators.adx >= 30 &&
indicators.rsi >= 32 &&
indicators.rsi <= 45 &&
  indicators.volume === "FORTE";

if (score >= 90 && !(eliteBuy || eliteSell)) {
    score = 89;
}
  return {
    indicators,
    score: Math.round(score),
    direction: getDirection(indicators, score),
    level: getLevel(score),
  };
}

module.exports = {
  calculateScore,
  getLevel,
};