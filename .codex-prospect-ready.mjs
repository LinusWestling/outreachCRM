#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DEFAULT_BASE_URL = "http://127.0.0.1:5168";
const DEFAULT_INPUT_FILE = ".codex-prospect-ready.json";

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    return;
  }

  const dryRun = args.includes("--dry-run");
  const inputPath = args.find((arg) => !arg.startsWith("-")) ?? DEFAULT_INPUT_FILE;
  const config = JSON.parse(await readFile(path.resolve(process.cwd(), inputPath), "utf8"));
  const baseUrl = String(config.baseUrl ?? process.env.OUTREACH_API_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const ids = normalizeIds(config);

  if (ids.length === 0) {
    throw new Error(`No prospect IDs found in ${inputPath}.`);
  }

  const pendingBefore = await getJson(`${baseUrl}/api/creators/pending`);
  const pendingById = new Map(pendingBefore.map((creator) => [creator.id, creator]));
  const touched = [];

  for (const id of ids) {
    const existing = pendingById.get(id);
    if (!existing) {
      throw new Error(`Prospect ${id} is not queued. Stopping before any unsafe readiness change.`);
    }

    if (dryRun) {
      touched.push({ id, handle: existing.handle ?? existing.profileUrl, ready: existing.isReadyForAction === true });
      continue;
    }

    const marked = await postJson(`${baseUrl}/api/creators/pending/${id}/ready`);
    touched.push({ id, handle: marked.handle ?? existing.handle ?? existing.profileUrl, ready: marked.isReadyForAction === true });
  }

  if (!dryRun) {
    const pendingAfter = await getJson(`${baseUrl}/api/creators/pending`);
    const afterById = new Map(pendingAfter.map((creator) => [creator.id, creator]));
    const failures = touched
      .map((item) => ({ ...item, latest: afterById.get(item.id) }))
      .filter((item) => !item.latest || item.latest.isReadyForAction !== true);

    if (failures.length > 0) {
      throw new Error(`Readiness was not confirmed for: ${failures.map((item) => item.id).join(", ")}`);
    }
  }

  console.log(JSON.stringify({ dryRun, markedCount: touched.length, marked: touched }, null, 2));
}

function normalizeIds(config) {
  const raw = config.ids ?? config.prospectIds ?? config;

  if (Array.isArray(raw)) {
    return raw.map((item) => requireId(typeof item === "string" ? item : item?.id));
  }

  if (raw && typeof raw === "object") {
    return Object.entries(raw)
      .filter(([key]) => key !== "baseUrl")
      .map(([id]) => requireId(id));
  }

  throw new Error("Input must be an IDs array or an object keyed by creator ID.");
}

function requireId(id) {
  if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error(`Invalid creator ID: ${id}`);
  }

  return id;
}

async function getJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  return parseResponse(response);
}

async function postJson(url) {
  const response = await fetch(url, {
    method: "POST",
    headers: { Accept: "application/json" },
  });
  return parseResponse(response);
}

async function parseResponse(response) {
  const body = await response.text();
  const data = body ? JSON.parse(body) : null;

  if (!response.ok) {
    const message = data?.message ?? data?.detail ?? data?.title ?? `${response.status} ${response.statusText}`.trim();
    throw new Error(message);
  }

  return data;
}

function printUsage() {
  console.log(`Usage:
  node .codex-prospect-ready.mjs [input-json] [--dry-run]

Default input file:
  ${DEFAULT_INPUT_FILE}

Example input:
  {
    "ids": [
      "00000000-0000-0000-0000-000000000001"
    ]
  }

The command marks only queued prospects ready, and the API requires followers plus a personalized message that differs from the default template.`);
}
