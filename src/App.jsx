import React, { useState, useEffect, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';
import { LayoutDashboard, Activity, Cpu, TrendingUp, Gauge } from 'lucide-react';

// Set this to your deployed Render backend URL once you have it, e.g.
// const API_BASE_URL = 'https://motor-vibration-backend.onrender.com';
const API_BASE_URL = 'https://motor-fault-detection.onrender.com';

// Light theme for the main content area
const COLORS = {
  bg: '#F8FAFC',
  panel: '#FFFFFF',
  panelAlt: '#F1F5F9',
  border: '#E2E8F0',
  textPrimary: '#0F172A',
  textSecondary: '#64748B',
  amber: '#D97706',
  cyan: '#0891B2',
  red: '#DC2626',
  green: '#16A34A',
};

// Dark palette used only for the left sidebar (matches reference image's nav strip)
const SIDEBAR = {
  bg: '#111827',
  hoverBg: 'rgba(217, 119, 6, 0.15)',
  text: '#94A3B8',
  textActive: '#D97706',
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
  const [session, setSession] = useState({ label: 'unlabeled', trial: 0 });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionBusy, setSessionBusy] = useState(false);

  const fetchLatest = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/latest`);
      if (!res.ok) throw new Error(`/latest returned HTTP ${res.status}`);
      setLatest(await res.json());
      setError(null);
    } catch (e) {
      setError(e.message || 'Could not reach backend');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/history?limit=50`);
      if (res.ok) setHistory(await res.json());
    } catch (e) {
      // non-critical -- don't let a history hiccup override the main connection status
    }
  }, []);

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/session/current`);
      if (res.ok) setSession(await res.json());
    } catch (e) {
      // non-critical
    }
  }, []);

  const [sessionError, setSessionError] = useState(null);

  const startSession = useCallback(async (label) => {
    setSessionBusy(true);
    setSessionError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/session/start?label=${label}`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
      }
      setSession(await res.json());
    } catch (e) {
      setSessionError(e.message || 'Failed to start session');
    } finally {
      setSessionBusy(false);
    }
  }, []);

  useEffect(() => {
    fetchLatest();
    fetchHistory();
    fetchSession();
    // /latest is a single cheap document read -- poll it often for a "live" feel.
    // /history reads up to 50 documents per call -- poll it far less often to
    // avoid burning through the Firestore free daily read quota (50k/day).
    const latestInterval = setInterval(fetchLatest, 5000);
    const historyInterval = setInterval(fetchHistory, 20000);
    return () => {
      clearInterval(latestInterval);
      clearInterval(historyInterval);
    };
  }, [fetchLatest, fetchHistory, fetchSession]);

  return { latest, history, session, error, loading, startSession, sessionBusy, sessionError };
}

