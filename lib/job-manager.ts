import { cleanupPath } from "./cleanup";

export type JobStage =
  | "fetching"
  | "downloading"
  | "merging"
  | "converting"
  | "ready"
  | "error";

export interface ProgressEvent {
  id: string;
  stage: JobStage;
  percent: number;
  speed: string | null;
  eta: string | null;
  error?: string;
}

export interface PreparedFile {
  filePath: string;
  tempDir: string;
  filename: string;
  contentType: string;
  size: number;
}

type Subscriber = (event: ProgressEvent) => void;

interface JobRecord {
  state: ProgressEvent;
  updatedAt: number;
  subscribers: Set<Subscriber>;
  preparedFile?: PreparedFile;
  claimed?: boolean;
}

const JOB_TTL_MS = 2 * 60 * 1000;

class JobManager {
  private readonly jobs = new Map<string, JobRecord>();

  private ensureJob(id: string): JobRecord {
    let record = this.jobs.get(id);
    if (!record) {
      record = {
        state: {
          id,
          stage: "fetching",
          percent: 0,
          speed: null,
          eta: null,
        },
        updatedAt: Date.now(),
        subscribers: new Set(),
      };
      this.jobs.set(id, record);
    }
    return record;
  }

  update(
    id: string,
    patch: Partial<Omit<ProgressEvent, "id">>,
  ): ProgressEvent {
    const record = this.ensureJob(id);
    record.state = {
      ...record.state,
      ...patch,
      id,
    };
    record.updatedAt = Date.now();

    for (const sub of record.subscribers) {
      try {
        sub(record.state);
      } catch {
        // Ignore broken subscriber streams
      }
    }

    if (record.state.stage === "ready" || record.state.stage === "error") {
      this.scheduleCleanup(id);
    }

    return record.state;
  }

  setPreparedFile(id: string, file: PreparedFile): void {
    const record = this.ensureJob(id);
    record.preparedFile = file;
    record.claimed = false;
    record.updatedAt = Date.now();
    this.scheduleCleanup(id);
  }

  /**
   * Claims a prepared file for streaming once. Returns undefined if missing or already claimed.
   */
  claimPreparedFile(id: string): PreparedFile | undefined {
    const record = this.jobs.get(id);
    if (!record?.preparedFile || record.claimed) {
      return undefined;
    }
    record.claimed = true;
    const file = record.preparedFile;
    record.preparedFile = undefined;
    return file;
  }

  getState(id: string): ProgressEvent | undefined {
    return this.jobs.get(id)?.state;
  }

  subscribe(id: string, callback: Subscriber): () => void {
    const record = this.ensureJob(id);
    record.subscribers.add(callback);

    // Immediately emit current known state
    callback(record.state);

    return () => {
      record.subscribers.delete(callback);
    };
  }

  private scheduleCleanup(id: string): void {
    const timer = setTimeout(() => {
      const record = this.jobs.get(id);
      if (record && Date.now() - record.updatedAt >= JOB_TTL_MS - 1000) {
        if (record.preparedFile) {
          void cleanupPath(record.preparedFile.tempDir);
        }
        this.jobs.delete(id);
      }
    }, JOB_TTL_MS);

    if (typeof timer.unref === "function") {
      timer.unref();
    }
  }
}

const globalForJobs = globalThis as typeof globalThis & {
  __umdJobManager?: JobManager;
};

export function getJobManager(): JobManager {
  if (
    !globalForJobs.__umdJobManager ||
    typeof globalForJobs.__umdJobManager.setPreparedFile !== "function"
  ) {
    globalForJobs.__umdJobManager = new JobManager();
  }
  return globalForJobs.__umdJobManager;
}
