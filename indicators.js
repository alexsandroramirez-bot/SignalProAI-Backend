const { EMA, RSI, MACD, ATR, ADX } = require("technicalindicators");

function toNumber(value) {
  if (value === null || value === undefined || value === "") return 0;

  const number = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function last(values) {
  return values && values.length ? values[values.length - 1] : null;
}

function average(values = []) {
  const validValues = values.map(toNumber).filter((value) => Number.isFinite(value) && value > 0);

  if (!validValues.length) return 0;

  return validValues.reduce((sum, value) => sum + value, 0) / validValues.length;
}

function safeLastIndicator(callback, fallback = null) {
  try {
    const result = callback();
    return last(result) || fallback;
  } catch (error) {
    return fallback;
  }
}

function sanitizeCandles(candles = []) {
  if (!Array.isArray(candles)) return [];

  return candles
    .map((candle) => {
      const open = toNumber(candle?.open ?? candle?.o);
      const high = toNumber(candle?.high ?? candle?.h);
      const low = toNumber(candle?.low ?? candle?.l);
      const close = toNumber(candle?.close ?? candle?.c ?? candle?.price);
      const volume = toNumber(candle?.volume ?? candle?.tick_volume ?? candle?.v);

      if (!open || !high || !low || !close) return null;
      if (high < low) return null;

      return {
        ...candle,
        open,
        high,
        low,
        close,
        volume,
      };
    })
    .filter(Boolean);
}

function getOpen(candle) {
  return toNumber(candle?.open ?? candle?.o);
}

function getHigh(candle) {
  return toNumber(candle?.high ?? candle?.h);
}

function getLow(candle) {
  return toNumber(candle?.low ?? candle?.l);
}

function getClose(candle) {
  return toNumber(candle?.close ?? candle?.c ?? candle?.price);
}

function getVolume(candle) {
  return toNumber(candle?.volume ?? candle?.tick_volume ?? candle?.v);
}

function getRecentCandles(candles = [], limit = 20) {
  if (!Array.isArray(candles)) return [];
  return candles.slice(-limit);
}

function highestHigh(candles = [], lookback = 20) {
  const recent = getRecentCandles(candles, lookback);
  const values = recent.map(getHigh).filter((value) => value > 0);

  if (!values.length) return 0;

  return Math.max(...values);
}

function lowestLow(candles = [], lookback = 20) {
  const recent = getRecentCandles(candles, lookback);
  const values = recent.map(getLow).filter((value) => value > 0);

  if (!values.length) return 0;

  return Math.min(...values);
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
  const close = getClose(recent[recent.length - 1]);

  if (!highs.length || !lows.length || !close) return 0;

  return ((Math.max(...highs) - Math.min(...lows)) / close) * 100;
}

function getCandleBody(candle) {
  return Math.abs(getClose(candle) - getOpen(candle));
}

function getCandleRange(candle) {
  return Math.abs(getHigh(candle) - getLow(candle));
}

function isBullishCandle(candle) {
  return getClose(candle) > getOpen(candle);
}

function isBearishCandle(candle) {
  return getClose(candle) < getOpen(candle);
}

function hasBullishRejection(candles = [], lookback = 3) {
  const recent = getRecentCandles(candles, lookback);

  return recent.some((candle) => {
    const open = getOpen(candle);
    const high = getHigh(candle);
    const low = getLow(candle);
    const close = getClose(candle);

    if (!open || !high || !low || !close || high <= low) return false;

    const range = high - low;
    const body = Math.max(Math.abs(close - open), range * 0.05);
    const lowerWick = Math.min(open, close) - low;
    const closePosition = (close - low) / range;

    return lowerWick >= body * 1.2 && closePosition >= 0.52;
  });
}

function hasBearishRejection(candles = [], lookback = 3) {
  const recent = getRecentCandles(candles, lookback);

  return recent.some((candle) => {
    const open = getOpen(candle);
    const high = getHigh(candle);
    const low = getLow(candle);
    const close = getClose(candle);

    if (!open || !high || !low || !close || high <= low) return false;

    const range = high - low;
    const body = Math.max(Math.abs(close - open), range * 0.05);
    const upperWick = high - Math.max(open, close);
    const closePosition = (high - close) / range;

    return upperWick >= body * 1.2 && closePosition >= 0.52;
  });
}

function detectStructure(candles = []) {
  const safeCandles = sanitizeCandles(candles);

  if (safeCandles.length < 25) {
    return {
      bos: false,
      bosBullish: false,
      bosBearish: false,
      choch: false,
      chochBullish: false,
      chochBearish: false,
      structure: "INDEFINIDA",
      previousHigh: 0,
      previousLow: 0,
    };
  }

  const recent = safeCandles.slice(-5);
  const base = safeCandles.slice(0, -5);
  const lastCandle = safeCandles[safeCandles.length - 1];
  const close = getClose(lastCandle);

  const previousHigh = highestHigh(base, 20);
  const previousLow = lowestLow(base, 20);

  const recentHighBreak = recent.some((candle) => getClose(candle) > previousHigh);
  const recentLowBreak = recent.some((candle) => getClose(candle) < previousLow);

  const moveBefore = getMovePercent(safeCandles.slice(0, -5), 12);

  const bosBullish = recentHighBreak && close >= previousHigh;
  const bosBearish = recentLowBreak && close <= previousLow;

  const chochBullish = moveBefore < -0.15 && recentHighBreak;
  const chochBearish = moveBefore > 0.15 && recentLowBreak;

  let structure = "LATERAL";

  if (bosBullish || chochBullish) structure = "ALTA";
  if (bosBearish || chochBearish) structure = "BAIXA";

  return {
    bos: bosBullish || bosBearish,
    bosBullish,
    bosBearish,
    choch: chochBullish || chochBearish,
    chochBullish,
    chochBearish,
    structure,
    previousHigh,
    previousLow,
  };
}

function detectFVG(candles = [], lookback = 10) {
  const safeCandles = sanitizeCandles(candles);

  if (safeCandles.length < 3) {
    return {
      bullish: false,
      bearish: false,
      type: "NENHUM",
      age: null,
    };
  }

  let bullishSignal = null;
  let bearishSignal = null;

  const start = Math.max(2, safeCandles.length - lookback);

  for (let i = start; i < safeCandles.length; i += 1) {
    const c1 = safeCandles[i - 2];
    const c3 = safeCandles[i];

    const bullish = getHigh(c1) < getLow(c3);
    const bearish = getLow(c1) > getHigh(c3);

    if (bullish) {
      bullishSignal = {
        index: i,
        age: safeCandles.length - 1 - i,
      };
    }

    if (bearish) {
      bearishSignal = {
        index: i,
        age: safeCandles.length - 1 - i,
      };
    }
  }

  const bullish = Boolean(bullishSignal);
  const bearish = Boolean(bearishSignal);

  if (bullish && bearish) {
    return bullishSignal.age <= bearishSignal.age
      ? {
          bullish: true,
          bearish: false,
          type: "ALTA",
          age: bullishSignal.age,
        }
      : {
          bullish: false,
          bearish: true,
          type: "BAIXA",
          age: bearishSignal.age,
        };
  }

  return {
    bullish,
    bearish,
    type: bullish ? "ALTA" : bearish ? "BAIXA" : "NENHUM",
    age: bullishSignal?.age ?? bearishSignal?.age ?? null,
  };
}

function detectOrderBlock(candles = [], lookback = 10) {
  const safeCandles = sanitizeCandles(candles);

  if (safeCandles.length < 10) {
    return {
      bullish: false,
      bearish: false,
      type: "NENHUM",
      age: null,
    };
  }

  let bullishSignal = null;
  let bearishSignal = null;

  const start = Math.max(2, safeCandles.length - lookback);

  for (let i = start; i < safeCandles.length; i += 1) {
    const previous = safeCandles[i - 1];
    const current = safeCandles[i];

    const previousBody = getCandleBody(previous);
    const currentBody = getCandleBody(current);
    const currentRange = getCandleRange(current);

    const bullish =
      isBearishCandle(previous) &&
      isBullishCandle(current) &&
      getClose(current) > getHigh(previous) &&
      currentBody >= previousBody * 0.7 &&
      currentBody >= currentRange * 0.35;

    const bearish =
      isBullishCandle(previous) &&
      isBearishCandle(current) &&
      getClose(current) < getLow(previous) &&
      currentBody >= previousBody * 0.7 &&
      currentBody >= currentRange * 0.35;

    if (bullish) {
      bullishSignal = {
        index: i,
        age: safeCandles.length - 1 - i,
      };
    }

    if (bearish) {
      bearishSignal = {
        index: i,
        age: safeCandles.length - 1 - i,
      };
    }
  }

  const bullish = Boolean(bullishSignal);
  const bearish = Boolean(bearishSignal);

  if (bullish && bearish) {
    return bullishSignal.age <= bearishSignal.age
      ? {
          bullish: true,
          bearish: false,
          type: "COMPRA",
          age: bullishSignal.age,
        }
      : {
          bullish: false,
          bearish: true,
          type: "VENDA",
          age: bearishSignal.age,
        };
  }

  return {
    bullish,
    bearish,
    type: bullish ? "COMPRA" : bearish ? "VENDA" : "NENHUM",
    age: bullishSignal?.age ?? bearishSignal?.age ?? null,
  };
}

function detectLiquiditySweep(candles = [], lookback = 25, recentLookback = 5) {
  const safeCandles = sanitizeCandles(candles);

  if (safeCandles.length < lookback + recentLookback) {
    return {
      bullishSweep: false,
      bearishSweep: false,
      type: "NENHUM",
      age: null,
      sweptHigh: 0,
      sweptLow: 0,
    };
  }

  const recent = safeCandles.slice(-recentLookback);
  const base = safeCandles.slice(-(lookback + recentLookback), -recentLookback);

  const previousHigh = highestHigh(base, lookback);
  const previousLow = lowestLow(base, lookback);

  let bullishSignal = null;
  let bearishSignal = null;

  recent.forEach((candle, index) => {
    const age = recent.length - 1 - index;

    const bullishSweep = getLow(candle) < previousLow && getClose(candle) > previousLow;
    const bearishSweep = getHigh(candle) > previousHigh && getClose(candle) < previousHigh;

    if (bullishSweep) {
      bullishSignal = {
        age,
      };
    }

    if (bearishSweep) {
      bearishSignal = {
        age,
      };
    }
  });

  const bullishSweep = Boolean(bullishSignal);
  const bearishSweep = Boolean(bearishSignal);

  if (bullishSweep && bearishSweep) {
    return bullishSignal.age <= bearishSignal.age
      ? {
          bullishSweep: true,
          bearishSweep: false,
          type: "COMPRA",
          age: bullishSignal.age,
          sweptHigh: previousHigh,
          sweptLow: previousLow,
        }
      : {
          bullishSweep: false,
          bearishSweep: true,
          type: "VENDA",
          age: bearishSignal.age,
          sweptHigh: previousHigh,
          sweptLow: previousLow,
        };
  }

  return {
    bullishSweep,
    bearishSweep,
    type: bullishSweep ? "COMPRA" : bearishSweep ? "VENDA" : "NENHUM",
    age: bullishSignal?.age ?? bearishSignal?.age ?? null,
    sweptHigh: previousHigh,
    sweptLow: previousLow,
  };
}

function detectBreakerBlock(candles = []) {
  const safeCandles = sanitizeCandles(candles);

  if (safeCandles.length < 30) {
    return {
      bullish: false,
      bearish: false,
      type: "NENHUM",
    };
  }

  const structureData = detectStructure(safeCandles);
  const liquidityData = detectLiquiditySweep(safeCandles);
  const orderBlockData = detectOrderBlock(safeCandles);

  const bullish =
    (liquidityData.bullishSweep || structureData.chochBullish) &&
    (structureData.bosBullish || orderBlockData.bullish);

  const bearish =
    (liquidityData.bearishSweep || structureData.chochBearish) &&
    (structureData.bosBearish || orderBlockData.bearish);

  return {
    bullish,
    bearish,
    type: bullish ? "COMPRA" : bearish ? "VENDA" : "NENHUM",
  };
}

function getTrendFromEma({ price, ema20, ema50, ema200, recentMove }) {
  if (!price || !ema20 || !ema50) return "NEUTRA";

  const bullishBasic = price > ema20 && ema20 > ema50;
  const bearishBasic = price < ema20 && ema20 < ema50;

  const bullishLong = ema200 ? ema50 >= ema200 : recentMove > 0;
  const bearishLong = ema200 ? ema50 <= ema200 : recentMove < 0;

  if (bullishBasic && bullishLong) return "ALTA";
  if (bearishBasic && bearishLong) return "BAIXA";

  return "NEUTRA";
}

function getMomentumStatus({ rsi, macdSignal, recentMove }) {
  if (rsi >= 50 && rsi <= 68 && macdSignal === "COMPRA") return "FORTE";
  if (rsi >= 32 && rsi <= 50 && macdSignal === "VENDA") return "FORTE";

  if (rsi > 72 || rsi < 28) return "ESTICADO";

  if (Math.abs(recentMove) < 0.04) return "FRACO";

  if (rsi >= 45 && rsi <= 58) return "NEUTRO";

  return "NEUTRO";
}

function getVolatilityStatus({ atr, price }) {
  if (!atr || !price) return "NORMAL";

  const atrPercent = (atr / price) * 100;

  if (atrPercent < 0.03) return "BAIXA";
  if (atrPercent <= 1.5) return "SAUDAVEL";

  return "ALTA";
}

function analyzeIndicators(ticker, candles = []) {
  const safeCandles = sanitizeCandles(candles);

  const closes = safeCandles.map((c) => Number(c.close));
  const highs = safeCandles.map((c) => Number(c.high));
  const lows = safeCandles.map((c) => Number(c.low));
  const volumes = safeCandles.map((c) => Number(c.volume));

  const price = toNumber(ticker?.price) || toNumber(last(closes));

  const ema9 = safeLastIndicator(() => EMA.calculate({ period: 9, values: closes }));
  const ema20 = safeLastIndicator(() => EMA.calculate({ period: 20, values: closes }));
  const ema50 = safeLastIndicator(() => EMA.calculate({ period: 50, values: closes }));

  const ema100 = safeLastIndicator(() => EMA.calculate({ period: 100, values: closes }));
  const ema200Raw = safeLastIndicator(() => EMA.calculate({ period: 200, values: closes }));

  const slowAverage = average(closes.slice(-60));
  const ema200 = ema200Raw || ema100 || slowAverage || ema50 || 0;
  const ema200Estimated = !ema200Raw;

  const rsi = safeLastIndicator(() => RSI.calculate({ period: 14, values: closes }), 50);

  const macd = safeLastIndicator(() =>
    MACD.calculate({
      values: closes,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false,
    })
  );

  const atr = safeLastIndicator(() =>
    ATR.calculate({
      high: highs,
      low: lows,
      close: closes,
      period: 14,
    })
  );

  const adxData = safeLastIndicator(() =>
    ADX.calculate({
      high: highs,
      low: lows,
      close: closes,
      period: 14,
    })
  );

  const adx = toNumber(adxData?.adx);

  let macdSignal = "NEUTRO";

  if (macd?.MACD > macd?.signal) macdSignal = "COMPRA";
  if (macd?.MACD < macd?.signal) macdSignal = "VENDA";

  const recentMove = getMovePercent(safeCandles, 12);
  const rangePercent = getRangePercent(safeCandles, 20);

  const trend = getTrendFromEma({
    price,
    ema20,
    ema50,
    ema200,
    recentMove,
  });

  const momentum = getMomentumStatus({
    rsi,
    macdSignal,
    recentMove,
  });

  const volatility = getVolatilityStatus({
    atr,
    price,
  });

  const avgVolume = average(volumes.slice(-20));
  const lastVolume = toNumber(last(volumes)) || toNumber(ticker?.volume);

  let volume = "NORMAL";

  if (avgVolume > 0 && lastVolume >= avgVolume * 1.2) {
    volume = "FORTE";
  }

  if (avgVolume > 0 && lastVolume < avgVolume * 0.45) {
    volume = "BAIXO";
  }

  const structureData = detectStructure(safeCandles);
  const fvgData = detectFVG(safeCandles);
  const orderBlockData = detectOrderBlock(safeCandles);
  const liquidityData = detectLiquiditySweep(safeCandles);
  const breakerData = detectBreakerBlock(safeCandles);

  const liquidity = lastVolume > 0 || avgVolume > 0 || toNumber(ticker?.volume) > 0 ? "OK" : "BAIXA";

  return {
    price,

    ema9,
    ema20,
    ema50,
    ema100,
    ema200,
    ema200Raw,
    ema200Estimated,

    rsi,
    macd,
    macdSignal,
    atr,
    adx,
    trend,

    bos: structureData.bos,
    bosBullish: structureData.bosBullish,
    bosBearish: structureData.bosBearish,

    choch: structureData.choch,
    chochBullish: structureData.chochBullish,
    chochBearish: structureData.chochBearish,

    structure: structureData.structure,
    previousHigh: structureData.previousHigh,
    previousLow: structureData.previousLow,

    fvgBullish: fvgData.bullish,
    fvgBearish: fvgData.bearish,
    fvgType: fvgData.type,
    fvgAge: fvgData.age,

    orderBlockBullish: orderBlockData.bullish,
    orderBlockBearish: orderBlockData.bearish,
    orderBlockType: orderBlockData.type,
    orderBlockAge: orderBlockData.age,

    breakerBullish: breakerData.bullish,
    breakerBearish: breakerData.bearish,
    breakerType: breakerData.type,

    liquidityBullish: liquidityData.bullishSweep,
    liquidityBearish: liquidityData.bearishSweep,
    liquidityType: liquidityData.type,
    liquidityAge: liquidityData.age,
    sweptHigh: liquidityData.sweptHigh,
    sweptLow: liquidityData.sweptLow,

    bullishRejection: hasBullishRejection(safeCandles),
    bearishRejection: hasBearishRejection(safeCandles),

    recentMove,
    rangePercent,

    momentum,
    volume,
    volatility,
    liquidity,

    dataQuality: {
      candles: safeCandles.length,
      hasEnoughForEma20: closes.length >= 20,
      hasEnoughForEma50: closes.length >= 50,
      hasEnoughForEma200: closes.length >= 200,
      ema200Estimated,
    },
  };
}

module.exports = {
  analyzeIndicators,
  detectStructure,
  detectFVG,
  detectOrderBlock,
  detectLiquiditySweep,
  detectBreakerBlock,
};