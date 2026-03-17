import { redisClient } from "./redis";
import { log } from "./logger";

export type ProcessorStatus = "healthy" | "degraded" | "unhealthy";

interface ProcessorDefinition {
  name: string;
  label: string;
  description: string;
  intervalMs: number;
  graceMs: number;
  maxRuntimeMs: number;
}

interface StoredProcessorSnapshot {
  name: string;
  running?: boolean;
  lastStartedAt?: string;
  lastCompletedAt?: string;
  lastSucceededAt?: string;
  lastFailedAt?: string;
  lastDurationMs?: number;
  lastError?: string | null;
  nextRunAt?: string | null;
  intervalMs?: number;
  graceMs?: number;
  maxRuntimeMs?: number;
  lastResult?: Record<string, unknown> | null;
}

export interface ProcessorHealthSnapshot extends StoredProcessorSnapshot {
  label: string;
  description: string;
  status: ProcessorStatus;
  statusMessage: string;
}

interface ProcessorUpdateOptions {
  nextRunAt?: Date | null;
  intervalMs?: number;
  graceMs?: number;
  maxRuntimeMs?: number;
  lastResult?: Record<string, unknown> | null;
}

const PROCESSOR_HEALTH_PREFIX = "ozvps:processor-health";
const PROCESSOR_HEALTH_TTL_SECONDS = 60 * 60 * 24 * 14;

export const PROCESSOR_DEFINITIONS: ProcessorDefinition[] = [
  {
    name: "billing-daily",
    label: "Billing Daily Run",
    description: "Charges renewals and runs the full daily billing cycle.",
    intervalMs: 24 * 60 * 60 * 1000,
    graceMs: 2 * 60 * 60 * 1000,
    maxRuntimeMs: 30 * 60 * 1000,
  },
  {
    name: "billing-quick-check",
    label: "Billing Quick Check",
    description: "Handles auto top-ups and trial expiry checks throughout the day.",
    intervalMs: 30 * 60 * 1000,
    graceMs: 10 * 60 * 1000,
    maxRuntimeMs: 10 * 60 * 1000,
  },
  {
    name: "cancellation-processor",
    label: "Cancellation Processor",
    description: "Processes scheduled deletions and confirms VirtFusion cleanups.",
    intervalMs: 30 * 1000,
    graceMs: 2 * 60 * 1000,
    maxRuntimeMs: 10 * 60 * 1000,
  },
  {
    name: "orphan-cleanup",
    label: "Orphan Cleanup",
    description: "Removes accounts and infrastructure left behind after user deletion.",
    intervalMs: 60 * 60 * 1000,
    graceMs: 20 * 60 * 1000,
    maxRuntimeMs: 45 * 60 * 1000,
  },
];

const processorDefinitionMap = new Map(PROCESSOR_DEFINITIONS.map((definition) => [definition.name, definition]));

function getProcessorKey(name: string): string {
  return `${PROCESSOR_HEALTH_PREFIX}:${name}`;
}

function getDefinition(name: string): ProcessorDefinition {
  return processorDefinitionMap.get(name) ?? {
    name,
    label: name,
    description: "Background processor",
    intervalMs: 0,
    graceMs: 5 * 60 * 1000,
    maxRuntimeMs: 15 * 60 * 1000,
  };
}

function parseSnapshot(rawValue: string | null): StoredProcessorSnapshot | null {
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as StoredProcessorSnapshot;
  } catch {
    return null;
  }
}

function toIsoString(value?: Date | null): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  return value ? value.toISOString() : null;
}

