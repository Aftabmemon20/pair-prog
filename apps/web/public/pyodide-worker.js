// Pyodide Web Worker for Pairio-Lite
// Runs Python code strictly in browser sandbox. Never executes user code on server.

importScripts("https://cdn.jsdelivr.net/pyodide/v0.27.2/full/pyodide.js");

let pyodideReadyPromise = null;
let pyodideInstance = null;

async function initPyodide() {
  self.postMessage({ type: "STATUS", status: "loading" });
  try {
    pyodideInstance = await loadPyodide({
      stdout: (text) => {
        // Will be captured per-run
      },
      stderr: (text) => {
        // Will be captured per-run
      },
    });
    self.postMessage({ type: "STATUS", status: "ready" });
  } catch (err) {
    self.postMessage({ type: "STATUS", status: "error", error: String(err) });
  }
}

pyodideReadyPromise = initPyodide();

self.onmessage = async (event) => {
  const { type, code, id } = event.data;

  if (type === "PING") {
    self.postMessage({ type: "PONG" });
    return;
  }

  if (type === "RUN") {
    await pyodideReadyPromise;

    if (!pyodideInstance) {
      self.postMessage({
        type: "RUN_RESULT",
        id,
        exit_code: 1,
        stdout: "",
        stderr: "Pyodide runtime failed to load.",
        raw_traceback: "",
        execution_time_ms: 0,
      });
      return;
    }

    const startTime = performance.now();

    // Prepare execution wrapper in Python
    // We redirect sys.stdout & sys.stderr to capture buffers
    // and compile the user code under "main.py" so tracebacks match editor line numbers exactly
    const wrapper = `
import sys, io, traceback

_out = io.StringIO()
_err = io.StringIO()
_old_out = sys.stdout
_old_err = sys.stderr
sys.stdout = _out
sys.stderr = _err

_exit_code = 0
_raw_tb = ""

try:
    _compiled = compile(_user_code, "main.py", "exec")
    _ns = {"__name__": "__main__"}
    exec(_compiled, _ns)
except Exception as _e:
    _exit_code = 1
    _raw_tb = traceback.format_exc()
    _err.write(_raw_tb)
except SystemExit as _e:
    _exit_code = _e.code if isinstance(_e.code, int) else 0
finally:
    sys.stdout = _old_out
    sys.stderr = _old_err

_captured_out = _out.getvalue()
_captured_err = _err.getvalue()
`;

    try {
      pyodideInstance.globals.set("_user_code", code);
      await pyodideInstance.runPythonAsync(wrapper);

      const stdout = pyodideInstance.globals.get("_captured_out") || "";
      const stderr = pyodideInstance.globals.get("_captured_err") || "";
      const exitCode = pyodideInstance.globals.get("_exit_code") ?? 0;
      const rawTb = pyodideInstance.globals.get("_raw_tb") || "";
      const duration = Math.round(performance.now() - startTime);

      self.postMessage({
        type: "RUN_RESULT",
        id,
        exit_code: exitCode,
        stdout,
        stderr,
        raw_traceback: rawTb,
        execution_time_ms: duration,
      });
    } catch (unhandledErr) {
      const duration = Math.round(performance.now() - startTime);
      self.postMessage({
        type: "RUN_RESULT",
        id,
        exit_code: 1,
        stdout: "",
        stderr: String(unhandledErr),
        raw_traceback: String(unhandledErr),
        execution_time_ms: duration,
      });
    }
  }
};
