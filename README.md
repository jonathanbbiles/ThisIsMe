# Bullish or Bust (Live Alpaca)

A two-part app:
- **backend/** Node.js + Express server that talks to **Alpaca LIVE** trading API
- **frontend/** Expo React Native app for iPhone (works in Expo Go), pulls CryptoCompare data, computes RSI/MACD/trend, and triggers trades via backend.

## Quick Start

### 1) Backend (Render or local)
```bash
cd backend
cp .env.example .env
# put your LIVE Alpaca keys in .env
npm install
npm start
```

The server listens on `PORT` (default 3000). Endpoints:

* `GET /api/ping`
* `GET /api/account`
* `POST /api/trade`  body: `{ "symbol": "BTC/USD", "notionalPct": 0.1 }`

### 2) Frontend (Expo)

```bash
cd ../frontend
cp .env.example .env
# set EXPO_PUBLIC_API_URL=https://<your-render-app>.onrender.com
npm install
npx expo start
```

### ENV

**backend/.env**

```
ALPACA_API_KEY=YOUR_LIVE_KEY_ID
ALPACA_SECRET_KEY=YOUR_LIVE_SECRET
# Optional: switch environments. Defaults to LIVE when omitted.
# ALPACA_BASE_URL=https://paper-api.alpaca.markets/v2
PORT=3000
ALLOCATION_PCT=0.10
FEE_BUFFER=0.0025
PROFIT_TARGET=0.0005
MIN_NOTIONAL=5
```

**frontend/.env**

```
# For production, set to your deployed backend URL:
EXPO_PUBLIC_API_URL=
# Keys optional for UI; all trading is via backend
EXPO_PUBLIC_ALPACA_API_KEY=
EXPO_PUBLIC_ALPACA_SECRET_KEY=
```

### Notes

* LIVE crypto orders evaluate **non_marginable_buying_power** (cash-only). Fund the account and ensure crypto trading is enabled.
* Crypto symbol format is **pair style**, e.g. `BTC/USD`, `ETH/USD`. (Alpaca docs example shows `BTC/USD`.)
* We place BUY with `notional` then poll until filled, then LIMIT SELL for the filled qty.

