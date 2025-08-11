const axios = require('axios');

function toFixedQty(x) {
  // Crypto qty supports high precision; clamp to 8 dp
  return Number(x).toFixed(8);
}

function roundPrice(p) {
  const price = Number(p);
  if (price >= 1000) return Number(price.toFixed(2));
  if (price >= 1) return Number(price.toFixed(4));
  return Number(price.toFixed(6));
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Place market BUY using notional (fraction of non_marginable_buying_power),
 * wait till filled, then place LIMIT SELL at (avgFillPrice * (1 + buffer + target))
 */
async function placeMarketBuyThenSell({
  symbol,
  notionalPct,
  minNotional,
  feeBuffer,
  profitTarget,
  alpaca
}) {
  if (!alpaca?.baseUrl || !alpaca?.headers) {
    throw new Error('Missing Alpaca config');
  }
  const BASE = alpaca.baseUrl;
  const HEADERS = alpaca.headers;

  // Defaults from env with sane fallbacks
  const allocationPct = typeof notionalPct === 'number'
    ? notionalPct
    : (process.env.ALLOCATION_PCT ? Number(process.env.ALLOCATION_PCT) : 0.10);

  const minNot = typeof minNotional === 'number'
    ? minNotional
    : (process.env.MIN_NOTIONAL ? Number(process.env.MIN_NOTIONAL) : 5);

  const feeBuf = typeof feeBuffer === 'number'
    ? feeBuffer
    : (process.env.FEE_BUFFER ? Number(process.env.FEE_BUFFER) : 0.0025);

  const tgt = typeof profitTarget === 'number'
    ? profitTarget
    : (process.env.PROFIT_TARGET ? Number(process.env.PROFIT_TARGET) : 0.0005);

  // 1) Get account to determine non-marginable BP for crypto
  const acct = await axios.get(`${BASE}/account`, { headers: HEADERS }).then(r => r.data);
  const nmbp = Number(acct.non_marginable_buying_power ?? acct.cash ?? 0);
  if (!nmbp || nmbp <= 0) {
    throw new Error(`Insufficient non_marginable_buying_power (got ${nmbp})`);
  }

  const buyNotional = Math.max(minNot, nmbp * allocationPct);

  // 2) Place market BUY using notional
  const buyBody = {
    symbol,              // e.g. "BTC/USD"
    side: 'buy',
    type: 'market',
    time_in_force: 'gtc',
    notional: String(buyNotional)
  };

  const buyOrder = await axios.post(`${BASE}/orders`, buyBody, { headers: HEADERS }).then(r => r.data);

  // 3) Poll until filled (or timeout)
  let filled = null;
  for (let i = 0; i < 20; i++) {
    const ord = await axios.get(`${BASE}/orders/${buyOrder.id}`, { headers: HEADERS }).then(r => r.data);
    if (ord.status === 'filled') {
      filled = ord;
      break;
    }
    if (ord.status === 'canceled' || ord.status === 'rejected') {
      throw new Error(`Buy order ${ord.status}: ${ord.reject_reason || 'no reason'}`);
    }
    await sleep(1500);
  }
  if (!filled) {
    throw new Error('Timed out waiting for buy fill');
  }

  const avgFill = Number(filled.filled_avg_price);
  const qty = Number(filled.filled_qty);
  if (!avgFill || !qty) {
    throw new Error(`Filled order missing avg price/qty: avg=${avgFill}, qty=${qty}`);
  }

  // 4) Compute target sell price (buffer + profit)
  const targetPx = roundPrice(avgFill * (1 + feeBuf + tgt));

  // 5) Place LIMIT SELL for full bought qty
  const sellBody = {
    symbol,
    side: 'sell',
    type: 'limit',
    time_in_force: 'gtc',
    limit_price: String(targetPx),
    qty: toFixedQty(qty)
  };
  const sellOrder = await axios.post(`${BASE}/orders`, sellBody, { headers: HEADERS }).then(r => r.data);

  return {
    buy: {
      id: filled.id,
      status: filled.status,
      filled_avg_price: avgFill,
      filled_qty: qty
    },
    sell: {
      id: sellOrder.id,
      status: sellOrder.status,
      limit_price: targetPx
    }
  };
}

module.exports = { placeMarketBuyThenSell };
