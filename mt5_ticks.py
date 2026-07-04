import json
import sys
from datetime import datetime

import MetaTrader5 as mt5

SYMBOL_MAP = {
    "BTC/USD": "BTCUSDm",
    "ETH/USD": "ETHUSDm",
    "EUR/USD": "EURUSDm",
    "GBP/USD": "GBPUSDm",
    "XAU/USD": "XAUUSDm",
    "US30": "US30m",
    "US500": "US500m",
    "NAS100": "USTECm",
}

TIMEFRAME_MAP = {
    "candles5m": mt5.TIMEFRAME_M5,
    "candles15m": mt5.TIMEFRAME_M15,
    "candles1h": mt5.TIMEFRAME_H1,
}

CANDLE_LIMIT = 200


def error_response(message, details=None):
    print(
        json.dumps(
            {
                "success": False,
                "error": message,
                "details": details,
                "ticks": [],
            },
            ensure_ascii=False,
        )
    )


def format_candle(rate):
    return {
        "time": int(rate["time"]),
        "open": float(rate["open"]),
        "high": float(rate["high"]),
        "low": float(rate["low"]),
        "close": float(rate["close"]),
        "volume": float(rate["tick_volume"]),
    }


def get_candles(mt5_symbol, timeframe):
    rates = mt5.copy_rates_from_pos(mt5_symbol, timeframe, 0, CANDLE_LIMIT)

    if rates is None:
        return []

    return [format_candle(rate) for rate in rates]


def get_tick(app_asset, mt5_symbol, server_name):
    info = mt5.symbol_info(mt5_symbol)

    if info is None:
        return {
            "asset": app_asset,
            "symbol": mt5_symbol,
            "success": False,
            "error": "Símbolo não encontrado no MT5",
        }

    if not info.visible:
        mt5.symbol_select(mt5_symbol, True)

    tick = mt5.symbol_info_tick(mt5_symbol)

    if tick is None or tick.bid <= 0 or tick.ask <= 0:
        return {
            "asset": app_asset,
            "symbol": mt5_symbol,
            "success": False,
            "error": "Sem tick válido no momento",
        }

    bid = float(tick.bid)
    ask = float(tick.ask)
    mid = (bid + ask) / 2
    spread = ask - bid

    candles5m = get_candles(mt5_symbol, TIMEFRAME_MAP["candles5m"])
    candles15m = get_candles(mt5_symbol, TIMEFRAME_MAP["candles15m"])
    candles1h = get_candles(mt5_symbol, TIMEFRAME_MAP["candles1h"])

    return {
        "asset": app_asset,
        "symbol": mt5_symbol,
        "success": True,
        "price": mid,
        "bid": bid,
        "ask": ask,
        "last": float(tick.last or 0),
        "spread": spread,
        "digits": int(info.digits),
        "volume": float(tick.volume or 0),
        "time": datetime.fromtimestamp(tick.time).isoformat(),
        "timeMs": int(tick.time_msc) if hasattr(tick, "time_msc") else None,
        "source": "MT5",
        "server": server_name,
        "real": True,
        "simulated": False,
        "candles": candles5m,
        "candles5m": candles5m,
        "candles15m": candles15m,
        "candles1h": candles1h,
    }


def main():
    if not mt5.initialize():
        error_response("Erro ao iniciar MT5", str(mt5.last_error()))
        return

    account = mt5.account_info()

    if account is None:
        error_response(
            "MT5 abriu, mas nenhuma conta está logada",
            str(mt5.last_error()),
        )
        mt5.shutdown()
        return

    ticks = []

    for app_asset, mt5_symbol in SYMBOL_MAP.items():
        ticks.append(get_tick(app_asset, mt5_symbol, account.server))

    mt5.shutdown()

    print(
        json.dumps(
            {
                "success": True,
                "source": "MT5",
                "server": account.server,
                "updatedAt": datetime.now().isoformat(),
                "ticks": ticks,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        error_response("Erro inesperado no script MT5", str(error))
        sys.exit(1)