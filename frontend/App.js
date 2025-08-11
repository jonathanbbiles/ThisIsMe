import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Switch, RefreshControl, Alert, StyleSheet } from 'react-native';
import Constants from 'expo-constants';

/** ---------------------- Config ---------------------- **/

// Detect backend URL: use explicit env if provided, else local dev IP:3000
const pickLocalIP = () => {
  try {
    const host = Constants.expoConfig?.hostUri ?? Constants.manifest?.debuggerHost;
    return host ? host.split(':').shift() : 'localhost';
  } catch { return 'localhost'; }
};
const BACKEND_URL = (process.env.EXPO_PUBLIC_API_URL && process.env.EXPO_PUBLIC_API_URL.length > 0)
  ? process.env.EXPO_PUBLIC_API_URL
  : `http://${pickLocalIP()}:3000`;

// Tokens to watch (Alpaca uses pair format, e.g., BTC/USD)
const TOKENS = [
  'BTC/USD', 'ETH/USD', 'SOL/USD', 'BCH/USD', 'ADA/USD', 'DOGE/USD'
];

// CryptoCompare helpers
const splitPair = (pair) => {
  const [fsym, tsym] = pair.split('/');
  return { fsym, tsym };
};
const histoURL = (pair) => {
  const { fsym, tsym } = splitPair(pair);
  // 120 mins of minute bars
  return `https://min-api.cryptocompare.com/data/v2/histominute?fsym=${fsym}&tsym=${tsym}&limit=120`;
};

/** -------------------- Indicators -------------------- **/

function ema(values, period) {
  const k = 2 / (period + 1);
  const emaArr = [];
  let prev;
  values.forEach((v, i) => {
    const val = Number(v);
    if (i === 0) { prev = val; emaArr.push(val); return; }
    const next = val * k + prev * (1 - k);
    emaArr.push(next);
    prev = next;
  });
  return emaArr;
}

function macd(values, fast = 12, slow = 26, signal = 9) {
  if (values.length < slow + signal) return { macd: [], signal: [], hist: [] };
  const emaFast = ema(values, fast);
  const emaSlow = ema(values, slow);
  const macdLine = values.map((_, i) => (emaFast[i] ?? 0) - (emaSlow[i] ?? 0));
  const signalLine = ema(macdLine.slice(- (signal + slow)), signal); // stabilize tail
  const fullSignal = Array(macdLine.length - signalLine.length).fill(0).concat(signalLine);
  const hist = macdLine.map((v, i) => v - (fullSignal[i] ?? 0));
  return { macd: macdLine, signal: fullSignal, hist };
}

function rsi(values, period = 14) {
  if (values.length <= period) return Array(values.length).fill(50);
  const gains = [], losses = [];
  for (let i = 1; i < values.length; i++) {
    const ch = values[i] - values[i - 1];
    gains.push(Math.max(ch, 0));
    losses.push(Math.max(-ch, 0));
  }
  const avg = (arr, p) => {
    let sum = 0;
    for (let i = 0; i < p; i++) sum += arr[i];
    let av = sum / p;
    const out = [av];
    for (let i = p; i < arr.length; i++) {
      av = (av * (p - 1) + arr[i]) / p;
      out.push(av);
    }
    return out;
  };
  const avgGain = avg(gains, period);
  const avgLoss = avg(losses, period);
  const rsiVals = avgGain.map((g, i) => {
    const l = avgLoss[i] || 0;
    if (i < (period - 1)) return 50;
    if (l === 0) return 100;
    const rs = g / l;
    return 100 - 100 / (1 + rs);
  });
  return Array(period).fill(50).concat(rsiVals);
}

function linRegSlope(values, lookback = 20) {
  if (values.length < lookback) return 0;
  const slice = values.slice(-lookback);
  const n = slice.length;
  const xs = Array.from({ length: n }, (_, i) => i + 1);
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = slice.reduce((a, b) => a + b, 0);
  const sumXY = slice.reduce((acc, y, i) => acc + y * xs[i], 0);
  const sumX2 = xs.reduce((acc, x) => acc + x * x, 0);
  const m = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  return m;
}

/** -------------------- UI Helpers -------------------- **/
const Section = ({ title, children }) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {children}
  </View>
);

