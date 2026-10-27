export type Mode = "practice" | "assessment";
export type Tool =
  | "raw_sensor"
  | "controller"
  | "network"
  | "dashboard"
  | "inspection";
export type Fault = "sensor_stuck" | "firmware_stale" | "communication_drop";
export type Repair = "replace_sensor" | "refresh_firmware" | "restore_link";
export type Evidence = {
  id: string;
  time: number;
  tool: Tool;
  label: string;
  prediction: string;
  setpoint: number;
  data: Record<string, string | number>;
  summary: string;
};
export type Event = {
  id: number;
  time: number;
  kind: string;
  summary: string;
  prediction?: string;
  explanation?: string;
  evidence_ids?: string[];
  provider?: string;
};
export type Report = {
  score: number;
  rubric: { name: string; score: number; max: number; detail: string }[];
  correct_diagnosis: boolean;
  recovery_verified: boolean;
  answer: { fault: Fault; label: string; explanation: string };
  hints_used: number;
  tests_run: number;
  repair_attempts: number;
  diagnosis_attempts: number;
  limitations: string;
};
export type Session = {
  id: string;
  mode: Mode;
  phase: "investigate" | "repair" | "verify" | "complete";
  created_at: string;
  time: number;
  initial: number;
  setpoint: number;
  dashboard: { value: number; received_time: number; age: number };
  observations: Evidence[];
  events: Event[];
  coach: {
    question: string;
    message: string;
    provider: string;
    notice: string | null;
    time: number;
  }[];
  hints_used: number;
  diagnosis: {
    fault: Fault;
    explanation: string;
    evidence_ids: string[];
    time: number;
  } | null;
  repairs: { action: Repair; time: number }[];
  verification: {
    passed: boolean;
    points: { setpoint: number; display: number; time: number; age: number }[];
    response_delta: number;
    criterion: string;
  } | null;
  completed: boolean;
  report: Report | null;
};
export type Handle = {
  id: string;
  key: string;
  mode: Mode;
  created_at: string;
};
