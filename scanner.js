const { getManyMarketData } = require("./marketApi");
const config = require("./config");
const { calculateScore } = require("./scoreEngine");

function toNumber(value) {
  if (value === null || value === undefined || value === "") return 0;

  const number = Number(String(value).replace(/[^\d.-]/g, ""));
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

function isAllowedSetupForProfile(setupType, profile) {
  const setup = String(setupType || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  if (profile === "SCALPING") {
    return setup === "SCALPING" || setup === "REVERSAO";
  }

  if (profile === "SWING") {
    return setup === "TENDENCIA" || setup === "REVERSAO";
  }

  return setup === "TENDENCIA" || setup === "REVERSAO";
}

function getProfileRules(profile) {
  if (profile === "SCALPING") {
    return {
      profile,
      minTradeScore: 86,
      observeScore: 76,
      maxWaitingMinutes: 45,
      maxEntryDistancePercent: 0.6,

      tickMultiplier: 0.25,
      spreadMultiplier: 0.65,

      warningTickAgeSeconds: 15,
      maxTickAgeSeconds: 30,

      minFastCandlesToWarn: 80,
      minFastCandlesToBlock: 40,

      allowedSetups: ["SCALPING", "REVERSAO"],
    };
  }

  if (profile === "SWING") {
    return {
      profile,
      minTradeScore: 90,
      observeScore: 80,
      maxWaitingMinutes: 720,
      maxEntryDistancePercent: 2,

      tickMultiplier: 5,
      spreadMultiplier: 1.2,

      warningTickAgeSeconds: 300,
      maxTickAgeSeconds: 900,

      minFastCandlesToWarn: 50,
      minFastCandlesToBlock: 30,

      allowedSetups: ["TENDENCIA", "REVERSAO"],
    };
  }

  return {
    profile: "DAY_TRADE",
    minTradeScore: 88,
    observeScore: 78,
    maxWaitingMinutes: 120,
    maxEntryDistancePercent: 1,

    tickMultiplier: 1,
    spreadMultiplier: 1,

    warningTickAgeSeconds: 60,
    maxTickAgeSeconds: 120,

    minFastCandlesToWarn: 80,
    minFastCandlesToBlock: 40,

    allowedSetups: ["TENDENCIA", "REVERSAO"],
  };
}

function getBaseAssetSafetyRules(asset) {
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

function getAssetSafetyRules(asset, profile = "DAY_TRADE") {
  const baseRules = getBaseAssetSafetyRules(asset);
  const profileRules = getProfileRules(profile);

  return {
    ...baseRules,

    warningSpreadPercent: Number(
      (baseRules.warningSpreadPercent * profileRules.spreadMultiplier).toFixed(5)
    ),

    maxSpreadPercent: Number(
      (baseRules.maxSpreadPercent * profileRules.spreadMultiplier).toFixed(5)
    ),

    warningTickAgeSeconds:
      profile === "SCALPING"
        ? profileRules.warningTickAgeSeconds
        : Math.round(baseRules.warningTickAgeSeconds * profileRules.tickMultiplier),

    maxTickAgeSeconds:
      profile === "SCALPING"
        ? profileRules.maxTickAgeSeconds
        : Math.round(baseRules.maxTickAgeSeconds * profileRules.tickMultiplier),

    minFastCandlesToWarn: profileRules.minFastCandlesToWarn,
    minFastCandlesToBlock: profileRules.minFastCandlesToBlock,

    profileRules,
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

function getFastCandles(item) {
  return item.candles1m || item.candlesM1 || item.candles5m || item.candles || [];
}

function getSetupType(analysis) {
  return analysis?.setupType || analysis?.strategy || analysis?.scoreDetails?.setupType || "AGUARDAR";
}

function getStrategy(analysis) {
  return analysis?.strategy || analysis?.setupType || analysis?.scoreDetails?.strategy || "AGUARDAR";
}

function assessSafety(item, profile = "DAY_TRADE") {
  const rules = getAssetSafetyRules(item.asset, profile);

  const price = toNumber(item.price);
  const bid = toNumber(item.bid);
  const ask = toNumber(item.ask);
  const spread = toNumber(item.spread || Math.abs(ask - bid));
  const spreadPercent = getSpreadPercent(item);
  const tickAgeSeconds = getTickAgeSeconds(item);

  const candlesFastCount = getCandleCount(getFastCandles(item));
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

  if (profile === "SCALPING") {
    if (candlesFastCount < rules.minFastCandlesToBlock) {
      blockedReasons.push("Poucos candles rápidos para validar scalping.");
    } else if (candlesFastCount < rules.minFastCandlesToWarn) {
      warningReasons.push("Quantidade de candles rápidos abaixo do ideal para scalping.");
    }

    if (!item.candles1m && !item.candlesM1) {
      warningReasons.push("Scalping usando candles rápidos aproximados. Ideal ativar M1 no backend.");
    }
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
      candlesFast: candlesFastCount,
      candles5m: candles5mCount,
      candles15m: candles15mCount,
      candles1h: candles1hCount,
    },
    limits: rules,
    profile,
  };
}

function applyProfileFilter(analysis, profileRules) {
  const originalScore = toNumber(analysis.score);
  const originalDirection = analysis.direction || "AGUARDAR";
  const setupType = getSetupType(analysis);
  const strategy = getStrategy(analysis);

  if (!isTradeDirection(originalDirection)) {
    return {
      ...analysis,
      setupType,
      strategy,
      actionable: false,
    };
  }

  if (!isAllowedSetupForProfile(setupType, profileRules.profile)) {
    return {
      ...analysis,
      originalScore,
      originalDirection,
      score: Math.min(originalScore, 82),
      direction: "OBSERVAR",
      level: "OBSERVAR",
      actionable: false,
      setupType,
      strategy,
      profileBlocked: true,
      profileReason: `Setup ${setupType} não permitido para o perfil ${profileRules.profile}.`,
    };
  }

  if (originalScore < profileRules.minTradeScore) {
    return {
      ...analysis,
      originalScore,
      originalDirection,
      direction: originalScore >= profileRules.observeScore ? "OBSERVAR" : "AGUARDAR",
      actionable: false,
      setupType,
      strategy,
      profileBlocked: false,
      profileReason: `Score ${originalScore} abaixo do mínimo ${profileRules.minTradeScore} para ${profileRules.profile}.`,
    };
  }

  return {
    ...analysis,
    originalScore,
    originalDirection,
    setupType,
    strategy,
    actionable: true,
    profileBlocked: false,
    profileReason: null,
  };
}

function applySafetyFilter(item, analysis, safety, profileRules) {
  const originalScore = toNumber(analysis.score);
  const originalDirection = analysis.direction || "AGUARDAR";
  const setupType = getSetupType(analysis);
  const strategy = getStrategy(analysis);

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
      setupType,
      strategy,
      profile: profileRules.profile,
    };
  }

  if (safety.warning && isTradeDirection(originalDirection)) {
    return {
      ...analysis,
      originalScore,
      originalDirection,
      score: Math.min(originalScore, 82),
      direction: "OBSERVAR",
      level: "ATENÇÃO",
      actionable: false,
      safetyBlocked: false,
      safetyWarning: true,
      safetyStatus: safety.status,
      safetyReasons: safety.warningReasons,
      setupType,
      strategy,
      profile: profileRules.profile,
    };
  }

  const profileFiltered = applyProfileFilter(
    {
      ...analysis,
      originalScore,
      originalDirection,
      setupType,
      strategy,
      profile: profileRules.profile,
    },
    profileRules
  );

  return {
    ...profileFiltered,
    safetyBlocked: false,
    safetyWarning: safety.warning,
    safetyStatus: safety.status,
    safetyReasons: safety.warningReasons,
    setupType,
    strategy,
    profile: profileRules.profile,
  };
}

function removeHeavyData(item) {
  return {
    ...item,

    candles: undefined,
    candles1m: undefined,
    candlesM1: undefined,
    candles5m: undefined,
    candles15m: undefined,
    candles1h: undefined,

    candleInfo: item.safety?.candleInfo || {
      candlesFast: getCandleCount(getFastCandles(item)),
      candles5m: getCandleCount(item.candles5m || item.candles),
      candles15m: getCandleCount(item.candles15m),
      candles1h: getCandleCount(item.candles1h),
    },
  };
}

function getBestSignal(radar = []) {
  const actionable = radar.find((item) => {
    return (
      item.actionable === true &&
      isTradeDirection(item.direction) &&
      item.safetyBlocked !== true &&
      item.safetyWarning !== true
    );
  });

  return actionable || radar[0] || null;
}

async function scanMarket(options = {}) {
  const profile = normalizeProfile(
    options.profile ||
      options.mode ||
      config.TRADING_PROFILE ||
      process.env.SIGNAL_PROFILE ||
      "DAY_TRADE"
  );

  const profileRules = getProfileRules(profile);
  const marketData = await getManyMarketData(config.SYMBOLS);

  const radar = marketData
    .map((item) => {
      const safety = assessSafety(item, profile);

      const analysis = calculateScore(item, {
        profile,
        mode: profile,

        candles1m: item.candles1m || item.candlesM1 || [],
        candlesM1: item.candlesM1 || item.candles1m || [],

        candles5m: item.candles5m || item.candles || [],
        candles15m: item.candles15m || [],
        candles1h: item.candles1h || [],
      });

      const safeAnalysis = applySafetyFilter(item, analysis, safety, profileRules);

      return removeHeavyData({
        ...item,
        ...safeAnalysis,
        safety,
        profile,
        profileRules: {
          minTradeScore: profileRules.minTradeScore,
          observeScore: profileRules.observeScore,
          maxWaitingMinutes: profileRules.maxWaitingMinutes,
          maxEntryDistancePercent: profileRules.maxEntryDistancePercent,
          allowedSetups: profileRules.allowedSetups,
        },
      });
    })
    .sort((a, b) => {
      if (a.actionable && !b.actionable) return -1;
      if (!a.actionable && b.actionable) return 1;
      return toNumber(b.score) - toNumber(a.score);
    });

  return {
    totalAssets: radar.length,
    bestSignal: getBestSignal(radar),
    radar,
    lastUpdate: new Date().toLocaleTimeString("pt-BR"),
    source: "MT5",
    real: true,
    simulated: false,
    profile,
    profileRules: {
      minTradeScore: profileRules.minTradeScore,
      observeScore: profileRules.observeScore,
      maxWaitingMinutes: profileRules.maxWaitingMinutes,
      maxEntryDistancePercent: profileRules.maxEntryDistancePercent,
      allowedSetups: profileRules.allowedSetups,
    },
  };
}

module.exports = {
  scanMarket,
};