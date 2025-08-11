require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { placeMarketBuyThenSell } = require('./trade');

const app = express();
app.use(cors());
app.use(express.json());

wmdaa8-codex/create-bullish-or-bust-crypto-trading-app
const port = process.env.PORT || 3000;
const PORT = process.env.PORT || 3000;
main

const ALPACA_BASE_URL = process.env.ALPACA_BASE_URL || 'https://api.alpaca.markets/v2';
const ALPACA_DATA_URL = process.env.ALPACA_DATA_URL || 'https://data.alpaca.markets/v2';
const API_KEY = process.env.ALPACA_API_KEY;
const SECRET_KEY = process.env.ALPACA_SECRET_KEY;

if (!API_KEY || !SECRET_KEY) {
  console.error('Missing ALPACA_API_KEY or ALPACA_SECRET_KEY in backend/.env');
  process.exit(1);
}

const HEADERS = {
  'APCA-API-KEY-ID': API_KEY,
  'APCA-API-SECRET-KEY': SECRET_KEY,
  'Content-Type': 'application/json'
};

wmdaa8-codex/create-bullish-or-bust-crypto-trading-app
main
app.get('/ping', (_req, res) => res.json({ status: 'ok' }));
app.get('/api/ping', (_req, res) => res.json({ ok: true, ts: Date.now() }));

app.get('/api/account', async (_req, res) => {
  try {
    const r = await axios.get(`${ALPACA_BASE_URL}/account`, { headers: HEADERS });
    const a = r.data || {};
    const equity = parseFloat(a.equity ?? a.portfolio_value ?? 0);
    const lastEquity = parseFloat(a.last_equity ?? equity);
    const dayChange = lastEquity ? (equity - lastEquity) / lastEquity : 0;
    res.json({
      equity,
      lastEquity,
      dayChange,
      buying_power: a.buying_power,
      non_marginable_buying_power: a.non_marginable_buying_power,
      status: a.status,
      account_blocked: a.account_blocked,
      trade_suspended_by_user: a.trade_suspended_by_user
    });
  } catch (err) {
    console.error('Account fetch failed:', err?.response?.data || err.message);
    res.status(500).json({ error: 'Account fetch failed', detail: err?.response?.data || err.message });
  }
});

app.post('/api/trade', async (req, res) => {
  const { symbol, notionalPct, minNotional, feeBuffer, profitTarget } = req.body || {};
  if (!symbol || typeof symbol !== 'string') {
    return res.status(400).json({ error: 'symbol is required, e.g. "BTC/USD"' });
  }
  try {
    const result = await placeMarketBuyThenSell({
      symbol,
      notionalPct: typeof notionalPct === 'number' ? notionalPct : undefined,
      minNotional: typeof minNotional === 'number' ? minNotional : undefined,
      feeBuffer: typeof feeBuffer === 'number' ? feeBuffer : undefined,
      profitTarget: typeof profitTarget === 'number' ? profitTarget : undefined,
      alpaca: { baseUrl: ALPACA_BASE_URL, headers: HEADERS }
    });
    res.json(result);
  } catch (err) {
    console.error('Trade error:', err?.response?.data || err.message);
    res.status(500).json({ error: 'Trade failed', detail: err?.response?.data || err.message });
  }
});

wmdaa8-codex/create-bullish-or-bust-crypto-trading-app
app.listen(port, () => {
  console.log(`API up on ${port}`);
  console.log(`Using Alpaca base URL: ${ALPACA_BASE_URL}`);
  console.log(`Using Alpaca data URL: ${ALPACA_DATA_URL}`);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`API up on ${PORT}`);
  console.log(`Using Alpaca base URL: ${ALPACA_BASE_URL}`);
  console.log(`Using Alpaca data URL: ${ALPACA_DATA_URL}`);

app.listen(PORT, () => {
  console.log(`Backend listening on http://0.0.0.0:${PORT}`);
  console.log(`Using Alpaca base URL: ${ALPACA_BASE_URL}`);
main
});
