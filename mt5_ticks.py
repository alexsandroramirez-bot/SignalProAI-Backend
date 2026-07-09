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

PRICE_GUARDS = {
    "BTC/USD": {
        "min": 1000,
        "max": 1000000,
        "label": "Bitcoin",
    },
    "ETH/USD": {
        "min": 100,
        "max": 100000,
        "label": "Ethereum",
    },
    "EUR/USD": {
        "min": 0.5,
        "max": 2.0,
        "label": "Euro/Dólar",
    },
    "GBP/USD": {
        "min": 0.5,
        "max": 2.5,
        "label": "Libra/Dólar",
    },
    "XAU/USD": {
        "min": 500,
        "max": 10000,
        "label": "Ouro",
    },
    "US30": {
        "min": 10000,
        "max": 100000,
        "label": "Dow Jones / US30",
    },
    "US500": {
        "min": 1000,
        "max": 20000,
        "label": "S&P 500 / US500",
    },
    "NAS100": {
        "min": 1000,
        "max": 100000,
        "label": "Nasdaq / NAS100",
    },
}

TIMEFRAME_MAP = {
    "candles1m": mt5.TIMEFRAME_M1,
    "candles5m": mt5.TIMEFRAME_M5,
    "candles15m": mt5.TIMEFRAME_M15,
    "candles1h": mt5.TIMEFRAME_H1,
}

CANDLE_LIMITS = {
    "candles1m": 60,
    "candles5m": 60,
    "candles15m": 60,
    "candles1h": 60,
}


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


def safe_float(value, default=0):
    try:
        number = float(value)
        return number if number == number else default
    except Exception:
        return default


def safe_int(value, default=0):
    try:
        return int(value)
    except Exception:
        return default


def get_asset_market(app_asset):
    value = str(app_asset or "").upper()

    if "BTC" in value or "ETH" in value:
        return "crypto"

    if "EUR" in value or "GBP" in value:
        return "forex"

    if "XAU" in value:
        return "metal"

    if "US30" in value or "US500" in value or "NAS100" in value:
        return "index"

    return "market"


def get_asset_category(app_asset):
    value = str(app_asset or "").upper()

    if "BTC" in value or "ETH" in value:
        return "Cripto"

    if "EUR" in value or "GBP" in value:
        return "Forex"

    if "XAU" in value:
        return "Ouro"

    if "US30" in value or "US500" in value or "NAS100" in value:
        return "Índice"

    return "Mercado"


def validate_price(app_asset, price, bid=None, ask=None):
    guard = PRICE_GUARDS.get(app_asset)

    if guard is None:
        return {
            "valid": price > 0,
            "reason": None if price > 0 else "Preço menor ou igual a zero.",
            "min": None,
            "max": None,
            "label": app_asset,
        }

    min_price = safe_float(guard.get("min"))
    max_price = safe_float(guard.get("max"))
    label = guard.get("label", app_asset)

    if price <= 0:
        return {
            "valid": False,
            "reason": f"{label}: preço inválido ou zerado.",
            "min": min_price,
            "max": max_price,
            "label": label,
        }

    if price < min_price:
        return {
            "valid": False,
            "reason": f"{label}: preço {price} abaixo do mínimo esperado {min_price}.",
            "min": min_price,
            "max": max_price,
            "label": label,
        }

    if price > max_price:
        return {
            "valid": False,
            "reason": f"{label}: preço {price} acima do máximo esperado {max_price}.",
            "min": min_price,
            "max": max_price,
            "label": label,
        }

    if bid is not None and ask is not None and bid > 0 and ask > 0 and ask < bid:
        return {
            "valid": False,
            "reason": f"{label}: ask menor que bid. Tick inconsistente.",
            "min": min_price,
            "max": max_price,
            "label": label,
        }

    return {
        "valid": True,
        "reason": None,
        "min": min_price,
        "max": max_price,
        "label": label,
    }


def format_candle(rate):
    return {
        "time": safe_int(rate["time"]),
        "open": safe_float(rate["open"]),
        "high": safe_float(rate["high"]),
        "low": safe_float(rate["low"]),
        "close": safe_float(rate["close"]),
        "volume": safe_float(rate["tick_volume"]),
    }


def get_candles(mt5_symbol, timeframe_key):
    timeframe = TIMEFRAME_MAP.get(timeframe_key)
    limit = CANDLE_LIMITS.get(timeframe_key, 60)

    if timeframe is None:
        return []

    rates = mt5.copy_rates_from_pos(mt5_symbol, timeframe, 0, limit)

    if rates is None:
        return []

    return [format_candle(rate) for rate in rates]


def get_tick_age_seconds(tick):
    try:
        tick_time = safe_float(getattr(tick, "time", 0))
        now_time = datetime.now().timestamp()

        if tick_time <= 0:
            return None

        return max(0, round(now_time - tick_time, 2))
    except Exception:
        return None


