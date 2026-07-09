const path = require("path");
const { execFile } = require("child_process");
const { calculateScore } = require("./scoreEngine");

const PYTHON_MAX_BUFFER = 30 * 1024 * 1024;

const PRICE_GUARDS = {
  "BTC/USD": { min: 1000, max: 1000000 },
  BTCUSD: { min: 1000, max: 1000000 },
  BTC: { min: 1000, max: 1000000 },

  "ETH/USD": { min: 100, max: 100000 },
  ETHUSD: { min: 100, max: 100000 },
  ETH: { min: 100, max: 100000 },

  "EUR/USD": { min: 0.5, max: 2 },
  EURUSD: { min: 0.5, max: 2 },

  "GBP/USD": { min: 0.5, max: 2.5 },
  GBPUSD: { min: 0.5, max: 2.5 },

  "XAU/USD": { min: 500, max: 10000 },
  XAUUSD: { min: 500, max: 10000 },
  GOLD: { min: 500, max: 10000 },

  US30: { min: 10000, max: 100000 },
  US500: { min: 1000, max: 20000 },
  NAS100: { min: 1000, max: 100000 },
  USTEC: { min: 1000, max: 100000 },
};

function toNumber(value) {
  if (value === null || value === undefined || value === "") return 0;

  const number = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function clamp(value, min, max) {
  const number = toNumber(value);
  return Math.max(min, Math.min(max, number));
}

function normalizeText(value) {
  return String(value || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9/.-]/g, "")
    .trim();
}

function normalizeProfile(value) {
  const normalized = normalizeText(value);

  if (normalized.includes("SCALP")) return "SCALPING";
  if (normalized.includes("SWING")) return "SWING";

  return "DAY_TRADE";
}

function normalizeSetupType(value) {
  const normalized = normalizeText(value);

  if (normalized.includes("SCALP")) return "SCALPING";
  if (normalized.includes("REVERS")) return "REVERSAO";
  if (normalized.includes("TEND")) return "TENDENCIA";
  if (normalized.includes("SMC") || normalized.includes("SMART") || normalized.includes("MONEY")) {
    return "SMC";
  }

  if (normalized.includes("AGUARD")) return "AGUARDAR";

  return normalized || "AGUARDAR";
}

function isTradeDirection(direction) {
  return direction === "COMPRA" || direction === "VENDA";
}

function getProfileRules(profileValue) {
  const profile = normalizeProfile(profileValue);

  if (profile === "SCALPING") {
    return {
      profile,
      minTradeScore: 86,
      observeScore: 68,
      preparingScore: 76,
      allowedSetups: ["SCALPING", "REVERSAO", "SMC"],
      maxSpreadPercent: 0.18,
    };
  }

  if (profile === "SWING") {
    return {
      profile,
      minTradeScore: 90,
      observeScore: 78,
      preparingScore: 85,
      allowedSetups: ["TENDENCIA", "REVERSAO", "SMC"],
      maxSpreadPercent: 0.25,
    };
  }

  return {
    profile: "DAY_TRADE",
    minTradeScore: 88,
    observeScore: 72,
    preparingScore: 80,
    allowedSetups: ["TENDENCIA", "REVERSAO", "SMC"],
    maxSpreadPercent: 0.22,
  };
}

function getAssetName(item = {}) {
  return (
    item.asset ||
    item.symbol ||
    item.ticker ||
    item.name ||
    item.displaySymbol ||
    item.productId ||
    "UNKNOWN"
  );
}

function getAssetKey(asset) {
  const text = normalizeText(asset);

  if (text.includes("BTC")) return "BTC/USD";
  if (text.includes("ETH")) return "ETH/USD";
  if (text.includes("EURUSD") || text.includes("EUR/USD")) return "EUR/USD";
  if (text.includes("GBPUSD") || text.includes("GBP/USD")) return "GBP/USD";
  if (text.includes("XAU") || text.includes("GOLD")) return "XAU/USD";
  if (text.includes("US30")) return "US30";
  if (text.includes("US500") || text.includes("SPX") || text.includes("SP500")) return "US500";
  if (text.includes("NAS100") || text.includes("USTEC") || text.includes("NASDAQ")) return "NAS100";

  return text;
}

