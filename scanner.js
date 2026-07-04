const { getManyMarketData } = require("./marketApi");
const config = require("./config");
const { calculateScore } = require("./scoreEngine");

function removeHeavyData(item) {
  return {
    ...item,

    candles: undefined,
    candles5m: undefined,
    candles15m: undefined,
    candles1h: undefined,

    candleInfo: {
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
      const analysis = calculateScore(item, {
        candles5m: item.candles5m || item.candles || [],
        candles15m: item.candles15m || [],
        candles1h: item.candles1h || [],
      });

      return removeHeavyData({
        ...item,
        ...analysis,
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