def get_tick_time_ms(tick):
    time_msc = getattr(tick, "time_msc", None)

    if time_msc:
        return safe_int(time_msc)

    tick_time = safe_float(getattr(tick, "time", 0))

    if tick_time > 0:
        return safe_int(tick_time * 1000)

    return None


def build_invalid_tick(app_asset, mt5_symbol, server_name, message, details=None):
    return {
        "asset": app_asset,
        "symbol": mt5_symbol,
        "category": get_asset_category(app_asset),
        "market": get_asset_market(app_asset),
        "success": False,
        "error": message,
        "details": details,
        "source": "MT5",
        "server": server_name,
        "real": True,
        "simulated": False,
    }


def get_tick(app_asset, mt5_symbol, server_name):
    info = mt5.symbol_info(mt5_symbol)

    if info is None:
        return build_invalid_tick(
            app_asset,
            mt5_symbol,
            server_name,
            "Símbolo não encontrado no MT5",
        )

    if not info.visible:
        mt5.symbol_select(mt5_symbol, True)

    tick = mt5.symbol_info_tick(mt5_symbol)

    if tick is None:
        return build_invalid_tick(
            app_asset,
            mt5_symbol,
            server_name,
            "Sem tick no momento",
        )

    bid = safe_float(getattr(tick, "bid", 0))
    ask = safe_float(getattr(tick, "ask", 0))
    last = safe_float(getattr(tick, "last", 0))
    volume = safe_float(getattr(tick, "volume", 0))

    if bid <= 0 or ask <= 0:
        return build_invalid_tick(
            app_asset,
            mt5_symbol,
            server_name,
            "Sem bid/ask válido no momento",
            {
                "bid": bid,
                "ask": ask,
                "last": last,
            },
        )

    mid = (bid + ask) / 2
    spread = ask - bid

    price_validation = validate_price(app_asset, mid, bid, ask)

    if not price_validation.get("valid"):
        return build_invalid_tick(
            app_asset,
            mt5_symbol,
            server_name,
            "Preço bloqueado pela trava de segurança",
            {
                "reason": price_validation.get("reason"),
                "price": mid,
                "bid": bid,
                "ask": ask,
                "last": last,
                "minExpected": price_validation.get("min"),
                "maxExpected": price_validation.get("max"),
                "assetLabel": price_validation.get("label"),
            },
        )

    point = safe_float(getattr(info, "point", 0))
    spread_points = spread / point if point > 0 else 0
    spread_percent = (spread / mid) * 100 if mid > 0 else 0

    candles1m = get_candles(mt5_symbol, "candles1m")
    candles5m = get_candles(mt5_symbol, "candles5m")
    candles15m = get_candles(mt5_symbol, "candles15m")
    candles1h = get_candles(mt5_symbol, "candles1h")

    tick_age_seconds = get_tick_age_seconds(tick)

    return {
        "asset": app_asset,
        "symbol": mt5_symbol,
        "category": get_asset_category(app_asset),
        "market": get_asset_market(app_asset),
        "success": True,

        "price": mid,
        "bid": bid,
        "ask": ask,
        "last": last,

        "spread": spread,
        "spreadPoints": round(spread_points, 2),
        "spreadPercent": round(spread_percent, 5),

        "digits": safe_int(info.digits),
        "point": point,
        "volume": volume,

        "time": datetime.fromtimestamp(tick.time).isoformat(),
        "timeMs": get_tick_time_ms(tick),
        "tickAgeSeconds": tick_age_seconds,

        "source": "MT5",
        "server": server_name,
        "real": True,
        "simulated": False,

        "priceValidation": {
            "valid": True,
            "minExpected": price_validation.get("min"),
            "maxExpected": price_validation.get("max"),
            "label": price_validation.get("label"),
        },

        # Compatibilidade antiga
        "candles": candles5m,

        # Aliases rápidos para Scalping
        "candles1m": candles1m,
        "candlesM1": candles1m,
        "candlesFast": candles1m,
        "candles_fast": candles1m,

        # Timeframes principais
        "candles5m": candles5m,
        "candlesM5": candles5m,
        "candles15m": candles15m,
        "candlesM15": candles15m,
        "candles1h": candles1h,
        "candlesH1": candles1h,

        "candleInfo": {
            "candles1m": len(candles1m),
            "candlesM1": len(candles1m),
            "candlesFast": len(candles1m),
            "candles5m": len(candles5m),
            "candlesM5": len(candles5m),
            "candles15m": len(candles15m),
            "candlesM15": len(candles15m),
            "candles1h": len(candles1h),
            "candlesH1": len(candles1h),
        },
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

    valid_ticks = [item for item in ticks if item.get("success") is True]
    blocked_ticks = [item for item in ticks if item.get("success") is not True]

    print(
        json.dumps(
            {
                "success": True,
                "source": "MT5",
                "server": account.server,
                "updatedAt": datetime.now().isoformat(),
                "total": len(ticks),
                "valid": len(valid_ticks),
                "blocked": len(blocked_ticks),
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