function Panel({ title, right, children, className = '' }) {
  return (
    <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }} className={`rounded-lg p-5 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <div style={{ color: COLORS.textSecondary }} className="text-xs uppercase tracking-wider font-medium">{title}</div>
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

function makeTicks(max, count = 5) {
  const m = Number(max) || 0;
  if (m <= 0) return undefined;
  return Array.from({ length: count }, (_, i) => Number(((m * i) / (count - 1)).toFixed(2)));
}

function SpectrumChart({ data, height = 200, maxFreq = 120, maxAmp = '' }) {
  const freqMax = Number(maxFreq) || 120;
  const clippedData = data.filter((p) => p.freq <= freqMax);
  const hasFixedAmp = maxAmp !== '' && !isNaN(Number(maxAmp));
  const yDomain = hasFixedAmp ? [0, Number(maxAmp)] : ['auto', 'auto'];
  const yTicks = hasFixedAmp ? makeTicks(maxAmp) : undefined;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={clippedData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid stroke={COLORS.border} strokeDasharray="2 4" />
        <XAxis dataKey="freq" type="number" domain={[0, freqMax]} allowDataOverflow stroke={COLORS.textSecondary} tick={{ fontSize: 10 }} label={{ value: 'Hz', position: 'insideBottomRight', offset: -2, fill: COLORS.textSecondary, fontSize: 10 }} />
        <YAxis domain={yDomain} ticks={yTicks} tickFormatter={(v) => Number(v).toFixed(2)} allowDataOverflow stroke={COLORS.textSecondary} tick={{ fontSize: 10 }} />
        <Tooltip contentStyle={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, fontSize: 11 }} labelStyle={{ color: COLORS.textPrimary }} />
        {FAULT_FREQS.map((f) => (
          <ReferenceLine key={f.name} x={f.freq} stroke={f.color} strokeDasharray="3 3" strokeOpacity={0.6}
            label={{ value: f.name, position: 'top', fill: f.color, fontSize: 10 }} />
        ))}
        <Line type="monotone" dataKey="mag" stroke={COLORS.amber} strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function OverviewPage({ latest, history, session, startSession, sessionBusy, sessionError }) {
  const rmsTrendData = history.map((h, i) => ({ i, rms_x: h.rms_x, rms_y: h.rms_y, rms_z: h.rms_z }));
  const TRAINING_LABELS = ['normal', 'bpfo', 'bpfi', 'ftf', 'bsf'];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      <Panel title="Recording Session" className="lg:col-span-5">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <div>
            <span style={{ color: COLORS.textSecondary }} className="text-sm">Currently labeling as </span>
            <span style={{ color: session.label === 'unlabeled' ? COLORS.red : COLORS.amber, fontFamily: '"JetBrains Mono", monospace' }} className="text-sm font-bold uppercase">
              {session.label}
            </span>
            {session.trial > 0 && (
              <span style={{ color: COLORS.textSecondary, fontFamily: '"JetBrains Mono", monospace' }} className="text-sm"> · trial {session.trial}</span>
            )}
          </div>
        </div>

        {sessionError && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: COLORS.red }} className="rounded-lg p-3 mb-3 text-xs break-words">
            Couldn't start session: {sessionError}
          </div>
        )}

        <div style={{ color: COLORS.textSecondary }} className="text-xs uppercase tracking-wider mb-1.5">Known condition (training data collection)</div>
        <div className="flex gap-2 flex-wrap mb-3">
          {TRAINING_LABELS.map((l) => (
            <button
              key={l}
              disabled={sessionBusy}
              onClick={() => startSession(l)}
              style={{
                background: session.label === l ? COLORS.amber : COLORS.panelAlt,
                color: session.label === l ? '#FFFFFF' : COLORS.textPrimary,
                border: `1px solid ${session.label === l ? COLORS.amber : COLORS.border}`,
                opacity: sessionBusy ? 0.5 : 1,
              }}
              className="text-xs px-3 py-1.5 rounded uppercase font-medium"
            >
              Start {l}
            </button>
          ))}
        </div>

        <div style={{ color: COLORS.textSecondary }} className="text-xs uppercase tracking-wider mb-1.5">Real use (condition unknown -- rely on AI Prediction tab instead)</div>
        <button
          disabled={sessionBusy}
          onClick={() => startSession('monitoring')}
          style={{
            background: session.label === 'monitoring' ? COLORS.cyan : COLORS.panelAlt,
            color: session.label === 'monitoring' ? '#FFFFFF' : COLORS.textPrimary,
            border: `1px solid ${session.label === 'monitoring' ? COLORS.cyan : COLORS.border}`,
            opacity: sessionBusy ? 0.5 : 1,
          }}
          className="text-xs px-3 py-1.5 rounded uppercase font-medium"
        >
          Start Monitoring (unknown state)
        </button>

        <div style={{ color: COLORS.textSecondary }} className="text-xs mt-3">
          Only click a "known condition" button when you actually know the ground truth. Otherwise click "Start Monitoring" -- this keeps real-world unknown-state data from being silently mislabeled with whatever training label was last active.
        </div>
      </Panel>

      <Panel title="Sensor Readings" className="lg:col-span-3">
        <div className="grid grid-cols-3 gap-2">
          {CHANNELS.map((ch) => {
            const val = latest?.[ch.id]?.rms;
            return (
              <StatCard key={ch.id} label={`${ch.label} RMS`} value={val != null ? val.toFixed(1) : '--'} unit="raw" />
            );
          })}
        </div>
      </Panel>

      <Panel title="Fault Classification" className="lg:col-span-2">
        <div style={{ color: COLORS.textSecondary }} className="text-sm py-4 text-center">
          Model not trained yet.
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
            <Tooltip contentStyle={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, fontSize: 11 }} />
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
              color: axis === ch.id ? '#FFFFFF' : COLORS.textSecondary,
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
              <Tooltip contentStyle={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, fontSize: 11 }} />
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
            <Tooltip contentStyle={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, fontSize: 11 }} />
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
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, Component: OverviewPage },
  { id: 'signal', label: 'Signal Analysis', icon: Activity, Component: SignalAnalysisPage },
  { id: 'prediction', label: 'AI Prediction', icon: Cpu, Component: PredictionPage },
  { id: 'trend', label: 'Trend Analysis', icon: TrendingUp, Component: TrendPage },
];

export default function MotorFaultDashboard() {
  const [page, setPage] = useState('overview');
  const { latest, history, session, error, loading, startSession, sessionBusy, sessionError } = useApiData();
  const active = PAGES.find((p) => p.id === page);
  const ActivePage = active.Component;

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', minHeight: '100vh' }} className="flex">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;700&display=swap');
      `}</style>

      {/* Sidebar */}
      <div style={{ width: 220, background: SIDEBAR.bg }} className="flex flex-col p-4 shrink-0">
        <div className="flex items-center gap-2 mb-8 px-2 pt-1">
          <Gauge size={20} color={COLORS.amber} />
          <span style={{ color: '#FFFFFF', fontFamily: '"Space Grotesk", sans-serif', letterSpacing: '0.02em' }} className="font-bold text-sm">MOTOR MONITOR</span>
        </div>
        <nav className="flex flex-col gap-1">
          {PAGES.map((p) => {
            const Icon = p.icon;
            const isActive = page === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setPage(p.id)}
                style={{
                  background: isActive ? SIDEBAR.hoverBg : 'transparent',
                  color: isActive ? SIDEBAR.textActive : SIDEBAR.text,
                }}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-left"
              >
                <Icon size={16} />
                {p.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Main content */}
      <div style={{ background: COLORS.bg, color: COLORS.textPrimary }} className="flex-1 p-6 overflow-auto">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <div style={{ fontFamily: '"Space Grotesk", sans-serif' }} className="text-xl font-bold">{active.label}</div>
            <div style={{ color: COLORS.textSecondary }} className="text-sm mt-1">ADXL335 (GY-61) · DE bearing housing · 6201ZZC3</div>
          </div>
          <div className="flex items-center gap-2">
            <span style={{ background: error ? COLORS.red : COLORS.green }} className="w-2.5 h-2.5 rounded-full inline-block animate-pulse" />
            <span style={{ color: error ? COLORS.red : COLORS.green, fontFamily: '"JetBrains Mono", monospace' }} className="text-sm font-medium">{error ? 'DISCONNECTED' : 'LIVE'}</span>
          </div>
        </div>

        {error && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: COLORS.red }} className="rounded-lg p-3 mb-4 text-sm">
            Can't reach backend: {error}. Check that API_BASE_URL points to your deployed Render service, that the backend is awake (first request after idle can take 30-50s), and that the ESP32 has sent at least one batch.
          </div>
        )}

        {loading && !latest && !error && (
          <div style={{ color: COLORS.textSecondary }} className="text-sm mb-4">Loading...</div>
        )}

        <ActivePage latest={latest} history={history} session={session} startSession={startSession} sessionBusy={sessionBusy} sessionError={sessionError} />
      </div>
    </div>
  );
}