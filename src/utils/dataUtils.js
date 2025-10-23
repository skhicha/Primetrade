// src/utils/dataUtils.js
// Utility functions for parsing and analysis (final version)

export const toNumber = (v) => {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  const s = String(v).trim().replace(/[$,]/g, '');
  if (s === '' || s.toLowerCase() === 'nan') return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

export const normalizeRow = (row) => {
  const out = {};
  Object.keys(row || {}).forEach((k) => {
    const key = k.toString().trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    out[key] = row[k];
  });
  return out;
};

export const parseTime = (v, assumeIST = false) => {
  if (!v && v !== 0) return { date: '', hour: 0 };
  const s = String(v).trim();
  // epoch detection
  if (/^\d+$/.test(s)) {
    if (s.length >= 13) {
      const d = new Date(Number(s));
      return { date: d.toISOString().split('T')[0], hour: d.getUTCHours() };
    } else if (s.length === 10) {
      const d = new Date(Number(s) * 1000);
      return { date: d.toISOString().split('T')[0], hour: d.getUTCHours() };
    }
  }
  // try parse
  const dt = new Date(s);
  if (!isNaN(dt)) return { date: dt.toISOString().split('T')[0], hour: dt.getUTCHours() };
  // assume IST fallback
  if (assumeIST) {
    try {
      const ts = s.includes('T') ? s + '+05:30' : s.replace(' ', 'T') + '+05:30';
      const d2 = new Date(ts);
      if (!isNaN(d2)) return { date: d2.toISOString().split('T')[0], hour: d2.getUTCHours() };
    } catch (e) {}
  }
  return { date: '', hour: 0 };
};

/**
 * computeAnalysis(sentimentRows, traderRows)
 * - sentimentRows: array of { date, class } or { date, classification } (strings 'fear'/'greed')
 * - traderRows: array of normalized trades: must include at minimum:
 *     { account, date, hour, closedPnL, leverage, symbol?, size?, time? }
 *
 * Returns:
 * {
 *   performanceBySentiment: { fear: {...}, greed: {...}, unknown: {...} },
 *   topTraders: [...],
 *   hourly: [...],
 *   daily: [...],
 *   totalTrades: number,
 *   uniqueTraders: number,
 *   rawTrades: { fear: [...], greed: [...], unknown: [...] }
 * }
 */
export const computeAnalysis = (sentimentRows = [], traderRows = []) => {
  // Build sentiment counts per date (support different keys)
  const sentByDate = {};
  sentimentRows.forEach((s) => {
    const date = s.date || s.Date || s.timestamp || s.Timestamp;
    if (!date) return;
    const rawClass = (s.class || s.classification || s.value || '').toString().trim().toLowerCase();
    sentByDate[date] = sentByDate[date] || { fear: 0, greed: 0 };
    if (rawClass.includes('fear')) sentByDate[date].fear++;
    else if (rawClass.includes('greed')) sentByDate[date].greed++;
  });

  // majority sentiment map
  const sentMap = {};
  Object.keys(sentByDate).forEach((d) => {
    const c = sentByDate[d];
    sentMap[d] = c.fear >= c.greed ? 'fear' : 'greed';
  });

  // enrich trades with sentiment (by date)
  const enriched = traderRows.map((tr) => ({
    ...tr,
    sentiment: (tr.date && sentMap[tr.date]) || 'unknown'
  }));

  // Prepare aggregations
  const perf = {
    fear: { trades: 0, totalPnL: 0, wins: 0, totalLeverage: 0 },
    greed: { trades: 0, totalPnL: 0, wins: 0, totalLeverage: 0 },
    unknown: { trades: 0, totalPnL: 0, wins: 0, totalLeverage: 0 }
  };

  const traderStats = {}; // by account
  const hourly = Array.from({ length: 24 }, (_, i) => ({ hour: i, trades: 0, totalPnL: 0 }));

  // raw trade buckets for later detailed analysis
  const rawTrades = { fear: [], greed: [], unknown: [] };

  enriched.forEach((tr) => {
    const s = tr.sentiment || 'unknown';
    // guard
    if (!perf[s]) perf[s] = { trades: 0, totalPnL: 0, wins: 0, totalLeverage: 0 };

    perf[s].trades++;
    perf[s].totalPnL += tr.closedPnL || 0;
    perf[s].totalLeverage += tr.leverage || 0;
    if ((tr.closedPnL || 0) > 0) perf[s].wins++;

    // trader-level
    const acct = tr.account || 'unknown';
    if (!traderStats[acct]) traderStats[acct] = { account: acct, totalPnL: 0, trades: 0, wins: 0, totalLeverage: 0, fearTrades: 0, greedTrades: 0, fearPnL: 0, greedPnL: 0 };
    const ts = traderStats[acct];
    ts.trades++;
    ts.totalPnL += tr.closedPnL || 0;
    ts.totalLeverage += tr.leverage || 0;
    if ((tr.closedPnL || 0) > 0) ts.wins++;
    if (tr.sentiment === 'fear') { ts.fearTrades++; ts.fearPnL += tr.closedPnL || 0; }
    if (tr.sentiment === 'greed') { ts.greedTrades++; ts.greedPnL += tr.closedPnL || 0; }

    // hourly
    const h = Number.isInteger(tr.hour) ? tr.hour : 0;
    hourly[h].trades++;
    hourly[h].totalPnL += tr.closedPnL || 0;

    // raw trade capture (store canonical fields)
    rawTrades[s].push({
      account: tr.account,
      symbol: tr.symbol,
      time: tr.time || tr.timeRaw || null,
      date: tr.date,
      hour: tr.hour,
      size: tr.size || tr.sizeTokens || tr.size_tokens || null,
      closedPnL: tr.closedPnL || 0,
      leverage: tr.leverage || 0,
      side: tr.side || null,
      executionPrice: tr.executionPrice || null
    });
  });

  // finalize perf stats
  Object.keys(perf).forEach((k) => {
    const d = perf[k];
    d.avgPnL = d.trades ? d.totalPnL / d.trades : 0;
    d.winRate = d.trades ? (d.wins / d.trades) * 100 : 0;
    d.avgLeverage = d.trades ? d.totalLeverage / d.trades : 0;
  });

  // top traders array
  const topTraders = Object.values(traderStats).map((t) => ({
    ...t,
    winRate: t.trades ? (t.wins / t.trades) * 100 : 0,
    avgPnL: t.trades ? t.totalPnL / t.trades : 0,
    avgLeverage: t.trades ? t.totalLeverage / t.trades : 0,
    fearAvgPnL: t.fearTrades ? t.fearPnL / t.fearTrades : 0,
    greedAvgPnL: t.greedTrades ? t.greedPnL / t.greedTrades : 0
  })).sort((a, b) => b.totalPnL - a.totalPnL);

  // hourly finalize avg
  hourly.forEach((h) => { h.avgPnL = h.trades ? h.totalPnL / h.trades : 0; });

  // daily stats (cumulative)
  const dailyMap = {};
  enriched.forEach((t) => {
    const d = t.date || 'unknown';
    dailyMap[d] = dailyMap[d] || { date: d, trades: 0, totalPnL: 0 };
    dailyMap[d].trades++;
    dailyMap[d].totalPnL += t.closedPnL || 0;
  });
  const daily = Object.values(dailyMap).sort((a, b) => new Date(a.date) - new Date(b.date));
  let cum = 0;
  daily.forEach((d) => { cum += d.totalPnL; d.cumPnL = cum; d.avgPnL = d.trades ? d.totalPnL / d.trades : 0; });

  return {
    performanceBySentiment: perf,
    topTraders,
    hourly,
    daily,
    totalTrades: enriched.length,
    uniqueTraders: Object.keys(traderStats).length,
    rawTrades
  };
};