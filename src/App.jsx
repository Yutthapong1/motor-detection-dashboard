import React, { useState, useEffect, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';

// Set this to your deployed Render backend URL once you have it, e.g.
// const API_BASE_URL = 'https://motor-vibration-backend.onrender.com';
const API_BASE_URL = 'https://motor-fault-detection.onrender.com';

const COLORS = {
  bg: '#0A0F1C',
  panel: '#121A2E',
  panelAlt: '#1A2338',
  border: '#26314A',
  textPrimary: '#E7E9F0',
  textSecondary: '#8B93A8',
  amber: '#FFB020',
  cyan: '#4FD8E8',
  red: '#FF5C5C',
  green: '#3ECF8E',
};

const FAULT_FREQS = [
  { name: '1x', freq: 21.83, color: COLORS.cyan },
  { name: '2x', freq: 43.67, color: COLORS.cyan },
  { name: '3x', freq: 65.5, color: COLORS.cyan },
  { name: 'FTF', freq: 7.99, color: COLORS.red },
  { name: 'BPFO', freq: 55.92, color: COLORS.red },
  { name: 'BSF', freq: 75.56, color: COLORS.red },
  { name: 'BPFI', freq: 96.91, color: COLORS.red },
];

const CHANNELS = [
  { id: 'x', label: 'X-Axis' },
  { id: 'y', label: 'Y-Axis' },
  { id: 'z', label: 'Z-Axis' },
];

function zipSpectrum(freqs, mags) {
  if (!freqs || !mags) return [];
  return freqs.map((f, i) => ({ freq: Math.round(f * 10) / 10, mag: mags[i] }));
}

function zipWaveform(raw, fs) {
  if (!raw) return [];
  return raw.map((v, i) => ({ t: Math.round((i / fs) * 1000) / 1000, v }));
}

function getAmplitudeAt(spectrumPoints, targetFreq) {
  if (!spectrumPoints || spectrumPoints.length === 0) return 0;
  let closest = spectrumPoints[0];
  let minDiff = Math.abs(closest.freq - targetFreq);
  for (const p of spectrumPoints) {
    const diff = Math.abs(p.freq - targetFreq);
    if (diff < minDiff) { minDiff = diff; closest = p; }
  }
  return closest.mag;
}

function useApiData() {
  const [latest, setLatest] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [latestRes, historyRes] = await Promise.all([
        fetch(`${API_BASE_URL}/latest`),
        fetch(`${API_BASE_URL}/history?limit=50`),
      ]);
      if (!latestRes.ok) throw new Error(`/latest returned HTTP ${latestRes.status}`);
      const latestData = await latestRes.json();
      const historyData = historyRes.ok ? await historyRes.json() : [];
      setLatest(latestData);
      setHistory(historyData);
      setError(null);
    } catch (e) {
      setError(e.message || 'Could not reach backend');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return { latest, history, error, loading, refetch: fetchData };
}

function Panel({ title, right, children, className = '' }) {
  return (
    <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}` }} className={`rounded-lg p-5 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <div style={{ color: COLORS.textSecondary }} className="text-xs uppercase tracking-wider">{title}</div>
        {right}
      </div>
      {children}
    </div>
  );
}

function StatCard({ label, value, unit }) {
  return (
    <div style={{ background: COLORS.panelAlt, border: `1px solid ${COLORS.border}` }} className="rounded-lg px-4 py-3">
      <div style={{ color: COLORS.textSecondary }} className="text-xs uppercase tracking-wider mb-1">{label}</div>
      <div style={{ color: COLORS.textPrimary, fontFamily: '"JetBrains Mono", monospace' }} className="text-xl font-semibold">
        {value}<span style={{ color: COLORS.textSecondary }} className="text-xs ml-1">{unit}</span>
      </div>
    </div>
  );
}

