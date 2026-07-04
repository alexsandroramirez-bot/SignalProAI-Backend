import MetaTrader5 as mt5
from datetime import datetime

SYMBOL_CANDIDATES = {
    "BTC/USD": ["BTCUSDm", "BTCUSD"],
    "ETH/USD": ["ETHUSDm", "ETHUSD"],
    "EUR/USD": ["EURUSDm", "EURUSD"],
    "GBP/USD": ["GBPUSDm", "GBPUSD"],
    "XAU/USD": ["XAUUSDm", "XAUUSD"],
    "US30": ["US30m", "US30_x10m", "US30"],
    "US500": ["US500m", "US500_x100m", "US500"],
    "NAS100": ["USTEC_x100m", "USTECm", "USTEC", "NAS100m", "NAS100"],
}


def connect_mt5():
    if not mt5.initialize():
        print("❌ Erro ao iniciar MT5:")
        print(mt5.last_error())
        return False

    account = mt5.account_info()

    if account is None:
        print("❌ MT5 abriu, mas nenhuma conta está logada.")
        print("Abra o MetaTrader 5, faça login na conta e rode novamente.")
        print("Erro:", mt5.last_error())
        return False

    print("✅ MT5 conectado.")
    print("Servidor:", account.server)
    print("-" * 70)

    return True


def get_valid_tick(mt5_symbol):
    info = mt5.symbol_info(mt5_symbol)

    if info is None:
        return None, None

    if not info.visible:
        mt5.symbol_select(mt5_symbol, True)

    tick = mt5.symbol_info_tick(mt5_symbol)

    if tick is None or tick.bid <= 0 or tick.ask <= 0:
        return None, info

    return tick, info


def get_tick(app_asset, candidates):
    for mt5_symbol in candidates:
        tick, info = get_valid_tick(mt5_symbol)

        if tick is None:
            continue

        spread = tick.ask - tick.bid
        mid_price = (tick.bid + tick.ask) / 2

        print(f"✅ {app_asset}")
        print(f"Símbolo MT5: {mt5_symbol}")
        print(f"Bid: {tick.bid}")
        print(f"Ask: {tick.ask}")
        print(f"Mid: {mid_price}")
        print(f"Last: {tick.last}")
        print(f"Spread: {spread}")
        print(f"Horário do tick: {datetime.fromtimestamp(tick.time)}")
        print(f"Dígitos: {info.digits}")
        print("-" * 70)
        return

    print(f"⚠️ {app_asset}: sem tick válido no momento.")
    print(f"Tentativas: {', '.join(candidates)}")
    print("-" * 70)


def main():
    if not connect_mt5():
        mt5.shutdown()
        return

    for app_asset, candidates in SYMBOL_CANDIDATES.items():
        get_tick(app_asset, candidates)

    mt5.shutdown()


if __name__ == "__main__":
    main()