function getAssetCategory(asset) {
  const key = getAssetKey(asset);

  if (key.includes("BTC") || key.includes("ETH")) return "CRYPTO";
  if (key.includes("EUR") || key.includes("GBP")) return "FOREX";
  if (key.includes("XAU") || key.includes("GOLD")) return "GOLD";
  if (key.includes("US30") || key.includes("US500") || key.includes("NAS100")) return "INDEX";

  return "GENERIC";
}

function getPriceGuard(asset) {
  const key = getAssetKey(asset);
  return PRICE_GUARDS[key] || PRICE_GUARDS[normalizeText(asset)] || null;
}

function getCurrentPrice(item = {}) {
  const price =
    toNumber(item.price) ||
    toNumber(item.last) ||
    toNumber(item.close) ||
    toNumber(item.currentPrice) ||
    toNumber(item.ask) ||
    toNumber(item.bid);

  return price;
}

function getBid(item = {}) {
  return toNumber(item.bid);
}

function getAsk(item = {}) {
  return toNumber(item.ask);
}

function getSpread(item = {}) {
  const bid = getBid(item);
  const ask = getAsk(item);

  if (!bid || !ask || ask <= bid) return 0;

  return ask - bid;
}

function getSpreadPercent(item = {}) {
  const price = getCurrentPrice(item);
  const spread = getSpread(item);

  if (!price || !spread) return 0;

  return (spread / price) * 100;
}

function validateAssetPrice(item = {}) {
  const asset = getAssetName(item);
  const price = getCurrentPrice(item);
  const bid = getBid(item);
  const ask = getAsk(item);
  const guard = getPriceGuard(asset);

  if (!price || price <= 0) {
    return {
      valid: false,
      asset,
      price,
      guard,
      reason: "Preço ausente ou inválido.",
    };
  }

  if (bid && ask && ask <= bid) {
    return {
      valid: false,
      asset,
      price,
      bid,
      ask,
      guard,
      reason: "Bid/Ask inválido.",
    };
  }

  if (guard && (price < guard.min || price > guard.max)) {
    return {
      valid: false,
      asset,
      price,
      guard,
      reason: `Preço fora da faixa esperada para ${asset}.`,
    };
  }

  return {
    valid: true,
    asset,
    price,
    bid,
    ask,
    guard,
    reason: "Preço validado.",
  };
}

function getMt5ErrorReason(item = {}) {
  return (
    item.error ||
    item.reason ||
    item.message ||
    item.mt5Error ||
    item.mt5_error ||
    item.statusMessage ||
    "MT5 não retornou dados válidos para este ativo."
  );
}

