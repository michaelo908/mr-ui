import {
  chmod,
  open,
  readFile,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import chromium from "@sparticuz/chromium";

const PREPARATION_LOCK = join(tmpdir(), "gravitas-chromium.prepare.lock");
const PREPARATION_MARKER = join(tmpdir(), "gravitas-chromium.ready");
const LOCK_STALE_AFTER_MS = 120_000;
const LOCK_WAIT_TIMEOUT_MS = 120_000;
const MINIMUM_BROWSER_BYTES = 10_000_000;

let executablePromise: Promise<string> | undefined;

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function isPreparedExecutable(executablePath: string) {
  try {
    const [details, marker] = await Promise.all([
      stat(executablePath),
      readFile(PREPARATION_MARKER, "utf8"),
    ]);
    return (
      details.isFile() &&
      details.size >= MINIMUM_BROWSER_BYTES &&
      marker.trim() === executablePath
    );
  } catch {
    return false;
  }
}

async function acquirePreparationLock() {
  const startedAt = Date.now();

  while (Date.now() - startedAt < LOCK_WAIT_TIMEOUT_MS) {
    try {
      const handle = await open(PREPARATION_LOCK, "wx", 0o600);
      await handle.writeFile(
        JSON.stringify({ pid: process.pid, createdAt: Date.now() })
      );
      return handle;
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !("code" in error) ||
        error.code !== "EEXIST"
      ) {
        throw error;
      }

      try {
        const lockDetails = await stat(PREPARATION_LOCK);
        if (Date.now() - lockDetails.mtimeMs > LOCK_STALE_AFTER_MS) {
          await unlink(PREPARATION_LOCK).catch(() => undefined);
          continue;
        }
      } catch {
        continue;
      }

      await delay(100);
    }
  }

  throw new Error("Timed out while preparing the webpage renderer.");
}

async function prepareServerlessChromium() {
  const existingPath = join(tmpdir(), "chromium");
  if (await isPreparedExecutable(existingPath)) return existingPath;

  const lockHandle = await acquirePreparationLock();
  try {
    if (await isPreparedExecutable(existingPath)) return existingPath;

    const executablePath = await chromium.executablePath();
    const details = await stat(executablePath);
    if (!details.isFile() || details.size < MINIMUM_BROWSER_BYTES) {
      throw new Error("The webpage renderer executable is incomplete.");
    }

    await chmod(executablePath, 0o700);
    await writeFile(PREPARATION_MARKER, executablePath, {
      encoding: "utf8",
      mode: 0o600,
    });
    return executablePath;
  } finally {
    await lockHandle.close().catch(() => undefined);
    await unlink(PREPARATION_LOCK).catch(() => undefined);
  }
}

export function getBrowserExecutablePath() {
  if (process.env.GRAVITAS_BROWSER_EXECUTABLE_PATH) {
    return Promise.resolve(process.env.GRAVITAS_BROWSER_EXECUTABLE_PATH);
  }

  if (process.platform === "darwin") {
    return Promise.resolve(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    );
  }

  executablePromise ??= prepareServerlessChromium().catch((error) => {
    executablePromise = undefined;
    throw error;
  });
  return executablePromise;
}

export function isRetryableBrowserLaunchError(error: unknown) {
  return (
    error instanceof Error &&
    /(?:ETXTBSY|text file busy|browserType\.launch)/i.test(error.message)
  );
}

export async function waitBeforeBrowserLaunchRetry() {
  await delay(250);
}
