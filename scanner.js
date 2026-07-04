const { getManyMarketData } = require("./marketApi");
const config = require("./config");
const { calculateScore } = require("./scoreEngine");

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizeAsset(asset) {
  return String(asset || "")
    .toUpperCase()
    .replace("/", "")
    .replace("-", "")
    .replace("_", "")
    .trim();
}

function isTradeDirection(direction) {
  return direction === "COMPRA" || direction === "VENDA";
}

function getAssetSafetyRules(asset) {
  const normalized = normalizeAsset(asset);

  if (normalized.includes("BTC") || normalized.includes("ETH")) {
    return {
      warningSpreadPercent: 0.08,
      maxSpreadPercent: 0.15,
      warningTickAgeSeconds: 60,
      maxTickAgeSeconds: 120,
      minCandlesToWarn: 100,
      minCandlesToBlock: 50,
    };
  }

  if (normalized.includes("EUR") || normalized.includes("GBP")) {
    return {
      warningSpreadPercent: 0.015,
      maxSpreadPercent: 0.03,
      warningTickAgeSeconds: 60,
      maxTickAgeSeconds: 120,
      minCandlesToWarn: 100,
      minCandlesToBlock: 50,
    };
  }

  if (normalized.includes("XAU")) {
    return {
      warningSpreadPercent: 0.04,
      maxSpreadPercent: 0.08,
      warningTickAgeSeconds: 60,
      maxTickAgeSeconds: 120,
      minCandlesToWarn: 100,
      minCandlesToBlock: 50,
    };
  }

  if (
    normalized.includes("US30") ||
    normalized.includes("US500") ||
    normalized.includes("NAS100") ||
    normalized.includes("USTEC")
  ) {
    return {
      warningSpreadPercent: 0.06,
      maxSpreadPercent: 0.12,
      warningTickAgeSeconds: 60,
      maxTickAgeSeconds: 120,
      minCandlesToWarn: 100,
      minCandlesToBlock: 50,
    };
  }

  return {
    warningSpreadPercent: 0.08,
    maxSpreadPercent: 0.15,
    warningTickAgeSeconds: 60,
    maxTickAgeSeconds: 120,
    minCandlesToWarn: 100,
    minCandlesToBlock: 50,
  };
}

function getSpreadPercent(item) {
  const price = toNumber(item.price);
  const spread = toNumber(item.spread || Math.abs(toNumber(item.ask) - toNumber(item.bid)));

  if (!price || !spread) return 0;

  return (spread / price) * 100;
}

function getTickAgeSeconds(item) {
  if (item.timeMs) {
    const ageMs = Date.now() - Number(item.timeMs);
    return Number.isFinite(ageMs) ? Math.max(0, ageMs / 1000) : null;
  }

  if (item.time) {
    const timestamp = new Date(item.time).getTime();
    const ageMs = Date.now() - timestamp;
    return Number.isFinite(ageMs) ? Math.max(0, ageMs / 1000) : null;
  }

  return null;
}

function getCandleCount(candles) {
  return Array.isArray(candles) ? candles.length : 0;
}