function assessSafety(item = {}, profileValue = "DAY_TRADE") {
  const rules = getProfileRules(profileValue);
  const priceValidation = validateAssetPrice(item);
  const spreadPercent = getSpreadPercent(item);
  const warnings = [];

  if (item.success === false) {
    return {
      blocked: true,
      status: "BLOQUEADO",
      safetyStatus: "BLOQUEADO",
      safetyBlocked: true,
      reason: getMt5ErrorReason(item),
      warning: getMt5ErrorReason(item),
      warnings: [getMt5ErrorReason(item)],
      priceValidation,
      spreadPercent,
    };
  }

  if (!priceValidation.valid) {
    return {
      blocked: true,
      status: "BLOQUEADO",
      safetyStatus: "BLOQUEADO",
      safetyBlocked: true,
      reason: priceValidation.reason,
      warning: priceValidation.reason,
      warnings: [priceValidation.reason],
      priceValidation,
      spreadPercent,
    };
  }

  if (spreadPercent > rules.maxSpreadPercent) {
    warnings.push(
      `Spread alto para ${rules.profile}: ${spreadPercent.toFixed(3)}%.`
    );
  }

  const liquidityText = normalizeText(item.liquidity || item.liquidityStatus);

  if (liquidityText.includes("BAIXA")) {
    warnings.push("Liquidez baixa no momento.");
  }

  if (warnings.length) {
    return {
      blocked: false,
      status: "ALERTA",
      safetyStatus: "ALERTA",
      safetyBlocked: false,
      reason: warnings.join(" "),
      warning: warnings.join(" "),
      warnings,
      priceValidation,
      spreadPercent,
    };
  }

  return {
    blocked: false,
    status: "OK",
    safetyStatus: "OK",
    safetyBlocked: false,
    reason: "Segurança OK.",
    warning: "",
    warnings: [],
    priceValidation,
    spreadPercent,
  };
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

function pickCandles(...sets) {
  for (const set of sets) {
    if (Array.isArray(set) && set.length) return set;
  }

  return [];
}

function getFastCandles(item = {}) {
  return pickCandles(
    item.candlesFast,
    item.candles_fast,
    item.candles1m,
    item.candlesM1,
    item.candles_m1,
    item.m1,
    item.candles5m,
    item.candlesM5,
    item.candles
  );
}

function getCandles5m(item = {}) {
  return pickCandles(item.candles5m, item.candlesM5, item.candles_m5, item.m5, item.candles);
}

function getCandles15m(item = {}) {
  return pickCandles(item.candles15m, item.candlesM15, item.candles_m15, item.m15);
}

function getCandles1h(item = {}) {
  return pickCandles(item.candles1h, item.candlesH1, item.candles_h1, item.h1);
}

function getCandleCount(candles) {
  return Array.isArray(candles) ? candles.length : 0;
}

function getSupportResistance(candles = [], lookback = 30) {
  if (!Array.isArray(candles) || candles.length < 10) {
    return {
      support: 0,
      resistance: 0,
      close: 0,
      range: 0,
    };
  }

  const recent = candles.slice(-lookback);
  const highs = recent.map(getHigh).filter((value) => value > 0);
  const lows = recent.map(getLow).filter((value) => value > 0);
  const close = getClose(recent[recent.length - 1]);

  if (!highs.length || !lows.length || !close) {
    return {
      support: 0,
      resistance: 0,
      close: 0,
      range: 0,
    };
  }

  const support = Math.min(...lows);
  const resistance = Math.max(...highs);

  return {
    support,
    resistance,
    close,
    range: resistance - support,
  };
}

function getPricePrecision(asset) {
  const category = getAssetCategory(asset);

  if (category === "FOREX") return 5;

  return 2;
}

function roundPrice(value, asset) {
  const number = toNumber(value);
  const precision = getPricePrecision(asset);

  if (!number) return 0;

  return Number(number.toFixed(precision));
}

function getRiskPercent(asset) {
  const category = getAssetCategory(asset);

  if (category === "FOREX") return 0.0012;
  if (category === "GOLD") return 0.004;
  if (category === "CRYPTO") return 0.004;
  if (category === "INDEX") return 0.003;

  return 0.004;
}

function buildTradePlan(item = {}, direction = "AGUARDAR") {
  const asset = getAssetName(item);
  const price = getCurrentPrice(item);
  const candles5m = getCandles5m(item);
  const sr = getSupportResistance(candles5m, 30);

  if (!isTradeDirection(direction) || !price) {
    return {
      currentPrice: roundPrice(price, asset),
      price: roundPrice(price, asset),
      entry: 0,
      entryPrice: 0,
      stop: 0,
      stopLoss: 0,
      tp1: 0,
      tp2: 0,
      tp3: 0,
      takeProfit: 0,
      target: 0,
      rr: 0,
      riskReward: "-",
      riskRewardRatio: 0,
    };
  }

  const riskByPercent = price * getRiskPercent(asset);
  const riskByRange = sr.range > 0 ? sr.range * 0.25 : 0;
  const risk = Math.max(riskByPercent, riskByRange || 0);

  let entry = price;
  let stop = 0;
  let tp1 = 0;
  let tp2 = 0;
  let tp3 = 0;

  if (direction === "COMPRA") {
    stop = entry - risk;
    tp1 = entry + risk;
    tp2 = entry + risk * 1.5;
    tp3 = entry + risk * 2;
  }

  if (direction === "VENDA") {
    stop = entry + risk;
    tp1 = entry - risk;
    tp2 = entry - risk * 1.5;
    tp3 = entry - risk * 2;
  }

  return {
    currentPrice: roundPrice(price, asset),
    price: roundPrice(price, asset),
    entry: roundPrice(entry, asset),
    entryPrice: roundPrice(entry, asset),
    stop: roundPrice(stop, asset),
    stopLoss: roundPrice(stop, asset),
    tp1: roundPrice(tp1, asset),
    tp2: roundPrice(tp2, asset),
    tp3: roundPrice(tp3, asset),
    takeProfit: roundPrice(tp3, asset),
    target: roundPrice(tp3, asset),
    rr: 2,
    riskReward: "1:2.00",
    riskRewardRatio: 2,
  };
}

function normalizeDetailScore(value) {
  return Math.round(clamp(value, 0, 100));
}

function buildDefaultAiAnalysis({
  profile,
  direction = "AGUARDAR",
  setupType = "AGUARDAR",
  score = 0,
  reason = "Análise ainda não disponível.",
}) {
  return {
    opportunityStatus: "AGUARDAR",
    marketBias: "INDEFINIDA",
    marketBiasConfidence: 0,
    entryType: "AGUARDAR",
    aiDirection: direction,
    aiScore: normalizeDetailScore(score),
    entryZone: 0,
    invalidation: 0,
    targetZone: 0,
    aiReason: reason,
    reason,
    missingConfirmation: reason,
    profile,
    selectedSetup: setupType,
    selectedDirection: direction,
  };
}

function buildScoreDetails(analysis = {}, safety = {}, profileValue = "DAY_TRADE") {
  const original = analysis.scoreDetails || {};
  const aiAnalysis =
    analysis.aiAnalysis ||
    original.aiAnalysis ||
    buildDefaultAiAnalysis({
      profile: profileValue,
      direction: analysis.direction,
      setupType: analysis.setupType,
      score: analysis.score,
      reason: original.reason || safety.reason,
    });

  return {
    ...original,

    profile: analysis.profile || original.profile || profileValue,
    setupType: analysis.setupType || original.setupType || "AGUARDAR",
    strategy: analysis.strategy || original.strategy || analysis.setupType || "AGUARDAR",

    selectedSetup:
      original.selectedSetup ||
      aiAnalysis.selectedSetup ||
      analysis.setupType ||
      "AGUARDAR",

    selectedDirection:
      original.selectedDirection ||
      aiAnalysis.selectedDirection ||
      analysis.direction ||
      "AGUARDAR",

    rawDirection: original.rawDirection || analysis.direction || "AGUARDAR",
    rawScore: original.rawScore ?? analysis.score ?? 0,
    finalScore: original.finalScore ?? analysis.score ?? 0,
    difference: original.difference ?? 0,

    opportunityStatus:
      analysis.opportunityStatus ||
      original.opportunityStatus ||
      aiAnalysis.opportunityStatus ||
      "AGUARDAR",

    marketBias:
      analysis.marketBias ||
      original.marketBias ||
      aiAnalysis.marketBias ||
      "INDEFINIDA",

    marketBiasConfidence:
      analysis.marketBiasConfidence ||
      original.marketBiasConfidence ||
      aiAnalysis.marketBiasConfidence ||
      0,

    entryType:
      analysis.entryType ||
      original.entryType ||
      aiAnalysis.entryType ||
      "AGUARDAR",

    aiDirection:
      analysis.aiDirection ||
      original.aiDirection ||
      aiAnalysis.aiDirection ||
      analysis.direction ||
      "AGUARDAR",

    aiScore:
      analysis.aiScore ||
      original.aiScore ||
      aiAnalysis.aiScore ||
      normalizeDetailScore(analysis.score),

    aiReason:
      analysis.aiReason ||
      original.aiReason ||
      aiAnalysis.aiReason ||
      original.reason ||
      safety.reason ||
      "",

    missingConfirmation:
      analysis.missingConfirmation ||
      original.missingConfirmation ||
      aiAnalysis.missingConfirmation ||
      "",

    aiAnalysis,

    safetyStatus: safety.safetyStatus || safety.status || "OK",
    safetyBlocked: Boolean(safety.safetyBlocked || safety.blocked),
    safetyReason: safety.reason || "",
    safetyWarnings: safety.warnings || [],
    priceValidation: safety.priceValidation,
  };
}

function applyProfileFilter(analysis = {}, safety = {}, profileValue = "DAY_TRADE") {
  const rules = getProfileRules(profileValue);
  const score = toNumber(analysis.score);
  const originalDirection = analysis.direction || "AGUARDAR";
  const setupType = normalizeSetupType(
    analysis.setupType || analysis.scoreDetails?.selectedSetup || analysis.strategy
  );

  let direction = originalDirection;
  let reason = "";

  if (safety.blocked) {
    return {
      direction: "AGUARDAR",
      status: "AGUARDAR",
      setupType,
      strategy: setupType,
      reason: safety.reason || "Ativo bloqueado pela segurança.",
      rules,
    };
  }

  if (isTradeDirection(direction) && !rules.allowedSetups.includes(setupType)) {
    direction = score >= rules.observeScore ? "OBSERVAR" : "AGUARDAR";
    reason = `Setup ${setupType} não é o principal para o perfil ${rules.profile}.`;
  }

  if (isTradeDirection(direction) && score < rules.minTradeScore) {
    direction = score >= rules.observeScore ? "OBSERVAR" : "AGUARDAR";
    reason = `Score ${score} abaixo da entrada mínima ${rules.minTradeScore}.`;
  }

  if (safety.status === "ALERTA" && isTradeDirection(direction) && score < 93) {
    direction = "OBSERVAR";
    reason = safety.reason || "Sinal em observação por alerta de segurança.";
  }

  return {
    direction,
    status: direction,
    setupType,
    strategy: setupType,
    reason,
    rules,
  };
}

function getOpportunityStatusFromAnalysis(analysis = {}, filteredDirection = "AGUARDAR") {
  const scoreDetails = analysis.scoreDetails || {};
  const aiAnalysis = analysis.aiAnalysis || scoreDetails.aiAnalysis || {};

  if (isTradeDirection(filteredDirection)) return "ENTRADA";

  return (
    analysis.opportunityStatus ||
    scoreDetails.opportunityStatus ||
    aiAnalysis.opportunityStatus ||
    (filteredDirection === "OBSERVAR" ? "OBSERVAR" : "AGUARDAR")
  );
}

function removeHeavyData(item = {}) {
  const heavyKeys = new Set([
    "candles",
    "candles1m",
    "candlesM1",
    "candlesFast",
    "candles_fast",
    "candles5m",
    "candlesM5",
    "candles15m",
    "candlesM15",
    "candles1h",
    "candlesH1",
    "candles_m1",
    "candles_m5",
    "candles_m15",
    "candles_h1",
    "m1",
    "m5",
    "m15",
    "h1",
  ]);

  const cleaned = {};

  for (const [key, value] of Object.entries(item || {})) {
    if (!heavyKeys.has(key)) {
      cleaned[key] = value;
    }
  }

  const fast = getFastCandles(item);
  const m5 = getCandles5m(item);
  const m15 = getCandles15m(item);
  const h1 = getCandles1h(item);

  cleaned.candleInfo = {
    ...(item.candleInfo || {}),
    candlesFast: getCandleCount(fast),
    candles1m: getCandleCount(fast),
    candles5m: getCandleCount(m5),
    candles15m: getCandleCount(m15),
    candles1h: getCandleCount(h1),
  };

  return cleaned;
}

function buildBlockedAnalysis(item = {}, safety = {}, profileValue = "DAY_TRADE") {
  const profile = normalizeProfile(profileValue);
  const asset = getAssetName(item);
  const price = getCurrentPrice(item);

  const aiAnalysis = buildDefaultAiAnalysis({
    profile,
    direction: "AGUARDAR",
    setupType: "BLOQUEADO",
    score: 0,
    reason: safety.reason || "Ativo bloqueado pela segurança.",
  });

  return {
    ...removeHeavyData(item),

    asset,
    symbol: item.symbol || asset,
    price,
    currentPrice: price,

    score: 0,
    confidence: 0,
    direction: "AGUARDAR",
    rawDirection: "AGUARDAR",
    level: "AGUARDAR",
    setupType: "BLOQUEADO",
    strategy: "BLOQUEADO",
    profile,

    opportunityStatus: "AGUARDAR",
    marketBias: "INDEFINIDA",
    entryType: "BLOQUEADO",
    aiReason: safety.reason || "Ativo bloqueado pela segurança.",
    missingConfirmation: safety.reason || "Ativo bloqueado pela segurança.",
    aiAnalysis,

    safetyStatus: "BLOQUEADO",
    safetyBlocked: true,
    safetyReason: safety.reason,
    safetyWarnings: safety.warnings || [],
    priceValidation: safety.priceValidation,

    buyScore: 0,
    sellScore: 0,
    trendBuyScore: 0,
    trendSellScore: 0,
    reversalBuyScore: 0,
    reversalSellScore: 0,
    scalpingBuyScore: 0,
    scalpingSellScore: 0,
    smcBuyScore: 0,
    smcSellScore: 0,

    ...buildTradePlan(item, "AGUARDAR"),

    scoreDetails: {
      profile,
      setupType: "BLOQUEADO",
      strategy: "BLOQUEADO",
      selectedSetup: "BLOQUEADO",
      selectedDirection: "AGUARDAR",
      rawDirection: "AGUARDAR",
      rawScore: 0,
      finalScore: 0,
      difference: 0,

      opportunityStatus: "AGUARDAR",
      marketBias: "INDEFINIDA",
      marketBiasConfidence: 0,
      entryType: "BLOQUEADO",
      aiDirection: "AGUARDAR",
      aiScore: 0,
      aiReason: safety.reason || "Ativo bloqueado pela segurança.",
      missingConfirmation: safety.reason || "Ativo bloqueado pela segurança.",
      aiAnalysis,

      buyScore: 0,
      sellScore: 0,
      trendBuyScore: 0,
      trendSellScore: 0,
      reversalBuyScore: 0,
      reversalSellScore: 0,
      scalpingBuyScore: 0,
      scalpingSellScore: 0,
      smcBuyScore: 0,
      smcSellScore: 0,

      candlesFast: getCandleCount(getFastCandles(item)),
      candles5m: getCandleCount(getCandles5m(item)),
      candles15m: getCandleCount(getCandles15m(item)),
      candles1h: getCandleCount(getCandles1h(item)),

      safetyStatus: "BLOQUEADO",
      safetyBlocked: true,
      safetyReason: safety.reason,
      safetyWarnings: safety.warnings || [],
      priceValidation: safety.priceValidation,
    },
  };
}

function buildRadarAsset(item = {}, analysis = {}, safety = {}, profileValue = "DAY_TRADE") {
  const profile = normalizeProfile(profileValue);
  const filtered = applyProfileFilter(analysis, safety, profile);
  const scoreDetails = buildScoreDetails(analysis, safety, profile);
  const finalDirection = filtered.direction;
  const plan = buildTradePlan(item, finalDirection);

  const opportunityStatus = getOpportunityStatusFromAnalysis(analysis, finalDirection);
  const aiAnalysis = scoreDetails.aiAnalysis;

  const setupType =
    normalizeSetupType(analysis.setupType || scoreDetails.selectedSetup || filtered.setupType) ||
    "AGUARDAR";

  const strategy =
    normalizeSetupType(analysis.strategy || setupType || scoreDetails.strategy) ||
    setupType;

  const asset = getAssetName(item);

  return {
    ...removeHeavyData(item),

    asset,
    symbol: item.symbol || asset,
    mt5Symbol: item.mt5Symbol || item.mt5_symbol || item.symbol || asset,

    score: toNumber(analysis.score),
    confidence: toNumber(analysis.score),
    direction: finalDirection,
    rawDirection: analysis.direction || scoreDetails.rawDirection || "AGUARDAR",
    level: analysis.level || "AGUARDAR",

    setupType,
    strategy,
    profile,

    selectedSetup: scoreDetails.selectedSetup,
    selectedDirection: scoreDetails.selectedDirection,

    opportunityStatus,
    marketBias: scoreDetails.marketBias,
    marketBiasConfidence: scoreDetails.marketBiasConfidence,
    entryType: scoreDetails.entryType,
    aiDirection: scoreDetails.aiDirection,
    aiScore: scoreDetails.aiScore,
    aiReason: scoreDetails.aiReason,
    missingConfirmation: scoreDetails.missingConfirmation,
    aiAnalysis,

    safetyStatus: safety.safetyStatus || safety.status || "OK",
    safetyBlocked: Boolean(safety.safetyBlocked || safety.blocked),
    safetyReason: safety.reason || filtered.reason || "",
    safetyWarnings: safety.warnings || [],
    priceValidation: safety.priceValidation,
    spreadPercent: safety.spreadPercent,

    backendProfileRules: filtered.rules,

    indicators: analysis.indicators,
    indicatorsFast: analysis.indicatorsFast,
    indicators15m: analysis.indicators15m,
    indicators1h: analysis.indicators1h,

    buyScore: scoreDetails.buyScore,
    sellScore: scoreDetails.sellScore,

    trendBuyScore: scoreDetails.trendBuyScore,
    trendSellScore: scoreDetails.trendSellScore,

    reversalBuyScore: scoreDetails.reversalBuyScore,
    reversalSellScore: scoreDetails.reversalSellScore,

    scalpingBuyScore: scoreDetails.scalpingBuyScore,
    scalpingSellScore: scoreDetails.scalpingSellScore,

    smcBuyScore: scoreDetails.smcBuyScore,
    smcSellScore: scoreDetails.smcSellScore,

    rawScore: scoreDetails.rawScore,
    finalScore: scoreDetails.finalScore,
    difference: scoreDetails.difference,

    candlesFast: scoreDetails.candlesFast,
    candles5m: scoreDetails.candles5m,
    candles15m: scoreDetails.candles15m,
    candles1h: scoreDetails.candles1h,

    recentMove5m: scoreDetails.recentMove5m,
    fastMove: scoreDetails.fastMove,
    range5m: scoreDetails.range5m,

    bullishRejection: scoreDetails.bullishRejection,
    bearishRejection: scoreDetails.bearishRejection,
    nearSupport: scoreDetails.nearSupport,
    nearResistance: scoreDetails.nearResistance,

    ...plan,

    signalAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),

    scoreDetails: {
      ...scoreDetails,
      opportunityStatus,
      marketBias: scoreDetails.marketBias,
      entryType: scoreDetails.entryType,
      aiReason: scoreDetails.aiReason,
      missingConfirmation: scoreDetails.missingConfirmation,
      aiAnalysis,
      safetyStatus: safety.safetyStatus || safety.status || "OK",
      safetyBlocked: Boolean(safety.safetyBlocked || safety.blocked),
      safetyReason: safety.reason || filtered.reason || "",
      safetyWarnings: safety.warnings || [],
      priceValidation: safety.priceValidation,
    },
  };
}