function parseDate(value?: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function getDueAt(snapshot: StoredProcessorSnapshot, definition: ProcessorDefinition): number | null {
  const nextRunAt = parseDate(snapshot.nextRunAt);
  if (nextRunAt) {
    return nextRunAt;
  }

  const intervalMs = snapshot.intervalMs ?? definition.intervalMs;
  if (!intervalMs) {
    return null;
  }

  const lastCompletedAt = parseDate(snapshot.lastCompletedAt);
  if (lastCompletedAt) {
    return lastCompletedAt + intervalMs;
  }

  const lastStartedAt = parseDate(snapshot.lastStartedAt);
  if (lastStartedAt) {
    return lastStartedAt + intervalMs;
  }

  return null;
}

function buildSnapshot(name: string, storedSnapshot: StoredProcessorSnapshot | null): ProcessorHealthSnapshot {
  const definition = getDefinition(name);
  const snapshot: StoredProcessorSnapshot = {
    name,
    intervalMs: definition.intervalMs,
    graceMs: definition.graceMs,
    maxRuntimeMs: definition.maxRuntimeMs,
    ...storedSnapshot,
  };

  const now = Date.now();
  const running = snapshot.running === true;
  const startedAt = parseDate(snapshot.lastStartedAt);
  const completedAt = parseDate(snapshot.lastCompletedAt);
  const succeededAt = parseDate(snapshot.lastSucceededAt);
  const failedAt = parseDate(snapshot.lastFailedAt);
  const intervalMs = snapshot.intervalMs ?? definition.intervalMs;
  const graceMs = snapshot.graceMs ?? definition.graceMs;
  const maxRuntimeMs = snapshot.maxRuntimeMs ?? definition.maxRuntimeMs;
  const dueAt = getDueAt(snapshot, definition);

  let status: ProcessorStatus = "healthy";
  let statusMessage = "Running on schedule";

  if (running) {
    const runtimeMs = startedAt ? now - startedAt : 0;
    if (runtimeMs > maxRuntimeMs) {
      status = "degraded";
      statusMessage = "Processor is still running longer than expected";
    } else {
      status = "healthy";
      statusMessage = "Processor is currently running";
    }
  } else if (failedAt && (!succeededAt || failedAt >= succeededAt)) {
    status = dueAt && now > dueAt + graceMs ? "unhealthy" : "degraded";
    statusMessage = snapshot.lastError || "Last run failed";
  } else if (!completedAt && !succeededAt) {
    if (dueAt && now <= dueAt + graceMs) {
      status = "healthy";
      statusMessage = "First run is scheduled";
    } else {
      status = "degraded";
      statusMessage = "Waiting for first successful run";
    }
  } else if (dueAt && now > dueAt + graceMs + Math.max(intervalMs, 60 * 1000)) {
    status = "unhealthy";
    statusMessage = "Processor is overdue";
  } else if (dueAt && now > dueAt + graceMs) {
    status = "degraded";
    statusMessage = "Processor is slightly overdue";
  }

  return {
    ...snapshot,
    label: definition.label,
    description: definition.description,
    status,
    statusMessage,
  };
}

async function readStoredSnapshot(name: string): Promise<StoredProcessorSnapshot | null> {
  if (!redisClient?.isReady) {
    return null;
  }

  try {
    const rawValue = await redisClient.get(getProcessorKey(name));
    return parseSnapshot(rawValue);
  } catch (error: any) {
    log(`Failed to read processor health for ${name}: ${error.message}`, "processor-health", { level: "warn" });
    return null;
  }
}

async function writeStoredSnapshot(name: string, updates: Partial<StoredProcessorSnapshot>): Promise<void> {
  if (!redisClient?.isReady) {
    return;
  }

  try {
    const current = await readStoredSnapshot(name);
    const definition = getDefinition(name);
    const nextSnapshot: StoredProcessorSnapshot = {
      name,
      intervalMs: definition.intervalMs,
      graceMs: definition.graceMs,
      maxRuntimeMs: definition.maxRuntimeMs,
      ...current,
      ...updates,
    };

    await redisClient.set(getProcessorKey(name), JSON.stringify(nextSnapshot), {
      EX: PROCESSOR_HEALTH_TTL_SECONDS,
    });
  } catch (error: any) {
    log(`Failed to write processor health for ${name}: ${error.message}`, "processor-health", { level: "warn" });
  }
}

export async function scheduleProcessorRun(name: string, options: ProcessorUpdateOptions = {}): Promise<void> {
  await writeStoredSnapshot(name, {
    nextRunAt: toIsoString(options.nextRunAt),
    intervalMs: options.intervalMs,
    graceMs: options.graceMs,
    maxRuntimeMs: options.maxRuntimeMs,
    lastResult: options.lastResult,
  });
}

export async function markProcessorStarted(name: string, options: ProcessorUpdateOptions = {}): Promise<number> {
  const startedAt = new Date();

  await writeStoredSnapshot(name, {
    running: true,
    lastStartedAt: startedAt.toISOString(),
    lastError: null,
    nextRunAt: toIsoString(options.nextRunAt),
    intervalMs: options.intervalMs,
    graceMs: options.graceMs,
    maxRuntimeMs: options.maxRuntimeMs,
  });

  return startedAt.getTime();
}

export async function markProcessorSucceeded(
  name: string,
  startedAtMs?: number,
  options: ProcessorUpdateOptions = {},
): Promise<void> {
  const completedAt = new Date();

  await writeStoredSnapshot(name, {
    running: false,
    lastCompletedAt: completedAt.toISOString(),
    lastSucceededAt: completedAt.toISOString(),
    lastDurationMs: startedAtMs ? completedAt.getTime() - startedAtMs : undefined,
    lastError: null,
    nextRunAt: toIsoString(options.nextRunAt),
    intervalMs: options.intervalMs,
    graceMs: options.graceMs,
    maxRuntimeMs: options.maxRuntimeMs,
    lastResult: options.lastResult,
  });
}

export async function markProcessorFailed(
  name: string,
  error: unknown,
  startedAtMs?: number,
  options: ProcessorUpdateOptions = {},
): Promise<void> {
  const completedAt = new Date();
  const errorMessage = error instanceof Error ? error.message : String(error);

  await writeStoredSnapshot(name, {
    running: false,
    lastCompletedAt: completedAt.toISOString(),
    lastFailedAt: completedAt.toISOString(),
    lastDurationMs: startedAtMs ? completedAt.getTime() - startedAtMs : undefined,
    lastError: errorMessage,
    nextRunAt: toIsoString(options.nextRunAt),
    intervalMs: options.intervalMs,
    graceMs: options.graceMs,
    maxRuntimeMs: options.maxRuntimeMs,
    lastResult: options.lastResult,
  });
}

export async function getProcessorHealthSnapshots(): Promise<ProcessorHealthSnapshot[]> {
  const snapshots = await Promise.all(
    PROCESSOR_DEFINITIONS.map(async (definition) => {
      const storedSnapshot = await readStoredSnapshot(definition.name);
      return buildSnapshot(definition.name, storedSnapshot);
    }),
  );

  return snapshots;
}
