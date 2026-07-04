const path = require("path");
const { execFile } = require("child_process");

const PYTHON_PATH =
  process.env.PYTHON_PATH ||
  path.join(
    process.env.LOCALAPPDATA || "",
    "Programs",
    "Python",
    "Python312",
    "python.exe"
  );

const MT5_TICKS_SCRIPT = path.join(__dirname, "mt5_ticks.py");

function normalizeAsset(value) {
  return String(value || "")
    .toUpperCase()
    .replace("/", "")
    .replace("-", "")
    .replace("_", "")
    .trim();
}

function normalizeCoinbaseSymbol(symbol) {
  return String(symbol || "").replace("-", "/").toUpperCase();
}

function runPythonScript(scriptPath) {
  return new Promise((resolve, reject) => {
    execFile(
      PYTHON_PATH,
      [scriptPath],
      {
        cwd: __dirname,
        windowsHide: true,
        timeout: 20000,
        maxBuffer: 1024 * 1024 * 10,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new Error(
              stderr ||
                error.message ||
                "Erro desconhecido ao executar script Python"
            )
          );
          return;
        }

        try {
          const output = String(stdout || "").trim();
          const parsed = JSON.parse(output);
          resolve(parsed);
        } catch (parseError) {
          reject(
            new Error(
              `Erro ao interpretar resposta do Python: ${parseError.message}. Saída: ${stdout}`
            )
          );
        }
      }
    );
  });
}

async function getMt5Payload() {
  const result = await runPythonScript(MT5_TICKS_SCRIPT);

  if (!result?.success) {
    throw new Error(result?.error || "Erro ao buscar dados do MT5");
  }

  return result;
}

function cleanMarketItem(item) {
  return {
    asset: item.asset,
    symbol: item.symbol,
    price: Number(item.price),
    bid: Number(item.bid),
    ask: Number(item.ask),
    last: Number(item.last || 0),
    spread: Number(item.spread || 0),
    digits: Number(item.digits || 0),
    volume: Number(item.volume || 0),
    time: item.time,
    timeMs: item.timeMs,
    source: item.source || "MT5",
    server: item.server,
    real: true,
    simulated: false,
    candles: Array.isArray(item.candles) ? item.candles : [],
    candles5m: Array.isArray(item.candles5m) ? item.candles5m : [],
    candles15m: Array.isArray(item.candles15m) ? item.candles15m : [],
    candles1h: Array.isArray(item.candles1h) ? item.candles1h : [],
  };
}

async function getAllMt5MarketData() {
  const payload = await getMt5Payload();

  return (payload.ticks || [])
    .filter((item) => item?.success && Number(item.price) > 0)
    .map(cleanMarketItem);
}

async function getTicker(symbol) {
  const requestedAsset = normalizeCoinbaseSymbol(symbol);
  const marketData = await getAllMt5MarketData();

  const found = marketData.find((item) => {
    return (
      normalizeAsset(item.asset) === normalizeAsset(requestedAsset) ||
      normalizeAsset(item.symbol) === normalizeAsset(symbol)
    );
  });

  if (!found) {
    throw new Error(`Ativo não encontrado no MT5: ${symbol}`);
  }

  return found;
}

async function getCandles(symbol, granularity = 300) {
  const ticker = await getTicker(symbol);

  if (granularity === 900) return ticker.candles15m || [];
  if (granularity === 3600) return ticker.candles1h || [];

  return ticker.candles5m || ticker.candles || [];
}

async function getMarketData(symbol) {
  const ticker = await getTicker(symbol);

  return {
    ...ticker,
    candles: ticker.candles5m || ticker.candles || [],
    candles5m: ticker.candles5m || [],
    candles15m: ticker.candles15m || [],
    candles1h: ticker.candles1h || [],
  };
}

async function getManyMarketData() {
  // Agora o scanner usa todos os ativos reais disponíveis no MT5.
  // Não depende mais da lista antiga config.SYMBOLS.
  return getAllMt5MarketData();
}

module.exports = {
  getTicker,
  getCandles,
  getMarketData,
  getManyMarketData,
};