function parseJsonFromStdout(stdout) {
  const text = String(stdout || "").trim();

  if (!text) {
    throw new Error("Python não retornou dados.");
  }

  try {
    return JSON.parse(text);
  } catch (_) {
    const firstObject = text.indexOf("{");
    const firstArray = text.indexOf("[");

    let start = -1;

    if (firstObject === -1) start = firstArray;
    else if (firstArray === -1) start = firstObject;
    else start = Math.min(firstObject, firstArray);

    const lastObject = text.lastIndexOf("}");
    const lastArray = text.lastIndexOf("]");
    const end = Math.max(lastObject, lastArray);

    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }

    throw new Error("Não foi possível interpretar o JSON do Python.");
  }
}

function extractTicks(payload) {
  if (Array.isArray(payload)) return payload;

  if (!payload || typeof payload !== "object") return [];

  const possibleKeys = ["assets", "ticks", "data", "radar", "signals", "results"];

  for (const key of possibleKeys) {
    if (Array.isArray(payload[key])) return payload[key];
  }

  if (payload.asset || payload.symbol || payload.price) return [payload];

  return [];
}

function runPython(command, args) {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        cwd: __dirname,
        maxBuffer: PYTHON_MAX_BUFFER,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new Error(
              stderr ||
                error.message ||
                `Erro ao executar ${command} ${args.join(" ")}`
            )
          );
          return;
        }

        resolve(stdout);
      }
    );
  });
}

