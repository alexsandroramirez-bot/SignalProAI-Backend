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
    version: "1.1.0",
    dataSource: "MT5",
    endpoints: ["/scan", "/ticks"],
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
    const result = await scanMarket();

    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: "Erro ao executar scanner",
      details: error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 SignalProAI Backend rodando em http://localhost:${PORT}`);
  console.log(`📡 Ticks MT5 disponíveis em http://localhost:${PORT}/ticks`);
});