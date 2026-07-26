export type AgentStatus =
  "off" | "idle" | "unread" | "thinking" | "running" | "needs-input" | "error";

export interface ThreadRecord {
  id: string;
  rolloutPath: string;
  cwd: string;
  title: string;
  preview: string;
  recencyAtMs: number;
  reasoningEffort?: string;
  model?: string;
  spawnStatus?: string;
}

export interface RolloutState {
  status: AgentStatus;
  lastEventAt: number;
  completedAt?: number;
  detail?: string;
}

export interface AgentSnapshot extends ThreadRecord, RolloutState {
  displayTitle: string;
}

export interface SessionSnapshot extends AgentSnapshot {
  sessionLabel: string;
  sessionIndex: number;
  isActive: boolean;
}

export interface ReasoningSnapshot {
  current: string;
  levels: string[];
  threadId?: string;
  model?: string;
}

export interface ModelOption {
  slug: string;
  label: string;
}

export interface ModelSnapshot {
  current: string;
  options: ModelOption[];
  threadId?: string;
}

export interface UsageSnapshot {
  usedPercent: number;
  observedAt: number;
  windowMinutes?: number;
  resetsAt?: number;
  resetsAvailable?: number;
}

export interface ContextSnapshot {
  threadId: string;
  usedTokens: number;
  maxTokens: number;
  remainingPercent: number;
  observedAt: number;
}
