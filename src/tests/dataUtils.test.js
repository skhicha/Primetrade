// src/tests/dataUtils.test.js
import { toNumber, normalizeRow, parseTime, computeAnalysis } from '../utils/dataUtils';

describe('dataUtils basics', () => {
  test('toNumber handles formatting', () => {
    expect(toNumber('$1,234.50')).toBeCloseTo(1234.5);
    expect(toNumber('')).toBe(0);
    expect(toNumber(null)).toBe(0);
    expect(toNumber('NaN')).toBe(0);
  });

  test('normalizeRow converts keys', () => {
    const r = { 'Execution Price': '30500', 'ClosedPnL': '200' };
    const out = normalizeRow(r);
    expect(out.execution_price).toBe('30500');
    expect(out.closedpnl).toBe('200');
  });

  test('parseTime handles ISO and IST fallback', () => {
    const iso = parseTime('2024-10-21T14:30:00Z', false);
    expect(iso.date).toBe('2024-10-21');
    const ist = parseTime('2024-10-21 14:30:00', true);
    expect(typeof ist.hour).toBe('number');
    expect(ist.date).toBe('2024-10-21');
  });
});

describe('computeAnalysis full coverage', () => {
  test('computeAnalysis groups sentiment, hourly, top traders and rawTrades', () => {
    const sentimentRows = [
      { date: '2024-10-21', class: 'greed' },
      { date: '2024-10-21', class: 'greed' },
      { date: '2024-10-22', class: 'fear' }
    ];

    const traderRows = [
      { account: 'user123', date: '2024-10-21', hour: 14, closedPnL: 200, leverage: 5, symbol: 'BTC' },
      { account: 'user456', date: '2024-10-21', hour: 10, closedPnL: -100, leverage: 2, symbol: 'BTC' },
      { account: 'user123', date: '2024-10-22', hour: 9, closedPnL: 100, leverage: 4, symbol: 'BTC' }
    ];

    const res = computeAnalysis(sentimentRows, traderRows);

    expect(res.performanceBySentiment.greed.trades).toBe(2);
    expect(res.performanceBySentiment.fear.trades).toBe(1);
    expect(res.performanceBySentiment.greed.totalPnL).toBe(100); // 200 + (-100)
    expect(res.performanceBySentiment.fear.totalPnL).toBe(100);
    expect(res.hourly[14].trades).toBe(1);
    expect(res.hourly[9].trades).toBe(1);
    expect(res.topTraders[0].account).toBe('user123');
    expect(res.topTraders[0].totalPnL).toBe(300);
    // rawTrades checks
    expect(res.rawTrades.greed.length).toBe(2);
    expect(res.rawTrades.fear.length).toBe(1);
  });
});