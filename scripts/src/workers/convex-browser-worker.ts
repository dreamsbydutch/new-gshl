import "dotenv/config";
import { convexToJson, jsonToConvex } from "convex/values";
import puppeteer, { type Browser } from "puppeteer-core";
import { capturePuckPediaDirectories } from "../domains/maintenance/sync-player-bios-from-puckpedia";

type Task = { _id: string; kind: string; payload: Record<string, unknown> };

const convexUrl = String(
  process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL ?? "",
).replace(/\/$/, "");
const workerSecret = String(process.env.BROWSER_WORKER_SECRET ?? "");
const workerId = String(process.env.BROWSER_WORKER_ID ?? `gshl-${process.pid}`);
const executablePath = String(process.env.BROWSER_EXECUTABLE_PATH ?? "");
const profilePath =
  process.env.BROWSER_USER_DATA_DIR ?? process.env.YAHOO_BROWSER_PROFILE_PATH;

if (!convexUrl || !workerSecret || !executablePath) {
  throw new Error(
    "CONVEX_URL, BROWSER_WORKER_SECRET, and BROWSER_EXECUTABLE_PATH are required",
  );
}

async function callConvex<T>(
  path: string,
  args: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`${convexUrl}/api/mutation`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "convex-client": "gshl-browser-worker",
    },
    body: JSON.stringify({
      path,
      format: "convex_encoded_json",
      args: [convexToJson({ ...args, workerSecret })],
    }),
  });
  const payload = (await response.json()) as {
    status?: string;
    value?: unknown;
    errorMessage?: string;
  };
  if (payload.status !== "success")
    throw new Error(payload.errorMessage ?? `Convex ${path} failed`);
  return jsonToConvex(payload.value as never) as T;
}

function taskUrl(task: Task) {
  const value = task.payload.url;
  if (typeof value !== "string" || !value)
    throw new Error("Browser task is missing payload.url");
  const url = new URL(value);
  const allowed = ["yahoo.com", "puckpedia.com", "hockey-reference.com"];
  if (
    !allowed.some(
      (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
    )
  ) {
    throw new Error(`Browser host is not allowed: ${url.hostname}`);
  }
  return url.toString();
}

async function execute(browser: Browser, task: Task) {
  if (task.kind === "puckpedia-player-bio-sync") {
    const snapshot = await capturePuckPediaDirectories(browser);
    const uploadUrl = await callConvex<string>("externalWorker:uploadUrl", {
      taskId: task._id,
      workerId,
    });
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(snapshot),
    });
    if (!response.ok) throw new Error("PuckPedia snapshot upload failed");
    const result = (await response.json()) as { storageId: string };
    return [{ storageId: result.storageId }];
  }
  const page = await browser.newPage();
  try {
    await page.goto(taskUrl(task), {
      waitUntil: "networkidle2",
      timeout: 90_000,
    });
    const title = await page.title();
    const url = page.url();
    const html = await page.content();
    if (/sign in|log in|login/i.test(title) && /yahoo/i.test(url)) {
      throw new Error(
        "Yahoo login required; refresh the local browser profile",
      );
    }
    const chunkSize = 200_000;
    const chunks = Array.from(
      { length: Math.ceil(html.length / chunkSize) },
      (_, index) => ({
        sequence: index,
        url,
        title,
        html: html.slice(index * chunkSize, (index + 1) * chunkSize),
      }),
    );
    if (chunks.length > 100)
      throw new Error("Browser response exceeds the bounded task result limit");
    return chunks;
  } finally {
    await page.close();
  }
}

let browser: Browser | undefined;

async function poll() {
  const task = await callConvex<Task | null>("externalWorker:lease", {
    workerId,
    leaseMs: 180_000,
  });
  if (!task) return;
  const heartbeat = setInterval(() => {
    void callConvex("externalWorker:heartbeat", {
      taskId: task._id,
      workerId,
      leaseMs: 180_000,
    }).catch(() => undefined);
  }, 45_000);
  try {
    browser = await puppeteer.launch({
      executablePath,
      headless: process.env.BROWSER_HEADLESS !== "false",
      userDataDir: profilePath,
      args: ["--no-first-run", "--disable-background-networking"],
    });
    const chunks = await execute(browser, task);
    await callConvex("externalWorker:complete", {
      taskId: task._id,
      workerId,
      chunks,
    });
  } catch (error) {
    await callConvex("externalWorker:fail", {
      taskId: task._id,
      workerId,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    clearInterval(heartbeat);
    await browser?.close();
    browser = undefined;
  }
}

const shutdown = () =>
  void Promise.resolve(browser?.close()).finally(() => process.exit(0));
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

while (true) {
  await poll().catch((error: unknown) => console.error(error));
  await new Promise((resolve) => setTimeout(resolve, 5_000));
}