async function fetchMt5Ticks() {
  const scriptPath = path.join(__dirname, "mt5_ticks.py");

  try {
    const stdout = await runPython("python", [scriptPath]);
    const payload = parseJsonFromStdout(stdout);

    return {
      success: true,
      payload,
      ticks: extractTicks(payload),
    };
  } catch (firstError) {
    try {
      const stdout = await runPython("py", ["-3", scriptPath]);
      const payload = parseJsonFromStdout(stdout);

      return {
        success: true,
        payload,
        ticks: extractTicks(payload),
      };
    } catch (secondError) {
      return {
        success: false,
        error: secondError.message || firstError.message,
        payload: null,
        ticks: [],
      };
    }
  }
}

function analyzeAsset(item = {}, profileValue = "DAY_TRADE") {
  const profile = normalizeProfile(profileValue);
  const safety = assessSafety(item, profile);

  if (safety.blocked) {
    return buildBlockedAnalysis(item, safety, profile);
  }

  const candlesFast = getFastCandles(item);
  const candles5m = getCandles5m(item);
  const candles15m = getCandles15m(item);
  const candles1h = getCandles1h(item);

  const analysis = calculateScore(item, {
    profile,
    mode: profile,

    candles1m: candlesFast,
    candlesM1: candlesFast,
    candlesFast,

    candles5m,
    candlesM5: candles5m,

    candles15m,
    candlesM15: candles15m,

    candles1h,
    candlesH1: candles1h,
  });

  return buildRadarAsset(item, analysis, safety, profile);
}

