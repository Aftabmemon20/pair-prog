// Pyodide Runner Manager with Warm Spare Worker & 5s Hard Timeout

export interface StructuredFrame {
  file: string;
  line: number;
  function: string;
  code_line?: string;
}

export interface StructuredTraceback {
  error_type: string;
  error_message: string;
  frames: StructuredFrame[];
  top_frame?: StructuredFrame;
}

export interface RunResult {
  exit_code: number;
  stdout: string;
  stderr: string;
  raw_traceback?: string;
  traceback?: StructuredTraceback;
  execution_time_ms: number;
  actor: string;
}

type RunnerStatus = "uninitialized" | "loading" | "ready" | "running";

class PyodideRunnerManager {
  private activeWorker: Worker | null = null;
  private spareWorker: Worker | null = null;
  private status: RunnerStatus = "uninitialized";
  private statusListeners: Set<(status: RunnerStatus) => void> = new Set();
  private pendingRuns: Map<string, { resolve: (res: any) => void; reject: (err: any) => void }> = new Map();

  constructor() {
    // Lazily initialized in browser environment
  }

  public init() {
    if (typeof window === "undefined" || this.activeWorker) return;
    this.setStatus("loading");
    this.activeWorker = this.createWorker();
    this.spareWorker = this.createWorker();
  }

  public getStatus(): RunnerStatus {
    return this.status;
  }

  public onStatusChange(listener: (status: RunnerStatus) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  private setStatus(newStatus: RunnerStatus) {
    this.status = newStatus;
    this.statusListeners.forEach((l) => l(newStatus));
  }

  private createWorker(): Worker {
    const worker = new Worker("/pyodide-worker.js");
    worker.onmessage = (event) => {
      const { type, status, id, ...rest } = event.data;

      if (type === "STATUS") {
        if (status === "ready") {
          this.setStatus("ready");
        }
      } else if (type === "RUN_RESULT") {
        const pending = this.pendingRuns.get(id);
        if (pending) {
          this.pendingRuns.delete(id);
          pending.resolve(rest);
        }
      }
    };
    return worker;
  }

  public async runCode(code: string, actor: string, roomId: string): Promise<RunResult> {
    if (!this.activeWorker) {
      this.init();
    }

    const runId = `run_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.setStatus("running");

    const runPromise = new Promise<{
      exit_code: number;
      stdout: string;
      stderr: string;
      raw_traceback: string;
      execution_time_ms: number;
    }>((resolve, reject) => {
      this.pendingRuns.set(runId, { resolve, reject });

      // 5-second hard timeout
      const timer = setTimeout(() => {
        if (this.pendingRuns.has(runId)) {
          this.pendingRuns.delete(runId);

          // Hard kill the worker
          if (this.activeWorker) {
            this.activeWorker.terminate();
          }

          // Promote warm spare worker
          this.activeWorker = this.spareWorker;
          // Spawn replacement spare worker in background
          this.spareWorker = this.createWorker();

          this.setStatus("ready");

          resolve({
            exit_code: 124,
            stdout: "",
            stderr: "TimeoutError: Execution exceeded 5.0 seconds time limit.\nSandboxed Web Worker terminated to prevent browser freeze.",
            raw_traceback: "TimeoutError: 5s timeout",
            execution_time_ms: 5000,
          });
        }
      }, 5000);

      this.activeWorker?.postMessage({
        type: "RUN",
        id: runId,
        code,
      });
    });

    try {
      const rawResult = await runPromise;
      this.setStatus("ready");

      let structuredTb: StructuredTraceback | undefined;

      // If error occurred, parse traceback through server parser
      if (rawResult.exit_code !== 0 && (rawResult.raw_traceback || rawResult.stderr)) {
        try {
          const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
          const parseRes = await fetch(`${apiUrl}/rooms/${roomId}/parse-traceback`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ traceback: rawResult.raw_traceback || rawResult.stderr }),
          });
          if (parseRes.ok) {
            structuredTb = await parseRes.json();
          }
        } catch {
          // Graceful fallback
        }
      }

      const finalResult: RunResult = {
        exit_code: rawResult.exit_code,
        stdout: rawResult.stdout,
        stderr: rawResult.stderr,
        raw_traceback: rawResult.raw_traceback,
        traceback: structuredTb,
        execution_time_ms: rawResult.execution_time_ms,
        actor,
      };

      // Broadcast run event to room so peer developer sees output
      this.broadcastRunEvent(roomId, finalResult);

      return finalResult;
    } catch (err: any) {
      this.setStatus("ready");
      const errorResult: RunResult = {
        exit_code: 1,
        stdout: "",
        stderr: String(err),
        execution_time_ms: 0,
        actor,
      };
      return errorResult;
    }
  }

  private async broadcastRunEvent(roomId: string, result: RunResult) {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      await fetch(`${apiUrl}/rooms/${roomId}/run-event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actor: result.actor,
          stdout: result.stdout,
          stderr: result.stderr,
          exit_code: result.exit_code,
          execution_time_ms: result.execution_time_ms,
          traceback: result.traceback,
        }),
      });
    } catch {
      // Ignore broadcast network error
    }
  }
}

export const pyodideRunner = new PyodideRunnerManager();