/** -------------------- App -------------------- **/
export default function App() {
  const [data, setData] = useState({});
  const [autoTrade, setAutoTrade] = useState(false);
  const [hideOthers, setHideOthers] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [events, setEvents] = useState([]);
  const [account, setAccount] = useState({ equity: 0, dayChange: 0 });

  const log = (msg) => setEvents(prev => [new Date().toLocaleTimeString() + ' ' + msg, ...prev].slice(0, 20));

  async function fetchAccount() {
    try {
      const r = await fetch(`${BACKEND_URL}/api/account`);
      const j = await r.json();
      if (j?.equity != null) setAccount({ equity: j.equity, dayChange: j.dayChange ?? 0 });
    } catch (e) {
      log(`⚠️ Account fetch failed: ${e.message}`);
    }
  }

  async function fetchToken(pair) {
    const url = histoURL(pair);
    const res = await fetch(url);
    const j = await res.json();
    const bars = j?.Data?.Data || [];
    const closes = bars.map(b => Number(b.close));
    if (!closes.length) throw new Error('No data');
    const rsiVals = rsi(closes, 14);
    const { macd: m, signal: s, hist } = macd(closes, 12, 26, 9);
    const slope = linRegSlope(closes, 20);
    const price = closes[closes.length - 1];
    return { price, closes, rsi: rsiVals[rsiVals.length - 1], macd: m[m.length - 1] || 0, sig: s[s.length - 1] || 0, hist: hist[hist.length - 1] || 0, slope };
  }

  function classify(t) {
    const prevIdx = Math.max(0, t.closes.length - 2);
    const prev = macd(t.closes.slice(0, prevIdx + 1));
    const prevMACD = prev.macd[prev.macd.length - 1] || 0;
    const prevSig = prev.signal[prev.signal.length - 1] || 0;

    const crossedUp = (prevMACD <= prevSig) && (t.macd > t.sig);
    const rising = t.macd > prevMACD && t.sig >= prevSig && !crossedUp;

    if (crossedUp) return 'ENTRY READY';
    if (rising) return 'WATCHLIST';
    return 'OTHERS';
  }

  async function placeOrder(symbol) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/trade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol })
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.detail || j?.error || 'Trade failed');
      log(`✅ BUY ${symbol} @ ${j.buy.filled_avg_price} → LIMIT SELL ${j.sell.limit_price}`);
    } catch (e) {
      log(`❌ Trade ${symbol} failed: ${e.message}`);
      Alert.alert('Trade Error', e.message);
    } finally {
      fetchAccount();
    }
  }

  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const entries = await Promise.all(TOKENS.map(async (pair) => {
        try {
          const t = await fetchToken(pair);
          const cat = classify(t);
          return [pair, { ...t, cat }];
        } catch (e) {
          return [pair, { error: e.message, cat: 'OTHERS' }];
        }
      }));
      const obj = Object.fromEntries(entries);
      setData(obj);

      // Auto Trade: trigger on new ENTRY READY
      if (autoTrade) {
        const candidates = TOKENS.filter(p => obj[p]?.cat === 'ENTRY READY');
        for (const sym of candidates) {
          log(`⚙️ Auto trade: ${sym}`);
          // Fire and forget
          placeOrder(sym);
        }
      }
      fetchAccount();
    } catch (e) {
      log(`⚠️ Refresh failed: ${e.message}`);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 60_000);
    return () => clearInterval(id);
  }, [autoTrade]);

  const grouped = useMemo(() => {
    const g = { 'ENTRY READY': [], 'WATCHLIST': [], 'OTHERS': [] };
    TOKENS.forEach(p => {
      const t = data[p];
      if (!t) return g['OTHERS'].push({ pair: p });
      g[t.cat].push({ pair: p, ...t });
    });
    return g;
  }, [data]);

  return (
    <ScrollView style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      <Text style={styles.title}>Bullish or Bust</Text>
      <Text style={styles.subtitle}>Backend: {BACKEND_URL}</Text>
      <View style={styles.row}>
        <Text style={styles.label}>Auto Trade</Text>
        <Switch value={autoTrade} onValueChange={setAutoTrade} />
        <View style={{ width: 24 }} />
        <Text style={styles.label}>Hide Others</Text>
        <Switch value={hideOthers} onValueChange={setHideOthers} />
      </View>

      <View style={styles.account}>
        <Text style={styles.accText}>
          Equity: ${account.equity?.toFixed ? account.equity.toFixed(2) : account.equity}
        </Text>
        <Text style={[styles.accText, (account.dayChange || 0) >= 0 ? styles.green : styles.red]}>
          Day: {((account.dayChange || 0) * 100).toFixed(2)}%
        </Text>
      </View>

      <Section title="ENTRY READY">
        {grouped['ENTRY READY'].length === 0 && <Text style={styles.dim}>None</Text>}
        {grouped['ENTRY READY'].map(t => <TokenRow key={t.pair} t={t} onBuy={() => placeOrder(t.pair)} highlight="green" />)}
      </Section>

      <Section title="WATCHLIST">
        {grouped['WATCHLIST'].length === 0 && <Text style={styles.dim}>None</Text>}
        {grouped['WATCHLIST'].map(t => <TokenRow key={t.pair} t={t} onBuy={() => placeOrder(t.pair)} highlight="orange" />)}
      </Section>

      {!hideOthers && (
        <Section title="OTHERS">
          {grouped['OTHERS'].length === 0 && <Text style={styles.dim}>None</Text>}
          {grouped['OTHERS'].map(t => <TokenRow key={t.pair} t={t} onBuy={() => placeOrder(t.pair)} />)}
        </Section>
      )}

      <Section title="Events">
        {events.length === 0 && <Text style={styles.dim}>No recent events</Text>}
        {events.map((e, i) => <Text key={i} style={styles.event}>{e}</Text>)}
      </Section>

      <TouchableOpacity style={styles.refresh} onPress={refresh}>
        <Text style={styles.refreshText}>Refresh Now</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function TokenRow({ t, onBuy, highlight }) {
  const color = highlight === 'green' ? '#0a0' : highlight === 'orange' ? '#c60' : '#444';
  return (
    <View style={[styles.rowItem, { borderLeftColor: color }]}> 
      <View style={{ flex: 1 }}>
        <Text style={styles.pair}>{t.pair}</Text>
        {t.error ? (
          <Text style={styles.err}>Data error: {t.error}</Text>
        ) : (
          <Text style={styles.metrics}>
            Px {t.price?.toFixed?.(4)} · RSI {t.rsi?.toFixed?.(1)} · MACD {(t.macd || 0).toFixed(5)} vs {(t.sig || 0).toFixed(5)} · Slope {(t.slope || 0).toFixed(5)}
          </Text>
        )}
      </View>
      <TouchableOpacity onPress={onBuy} style={styles.buyBtn}>
        <Text style={styles.buyText}>Manual BUY</Text>
      </TouchableOpacity>
    </View>
  );
}

/** -------------------- Styles -------------------- **/
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b0b0f', padding: 16 },
  title: { fontSize: 22, color: '#fff', fontWeight: '700', marginBottom: 4 },
  subtitle: { fontSize: 12, color: '#9aa' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 12 },
  label: { color: '#ddd', marginRight: 8, fontSize: 14 },
  account: { flexDirection: 'row', gap: 16, marginBottom: 12 },
  accText: { color: '#ddd', fontSize: 14 },
  green: { color: '#0f6' },
  red: { color: '#f55' },
  section: { marginTop: 16 },
  sectionTitle: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 8 },
  dim: { color: '#789' },
  rowItem: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderLeftWidth: 4, borderLeftColor: '#444', backgroundColor: '#12131a', borderRadius: 8, marginBottom: 8 },
  pair: { color: '#fff', fontSize: 16, fontWeight: '600' },
  metrics: { color: '#bcd', fontSize: 12, marginTop: 2 },
  err: { color: '#f77', fontSize: 12, marginTop: 2 },
  buyBtn: { backgroundColor: '#0a5', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6 },
  buyText: { color: 'white', fontWeight: '700' },
  event: { color: '#9ad', fontSize: 12, marginBottom: 4 },
  refresh: { marginTop: 16, backgroundColor: '#223', padding: 12, borderRadius: 8, alignItems: 'center' },
  refreshText: { color: '#aee', fontWeight: '700' }
});
