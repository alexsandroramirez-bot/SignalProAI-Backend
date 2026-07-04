import MetaTrader5 as mt5

SEARCH_TERMS = [
    "GBP",
    "US30",
    "US500",
    "NAS",
    "USTEC",
    "SP",
    "DJ",
    "BTC",
    "ETH",
    "XAU",
    "EUR",
]

if not mt5.initialize():
    print("Erro ao iniciar MT5:", mt5.last_error())
    quit()

account = mt5.account_info()

if account is None:
    print("MT5 abriu, mas nenhuma conta está logada.")
    print("Erro:", mt5.last_error())
    mt5.shutdown()
    quit()

print("MT5 conectado.")
print("Servidor:", account.server)
print("-" * 80)

symbols = mt5.symbols_get()

if symbols is None:
    print("Nenhum símbolo encontrado.")
    print("Erro:", mt5.last_error())
    mt5.shutdown()
    quit()

for term in SEARCH_TERMS:
    print(f"\n🔎 Procurando: {term}")
    print("-" * 80)

    found = []

    for symbol in symbols:
        name = symbol.name.upper()
        description = str(symbol.description or "").upper()

        if term.upper() in name or term.upper() in description:
            found.append(symbol)

    if not found:
        print("Nenhum encontrado.")
        continue

    for symbol in found[:50]:
        print(f"{symbol.name} | {symbol.description}")

mt5.shutdown()