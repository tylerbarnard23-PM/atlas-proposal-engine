// Stratovell's local service (#116): the Next.js standalone server, started by
// the desktop application as an Electron utility process. Before the server
// loads, this installs the PDF bridge: the final-PDF route builds and re-gates
// the proposal exactly as before, then hands the finished HTML to the main
// process, which prints it with Electron's own Chromium (no installed browser).
// A utility process ends with the application, so no server is left behind.

interface ParentPort {
  on(event: "message", cb: (e: { data: unknown }) => void): void;
  postMessage(message: unknown): void;
}

const parentPort = (process as unknown as { parentPort?: ParentPort }).parentPort;
if (!parentPort) {
  console.error("Stratovell's local service runs only inside the Stratovell desktop application.");
  process.exit(1);
}

const pending = new Map<string, { resolve: (b: Uint8Array) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
let next = 0;

parentPort.on("message", (e) => {
  const m = e.data as { type?: string; id?: string; ok?: boolean; data?: Uint8Array; error?: string };
  if (m?.type !== "pdf-result" || typeof m.id !== "string") return;
  const p = pending.get(m.id);
  if (!p) return;
  pending.delete(m.id);
  clearTimeout(p.timer);
  if (m.ok && m.data instanceof Uint8Array) p.resolve(m.data);
  else p.reject(new Error(typeof m.error === "string" ? m.error : "The PDF couldn't be printed."));
});

(globalThis as { __stratovellRenderPdf?: (html: string) => Promise<Uint8Array> }).__stratovellRenderPdf = (html: string) =>
  new Promise<Uint8Array>((resolve, reject) => {
    const id = `pdf-${++next}`;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("Printing the PDF took too long."));
    }, 120_000);
    pending.set(id, { resolve, reject, timer });
    parentPort.postMessage({ type: "render-pdf", id, html });
  });

// The standalone server reads PORT and HOSTNAME (127.0.0.1) from the environment the application set.
require("./server.js");