function assessSafety(item) {
  const rules = getAssetSafetyRules(item.asset);

  const price = toNumber(item.price);
  const bid = toNumber(item.bid);
  const ask = toNumber(item.ask);
  const spread = toNumber(item.spread || Math.abs(ask - bid));
  const spreadPercent = getSpreadPercent(item);
  const tickAgeSeconds = getTickAgeSeconds(item);

  const candles5mCount = getCandleCount(item.candles5m || item.candles);
  const candles15mCount = getCandleCount(item.candles15m);
  const candles1hCount = getCandleCount(item.candles1h);

  const blockedReasons = [];
  const warningReasons = [];

  if (item.real !== true || item.simulated === true) {
    blockedReasons.push("Dados não confirmados como reais via MT5.");
  }

  if (!price || price <= 0) {
    blockedReasons.push("Preço inválido.");
  }

  if (!bid || bid <= 0 || !ask || ask <= 0) {
    blockedReasons.push("Bid/Ask inválidos.");
  }

  if (ask > 0 && bid > 0 && ask <= bid) {
    blockedReasons.push("Ask menor ou igual ao bid.");
  }

  if (spreadPercent >= rules.maxSpreadPercent) {
    blockedReasons.push(
      `Spread alto: ${spreadPercent.toFixed(4)}%. Limite: ${rules.maxSpreadPercent}%.`
    );
  } else if (spreadPercent >= rules.warningSpreadPercent) {
    warningReasons.push(
      `Spread em atenção: ${spreadPercent.toFixed(4)}%. Ideal abaixo de ${rules.warningSpreadPercent}%.`
    );
  }

  if (tickAgeSeconds === null) {
    warningReasons.push("Horário do tick não identificado.");
  } else if (tickAgeSeconds >= rules.maxTickAgeSeconds) {
    blockedReasons.push(
      `Tick antigo: ${tickAgeSeconds.toFixed(0)}s sem atualização. Limite: ${rules.maxTickAgeSeconds}s.`
    );
  } else if (tickAgeSeconds >= rules.warningTickAgeSeconds) {
    warningReasons.push(
      `Tick atrasado: ${tickAgeSeconds.toFixed(0)}s sem atualização.`
    );
  }

  if (
    candles5mCount < rules.minCandlesToBlock ||
    candles15mCount < rules.minCandlesToBlock ||
    candles1hCount < rules.minCandlesToBlock
  ) {
    blockedReasons.push("Poucos candles para validar o setup.");
  } else if (
    candles5mCount < rules.minCandlesToWarn ||
    candles15mCount < rules.minCandlesToWarn ||
    candles1hCount < rules.minCandlesToWarn
  ) {
    warningReasons.push("Quantidade de candles abaixo do ideal.");
  }

  const status =
    blockedReasons.length > 0
      ? "BLOQUEADO"
      : warningReasons.length > 0
      ? "ATENÇÃO"
      : "OK";

  return {
    status,
    ok: status === "OK",
    blocked: status === "BLOQUEADO",
    warning: status === "ATENÇÃO",
    blockedReasons,
    warningReasons,
    spread,
    spreadPercent,
    tickAgeSeconds,
    candleInfo: {
      candles5m: candles5mCount,
      candles15m: candles15mCount,
      candles1h: candles1hCount,
    },
    limits: rules,
  };
}

function applySafetyFilter(item, analysis, safety) {
  const originalScore = toNumber(analysis.score);
  const originalDirection = analysis.direction || "AGUARDAR";

  if (safety.blocked) {
    return {
      ...analysis,
      originalScore,
      originalDirection,
      score: Math.min(originalScore, 70),
      direction: "AGUARDAR",
      level: "BLOQUEADO",
      actionable: false,
      safetyBlocked: true,
      safetyWarning: false,
      safetyStatus: safety.status,
      safetyReasons: safety.blockedReasons,
    };
  }

  if (safety.warning && isTradeDirection(originalDirection)) {
    return {
      ...analysis,
      originalScore,
      originalDirection,
      score: Math.min(originalScore, 82),
      direction: "OBSERVAR",
      actionable: false,
      safetyBlocked: false,
      safetyWarning: true,
      safetyStatus: safety.status,
      safetyReasons: safety.warningReasons,
    };
  }

  return {
    ...analysis,
    originalScore,
    originalDirection,
    actionable: isTradeDirection(originalDirection),
    safetyBlocked: false,
    safetyWarning: safety.warning,
    safetyStatus: safety.status,
    safetyReasons: safety.warningReasons,
  };
}

function removeHeavyData(item) {
  return {
    ...item,

    candles: undefined,
    candles5m: undefined,
    candles15m: undefined,
    candles1h: undefined,

    candleInfo: item.safety?.candleInfo || {
      candles5m: Array.isArray(item.candles5m) ? item.candles5m.length : 0,
      candles15m: Array.isArray(item.candles15m) ? item.candles15m.length : 0,
      candles1h: Array.isArray(item.candles1h) ? item.candles1h.length : 0,
    },
  };
}

async function scanMarket() {
  const marketData = await getManyMarketData(config.SYMBOLS);

  const radar = marketData
    .map((item) => {
      const safety = assessSafety(item);

      const analysis = calculateScore(item, {
        candles5m: item.candles5m || item.candles || [],
        candles15m: item.candles15m || [],
        candles1h: item.candles1h || [],
      });

      const safeAnalysis = applySafetyFilter(item, analysis, safety);

      return removeHeavyData({
        ...item,
        ...safeAnalysis,
        safety,
      });
    })
    .sort((a, b) => b.score - a.score);

  return {
    totalAssets: radar.length,
    bestSignal: radar[0] || null,
    radar,
    lastUpdate: new Date().toLocaleTimeString("pt-BR"),
    source: "MT5",
    real: true,
    simulated: false,
  };
}

module.exports = {
  scanMarket,
};