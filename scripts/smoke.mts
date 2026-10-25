const performance = globalThis.performance;

interface Check {
  name: string;
  ok: boolean;
  ms: number;
  detail?: string;
}

const BASE = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3000";
const checks: Check[] = [];

async function timed(name: string, run: () => Promise<string | undefined>): Promise<void> {
  const started = performance.now();
  try {
    const detail = await run();
    checks.push({ name, ok: true, ms: performance.now() - started, detail });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    checks.push({ name, ok: false, ms: performance.now() - started, detail: message });
  }
}

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function jsonFetch(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`${BASE}${path}`, init);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`${init?.method ?? "GET"} ${path} failed: ${response.status} ${body.slice(0, 200)}`);
  }
  return response;
}

async function waitForStatus(id: string): Promise<string> {
  const deadline = Date.now() + 90_000;
  let status = "";
  while (Date.now() < deadline) {
    const report = (await (await jsonFetch(`/api/report/${id}`)).json()) as { status: string };
    status = report.status;
    if (status === "COMPLETED" || status === "FAILED") {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  assert(status === "COMPLETED", `analysis did not complete, final status: ${status}`);
  return status;
}

const runId = `smoke-${Date.now().toString(36)}`;
const submissionText = `Grid operators finance transmission, storage, and the flexibility services that keep supply and demand aligned every second. Deregulation invites price volatility because scarce transmission capacity concentrates market power. The institutions that govern planning, procurement, and cost recovery determine whether modernization delivers reliable and affordable power. This smoke paragraph adds ordinary words so it clears every minimum length gate for analysis.`;
let submissionId = "";
let assignmentId = "";

await timed("health endpoint", async () => {
  const payload = (await (await jsonFetch("/api/health")).json()) as { status: string; database: boolean };
  assert(payload.database === true, "database not reachable");
  assert(payload.status === "ok", "health not ok");
});

await timed("submit (inline JSON)", async () => {
  const response = (await (
    await jsonFetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: runId, text: submissionText })
    })
  ).json()) as { submission: { id: string; status: string } };
  submissionId = response.submission.id;
  assert(Boolean(submissionId), "no submission id returned");
  assert(
    ["QUEUED", "COMPLETED"].includes(response.submission.status),
    `unexpected submit status ${response.submission.status}`
  );
});

await timed("analysis completes", async () => {
  await waitForStatus(submissionId);
});

await timed("report payload integrity", async () => {
  const report = (await (await jsonFetch(`/api/report/${submissionId}`)).json()) as {
    scores: { similarity: number };
    matches: unknown[];
    sources: unknown[];
    stats: { wordCount: number };
  };
  assert(report.scores.similarity > 0, "expected nonzero similarity");
  assert(report.matches.length > 0, "expected matches");
  assert(report.sources.length > 0, "expected sources");
  assert(report.stats.wordCount > 0, "expected word count");
});

await timed("report filters (minMatchWords=2)", async () => {
  const report = (await (
    await jsonFetch(`/api/report/${submissionId}?minMatchWords=2`)
  ).json()) as { matches: unknown[] };
  assert(report.matches.length > 0, "filtered report empty");
});

await timed("submission list", async () => {
  const payload = (await (await jsonFetch("/api/submit")).json()) as {
    submissions: Array<{ id: string }>;
  };
  assert(payload.submissions.some((submission) => submission.id === submissionId), "new submission missing from list");
});

await timed("create assignment", async () => {
  const payload = (await (
    await jsonFetch("/api/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: `${runId} Assignment`, description: "smoke test" })
    })
  ).json()) as { assignment: { id: string } };
  assignmentId = payload.assignment.id;
  assert(Boolean(assignmentId), "no assignment id");
});

await timed("assignments list contains new one", async () => {
  const payload = (await (await jsonFetch("/api/assignments")).json()) as {
    assignments: Array<{ id: string }>;
  };
  assert(payload.assignments.some((assignment) => assignment.id === assignmentId), "assignment missing from list");
});

await timed("(assignment) roster endpoint", async () => {
  const payload = (await (await jsonFetch(`/api/assignments/${assignmentId}`)).json()) as {
    assignment: { title: string };
    students: unknown[];
    submissions: unknown[];
  };
  assert(payload.assignment.title === `${runId} Assignment`, "roster mismatch");
  assert(Array.isArray(payload.students), "students missing");
  assert(Array.isArray(payload.submissions), "submissions missing");
});

await timed("PDF export", async () => {
  const response = await fetch(`${BASE}/api/report/${submissionId}/pdf`);
  assert(response.ok, `pdf status ${response.status}`);
  assert(response.headers.get("content-type") === "application/pdf", "wrong pdf content type");
  const buffer = Buffer.from(await response.arrayBuffer());
  assert(buffer.subarray(0, 4).toString("latin1") === "%PDF", "missing PDF magic");
  assert(buffer.length > 1000, "pdf too small");
});

await timed("pages render", async () => {
  for (const path of ["/dashboard", "/instructor", `/instructor/${assignmentId}`, `/report/${submissionId}`]) {
    const response = await fetch(`${BASE}${path}`);
    assert(response.ok, `${path} status ${response.status}`);
  }
});

await timed("metrics endpoint", async () => {
  const response = await fetch(`${BASE}/api/metrics`);
  assert(response.ok, `metrics status ${response.status}`);
  const body = await response.text();
  assert(body.includes("veritas_"), "prometheus metrics missing");
});

const totalMs = checks.reduce((total, check) => total + check.ms, 0);
const failed = checks.filter((check) => !check.ok);

console.log(`SMOKE BASE: ${BASE}`);
for (const check of checks) {
  const icon = check.ok ? "PASS" : "FAIL";
  const detail = check.detail ? ` - ${check.detail}` : "";
  console.log(`${icon}  ${check.name}${detail}  (${check.ms.toFixed(0)} ms)`);
}
console.log(`total: ${(totalMs / 1000).toFixed(1)}s across ${checks.length} checks`);

if (failed.length > 0) {
  console.error(`smoke failed: ${failed.length}/${checks.length}`);
  process.exit(1);
}
console.log("SMOKE OK");
