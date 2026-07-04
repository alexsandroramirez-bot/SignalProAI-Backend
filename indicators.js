const { EMA, RSI, MACD, ATR, ADX } = require("technicalindicators");

function last(values) {
  return values && values.length ? values[values.length - 1] : null;
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + Number(value), 0) / values.length;
}

function analyzeIndicators(ticker, candles = []) {
  const closes = candles.map((c) => Number(c.close));
  const highs = candles.map((c) => Number(c.high));
  const lows = candles.map((c) => Number(c.low));
  const volumes = candles.map((c) => Number(c.volume));

  const price = Number(ticker.price);

  const ema20 = last(EMA.calculate({ period: 20, values: closes }));
  const ema50 = last(EMA.calculate({ period: 50, values: closes }));
  const ema200 = last(EMA.calculate({ period: 200, values: closes }));
  const rsi = last(RSI.calculate({ period: 14, values: closes }));

  const macd = last(
    MACD.calculate({
      values: closes,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false,
    })
  );

  const atr = last(
    ATR.calculate({
      high: highs,
      low: lows,
      close: closes,
      period: 14,
    })
  );
  const adxData = last(
  ADX.calculate({
    high: highs,
    low: lows,
    close: closes,
    period: 14,
  })
);

const adx = adxData?.adx || 0;

  const avgVolume = average(volumes.slice(-20));
  const lastVolume = last(volumes) || Number(ticker.volume);

  let trend = "NEUTRA";
  if (ema20 && ema50 && ema200) {
    if (ema20 > ema50 && ema50 > ema200) trend = "ALTA";
    if (ema20 < ema50 && ema50 < ema200) trend = "BAIXA";
  }

  let momentum = "NEUTRO";
  if (rsi >= 50 && rsi <= 68) momentum = "FORTE";
  if (rsi > 68) momentum = "ESTICADO";
  if (rsi < 45) momentum = "FRACO";

  let macdSignal = "NEUTRO";
  if (macd?.MACD > macd?.signal) macdSignal = "COMPRA";
  if (macd?.MACD < macd?.signal) macdSignal = "VENDA";

  let volatility = "NORMAL";
  if (atr && price) {
    const atrPercent = (atr / price) * 100;
    if (atrPercent < 0.3) volatility = "BAIXA";
    if (atrPercent >= 0.3 && atrPercent <= 2.5) volatility = "SAUDAVEL";
    if (atrPercent > 2.5) volatility = "ALTA";
  }

  const volume = lastVolume > avgVolume ? "FORTE" : "NORMAL";
const structureData = detectStructure(candles);
const fvgData = detectFVG(candles);
const orderBlockData = detectOrderBlock(candles);
const liquidityData = detectLiquiditySweep(candles);
const breakerData = detectBreakerBlock(candles);
  return {
  price,
  ema20,
  ema50,
  ema200,
  rsi,
  macd,
  macdSignal,
  atr,
  adx,
  trend,

  bos: structureData.bos,
  choch: structureData.choch,
  structure: structureData.structure,

  fvgBullish: fvgData.bullish,
  fvgBearish: fvgData.bearish,
  fvgType: fvgData.type,
  orderBlockBullish: orderBlockData.bullish,
orderBlockBearish: orderBlockData.bearish,
orderBlockType: orderBlockData.type,

breakerBullish: breakerData.bullish,
breakerBearish: breakerData.bearish,
breakerType: breakerData.type,

liquidityBullish: liquidityData.bullishSweep,
liquidityBearish: liquidityData.bearishSweep,
liquidityType: liquidityData.type,
  momentum,
  volume,
  volatility,
  liquidity: Number(ticker.volume) > 0 ? "OK" : "BAIXA",
};
}
function highestHigh(candles, lookback = 20) {
  return Math.max(...candles.slice(-lookback).map(c => c.high));
}

function lowestLow(candles, lookback = 20) {
  return Math.min(...candles.slice(-lookback).map(c => c.low));
}

function detectStructure(candles) {
  if (candles.length < 30) {
    return {
      bos: false,
      choch: false,
      structure: "INDEFINIDA",
    };
  }

  const last = candles[candles.length - 1];

  const previousHigh = highestHigh(candles.slice(0, -1), 20);
  const previousLow = lowestLow(candles.slice(0, -1), 20);

  return {
    bos: last.close > previousHigh,
    choch: last.close < previousLow,
    structure:
      last.close > previousHigh
        ? "ALTA"
        : last.close < previousLow
        ? "BAIXA"
        : "LATERAL",
  };
}function detectFVG(candles) {
  if (candles.length < 3) {
    return {
      bullish: false,
      bearish: false,
      type: "NENHUM",
    };
  }

  const c1 = candles[candles.length - 3];
  const c2 = candles[candles.length - 2];
  const c3 = candles[candles.length - 1];

  const bullish = Number(c1.high) < Number(c3.low);
  const bearish = Number(c1.low) > Number(c3.high);

  return {
    bullish,
    bearish,
    type: bullish ? "ALTA" : bearish ? "BAIXA" : "NENHUM",
  };
}
function detectOrderBlock(candles) {
  if (candles.length < 10) {
    return {
      bullish: false,
      bearish: false,
      type: "NENHUM",
    };
  }

  const last = candles[candles.length - 1];
  const previous = candles[candles.length - 2];

  const bullish =
    Number(previous.close) < Number(previous.open) &&
    Number(last.close) > Number(previous.high);

  const bearish =
    Number(previous.close) > Number(previous.open) &&
    Number(last.close) < Number(previous.low);

  return {
    bullish,
    bearish,
    type: bullish ? "COMPRA" : bearish ? "VENDA" : "NENHUM",
  };
}
function detectLiquiditySweep(candles) {
  if (candles.length < 25) {
    return {
      bullishSweep: false,
      bearishSweep: false,
      type: "NENHUM",
    };
  }

  const last = candles[candles.length - 1];
  const previousCandles = candles.slice(-21, -1);

  const previousHigh = Math.max(...previousCandles.map((c) => Number(c.high)));
  const previousLow = Math.min(...previousCandles.map((c) => Number(c.low)));

  const bullishSweep =
    Number(last.low) < previousLow && Number(last.close) > previousLow;

  const bearishSweep =
    Number(last.high) > previousHigh && Number(last.close) < previousHigh;

  return {
    bullishSweep,
    bearishSweep,
    type: bullishSweep ? "COMPRA" : bearishSweep ? "VENDA" : "NENHUM",
  };
}
function detectBreakerBlock(candles) {
  if (candles.length < 30) {
    return {
      bullish: false,
      bearish: false,
      type: "NENHUM",
    };
  }

  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const old = candles[candles.length - 10];

  const bullish =
    Number(old.low) > Number(prev.low) &&
    Number(prev.close) < Number(old.low) &&
    Number(last.close) > Number(prev.high);

  const bearish =
    Number(old.high) < Number(prev.high) &&
    Number(prev.close) > Number(old.high) &&
    Number(last.close) < Number(prev.low);

  return {
    bullish,
    bearish,
    type: bullish ? "COMPRA" : bearish ? "VENDA" : "NENHUM",
  };
}
module.exports = {
  analyzeIndicators,
  detectFVG,
  detectOrderBlock,
  detectLiquiditySweep,
  detectBreakerBlock,
};