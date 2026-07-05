const express = require("express");
const cors = require("cors");
const path = require("path");
const { execFile } = require("child_process");
const { PORT } = require("./config");
const { scanMarket } = require("./scanner");

const app = express();

app.use(cors());
app.use(express.json());

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

function normalizeProfile(value) {
  const normalized = String(value || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace("-", "_")
    .replace(" ", "_")
    .trim();

  if (normalized.includes("SCALP")) return "SCALPING";
  if (normalized.includes("SWING")) return "SWING";

  return "DAY_TRADE";
}

function getProfileInfo(profile) {
  if (profile === "SCALPING") {
    return {
      profile: "SCALPING",
      label: "Scalping",
      description: "Operações rápidas. Regras mais rígidas para tick, spread e candles.",
      queryExample: "/scan?profile=SCALPING",
    };
  }

  if (profile === "SWING") {
    return {
      profile: "SWING",
      label: "Swing",
      description: "Operações mais longas. Exige score maior e validação por tendência/reversão.",
      queryExample: "/scan?profile=SWING",
    };
  }

  return {
    profile: "DAY_TRADE",
    label: "Day Trade",
    description: "Perfil equilibrado para operações intraday.",
    queryExample: "/scan?profile=DAY_TRADE",
  };
}

function getRequestedProfile(req) {
  return normalizeProfile(
    req.query.profile ||
      req.query.mode ||
      req.query.tipo ||
      process.env.SIGNAL_PROFILE ||
      "DAY_TRADE"
  );
}

function runPythonScript(scriptPath) {
  return new Promise((resolve, reject) => {
    execFile(
      PYTHON_PATH,
      [scriptPath],
      {
        cwd: __dirname,
        windowsHide: true,
        timeout: 15000,
        maxBuffer: 1024 * 1024,
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

async function getMt5Ticks() {
  return runPythonScript(MT5_TICKS_SCRIPT);
}

app.get("/", (req, res) => {
  res.json({
    status: "online",
    app: "SignalProAI Backend",
    version: "1.2.0",
    dataSource: "MT5",
    defaultProfile: normalizeProfile(process.env.SIGNAL_PROFILE || "DAY_TRADE"),
    profiles: [
      getProfileInfo("SCALPING"),
      getProfileInfo("DAY_TRADE"),
      getProfileInfo("SWING"),
    ],
    endpoints: [
      "/scan",
      "/scan?profile=SCALPING",
      "/scan?profile=DAY_TRADE",
      "/scan?profile=SWING",
      "/ticks",
      "/profiles",
    ],
  });
});

app.get("/profiles", (req, res) => {
  res.json({
    success: true,
    defaultProfile: normalizeProfile(process.env.SIGNAL_PROFILE || "DAY_TRADE"),
    profiles: [
      {
        ...getProfileInfo("SCALPING"),
        rules: {
          minTradeScore: 86,
          observeScore: 76,
          maxTickAgeSeconds: 30,
          maxWaitingMinutes: 45,
          maxEntryDistancePercent: 0.6,
          allowedSetups: ["SCALPING", "REVERSAO"],
        },
      },
      {
        ...getProfileInfo("DAY_TRADE"),
        rules: {
          minTradeScore: 88,
          observeScore: 78,
          maxTickAgeSeconds: 120,
          maxWaitingMinutes: 120,
          maxEntryDistancePercent: 1,
          allowedSetups: ["TENDENCIA", "REVERSAO"],
        },
      },
      {
        ...getProfileInfo("SWING"),
        rules: {
          minTradeScore: 90,
          observeScore: 80,
          maxTickAgeSeconds: 900,
          maxWaitingMinutes: 720,
          maxEntryDistancePercent: 2,
          allowedSetups: ["TENDENCIA", "REVERSAO"],
        },
      },
    ],
  });
});

app.get("/ticks", async (req, res) => {
  try {
    const result = await getMt5Ticks();

    res.json({
      ...result,
      count: Array.isArray(result.ticks) ? result.ticks.length : 0,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Erro ao buscar ticks do MT5",
      details: error.message,
    });
  }
});

app.get("/scan", async (req, res) => {
  try {
    const profile = getRequestedProfile(req);

    const result = await scanMarket({
      profile,
      mode: profile,
    });

    res.json({
      ...result,
      requestedProfile: profile,
      profileInfo: getProfileInfo(profile),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Erro ao executar scanner",
      details: error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 SignalProAI Backend rodando em http://localhost:${PORT}`);
  console.log(`📡 Ticks MT5 disponíveis em http://localhost:${PORT}/ticks`);
  console.log(`🔎 Scanner padrão em http://localhost:${PORT}/scan`);
  console.log(`⚡ Scalping em http://localhost:${PORT}/scan?profile=SCALPING`);
  console.log(`📊 Day Trade em http://localhost:${PORT}/scan?profile=DAY_TRADE`);
  console.log(`📈 Swing em http://localhost:${PORT}/scan?profile=SWING`);
});