function sortRadar(a, b) {
  const aBlocked = a.safetyBlocked ? 1 : 0;
  const bBlocked = b.safetyBlocked ? 1 : 0;

  if (aBlocked !== bBlocked) return aBlocked - bBlocked;

  const aTrade = isTradeDirection(a.direction) ? 1 : 0;
  const bTrade = isTradeDirection(b.direction) ? 1 : 0;

  if (aTrade !== bTrade) return bTrade - aTrade;

  return toNumber(b.score) - toNumber(a.score);
}

async function scanMarket(options = {}) {
  const profile = normalizeProfile(options.profile || options.mode || "DAY_TRADE");
  const startedAt = new Date();

  const mt5 = await fetchMt5Ticks();

  if (!mt5.success) {
    const aiAnalysis = buildDefaultAiAnalysis({
      profile,
      direction: "AGUARDAR",
      setupType: "ERRO_MT5",
      score: 0,
      reason: mt5.error || "Erro ao buscar dados do MT5.",
    });

    return {
      success: false,
      profile,
      mode: profile,
      generatedAt: new Date().toISOString(),
      error: mt5.error || "Erro ao buscar dados do MT5.",
      total: 0,
      actionableAssets: 0,
      blockedAssets: 0,
      warningAssets: 0,
      radar: [],
      signals: [],
      assets: [],
      bestSignal: null,
      opportunityStatus: "AGUARDAR",
      marketBias: "INDEFINIDA",
      entryType: "ERRO_MT5",
      aiAnalysis,
    };
  }

  const ticks = mt5.ticks || [];

  const radar = ticks.map((item) => analyzeAsset(item, profile)).sort(sortRadar);

  const actionable = radar.filter(
    (item) => isTradeDirection(item.direction) && !item.safetyBlocked
  );

  const blockedAssets = radar.filter((item) => item.safetyBlocked).length;
  const warningAssets = radar.filter((item) => item.safetyStatus === "ALERTA").length;

  const bestSignal = actionable[0] || radar.find((item) => !item.safetyBlocked) || radar[0] || null;

  return {
    success: true,
    profile,
    mode: profile,
    generatedAt: new Date().toISOString(),
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),

    total: radar.length,
    totalAssets: radar.length,
    validAssets: radar.length - blockedAssets,
    actionableAssets: actionable.length,
    blockedAssets,
    warningAssets,

    radar,
    signals: radar,
    assets: radar,
    bestSignal,

    source: "MT5",
    mt5Summary: {
      success: true,
      total: radar.length,
      rawTotal: ticks.length,
      payloadTotal: mt5.payload?.total,
      payloadValid: mt5.payload?.valid,
      payloadBlocked: mt5.payload?.blocked,
    },
  };
}

module.exports = {
  scanMarket,
};