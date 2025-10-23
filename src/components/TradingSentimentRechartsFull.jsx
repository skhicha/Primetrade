// src/components/TradingSentimentRechartsFull.jsx
import React, { useState, useRef } from 'react';
import Papa from 'papaparse';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell
} from 'recharts';
import { Upload, Activity, FileText } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { saveAs } from 'file-saver';

import { toNumber, normalizeRow, parseTime, computeAnalysis } from '../utils/dataUtils';

export default function TradingSentimentRechartsFull() {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [assumeIST, setAssumeIST] = useState(true);
  const reportRef = useRef(null);

  // parse / normalize then compute analysis
  const processFiles = async (sentFile, traderFile) => {
    setLoading(true);
    try {
      const sentParsed = await new Promise((res, rej) => {
        Papa.parse(sentFile, { header: true, skipEmptyLines: true, complete: (r) => res(r.data), error: rej });
      });
      const traderParsed = await new Promise((res, rej) => {
        Papa.parse(traderFile, { header: true, skipEmptyLines: true, complete: (r) => res(r.data), error: rej });
      });

      const cleanSent = sentParsed.map(normalizeRow).map((r) => {
        const date = r.date || r.timestamp || r['timestamp_ist'] || r.Date || r['Date'] || '';
        const cls = r.classification || r['class'] || r.value || r['classification_norm'] || '';
        return { date: date ? String(date).split('T')[0] : '', class: (cls || '').toString().toLowerCase() };
      }).filter(r => r.date);

      const cleanTrader = traderParsed.map(normalizeRow).map((r) => {
        const account = r.account || r.account_id || r['account_id'] || r.Account || r['Account'] || '';
        const timeRaw = r.timestamp_ist || r['timestamp_ist'] || r.timestamp || r['timestamp'] || r.time || r['time'] || r.Timestamp || r['Timestamp'] || '';
        const p = parseTime(timeRaw, assumeIST);
        const closedPnL = toNumber(r.closed_pnl || r['closed_pnl'] || r['closed pnl'] || r.closedpnl || r['Closed PnL'] || r.pnl || r['pnl'] || r.closed);
        const leverage = toNumber(r.leverage || r.Leverage || r.lev || 1) || 1;
        const symbol = r.coin || r.symbol || r.Coin || r['Coin'] || '';
        const side = ('' + (r.side || r.direction || r.Direction || '')).toLowerCase().includes('sell') ? 'sell' : 'buy';
        const executionPrice = toNumber(r.execution_price || r['execution_price'] || r['execution price'] || r.price);
        const size = toNumber(r.size || r['size'] || r.size_tokens || r['size_tokens'] || r['size tokens']);
        return {
          account: String(account).trim(),
          symbol: String(symbol).trim(),
          executionPrice,
          side,
          timeRaw,
          date: p.date,
          hour: Number.isInteger(p.hour) ? p.hour : 0,
          closedPnL,
          leverage,
          size
        };
      }).filter(r => r.account);

      const res = computeAnalysis(cleanSent, cleanTrader);
      setAnalysis(res);
      console.debug('Parsing counts', { sentParsed: sentParsed.length, cleanSent: cleanSent.length, traderParsed: traderParsed.length, cleanTrader: cleanTrader.length });
    } catch (err) {
      console.error(err);
      alert('Error processing files — check console for details.');
    }
    setLoading(false);
  };

  // Demo CSVs
  const DEMO_SENT_CSV = `Date,Classification
2024-10-20,Fear
2024-10-21,Greed
2024-10-22,Fear
`;
  const DEMO_TRADER_CSV = `account,symbol,execution_price,size,side,timestamp,closedPnL,leverage
user123,BTCUSD,30850,0.5,buy,2024-10-21 14:30:00,150,5
user456,BTCUSD,31000,1.0,sell,2024-10-21 10:15:00,-200,3
user123,BTCUSD,30500,0.3,buy,2024-10-22 09:00:00,100,4
`;

  const loadDemoData = () => {
    Papa.parse(DEMO_SENT_CSV, {
      header: true,
      complete: (sRes) => {
        const sent = sRes.data.map(normalizeRow).map(r => ({ date: r.date || r.Date || r.timestamp, class: (r.classification || r.Classification || r.value || '').toString().toLowerCase() }));
        Papa.parse(DEMO_TRADER_CSV, {
          header: true,
          complete: (tRes) => {
            const trader = tRes.data.map(normalizeRow).map(r => {
              const { date, hour } = parseTime(r.timestamp || r.Timestamp || '', assumeIST);
              return {
                account: r.account,
                symbol: r.symbol,
                date,
                hour,
                closedPnL: toNumber(r.closedPnL || r['closedPnL'] || r.closedpnl || r.pnl || r['pnl']),
                leverage: toNumber(r.leverage || r.Leverage || 1),
                size: toNumber(r.size || r['size'] || r.size_tokens)
              };
            });
            const res = computeAnalysis(sent, trader);
            setAnalysis(res);
            alert('Demo data loaded');
          }
        });
      }
    });
  };

  // CSV download helper
  const downloadCSV = (data, filename = 'export.csv') => {
    const csv = Papa.unparse(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    saveAs(blob, filename);
  };

  const exportPDF = async () => {
    if (!reportRef.current) return alert('Nothing to export.');
    try {
      const canvas = await html2canvas(reportRef.current, { scale: 2 });
      const img = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = 210;
      const imgProps = pdf.getImageProperties(img);
      const pdfHeight = imgProps.height * pdfWidth / imgProps.width;
      pdf.addImage(img, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save('trading_sentiment_report.pdf');
    } catch (e) {
      console.error(e);
      alert('PDF export failed — check console.');
    }
  };

  // KPI
  const KPI = ({ label, value, sub }) => (
    <div className="bg-white p-4 rounded shadow-sm">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
      {sub && <div className="text-sm text-gray-400">{sub}</div>}
    </div>
  );

  // compute exact leverage buckets from raw trades (leverages per trade)
  const computeLeverageBuckets = () => {
    if (!analysis || !analysis.rawTrades) return [];
    const buckets = { 'Low (1-5x)': { trades: 0, totalPnL: 0, wins: 0 }, 'Medium (5-10x)': { trades: 0, totalPnL: 0, wins: 0 }, 'High (10-20x)': { trades: 0, totalPnL: 0, wins: 0 }, 'Extreme (>20x)': { trades: 0, totalPnL: 0, wins: 0 } };
    // iterate across all sentiment buckets
    ['fear', 'greed', 'unknown'].forEach((s) => {
      (analysis.rawTrades[s] || []).forEach((t) => {
        const lev = t.leverage || 0;
        let b;
        if (lev <= 5) b = 'Low (1-5x)';
        else if (lev <= 10) b = 'Medium (5-10x)';
        else if (lev <= 20) b = 'High (10-20x)';
        else b = 'Extreme (>20x)';
        buckets[b].trades++;
        buckets[b].totalPnL += t.closedPnL || 0;
        if ((t.closedPnL || 0) > 0) buckets[b].wins++;
      });
    });
    return Object.keys(buckets).map(k => ({ bucket: k, trades: buckets[k].trades, avgPnL: buckets[k].trades ? buckets[k].totalPnL / buckets[k].trades : 0, winRate: buckets[k].trades ? (buckets[k].wins / buckets[k].trades) * 100 : 0 }));
  };

  // UI tabs content similar to previous full component but now uses computeLeverageBuckets
  const Overview = () => {
    if (!analysis) return null;
    const perf = analysis.performanceBySentiment;
    const sentimentChart = Object.entries(perf).filter(([k]) => k !== 'unknown').map(([k, d]) => ({ sentiment: k, avgPnL: d.avgPnL, trades: d.trades, winRate: d.winRate }));
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <KPI label="Total Trades" value={analysis.totalTrades.toLocaleString()} />
          <KPI label="Unique Traders" value={analysis.uniqueTraders.toLocaleString()} />
          <KPI label="Total PnL" value={`$${analysis.daily && analysis.daily.length ? (analysis.daily[analysis.daily.length - 1].cumPnL || 0).toFixed(2) : '0.00'}`} />
          <KPI label="Top Sentiment (avg PnL)" value={(() => {
            const arr = sentimentChart.slice().sort((a, b) => b.avgPnL - a.avgPnL);
            return arr.length ? `${arr[0].sentiment} ($${arr[0].avgPnL.toFixed(2)})` : 'N/A';
          })()} />
        </div>

        <div className="bg-white p-4 rounded shadow">
          <h3 className="font-semibold mb-3">Average PnL by Sentiment</h3>
          <div style={{ height: 320 }}>
            <ResponsiveContainer>
              <BarChart data={sentimentChart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="sentiment" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="avgPnL" name="Avg PnL">
                  {sentimentChart.map((entry, idx) => <Cell key={idx} fill={entry.avgPnL >= 0 ? '#10b981' : '#ef4444'} />)}
                </Bar>
                <Bar dataKey="trades" name="Trades" fill="#a78bfa" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white p-4 rounded shadow">
            <h4 className="font-semibold mb-2">Daily Cumulative PnL</h4>
            <div style={{ height: 320 }}>
              <ResponsiveContainer>
                <LineChart data={analysis.daily || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="cumPnL" stroke="#3b82f6" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-4 rounded shadow">
            <h4 className="font-semibold mb-2">Hourly Avg PnL (UTC)</h4>
            <div style={{ height: 320 }}>
              <ResponsiveContainer>
                <BarChart data={analysis.hourly || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="hour" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="avgPnL" name="Avg PnL" fill="#10b981" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const PerformanceTab = () => {
    if (!analysis) return null;
    const levSummary = computeLeverageBuckets();
    return (
      <div className="space-y-6">
        <div className="bg-white p-4 rounded shadow">
          <h3 className="font-semibold mb-2">Sentiment Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Object.entries(analysis.performanceBySentiment).filter(([k]) => k !== 'unknown').map(([k, v]) => (
              <div key={k} className="bg-gray-50 p-3 rounded">
                <h4 className="font-semibold capitalize">{k}</h4>
                <p>Total Trades: {v.trades}</p>
                <p>Avg PnL: ${v.avgPnL.toFixed(2)}</p>
                <p>Win Rate: {v.winRate.toFixed(1)}%</p>
                <p>Avg Leverage: {v.avgLeverage.toFixed(2)}x</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-4 rounded shadow">
          <h3 className="font-semibold mb-2">Leverage Buckets (exact per trade)</h3>
          <div style={{ height: 320 }}>
            <ResponsiveContainer>
              <BarChart data={levSummary}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="bucket" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="avgPnL" name="Avg PnL" fill="#8b5cf6" />
                <Bar dataKey="winRate" name="Win Rate" fill="#f59e0b" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50"><tr><th className="px-3 py-2">Bucket</th><th className="px-3 py-2 text-right">Trades</th><th className="px-3 py-2 text-right">Avg PnL</th><th className="px-3 py-2 text-right">WinRate</th></tr></thead>
              <tbody>
                {levSummary.map(b => (
                  <tr key={b.bucket} className="hover:bg-gray-50"><td className="px-3 py-2">{b.bucket}</td><td className="px-3 py-2 text-right">{b.trades}</td><td className="px-3 py-2 text-right">${b.avgPnL.toFixed(2)}</td><td className="px-3 py-2 text-right">{b.winRate.toFixed(1)}%</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const TimeTab = () => {
    if (!analysis) return null;
    return (
      <div className="space-y-6">
        <div className="bg-white p-4 rounded shadow">
          <h3 className="font-semibold mb-2">Hourly Avg PnL (UTC)</h3>
          <div style={{ height: 360 }}>
            <ResponsiveContainer>
              <BarChart data={analysis.hourly}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hour" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="avgPnL" fill="#8b5cf6" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-4 rounded shadow">
          <h3 className="font-semibold mb-2">Daily Trend</h3>
          <div style={{ height: 360 }}>
            <ResponsiveContainer>
              <LineChart data={analysis.daily || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="avgPnL" stroke="#10b981" />
                <Line type="monotone" dataKey="cumPnL" stroke="#3b82f6" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    );
  };

  const TradersTab = () => {
    if (!analysis) return null;
    return (
      <div className="space-y-6">
        <div className="bg-white p-4 rounded shadow">
          <h3 className="font-semibold mb-2">Top Traders (Full)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr><th className="px-3 py-2">Rank</th><th className="px-3 py-2">Account</th><th className="px-3 py-2 text-right">Total PnL</th><th className="px-3 py-2 text-right">Trades</th><th className="px-3 py-2 text-right">Win Rate</th></tr>
              </thead>
              <tbody>
                {analysis.topTraders.map((t, i) => (
                  <tr key={t.account} className="hover:bg-gray-50">
                    <td className="px-3 py-2">{i + 1}</td>
                    <td className="px-3 py-2 font-mono">{t.account}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${t.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>${t.totalPnL.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right">{t.trades}</td>
                    <td className="px-3 py-2 text-right">{t.winRate.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // main render
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {!analysis && (
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-3xl mx-auto">
          <div className="text-center mb-6">
            <Activity className="w-16 h-16 mx-auto mb-4 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-800 mb-1">Bitcoin Sentiment & Trader Performance</h1>
            <p className="text-sm text-gray-600">Upload fear_greed_index.csv and historical_data.csv (or load demo)</p>
          </div>

          <div className="space-y-4">
            <label className="block border-2 border-dashed border-gray-200 rounded-lg p-4 cursor-pointer">
              <div className="flex items-center justify-center gap-2 mb-2"><Upload className="w-5 h-5 text-gray-500" /><div className="text-sm font-medium text-gray-700">Fear & Greed Index CSV</div></div>
              <input id="sent-file" type="file" accept=".csv" className="hidden" onChange={(e) => { if (e.target.files[0]) window.sentFile = e.target.files[0]; const el = document.getElementById('sent-file-name'); if (el && e.target.files[0]) el.textContent = e.target.files[0].name; }} />
              <div id="sent-file-name" className="text-xs text-gray-500 text-center">No file selected</div>
            </label>

            <label className="block border-2 border-dashed border-gray-200 rounded-lg p-4 cursor-pointer">
              <div className="flex items-center justify-center gap-2 mb-2"><Upload className="w-5 h-5 text-gray-500" /><div className="text-sm font-medium text-gray-700">Historical Trader CSV (Hyperliquid)</div></div>
              <input id="tr-file" type="file" accept=".csv" className="hidden" onChange={(e) => { if (e.target.files[0]) window.trFile = e.target.files[0]; const el = document.getElementById('tr-file-name'); if (el && e.target.files[0]) el.textContent = e.target.files[0].name; }} />
              <div id="tr-file-name" className="text-xs text-gray-500 text-center">No file selected</div>
            </label>

            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={assumeIST} onChange={(e) => setAssumeIST(e.target.checked)} />
                <span className="text-sm text-gray-600">Assume timestamps without timezone are IST (+05:30)</span>
              </label>

              <button className="ml-auto px-4 py-2 rounded bg-blue-600 text-white" onClick={() => {
                const s = window.sentFile, t = window.trFile;
                if (!s || !t) return alert('Please upload both files.');
                processFiles(s, t);
              }}>{loading ? 'Processing...' : 'Analyze Data'}</button>

              <button className="px-4 py-2 rounded bg-gray-100" onClick={() => {
                document.getElementById('sent-file').value = null;
                document.getElementById('tr-file').value = null;
                window.sentFile = null; window.trFile = null;
                setAnalysis(null);
              }}>Reset</button>
            </div>

            <div className="flex gap-2 mt-2">
              <button onClick={loadDemoData} className="bg-gray-500 text-white px-4 py-2 rounded">Load Demo Data</button>
              <button onClick={() => {
                downloadCSV(Papa.parse(DEMO_SENT_CSV, { header: true }).data, 'sample_fear_greed.csv');
                downloadCSV(Papa.parse(DEMO_TRADER_CSV, { header: true }).data, 'sample_historical.csv');
              }} className="bg-white border px-4 py-2 rounded">Download Sample CSVs</button>
            </div>
          </div>
        </div>
      )}

      {analysis && (
        <div className="max-w-7xl mx-auto" ref={reportRef}>
          <div className="bg-white rounded-lg shadow p-4 mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">Trading Sentiment Analysis</h2>
              <p className="text-sm text-gray-600">Trader performance vs Fear/Greed index</p>
            </div>

            <div className="flex gap-2">
              <button onClick={() => setActiveTab('overview')} className={`px-3 py-2 rounded ${activeTab === 'overview' ? 'bg-blue-600 text-white' : 'bg-white border'}`}>Overview</button>
              <button onClick={() => setActiveTab('performance')} className={`px-3 py-2 rounded ${activeTab === 'performance' ? 'bg-blue-600 text-white' : 'bg-white border'}`}>Performance</button>
              <button onClick={() => setActiveTab('time')} className={`px-3 py-2 rounded ${activeTab === 'time' ? 'bg-blue-600 text-white' : 'bg-white border'}`}>Time Analysis</button>
              <button onClick={() => setActiveTab('traders')} className={`px-3 py-2 rounded ${activeTab === 'traders' ? 'bg-blue-600 text-white' : 'bg-white border'}`}>Traders</button>
              <button onClick={exportPDF} className="px-3 py-2 rounded bg-white border flex items-center gap-2"><FileText className="w-4 h-4" /> Download PDF</button>
              <div className="w-px bg-gray-200 mx-1" />
              <button onClick={() => downloadCSV(analysis.topTraders.map(t => ({ account: t.account, totalPnL: t.totalPnL, trades: t.trades, winRate: t.winRate })), 'top_traders.csv')} className="px-3 py-2 rounded bg-white border">Download Top CSV</button>
              <button onClick={() => downloadCSV(analysis.daily || [], 'daily_summary.csv')} className="px-3 py-2 rounded bg-white border">Download Daily CSV</button>
            </div>
          </div>

          <div className="space-y-6">
            {activeTab === 'overview' && <Overview />}
            {activeTab === 'performance' && <PerformanceTab />}
            {activeTab === 'time' && <TimeTab />}
            {activeTab === 'traders' && <TradersTab />}

            <div className="bg-white p-4 rounded shadow">
              <h4 className="font-semibold">Key Insights & Suggested Actions</h4>
              <ul className="list-disc pl-5 text-gray-700 mt-2">
                <li>Total trades analyzed: <strong>{analysis.totalTrades}</strong></li>
                <li>Unique traders: <strong>{analysis.uniqueTraders}</strong></li>
                <li>Top trader (by PnL): <strong>{analysis.topTraders.length ? analysis.topTraders[0].account : 'N/A'}</strong></li>
                <li>Best sentiment (avg PnL): <strong>{(() => {
                  const arr = Object.entries(analysis.performanceBySentiment).filter(([k]) => k !== 'unknown').sort((a, b) => (b[1].avgPnL || 0) - (a[1].avgPnL || 0));
                  return arr.length ? arr[0][0] : 'N/A';
                })()}</strong></li>
              </ul>

              <div className="mt-3">
                <h5 className="font-semibold">Suggested Actions</h5>
                <ol className="list-decimal pl-5 text-gray-700">
                  <li>Investigate top traders to identify repeatable strategies and risk sizing.</li>
                  <li>Backtest counter-sentiment strategies (buy in fear / sell in greed) on longer history before deployment.</li>
                  <li>Limit extreme leverage during Fear market regimes unless validated.</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}