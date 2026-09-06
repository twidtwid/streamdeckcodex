import type { AgentStatus } from "../../types.js";

export type ProviderId = "codex" | "claude";
export type ProviderSetting = ProviderId | "auto";
export type Environment = "local" | "ssh" | "cloud";
export interface ProviderSettings {
  provider?: ProviderSetting;
}
export interface TargetIdentity {
  provider: ProviderId;
  windowId: string;
  sessionId: string;
  environment: Environment;
}
export interface ProviderSession {
  id: string;
  title: string;
  environment: Environment;
  cwd?: string;
  status?: AgentStatus;
}
export interface ProviderObservation {
  foreground?: ProviderId;
  target?: TargetIdentity;
  reason?: string;
  model?: string;
  effort?: string;
  permission?: string;
  draftEmpty?: boolean;
  fast?: boolean;
  weeklyUsedPercent?: number;
  weeklyBucket?: string;
  contextUsedPercent?: number;
  sessions?: ProviderSession[];
  capabilities?: string[];
  observedAt: number;
}
export interface ProviderOption {
  value: string;
  label: string;
}
export interface ProviderReply extends ProviderObservation {
  options?: ProviderOption[];
}
export interface ProviderRequest {
  operation: string;
  target: TargetIdentity;
  value?: string;
}
export interface DesktopProvider {
  readonly id: ProviderId;
  read(): Promise<ProviderObservation>;
  perform(request: ProviderRequest): Promise<ProviderReply>;
}

export function providerSetting(value: unknown): ProviderSetting | undefined {
  if (value === undefined) return "codex";
  return value === "codex" || value === "claude" || value === "auto"
    ? value
    : undefined;
}
export function resolveProvider(
  value: unknown,
  foreground?: ProviderId,
): ProviderId | undefined {
  const setting = providerSetting(value);
  return setting === "auto" ? foreground : setting;
}
export function targetKey(target?: TargetIdentity): string {
  return target
    ? JSON.stringify([
        target.provider,
        target.windowId,
        target.sessionId,
        target.environment,
      ])
    : "";
}
export function sameTarget(a?: TargetIdentity, b?: TargetIdentity): boolean {
  return !!a && !!b && targetKey(a) === targetKey(b);
}
export function freshObservation(
  observation: ProviderObservation,
  now = Date.now(),
): boolean {
  return (
    Number.isFinite(observation.observedAt) &&
    now >= observation.observedAt &&
    now - observation.observedAt <= 4000
  );
}