function SpectrumChart({ data, height = 200, maxFreq = 120, maxAmp = '' }) {
  // maxAmp empty string = auto-scale; a number = fixed scale (for comparing readings apples-to-apples)
  const yDomain = maxAmp !== '' && !isNaN(Number(maxAmp)) ? [0, Number(maxAmp)] : ['auto', 'auto'];
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid stroke={COLORS.border} strokeDasharray="2 4" />
        <XAxis dataKey="freq" type="number" domain={[0, Number(maxFreq) || 120]} stroke={COLORS.textSecondary} tick={{ fontSize: 10 }} label={{ value: 'Hz', position: 'insideBottomRight', offset: -2, fill: COLORS.textSecondary, fontSize: 10 }} />
        <YAxis domain={yDomain} stroke={COLORS.textSecondary} tick={{ fontSize: 10 }} />
        <Tooltip contentStyle={{ background: COLORS.panelAlt, border: `1px solid ${COLORS.border}`, fontSize: 11 }} labelStyle={{ color: COLORS.textPrimary }} />
        {FAULT_FREQS.map((f) => (
          <ReferenceLine key={f.name} x={f.freq} stroke={f.color} strokeDasharray="3 3" strokeOpacity={0.6}
            label={{ value: f.name, position: 'top', fill: f.color, fontSize: 10 }} />
        ))}
        <Line type="monotone" dataKey="mag" stroke={COLORS.amber} strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function OverviewPage({ latest, history }) {
  const rmsTrendData = history.map((h, i) => ({ i, rms_x: h.rms_x, rms_y: h.rms_y, rms_z: h.rms_z }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      <Panel title="Sensor Readings" className="lg:col-span-3">
        <div className="grid grid-cols-3 gap-2">
          {CHANNELS.map((ch) => {
            const val = latest?.[ch.id]?.rms;
            return (
              <StatCard key={ch.id} label={`${ch.label} RMS`} value={val != null ? val.toFixed(1) : '--'} unit="raw" />
            );
          })}
        </div>
        <div style={{ color: COLORS.textSecondary }} className="text-xs mt-3">
          Layout supports additional channels (e.g. temperature, current) as new sensors are added -- each is one more card, no page redesign needed.
        </div>
      </Panel>

      <Panel title="Fault Classification" className="lg:col-span-2">
        <div style={{ color: COLORS.textSecondary }} className="text-sm py-4 text-center">
          Model not trained yet. This panel will show Normal / BPFO / BPFI / FTF / BSF once the Random Forest model is added.
        </div>
      </Panel>

      <Panel title="Key Information" className="lg:col-span-3">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex justify-between"><span style={{ color: COLORS.textSecondary }}>Bearing</span><span>6201ZZC3</span></div>
          <div className="flex justify-between"><span style={{ color: COLORS.textSecondary }}>Mount</span><span>DE housing</span></div>
          <div className="flex justify-between"><span style={{ color: COLORS.textSecondary }}>Running speed</span><span style={{ fontFamily: '"JetBrains Mono", monospace' }}>1310 RPM</span></div>
          <div className="flex justify-between"><span style={{ color: COLORS.textSecondary }}>Sample rate</span><span style={{ fontFamily: '"JetBrains Mono", monospace' }}>{latest?.sample_rate ?? '--'} Hz</span></div>
          <div className="flex justify-between col-span-2"><span style={{ color: COLORS.textSecondary }}>Last reading</span><span style={{ fontFamily: '"JetBrains Mono", monospace' }}>{latest?.timestamp ? new Date(latest.timestamp).toLocaleString() : '--'}</span></div>
        </div>
      </Panel>

      <Panel title="RMS Trend" className="lg:col-span-2">
        <ResponsiveContainer width="100%" height={140}>
          <LineChart data={rmsTrendData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid stroke={COLORS.border} strokeDasharray="2 4" />
            <XAxis dataKey="i" stroke={COLORS.textSecondary} tick={false} />
            <YAxis stroke={COLORS.textSecondary} tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ background: COLORS.panelAlt, border: `1px solid ${COLORS.border}`, fontSize: 11 }} />
            <Line type="monotone" dataKey="rms_x" stroke={COLORS.green} strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </Panel>
    </div>
  );
}

function SignalAnalysisPage({ latest }) {
  const [axis, setAxis] = useState('x');
  const [maxFreq, setMaxFreq] = useState(120);
  const [maxAmp, setMaxAmp] = useState(''); // empty = auto-scale
  const axisData = latest?.[axis];
  const spectrum = zipSpectrum(axisData?.spectrum_freqs, axisData?.spectrum_mag);
  const waveform = zipWaveform(axisData?.raw, latest?.sample_rate || 500);

  const inputStyle = {
    background: COLORS.panelAlt,
    border: `1px solid ${COLORS.border}`,
    color: COLORS.textPrimary,
    fontFamily: '"JetBrains Mono", monospace',
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-1">
        {CHANNELS.map((ch) => (
          <button key={ch.id} onClick={() => setAxis(ch.id)}
            style={{
              background: axis === ch.id ? COLORS.amber : 'transparent',
              color: axis === ch.id ? COLORS.bg : COLORS.textSecondary,
              border: `1px solid ${axis === ch.id ? COLORS.amber : COLORS.border}`,
              fontFamily: '"JetBrains Mono", monospace',
            }}
            className="text-xs px-3 py-1 rounded"
          >
            {ch.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <Panel title={`Time Waveform - ${axis.toUpperCase()}`} className="lg:col-span-3">
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={waveform} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid stroke={COLORS.border} strokeDasharray="2 4" />
              <XAxis dataKey="t" stroke={COLORS.textSecondary} tick={{ fontSize: 10 }} label={{ value: 's', position: 'insideBottomRight', offset: -2, fill: COLORS.textSecondary, fontSize: 10 }} />
              <YAxis stroke={COLORS.textSecondary} tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ background: COLORS.panelAlt, border: `1px solid ${COLORS.border}`, fontSize: 11 }} />
              <Line type="monotone" dataKey="v" stroke={COLORS.cyan} strokeWidth={1} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Signal Info">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span style={{ color: COLORS.textSecondary }}>Sampling rate</span><span style={{ fontFamily: '"JetBrains Mono", monospace' }}>{latest?.sample_rate ?? '--'} Hz</span></div>
            <div className="flex justify-between"><span style={{ color: COLORS.textSecondary }}>Window</span><span>Hanning</span></div>
            <div className="flex justify-between"><span style={{ color: COLORS.textSecondary }}>Sensor</span><span>ADXL335</span></div>
            <div className="flex justify-between"><span style={{ color: COLORS.textSecondary }}>Channel</span><span>{axis.toUpperCase()}</span></div>
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <Panel
          title={`FFT Spectrum - ${axis.toUpperCase()}`}
          className="lg:col-span-3"
          right={
            <div className="flex items-center gap-3 text-xs">
              <label className="flex items-center gap-1.5" style={{ color: COLORS.textSecondary }}>
                Max Hz
                <input type="number" value={maxFreq} onChange={(e) => setMaxFreq(e.target.value)}
                  style={inputStyle} className="w-16 rounded px-1.5 py-0.5" />
              </label>
              <label className="flex items-center gap-1.5" style={{ color: COLORS.textSecondary }}>
                Max Amp
                <input type="number" value={maxAmp} onChange={(e) => setMaxAmp(e.target.value)}
                  placeholder="auto" style={inputStyle} className="w-16 rounded px-1.5 py-0.5" />
              </label>
            </div>
          }
        >
          <SpectrumChart data={spectrum} maxFreq={maxFreq} maxAmp={maxAmp} />
          <div className="flex gap-4 mt-1 flex-wrap">
            <div className="flex items-center gap-1.5"><span style={{ background: COLORS.cyan }} className="w-2 h-2 rounded-full inline-block" /><span style={{ color: COLORS.textSecondary }} className="text-xs">Running speed harmonics</span></div>
            <div className="flex items-center gap-1.5"><span style={{ background: COLORS.red }} className="w-2 h-2 rounded-full inline-block" /><span style={{ color: COLORS.textSecondary }} className="text-xs">Bearing fault frequencies</span></div>
          </div>
        </Panel>

        <Panel title="Marker Readout">
          <div className="space-y-1.5 text-xs">
            {FAULT_FREQS.map((f) => (
              <div key={f.name} className="flex justify-between items-center">
                <span className="flex items-center gap-1.5">
                  <span style={{ background: f.color }} className="w-1.5 h-1.5 rounded-full inline-block" />
                  <span style={{ color: COLORS.textPrimary }}>{f.name}</span>
                </span>
                <span style={{ color: COLORS.textSecondary, fontFamily: '"JetBrains Mono", monospace' }}>{f.freq}Hz</span>
                <span style={{ color: COLORS.textPrimary, fontFamily: '"JetBrains Mono", monospace' }}>{getAmplitudeAt(spectrum, f.freq).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="RMS" value={axisData?.rms != null ? axisData.rms.toFixed(1) : '--'} unit="raw" />
        <StatCard label="Crest Factor" value={axisData?.crest_factor != null ? axisData.crest_factor.toFixed(2) : '--'} unit="" />
        <StatCard label="Kurtosis" value={axisData?.kurtosis != null ? axisData.kurtosis.toFixed(2) : '--'} unit="" />
      </div>
    </div>
  );
}

function PredictionPage() {
  return (
    <Panel title="AI Prediction">
      <div style={{ color: COLORS.textSecondary }} className="text-sm text-center py-16">
        Model not trained yet.<br />
        Fault classification, Remaining Useful Life, and Health Index will appear here once the Random Forest model is added in the next phase.
      </div>
    </Panel>
  );
}

function TrendPage({ history }) {
  const values = history.map((h) => h.rms_x).filter((v) => v != null);
  const avg = values.length ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1) : '--';
  const max = values.length ? Math.max(...values).toFixed(1) : '--';
  const min = values.length ? Math.min(...values).toFixed(1) : '--';
  const chartData = history.map((h, i) => ({ i, rms_x: h.rms_x }));

  return (
    <div className="space-y-4">
      <Panel title="RMS Trend (X-Axis)">
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid stroke={COLORS.border} strokeDasharray="2 4" />
            <XAxis dataKey="i" stroke={COLORS.textSecondary} tick={{ fontSize: 10 }} />
            <YAxis stroke={COLORS.textSecondary} tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ background: COLORS.panelAlt, border: `1px solid ${COLORS.border}`, fontSize: 11 }} />
            <Line type="monotone" dataKey="rms_x" stroke={COLORS.green} strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </Panel>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Average" value={avg} unit="raw" />
        <StatCard label="Maximum" value={max} unit="raw" />
        <StatCard label="Minimum" value={min} unit="raw" />
      </div>
    </div>
  );
}

const PAGES = [
  { id: 'overview', label: 'Overview', Component: OverviewPage },
  { id: 'signal', label: 'Signal Analysis', Component: SignalAnalysisPage },
  { id: 'prediction', label: 'AI Prediction', Component: PredictionPage },
  { id: 'trend', label: 'Trend Analysis', Component: TrendPage },
];

export default function MotorFaultDashboard() {
  const [page, setPage] = useState('overview');
  const { latest, history, error, loading } = useApiData();
  const ActivePage = PAGES.find((p) => p.id === page).Component;

  return (
    <div style={{ background: COLORS.bg, color: COLORS.textPrimary, fontFamily: 'Inter, sans-serif', minHeight: '100vh' }} className="p-6">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;700&display=swap');
      `}</style>

      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <div style={{ fontFamily: '"Space Grotesk", sans-serif', letterSpacing: '0.02em' }} className="text-2xl font-bold">MOTOR FAULT MONITOR</div>
          <div style={{ color: COLORS.textSecondary }} className="text-sm mt-1">ADXL335 (GY-61) · DE bearing housing · 6201ZZC3</div>
        </div>
        <div className="flex items-center gap-2">
          <span style={{ background: error ? COLORS.red : COLORS.green, boxShadow: `0 0 8px ${error ? COLORS.red : COLORS.green}` }} className="w-2.5 h-2.5 rounded-full inline-block animate-pulse" />
          <span style={{ color: error ? COLORS.red : COLORS.green, fontFamily: '"JetBrains Mono", monospace' }} className="text-sm font-medium">{error ? 'DISCONNECTED' : 'LIVE'}</span>
        </div>
      </div>

      {error && (
        <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.red}`, color: COLORS.red }} className="rounded-lg p-3 mb-4 text-sm">
          Can't reach backend: {error}. Check that API_BASE_URL points to your deployed Render service, that the backend is awake (first request after idle can take 30-50s), and that the ESP32 has sent at least one batch.
        </div>
      )}

      {loading && !latest && !error && (
        <div style={{ color: COLORS.textSecondary }} className="text-sm mb-4">Loading...</div>
      )}

      <div style={{ borderBottom: `1px solid ${COLORS.border}` }} className="flex gap-1 mb-5 flex-wrap">
        {PAGES.map((p) => (
          <button key={p.id} onClick={() => setPage(p.id)}
            style={{
              color: page === p.id ? COLORS.amber : COLORS.textSecondary,
              borderBottom: page === p.id ? `2px solid ${COLORS.amber}` : '2px solid transparent',
              fontFamily: '"JetBrains Mono", monospace',
            }}
            className="text-sm px-3 py-2 -mb-px"
          >
            {p.label}
          </button>
        ))}
      </div>

      <ActivePage latest={latest} history={history} />
    </div>
  );
}