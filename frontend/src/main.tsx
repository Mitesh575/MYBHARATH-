import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  LayoutDashboard,
  FlaskConical,
  ClipboardList,
  BookOpen,
  ChevronRight,
  ArrowRight,
  Cpu,
  Thermometer,
  Radio,
  Monitor,
  Search,
  Sparkles,
  Play,
  Check,
  CheckCircle2,
  X,
  Download,
  Clock3,
  ShieldCheck,
  Layers3,
  Zap,
  Plus,
  Lightbulb,
  LockKeyhole,
  Cable,
  Target,
  AlertTriangle,
  Loader2,
  Send,
  ArrowLeft,
  Wrench,
  Menu,
  RotateCcw,
} from "lucide-react";
import {
  request,
  startCase,
  getCase,
  action,
  readHandles,
  saveHandles,
} from "./api";
import type {
  Mode,
  Tool,
  Fault,
  Repair,
  Evidence,
  Session,
  Handle,
} from "./types";
import "./styles.css";

const faults: Record<Fault, string> = {
  sensor_stuck: "Sensor output stuck",
  firmware_stale: "Firmware reuses an old sample",
  communication_drop: "Communication delivers no updates",
};
const repairs: Record<Repair, string> = {
  replace_sensor: "Replace sensor module",
  refresh_firmware: "Correct firmware sample refresh",
  restore_link: "Restore communication link",
};
const tools: { id: Tool; name: string; hint: string; icon: typeof Cpu }[] = [
  {
    id: "raw_sensor",
    name: "Raw sensor reading",
    hint: "Measure the signal before processing",
    icon: Thermometer,
  },
  {
    id: "controller",
    name: "Controller trace",
    hint: "Inspect the value and sample used",
    icon: Cpu,
  },
  {
    id: "network",
    name: "Communication check",
    hint: "Compare sent and received packets",
    icon: Radio,
  },
  {
    id: "dashboard",
    name: "Dashboard inspection",
    hint: "Inspect display freshness",
    icon: Monitor,
  },
  {
    id: "inspection",
    name: "Connection inspection",
    hint: "Check power and physical connections",
    icon: Cable,
  },
];
const time = (n: number) =>
  `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
const formatValue = (v: unknown) =>
  typeof v === "number" ? String(v) : String(v ?? "—");

function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prior = document.activeElement as HTMLElement | null;
    ref.current
      ?.querySelector<HTMLElement>("textarea,input,select,button")
      ?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const items = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            "button:not([disabled]),textarea,input,select,a[href]",
          ) || [],
        );
        if (!items.length) return;
        const a = items[0],
          b = items.at(-1);
        if (e.shiftKey && document.activeElement === a) {
          e.preventDefault();
          b?.focus();
        } else if (!e.shiftKey && document.activeElement === b) {
          e.preventDefault();
          a.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      prior?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        <div className="modal-heading">
          <h2 id="dialog-title">{title}</h2>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Circuit({
  session,
  preview = false,
}: {
  session?: Session | null;
  preview?: boolean;
}) {
  const latest = (tool: Tool) =>
    session?.observations.filter((e) => e.tool === tool).at(-1);
  const raw = latest("raw_sensor"),
    controller = latest("controller"),
    network = latest("network");
  const nodes = [
    {
      name: "Sensor",
      sub: "MEASUREMENT",
      icon: Thermometer,
      value: raw ? `${Number(raw.data.value).toFixed(2)}°C` : "Not measured",
      tag: raw?.id,
    },
    {
      name: "Controller",
      sub: "PROCESSING",
      icon: Cpu,
      value: controller
        ? `${Number(controller.data.value).toFixed(2)}°C`
        : "Not measured",
      tag: controller?.id,
    },
    {
      name: "Communication",
      sub: "DELIVERY",
      icon: Radio,
      value: network
        ? `${network.data.packets_acknowledged} / ${network.data.packets_sent} ACK`
        : "Not measured",
      tag: network?.id,
    },
    {
      name: "Dashboard",
      sub: "DISPLAY",
      icon: Monitor,
      value: session
        ? `${session.dashboard.value.toFixed(2)}°C`
        : "Frozen reading",
      tag: session ? "Visible" : undefined,
    },
  ];
  return (
    <div
      className={`circuit ${preview ? "preview" : ""}`}
      aria-label="Temperature system: sensor, controller, communication and dashboard"
    >
      <div className="circuit-wire" />
      {nodes.map((n, i) => (
        <div
          key={n.name}
          className={`device device-${i} ${n.tag ? "measured" : ""}`}
        >
          <div className="device-top">
            <span className="hardware-icon">
              <n.icon size={preview ? 27 : 23} strokeWidth={1.6} />
            </span>
            <span className="pin-light" />
          </div>
          <small>{n.sub}</small>
          <strong>{n.name}</strong>
          <span className="device-value">{preview ? "" : n.value}</span>
          {n.tag && !preview && <span className="device-tag">{n.tag}</span>}
        </div>
      ))}
    </div>
  );
}

function Trend({ session }: { session: Session }) {
  const width = 720,
    height = 180,
    left = 42,
    right = 16,
    top = 14,
    bottom = 30;
  const groups: [string, string, { t: number; v: number }[]][] = [
    [
      "Display",
      "#279c89",
      [
        { t: 0, v: session.initial },
        ...session.observations
          .filter((e) => e.tool === "dashboard")
          .map((e) => ({ t: e.time, v: Number(e.data.value) })),
        { t: session.time, v: session.dashboard.value },
      ],
    ],
    [
      "Raw sensor",
      "#5790de",
      session.observations
        .filter((e) => e.tool === "raw_sensor")
        .map((e) => ({ t: e.time, v: Number(e.data.value) })),
    ],
    [
      "Controller",
      "#b18cdb",
      session.observations
        .filter((e) => e.tool === "controller")
        .map((e) => ({ t: e.time, v: Number(e.data.value) })),
    ],
  ];
  const all = groups.flatMap((g) => g[2].map((p) => p.v));
  const low = Math.floor((Math.min(...all, session.setpoint) - 3) / 5) * 5,
    high = Math.ceil((Math.max(...all, session.setpoint) + 3) / 5) * 5;
  const x = (t: number) =>
      left + ((width - left - right) * t) / Math.max(session.time, 20),
    y = (v: number) =>
      height - bottom - ((height - top - bottom) * (v - low)) / (high - low);
  return (
    <div className="trend">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Observed temperature values over simulation time. Lines connect observations, not continuously sampled signals."
      >
        <title>Measured values over simulation time</title>
        {Array.from({ length: 4 }, (_, i) => {
          const v = low + ((high - low) * i) / 3;
          return (
            <g key={i}>
              <line
                x1={left}
                x2={width - right}
                y1={y(v)}
                y2={y(v)}
                stroke="#e8eef0"
              />
              <text x="3" y={y(v) + 4} fill="#88949f" fontSize="11">
                {Math.round(v)}°
              </text>
            </g>
          );
        })}
        <line
          x1={left}
          x2={width - right}
          y1={y(session.setpoint)}
          y2={y(session.setpoint)}
          stroke="#b3bdc6"
          strokeDasharray="5 5"
        />
        {groups.map(([name, color, points]) => (
          <g key={name}>
            <polyline
              fill="none"
              stroke={color}
              strokeWidth="2.5"
              points={points.map((p) => `${x(p.t)},${y(p.v)}`).join(" ")}
            />
            {points.map((p, i) => (
              <circle
                key={i}
                cx={x(p.t)}
                cy={y(p.v)}
                r="3.5"
                fill={color}
                stroke="white"
                strokeWidth="1.5"
              >
                <title>
                  {name}: {p.v}°C at {time(p.t)}
                </title>
              </circle>
            ))}
          </g>
        ))}
        <text x={left} y={height - 7} fill="#88949f" fontSize="11">
          00:00
        </text>
        <text
          textAnchor="end"
          x={width - right}
          y={height - 7}
          fill="#88949f"
          fontSize="11"
        >
          {time(Math.max(session.time, 20))} simulated
        </text>
      </svg>
      <div className="legend">
        <span>
          <i style={{ background: "#279c89" }} />
          Display
        </span>
        <span>
          <i style={{ background: "#5790de" }} />
          Raw sensor
        </span>
        <span>
          <i style={{ background: "#b18cdb" }} />
          Controller
        </span>
        <span className="legend-setpoint">– – Current setpoint</span>
      </div>
    </div>
  );
}

function App() {
  const [page, setPage] = useState<"overview" | "lab" | "reports" | "guide">(
    "overview",
  );
  const [handles, setHandles] = useState<Handle[]>(readHandles);
  const [current, setCurrent] = useState<Handle | null>(null),
    [session, setSession] = useState<Session | null>(null);
  const [history, setHistory] = useState<Session[]>([]),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  const [health, setHealth] = useState<{
      status: string;
      coach: string;
    } | null>(null),
    [mobile, setMobile] = useState(false);
  const [tool, setTool] = useState<Tool | null>(null),
    [prediction, setPrediction] = useState("");
  const [selected, setSelected] = useState<string[]>([]),
    [expanded, setExpanded] = useState<string[]>([]);
  const [diagnosisOpen, setDiagnosisOpen] = useState(false),
    [fault, setFault] = useState<Fault | " ">(" "),
    [explanation, setExplanation] = useState("");
  const [repairChoice, setRepairChoice] = useState<Repair | " ">(" "),
    [chamber, setChamber] = useState(40),
    [question, setQuestion] = useState("");
  const [finishOpen, setFinishOpen] = useState(false),
    [replay, setReplay] = useState<number | null>(null);
  const [reportSession, setReportSession] = useState<Session | null>(null),
    [notice, setNotice] = useState("");
  const run = async (name: string, fn: () => Promise<void>) => {
    setError("");
    setBusy(name);
    try {
      await fn();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Something went wrong. Try again.",
      );
    } finally {
      setBusy("");
    }
  };
  const remember = (s: Session) => {
    setSession(s);
    setHistory((prev) => [s, ...prev.filter((p) => p.id !== s.id)]);
    if (s.completed) {
      setReportSession(s);
      setReplay(null);
      setPage("reports");
    }
  };
  useEffect(() => {
    request<{ status: string; coach: string }>("/api/health")
      .then(setHealth)
      .catch(() => setHealth(null));
    Promise.allSettled(handles.map(getCase)).then((results) =>
      setHistory(
        results
          .filter(
            (r): r is PromiseFulfilledResult<Session> =>
              r.status === "fulfilled",
          )
          .map((r) => r.value),
      ),
    );
  }, []);
  const begin = (mode: Mode) =>
    run("start", async () => {
      const result = await startCase(mode);
      const h = {
        id: result.session.id,
        key: result.key,
        mode,
        created_at: result.session.created_at,
      };
      const next = [h, ...handles];
      saveHandles(next);
      setHandles(next);
      setCurrent(h);
      setSession(result.session);
      setHistory((prev) => [result.session, ...prev]);
      setSelected([]);
      setExpanded([]);
      setChamber(result.session.initial + 12);
      setFault(" ");
      setExplanation("");
      setRepairChoice(" ");
      setReportSession(null);
      setPage("lab");
      setMobile(false);
    });
  const resume = (s: Session) =>
    run("resume", async () => {
      const h = handles.find((h) => h.id === s.id);
      if (!h)
        throw new Error("This browser does not have the case access key.");
      setCurrent(h);
      const updated = await getCase(h);
      setSession(updated);
      setChamber(
        Math.min(
          65,
          updated.setpoint === updated.initial
            ? updated.initial + 12
            : updated.setpoint,
        ),
      );
      setSelected(updated.diagnosis?.evidence_ids || []);
      setFault(updated.diagnosis?.fault || " ");
      setExplanation(updated.diagnosis?.explanation || "");
      setRepairChoice(" ");
      if (updated.completed) {
        setReportSession(updated);
        setPage("reports");
      } else setPage("lab");
    });
  const mutate = (name: string, body: unknown = {}, after?: () => void) =>
    run(name, async () => {
      if (!current) throw new Error("Start a case first.");
      const updated = await action(current, name, body);
      remember(updated);
      after?.();
    });
  const completed = history.filter((s) => s.completed),
    active = history.filter((s) => !s.completed);
  const average = completed.length
    ? Math.round(
        completed.reduce((n, s) => n + (s.report?.score || 0), 0) /
          completed.length,
      )
    : null;
  const toggleEvidence = (id: string) =>
    setSelected((ids) =>
      ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id],
    );
  const navigate = (p: typeof page) => {
    setPage(p);
    setMobile(false);
    setError("");
    if (p === "reports") setReportSession(null);
  };
  const download = (s: Session) => {
    const blob = new Blob([JSON.stringify(s, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `FaultLab-${s.mode}-${s.id.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setNotice("Case report downloaded.");
    setTimeout(() => setNotice(""), 3000);
  };
  const report = reportSession?.report;
  const currentTool = tools.find((t) => t.id === tool);
  const latestCoach = session?.coach.at(-1);
  const loading = (name: string) =>
    busy === name ? <Loader2 className="spin" size={17} /> : null;

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobile ? "is-open" : ""}`}>
        <button
          className="brand"
          onClick={() => navigate("overview")}
          aria-label="FaultLab home"
        >
          <span className="brand-symbol">
            <Activity size={23} />
          </span>
          <span>
            FaultLab<span className="brand-dot">.</span>
          </span>
        </button>
        <div className="workspace-label">LEARNING WORKSPACE</div>
        <nav aria-label="Main navigation">
          {[
            { id: "overview", label: "Overview", icon: LayoutDashboard },
            { id: "lab", label: "Diagnostic lab", icon: FlaskConical },
            { id: "reports", label: "Case reports", icon: ClipboardList },
            { id: "guide", label: "Field guide", icon: BookOpen },
          ].map((n) => (
            <button
              key={n.id}
              className={`nav-item ${page === n.id ? "active" : ""}`}
              onClick={() => navigate(n.id as typeof page)}
            >
              <n.icon size={19} />
              <span>{n.label}</span>
              {n.id === "reports" && completed.length > 0 && (
                <b className="nav-count">{completed.length}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <div className="orb">
            <Zap size={18} />
          </div>
          <strong>Follow the evidence.</strong>
          <p>A good diagnosis explains where the expected behaviour stops.</p>
          <button onClick={() => navigate("guide")}>
            Open field guide <ArrowRight size={14} />
          </button>
        </div>
        <div className="sidebar-bottom">
          <span className={`status-dot ${health ? "online" : ""}`} />
          <span>{health ? "Lab server connected" : "Connecting to lab…"}</span>
          <small>NOVA SPARKZ · Prototype v0.1</small>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-toggle icon-button"
              aria-label="Toggle navigation"
              onClick={() => setMobile(!mobile)}
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>
              {
                {
                  overview: "Overview",
                  lab: "Diagnostic lab",
                  reports: "Case reports",
                  guide: "Field guide",
                }[page]
              }
            </strong>
          </div>
          <div className="topbar-right">
            <span className="prototype-pill">Hackathon prototype</span>
            <span className="team-avatar">NS</span>
            <span className="team-name">NOVA SPARKZ</span>
          </div>
        </header>
        <main
          id="main-content"
          className={`content ${page === "lab" ? "lab-content" : ""}`}
        >
          {error && (
            <div className="alert error" role="alert">
              <AlertTriangle size={18} />
              <span>{error}</span>
              <button
                className="icon-button"
                aria-label="Dismiss error"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="toast" role="status">
              <Check size={17} />
              {notice}
            </div>
          )}

          {page === "overview" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">YOUR PRACTICAL SKILLS LAB</div>
                  <h1>
                    Good diagnoses begin
                    <br />
                    with better questions.
                  </h1>
                  <p>
                    Investigate hidden failures in a connected system.
                    <br className="desktop-break" /> Test your reasoning, make a
                    repair, and prove it works.
                  </p>
                </div>
                <div className="heading-actions">
                  <span className="tiny-label">LEARN BY INVESTIGATING</span>
                  <div className="mini-diagram">
                    <Thermometer />
                    <span />
                    <Cpu />
                    <span />
                    <Radio />
                  </div>
                </div>
              </div>
              <section className="hero-panel">
                <div className="hero-copy">
                  <span className="module-tag">
                    <span /> AVAILABLE LAB
                  </span>
                  <h2>
                    The frozen
                    <br />
                    temperature monitor
                  </h2>
                  <p>
                    One symptom. Three possible causes.
                    <br />
                    Can you find where fresh data stops?
                  </p>
                  <div className="hero-actions">
                    <button
                      className="button primary"
                      disabled={!!busy}
                      onClick={() => begin("practice")}
                    >
                      {loading("start") || <Play size={17} />}Start practice{" "}
                      <ArrowRight size={16} />
                    </button>
                    <button
                      className="button text-button"
                      onClick={() => navigate("guide")}
                    >
                      How it works <ChevronRight size={16} />
                    </button>
                  </div>
                  <div className="module-meta">
                    <span>
                      <Layers3 size={14} />3 fault families
                    </span>
                    <span>
                      <Search size={14} />5 diagnostic tools
                    </span>
                  </div>
                </div>
                <div className="hero-system">
                  <div className="system-eyebrow">
                    CONNECTED TEMPERATURE SYSTEM
                  </div>
                  <Circuit preview />
                  <div className="system-caption">
                    <span className="pulse-dot" />
                    Explore the signal from measurement to display
                  </div>
                </div>
              </section>
              <div className="overview-stats">
                <div>
                  <span>Cases completed</span>
                  <strong>
                    {completed.length.toString().padStart(2, "0")}
                    <small>real sessions</small>
                  </strong>
                </div>
                <div>
                  <span>Average workflow score</span>
                  <strong>
                    {average === null ? "—" : average}
                    <small>
                      {average === null
                        ? "complete a case to begin"
                        : "out of 100"}
                    </small>
                  </strong>
                </div>
                <div>
                  <span>Recovery verified</span>
                  <strong>
                    {completed
                      .filter((s) => s.report?.recovery_verified)
                      .length.toString()
                      .padStart(2, "0")}
                    <small>tested at two temperatures</small>
                  </strong>
                </div>
              </div>
              <div className="section-heading">
                <h2>Choose how you learn</h2>
                <span>Same tools. Different support.</span>
              </div>
              <div className="mode-grid">
                <article className="mode-card">
                  <span className="mode-icon mint">
                    <Lightbulb size={24} />
                  </span>
                  <div>
                    <h3>Guided practice</h3>
                    <p>
                      Explore freely, ask for evidence-based hints and revise
                      your diagnosis before you finish.
                    </p>
                    <button
                      className="inline-link"
                      disabled={!!busy}
                      onClick={() => begin("practice")}
                    >
                      Enter practice <ArrowRight size={16} />
                    </button>
                  </div>
                </article>
                <article className="mode-card">
                  <span className="mode-icon lavender">
                    <ShieldCheck size={24} />
                  </span>
                  <div>
                    <h3>Independent assessment</h3>
                    <p>
                      New operating parameters. No hints. One diagnosis and one
                      repair, followed by a transparent report.
                    </p>
                    <button
                      className="inline-link"
                      disabled={!!busy}
                      onClick={() => begin("assessment")}
                    >
                      Start assessment <ArrowRight size={16} />
                    </button>
                  </div>
                </article>
              </div>
              {active.length > 0 && (
                <section className="panel recent-panel">
                  <div className="section-heading">
                    <h2>Continue an investigation</h2>
                    <span>{active.length} in progress</span>
                  </div>
                  {active.slice(0, 3).map((s) => (
                    <button
                      className="session-row"
                      key={s.id}
                      onClick={() => resume(s)}
                      disabled={!!busy}
                    >
                      <span className="row-icon">
                        <FlaskConical size={20} />
                      </span>
                      <span>
                        <strong>
                          Temperature monitor · {s.id.slice(0, 6).toUpperCase()}
                        </strong>
                        <small>
                          {s.mode === "practice"
                            ? "Guided practice"
                            : "Independent assessment"}{" "}
                          · {s.observations.length} measurements collected
                        </small>
                      </span>
                      <ArrowRight size={18} />
                    </button>
                  ))}
                </section>
              )}
              <div className="quiet-note">
                <ShieldCheck size={16} />
                <span>
                  Measurements come from a deterministic teaching model.
                  Educational impact has not yet been validated in a student
                  pilot.
                </span>
              </div>
            </>
          )}

          {page === "lab" &&
            (!session || session.completed ? (
              <div className="empty-state panel">
                <span className="empty-icon">
                  <FlaskConical size={38} />
                </span>
                <h1>Your next investigation starts here.</h1>
                <p>
                  Enter a fresh practice case or return to an unfinished one
                  from Overview.
                </p>
                <button
                  className="button primary"
                  disabled={!!busy}
                  onClick={() => begin("practice")}
                >
                  <Play size={17} />
                  Start practice
                </button>
                {session?.completed && (
                  <button
                    className="inline-link"
                    onClick={() => {
                      setReportSession(session);
                      setPage("reports");
                    }}
                  >
                    View the completed report <ArrowRight size={16} />
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="lab-heading">
                  <div>
                    <div className="eyebrow">
                      CASE {session.id.slice(0, 6).toUpperCase()}{" "}
                      <span
                        className={`mode-chip ${session.mode === "assessment" ? "assessment" : ""}`}
                      >
                        {session.mode === "assessment"
                          ? "ASSESSMENT"
                          : "GUIDED PRACTICE"}
                      </span>
                    </div>
                    <h1>Temperature monitor</h1>
                    <p>
                      The display started frozen at {session.initial.toFixed(1)}
                      °C. Find the cause and verify a repair.
                    </p>
                  </div>
                  <button
                    className="button secondary small"
                    onClick={() => setFinishOpen(true)}
                    disabled={!!busy}
                  >
                    End & review
                  </button>
                </div>
                <div className="stage-bar">
                  {[
                    { n: 1, text: "Observe & test", phase: "investigate" },
                    { n: 2, text: "Diagnose", phase: "repair" },
                    { n: 3, text: "Repair & verify", phase: "verify" },
                  ].map((st, i) => (
                    <div
                      key={st.n}
                      className={
                        (
                          session.phase === "investigate"
                            ? i === 0
                            : session.phase === "repair"
                              ? i <= 1
                              : true
                        )
                          ? "stage active"
                          : "stage"
                      }
                    >
                      <span>{st.n}</span>
                      {st.text}
                      {i < 2 && <ChevronRight size={15} />}
                    </div>
                  ))}
                  <span className="simulation-clock">
                    <Clock3 size={15} />
                    {time(session.time)} simulated
                  </span>
                </div>
                <div className="lab-grid">
                  <div className="lab-main">
                    <section className="panel system-panel">
                      <div className="panel-heading">
                        <div>
                          <h2>System workspace</h2>
                          <p>
                            Measured values appear on the stage you inspect.
                          </p>
                        </div>
                        <span className="subtle-badge">
                          <Activity size={13} />
                          Deterministic simulation
                        </span>
                      </div>
                      <Circuit session={session} />
                      <div className="workspace-divider" />
                      <div className="workspace-lower">
                        <div className="chamber-control">
                          <label htmlFor="chamber">
                            Chamber temperature <span>CONTROLLED INPUT</span>
                          </label>
                          <div className="temperature-control">
                            <span className="control-value">
                              {chamber}
                              <small>°C</small>
                            </span>
                            <input
                              id="chamber"
                              type="range"
                              min="18"
                              max="65"
                              step="1"
                              value={chamber}
                              onChange={(e) =>
                                setChamber(Number(e.target.value))
                              }
                              disabled={!!busy}
                            />
                          </div>
                          <div className="range-labels">
                            <span>18°C</span>
                            <span>65°C</span>
                          </div>
                          <button
                            className="button secondary small"
                            onClick={() =>
                              mutate("stimulus", { temperature: chamber })
                            }
                            disabled={!!busy}
                          >
                            {loading("stimulus") || <Play size={14} />}Apply
                            stimulus <span>+10 s</span>
                          </button>
                        </div>
                        <div className="monitor-readout">
                          <span className="readout-label">
                            DASHBOARD READING
                          </span>
                          <strong>
                            {session.dashboard.value.toFixed(2)}
                            <span>°C</span>
                          </strong>
                          <div>
                            <span
                              className={`status-dot ${session.dashboard.age <= 2 ? "online" : "stale"}`}
                            />
                            {session.dashboard.age === 0
                              ? "Updated this step"
                              : `Last received ${session.dashboard.age}s ago`}
                          </div>
                          <small>
                            Freshness does not prove measurement accuracy.
                          </small>
                        </div>
                      </div>
                      <Trend session={session} />
                      <div className="plot-caption">
                        Points represent recorded observations. Lines connect
                        those points.
                      </div>
                    </section>
                    <section className="panel tools-panel">
                      <div className="panel-heading">
                        <div>
                          <h2>Diagnostic tools</h2>
                          <p>Make a prediction before every measurement.</p>
                        </div>
                        <span className="subtle-badge">
                          Each test advances 5 s
                        </span>
                      </div>
                      <div className="tools-grid">
                        {tools.map((t) => (
                          <button
                            key={t.id}
                            className="tool-button"
                            disabled={!!busy}
                            onClick={() => {
                              setTool(t.id);
                              setPrediction("");
                            }}
                          >
                            <span className="tool-icon">
                              <t.icon size={20} />
                            </span>
                            <span>
                              <strong>{t.name}</strong>
                              <small>{t.hint}</small>
                            </span>
                            <Plus size={16} />
                          </button>
                        ))}
                      </div>
                    </section>
                    <section className="panel evidence-panel">
                      <div className="panel-heading">
                        <div>
                          <h2>
                            Evidence notebook{" "}
                            <span className="count-badge">
                              {session.observations.length}
                            </span>
                          </h2>
                          <p>Select records that support your explanation.</p>
                        </div>
                        <span className="subtle-badge">
                          {selected.length} selected
                        </span>
                      </div>
                      {session.observations.length === 0 ? (
                        <div className="notebook-empty">
                          <ClipboardList size={29} />
                          <strong>No evidence yet</strong>
                          <span>
                            Apply a temperature change, then choose a diagnostic
                            tool.
                          </span>
                        </div>
                      ) : (
                        <div className="evidence-list">
                          {[...session.observations].reverse().map((e) => (
                            <div
                              key={e.id}
                              className={`evidence-item ${selected.includes(e.id) ? "selected" : ""}`}
                            >
                              <div className="evidence-line">
                                <input
                                  type="checkbox"
                                  aria-label={`Select evidence ${e.id}`}
                                  checked={selected.includes(e.id)}
                                  onChange={() => toggleEvidence(e.id)}
                                />
                                <span className="evidence-id">{e.id}</span>
                                <button
                                  className="evidence-expand"
                                  onClick={() =>
                                    setExpanded((items) =>
                                      items.includes(e.id)
                                        ? items.filter((i) => i !== e.id)
                                        : [...items, e.id],
                                    )
                                  }
                                >
                                  <span>
                                    <strong>{e.label}</strong>
                                    <small>{e.summary}</small>
                                  </span>
                                  <span className="evidence-time">
                                    {time(e.time)}
                                    <ChevronRight
                                      size={15}
                                      className={
                                        expanded.includes(e.id) ? "rotate" : ""
                                      }
                                    />
                                  </span>
                                </button>
                              </div>
                              {expanded.includes(e.id) && (
                                <div className="evidence-details">
                                  <div className="prediction-record">
                                    <span>YOUR PREDICTION</span>
                                    <p>{e.prediction}</p>
                                  </div>
                                  <dl>
                                    {Object.entries(e.data).map(([k, v]) => (
                                      <div key={k}>
                                        <dt>{k.replaceAll("_", " ")}</dt>
                                        <dd>{formatValue(v)}</dd>
                                      </div>
                                    ))}
                                  </dl>
                                  <small>
                                    Chamber setpoint during test: {e.setpoint}°C
                                  </small>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="notebook-footer">
                        <span>
                          {selected.length < 2
                            ? "Select at least 2 evidence records to diagnose."
                            : "Evidence selected. Explain how the records support your diagnosis."}
                        </span>
                        <button
                          className="button primary small"
                          disabled={
                            !!busy ||
                            selected.length < 2 ||
                            (session.mode === "assessment" &&
                              !!session.diagnosis)
                          }
                          onClick={() => setDiagnosisOpen(true)}
                        >
                          <Target size={16} />
                          {session.diagnosis
                            ? "Revise diagnosis"
                            : "Build diagnosis"}
                        </button>
                      </div>
                    </section>
                    {session.diagnosis && (
                      <section className="panel repair-panel">
                        <div className="panel-heading">
                          <div>
                            <h2>Repair & recovery</h2>
                            <p>
                              Your hypothesis:{" "}
                              <strong>{faults[session.diagnosis.fault]}</strong>
                            </p>
                          </div>
                          <Wrench size={21} />
                        </div>
                        <label className="field-label" htmlFor="repair-select">
                          Choose the intervention your evidence supports
                        </label>
                        <div className="repair-actions">
                          <select
                            id="repair-select"
                            value={repairChoice}
                            onChange={(e) =>
                              setRepairChoice(e.target.value as Repair)
                            }
                            disabled={
                              !!busy ||
                              (session.mode === "assessment" &&
                                session.repairs.length > 0)
                            }
                          >
                            <option value=" ">Select a repair…</option>
                            {Object.entries(repairs).map(([key, label]) => (
                              <option value={key} key={key}>
                                {label}
                              </option>
                            ))}
                          </select>
                          <button
                            className="button secondary"
                            disabled={
                              !!busy ||
                              repairChoice === " " ||
                              (session.mode === "assessment" &&
                                session.repairs.length > 0)
                            }
                            onClick={() =>
                              mutate("repair", { action: repairChoice })
                            }
                          >
                            {loading("repair") || <Wrench size={16} />}Apply
                            repair
                          </button>
                        </div>
                        {session.repairs.length > 0 && (
                          <div className="verification-box">
                            <div>
                              <strong>Prove that the system recovered.</strong>
                              <p>
                                Run two controlled temperatures, each with a
                                45-second settling period.
                              </p>
                            </div>
                            <button
                              className="button primary"
                              disabled={!!busy}
                              onClick={() => mutate("verify")}
                            >
                              {loading("verify") || <CheckCircle2 size={17} />}
                              Verify recovery
                            </button>
                          </div>
                        )}
                        {session.verification &&
                          !session.verification.passed && (
                            <div className="alert warning">
                              <AlertTriangle size={18} />
                              <span>
                                Recovery failed. Response was{" "}
                                {session.verification.response_delta}°C for a
                                10°C step. Revisit your evidence and
                                intervention.
                              </span>
                            </div>
                          )}
                      </section>
                    )}
                  </div>
                  <aside className="lab-aside">
                    <section className="panel coach-panel">
                      <div className="coach-header">
                        <span className="coach-avatar">
                          <Sparkles size={21} />
                        </span>
                        <div>
                          <h2>
                            {health?.coach === "ollama_optional"
                              ? "Local AI coach"
                              : "Guided coach"}
                          </h2>
                          <span>
                            {session.mode === "assessment"
                              ? "Independent assessment"
                              : "Evidence before answers"}
                          </span>
                        </div>
                        <span className="coach-dot" />
                      </div>
                      {session.mode === "assessment" ? (
                        <div className="coach-locked">
                          <LockKeyhole size={29} />
                          <h3>You’ve got this.</h3>
                          <p>
                            Hints are disabled for this case. Use the tools and
                            your evidence to make one diagnosis and one repair.
                          </p>
                        </div>
                      ) : (
                        <>
                          <div className="coach-message">
                            <span className="tiny-label">
                              {latestCoach
                                ? latestCoach.provider === "ollama"
                                  ? "OLLAMA FEEDBACK"
                                  : "EVIDENCE-BASED GUIDANCE"
                                : "START WITH A QUESTION"}
                            </span>
                            <p>
                              {latestCoach?.message ||
                                "A frozen display is a symptom, not a diagnosis. What would you change first to check whether the system responds?"}
                              {}
                            </p>
                            {latestCoach?.notice && (
                              <small className="coach-notice">
                                {latestCoach.notice}
                              </small>
                            )}
                          </div>
                          <div className="coach-composer">
                            <label className="sr-only" htmlFor="coach-question">
                              Ask the coach
                            </label>
                            <textarea
                              id="coach-question"
                              value={question}
                              onChange={(e) => setQuestion(e.target.value)}
                              placeholder="Explain your thinking or ask for a hint…"
                              rows={3}
                              maxLength={1500}
                            />
                            <button
                              className="button secondary small"
                              disabled={!!busy}
                              onClick={() =>
                                mutate(
                                  "coach",
                                  {
                                    question:
                                      question.trim() ||
                                      "What should I investigate next?",
                                  },
                                  () => setQuestion(""),
                                )
                              }
                            >
                              {loading("coach") || <Send size={15} />}Ask coach
                            </button>
                          </div>
                          <div className="coach-footer">
                            <span>{session.hints_used} hints used</span>
                            <span>Hints never change readings</span>
                          </div>
                        </>
                      )}
                    </section>
                    <section className="panel case-notes">
                      <span className="tiny-label">
                        INVESTIGATION CHECKLIST
                      </span>
                      {[
                        {
                          done: session.setpoint !== session.initial,
                          label: "Change the input deliberately",
                        },
                        {
                          done: session.observations.length >= 2,
                          label: "Compare measurements at two stages",
                        },
                        {
                          done: !!session.diagnosis,
                          label: "Explain a diagnosis with evidence",
                        },
                        {
                          done: session.repairs.length > 0,
                          label: "Apply a targeted repair",
                        },
                        {
                          done: !!session.verification?.passed,
                          label: "Verify recovery with a new input",
                        },
                      ].map((c) => (
                        <div
                          className={`checklist-item ${c.done ? "done" : ""}`}
                          key={c.label}
                        >
                          <span>{c.done ? <Check size={12} /> : null}</span>
                          {c.label}
                        </div>
                      ))}
                    </section>
                    <div className="side-tip">
                      <Lightbulb size={19} />
                      <p>
                        A timestamp tells you when data arrived. A sample
                        sequence tells you which measurement was used.
                      </p>
                    </div>
                    <button
                      className="inline-link guide-shortcut"
                      onClick={() => navigate("guide")}
                    >
                      Need the tool reference? <ArrowRight size={15} />
                    </button>
                  </aside>
                </div>
              </>
            ))}

          {page === "reports" &&
            (reportSession && report ? (
              <>
                <button
                  className="inline-link back-link"
                  onClick={() => {
                    setReportSession(null);
                    setReplay(null);
                  }}
                >
                  <ArrowLeft size={16} />
                  All case reports
                </button>
                <div className="report-heading">
                  <div>
                    <div className="eyebrow">
                      CASE {reportSession.id.slice(0, 6).toUpperCase()} ·{" "}
                      {reportSession.mode.toUpperCase()}
                    </div>
                    <h1>
                      {report.recovery_verified
                        ? "Recovery, verified."
                        : "Investigation reviewed."}
                    </h1>
                    <p>
                      A traceable record of what you tested, concluded and
                      repaired.
                    </p>
                  </div>
                  <div className="heading-buttons">
                    <button
                      className="button secondary"
                      onClick={() => download(reportSession)}
                    >
                      <Download size={17} />
                      Export JSON
                    </button>
                    <button
                      className="button secondary print-button"
                      onClick={() => window.print()}
                    >
                      Print report
                    </button>
                  </div>
                </div>
                <div className="report-summary">
                  <div className="score-card">
                    <span>WORKFLOW SCORE</span>
                    <strong>
                      {report.score}
                      <small>/ 100</small>
                    </strong>
                    <p>
                      {report.correct_diagnosis
                        ? "Correct fault identified"
                        : "Diagnosis needs review"}
                    </p>
                  </div>
                  <div className="panel answer-card">
                    <div className="answer-heading">
                      <span
                        className={`result-icon ${report.recovery_verified ? "success" : "warning"}`}
                      >
                        {report.recovery_verified ? (
                          <CheckCircle2 size={25} />
                        ) : (
                          <Search size={25} />
                        )}
                      </span>
                      <div>
                        <span className="tiny-label">
                          ACTUAL FAULT · REVEALED AFTER THE CASE
                        </span>
                        <h2>{report.answer.label}</h2>
                      </div>
                    </div>
                    <p>{report.answer.explanation}</p>
                    <div className="report-facts">
                      <span>
                        <strong>{report.tests_run}</strong> tests
                      </span>
                      <span>
                        <strong>{report.hints_used}</strong> hints
                      </span>
                      <span>
                        <strong>{report.repair_attempts}</strong> repairs
                      </span>
                    </div>
                  </div>
                </div>
                <div className="report-grid">
                  <section className="panel rubric-panel">
                    <div className="panel-heading">
                      <h2>How the score was calculated</h2>
                      <Target size={19} />
                    </div>
                    {report.rubric.map((r) => (
                      <div className="rubric-item" key={r.name}>
                        <div>
                          <strong>{r.name}</strong>
                          <b>
                            {r.score}
                            <span> / {r.max}</span>
                          </b>
                        </div>
                        <div className="score-track">
                          <span
                            style={{ width: `${(r.score / r.max) * 100}%` }}
                          />
                        </div>
                        <small>{r.detail}</small>
                      </div>
                    ))}
                    <p className="rubric-limitation">{report.limitations}</p>
                  </section>
                  <section className="panel diagnosis-report">
                    <div className="panel-heading">
                      <h2>Your reasoning</h2>
                      <ClipboardList size={19} />
                    </div>
                    {reportSession.diagnosis ? (
                      <>
                        <span className="tiny-label">SUBMITTED DIAGNOSIS</span>
                        <h3>{faults[reportSession.diagnosis.fault]}</h3>
                        <blockquote>
                          {reportSession.diagnosis.explanation}
                        </blockquote>
                        <span className="tiny-label">CITED EVIDENCE</span>
                        {reportSession.observations
                          .filter((e) =>
                            reportSession.diagnosis?.evidence_ids.includes(
                              e.id,
                            ),
                          )
                          .map((e) => (
                            <div className="cited-evidence" key={e.id}>
                              <span className="evidence-id">{e.id}</span>
                              <p>{e.summary}</p>
                            </div>
                          ))}
                      </>
                    ) : (
                      <p>No diagnosis was submitted before the case ended.</p>
                    )}
                    {reportSession.verification && (
                      <div className="verification-results">
                        <h3>Recovery test</h3>
                        <table>
                          <thead>
                            <tr>
                              <th>Setpoint</th>
                              <th>Display</th>
                              <th>Update age</th>
                            </tr>
                          </thead>
                          <tbody>
                            {reportSession.verification.points.map((p) => (
                              <tr key={p.time}>
                                <td>{p.setpoint}°C</td>
                                <td>{p.display.toFixed(2)}°C</td>
                                <td>{p.age} s</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <small>{reportSession.verification.criterion}</small>
                      </div>
                    )}
                  </section>
                </div>
                <section className="panel replay-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Instructor replay</h2>
                      <p>
                        Review the actual event sequence. Click an event to
                        inspect its record.
                      </p>
                    </div>
                    <span className="subtle-badge">
                      {reportSession.events.length} events
                    </span>
                  </div>
                  <div className="replay-layout">
                    <div className="timeline">
                      {reportSession.events.map((e) => (
                        <button
                          key={e.id}
                          className={`timeline-event ${replay === e.id ? "active" : ""}`}
                          onClick={() => setReplay(e.id)}
                        >
                          <span className="timeline-dot" />
                          <span className="timeline-time">{time(e.time)}</span>
                          <span>
                            <strong>{e.kind.replaceAll("_", " ")}</strong>
                            <small>{e.summary}</small>
                          </span>
                          <ChevronRight size={14} />
                        </button>
                      ))}
                    </div>
                    <div className="replay-detail">
                      {replay ? (
                        (() => {
                          const e = reportSession.events.find(
                            (e) => e.id === replay,
                          )!;
                          const obs = reportSession.observations.find(
                            (o) =>
                              o.id ===
                              (e as unknown as { evidence_id: string })
                                .evidence_id,
                          );
                          return (
                            <>
                              <span className="tiny-label">
                                EVENT {e.id} AT {time(e.time)}
                              </span>
                              <h3>{e.summary}</h3>
                              {e.prediction && (
                                <>
                                  <label>
                                    Prediction recorded before the test
                                  </label>
                                  <p>{e.prediction}</p>
                                </>
                              )}
                              {e.explanation && (
                                <>
                                  <label>Learner explanation</label>
                                  <p>{e.explanation}</p>
                                </>
                              )}
                              {obs && (
                                <dl>
                                  {Object.entries(obs.data).map(([k, v]) => (
                                    <div key={k}>
                                      <dt>{k.replaceAll("_", " ")}</dt>
                                      <dd>{formatValue(v)}</dd>
                                    </div>
                                  ))}
                                </dl>
                              )}
                              {!obs && !e.explanation && (
                                <p>
                                  This event records a learner action or
                                  simulator result. Replay does not change the
                                  completed case.
                                </p>
                              )}
                            </>
                          );
                        })()
                      ) : (
                        <div className="replay-placeholder">
                          <Clock3 size={32} />
                          <h3>Follow the investigation</h3>
                          <p>
                            Choose an event on the left to review its prediction
                            and observed result.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </section>
                <div className="report-next">
                  <div>
                    <h2>Try a fresh case.</h2>
                    <p>
                      New parameters will test whether the reasoning transfers.
                    </p>
                  </div>
                  <button
                    className="button primary"
                    disabled={!!busy}
                    onClick={() => begin("assessment")}
                  >
                    <ShieldCheck size={18} />
                    Start independent assessment
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="page-heading compact">
                  <div>
                    <div className="eyebrow">YOUR LEARNING RECORD</div>
                    <h1>Case reports</h1>
                    <p>
                      Evidence, decisions and recovery checks, all in one place.
                    </p>
                  </div>
                  <button
                    className="button primary"
                    disabled={!!busy}
                    onClick={() => begin("practice")}
                  >
                    <Plus size={17} />
                    New case
                  </button>
                </div>
                {completed.length === 0 ? (
                  <div className="empty-state panel">
                    <span className="empty-icon">
                      <ClipboardList size={38} />
                    </span>
                    <h2>Your first report is waiting to be written.</h2>
                    <p>
                      Complete an investigation or end a case for review.
                      Reports show only your real sessions.
                    </p>
                    <button
                      className="button primary"
                      disabled={!!busy}
                      onClick={() => begin("practice")}
                    >
                      <Play size={17} />
                      Start practice
                    </button>
                  </div>
                ) : (
                  <section className="panel reports-table">
                    <table>
                      <thead>
                        <tr>
                          <th>Case</th>
                          <th>Mode</th>
                          <th>Tests / hints</th>
                          <th>Workflow score</th>
                          <th>Recovery</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {completed.map((s) => (
                          <tr key={s.id}>
                            <td>
                              <strong>{s.id.slice(0, 6).toUpperCase()}</strong>
                              <small>
                                {new Date(s.created_at).toLocaleDateString(
                                  undefined,
                                  { day: "numeric", month: "short" },
                                )}
                              </small>
                            </td>
                            <td>
                              <span className="subtle-badge">{s.mode}</span>
                            </td>
                            <td>
                              {s.observations.length} / {s.hints_used}
                            </td>
                            <td>
                              <strong>{s.report?.score}</strong>
                              <span className="muted"> / 100</span>
                            </td>
                            <td>
                              <span
                                className={
                                  s.report?.recovery_verified
                                    ? "result-label success"
                                    : "result-label warning"
                                }
                              >
                                {s.report?.recovery_verified
                                  ? "Verified"
                                  : "Not verified"}
                              </span>
                            </td>
                            <td>
                              <button
                                className="inline-link"
                                onClick={() => {
                                  setReportSession(s);
                                  setReplay(null);
                                }}
                              >
                                View report <ArrowRight size={15} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                )}
                <p className="privacy-note">
                  Session access keys stay in this browser. Measurements and
                  events persist in the local SQLite database. This prototype is
                  not a multi-user classroom platform.
                </p>
              </>
            ))}

          {page === "guide" && (
            <>
              <div className="page-heading compact">
                <div>
                  <div className="eyebrow">THE FAULTLAB FIELD GUIDE</div>
                  <h1>Think in tests, not guesses.</h1>
                  <p>A short reference for your first investigation.</p>
                </div>
                <button
                  className="button primary"
                  disabled={!!busy}
                  onClick={() =>
                    session && !session.completed
                      ? setPage("lab")
                      : begin("practice")
                  }
                >
                  {session && !session.completed
                    ? "Return to investigation"
                    : "Start practice"}
                  <ArrowRight size={16} />
                </button>
              </div>
              <div className="guide-intro panel">
                <div className="guide-number">01</div>
                <div>
                  <h2>Change something you control.</h2>
                  <p>
                    A stable display is normal when the input is stable. Move
                    the chamber temperature by at least 5°C. The model settles
                    gradually, and every action advances simulated time.
                  </p>
                </div>
              </div>
              <div className="guide-intro panel">
                <div className="guide-number">02</div>
                <div>
                  <h2>Follow the measurement through the system.</h2>
                  <p>
                    Compare raw sensor output with the controller’s processed
                    value. Check which sample the firmware used, then inspect
                    packet acknowledgements and dashboard freshness. Multiple
                    diagnostic paths can be valid.
                  </p>
                </div>
              </div>
              <div className="guide-intro panel">
                <div className="guide-number">03</div>
                <div>
                  <h2>Predict, cite, repair, verify.</h2>
                  <p>
                    Write what you expect before a test. Cite at least two
                    evidence records when you explain your diagnosis. A repair
                    is only successful after the display tracks two new test
                    temperatures.
                  </p>
                </div>
              </div>
              <section className="panel guide-reference">
                <div className="panel-heading">
                  <h2>What each tool tells you</h2>
                  <BookOpen size={21} />
                </div>
                {tools.map((t) => (
                  <div className="guide-tool" key={t.id}>
                    <t.icon size={22} />
                    <div>
                      <h3>{t.name}</h3>
                      <p>
                        {t.hint}.{" "}
                        {t.id === "raw_sensor"
                          ? "A fresh sample number does not guarantee a changing sensor value."
                          : t.id === "controller"
                            ? "A running loop can still reuse an old sample."
                            : t.id === "network"
                              ? "Sent packets and acknowledged packets may differ."
                              : t.id === "dashboard"
                                ? "A frozen value and a stale timestamp are different observations."
                                : "Correct wiring does not rule out every sensor, software or network fault."}
                      </p>
                    </div>
                  </div>
                ))}
              </section>
              <div className="guide-columns">
                <section className="panel">
                  <h2>Three fault families</h2>
                  <p>
                    <strong>Sensor:</strong> the sensor output is stuck at its
                    starting value.
                  </p>
                  <p>
                    <strong>Firmware:</strong> the processing loop reuses its
                    first sample.
                  </p>
                  <p>
                    <strong>Communication:</strong> processed values fail to
                    reach the dashboard.
                  </p>
                  <small>
                    The selected fault stays on the server until the case ends.
                  </small>
                </section>
                <section className="panel">
                  <h2>Honest prototype boundaries</h2>
                  <p>
                    The simulator uses a first-order thermal model and
                    simplified digital messages. It is not a calibrated replica
                    of a specific sensor.
                  </p>
                  <p>
                    Guided coaching works without an AI model. Optional Ollama
                    feedback uses only observed evidence and can still be wrong.
                  </p>
                  <small>
                    The score checks workflow, not certified competence. An
                    instructor should review reasoning quality.
                  </small>
                </section>
              </div>
              <section className="panel team-panel">
                <span className="tiny-label">
                  BUILT FOR THE MY BHARAT HACKATHON
                </span>
                <h2>NOVA SPARKZ</h2>
                <p>
                  <strong>MITESH KUMAAR S</strong> · Team lead
                </p>
                <p>MOGHIT PM · DILLI BASKARAN K</p>
                <span className="subtle-badge">HSC|TN|02631</span>
              </section>
            </>
          )}
        </main>
        <footer className="app-footer">
          <span>FaultLab · Learn practical skills by diagnosing failures.</span>
          <span>Designed for evidence. Built by NOVA SPARKZ.</span>
        </footer>
      </div>

      {tool && currentTool && (
        <Modal
          title={currentTool.name}
          onClose={() => {
            if (!busy) setTool(null);
          }}
        >
          <div className="modal-tool-intro">
            <span className="mode-icon mint">
              <currentTool.icon size={25} />
            </span>
            <p>
              {currentTool.hint}. Your prediction becomes part of the evidence
              record.
            </p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              mutate("probe", { tool, prediction }, () => {
                setTool(null);
                setPrediction("");
              });
            }}
          >
            <label className="field-label" htmlFor="prediction">
              What do you expect this test to show?
            </label>
            <textarea
              id="prediction"
              autoFocus
              rows={4}
              value={prediction}
              onChange={(e) => setPrediction(e.target.value)}
              minLength={10}
              maxLength={500}
              required
              placeholder="If my hypothesis is right, I expect…"
            />
            <span className="field-help">
              At least 10 characters. Describe an expected result, not just a
              fault name.
            </span>
            {error && (
              <p className="inline-error" role="alert">
                {error}
              </p>
            )}
            <div className="modal-footer">
              <span>
                <Clock3 size={15} />
                Advances simulation by 5 s
              </span>
              <button
                className="button primary"
                disabled={!!busy || prediction.trim().length < 10}
              >
                {loading("probe") || <Play size={16} />}Run measurement
              </button>
            </div>
          </form>
        </Modal>
      )}
      {diagnosisOpen && (
        <Modal
          title="Build an evidence-based diagnosis"
          wide
          onClose={() => {
            if (!busy) setDiagnosisOpen(false);
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              mutate(
                "diagnose",
                { fault, explanation, evidence_ids: selected },
                () => setDiagnosisOpen(false),
              );
            }}
          >
            <p className="modal-description">
              Explain where the expected update stops, using the evidence you
              selected.
              {session?.mode === "assessment"
                ? " You can submit only one diagnosis in assessment mode."
                : ""}
            </p>
            <div className="selected-tags">
              {selected.map((id) => (
                <span key={id}>
                  {id}
                  <Check size={12} />
                </span>
              ))}
            </div>
            <label className="field-label" htmlFor="fault-select">
              Most likely cause
            </label>
            <select
              id="fault-select"
              value={fault}
              onChange={(e) => setFault(e.target.value as Fault)}
              required
            >
              <option value=" ">Select a fault…</option>
              {Object.entries(faults).map(([key, label]) => (
                <option value={key} key={key}>
                  {label}
                </option>
              ))}
            </select>
            <label className="field-label" htmlFor="explanation">
              How does your evidence support that conclusion?
            </label>
            <textarea
              id="explanation"
              rows={5}
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              minLength={20}
              maxLength={2000}
              required
              placeholder="E01 shows… while E02 shows… This suggests…"
            />
            <small className="field-help">
              At least 20 characters. Multiple valid diagnostic paths are
              accepted.
            </small>
            {error && (
              <p className="inline-error" role="alert">
                {error}
              </p>
            )}
            <div className="modal-footer">
              <span>Answer revealed when the case ends</span>
              <button
                className="button primary"
                disabled={
                  !!busy || fault === " " || explanation.trim().length < 20
                }
              >
                {loading("diagnose") || <Target size={16} />}Submit diagnosis
              </button>
            </div>
          </form>
        </Modal>
      )}
      {finishOpen && (
        <Modal
          title="End this case for review?"
          onClose={() => setFinishOpen(false)}
        >
          <p className="modal-description">
            This ends the investigation and reveals the injected fault. Your
            existing measurements and decisions will remain in the report. You
            can start a new case afterward.
          </p>
          <div className="modal-footer">
            <button
              className="button secondary"
              onClick={() => setFinishOpen(false)}
            >
              Keep investigating
            </button>
            <button
              className="button primary"
              disabled={!!busy}
              onClick={() => mutate("finish", {}, () => setFinishOpen(false))}
            >
              {loading("finish")}End & reveal report
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
