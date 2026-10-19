#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DEFAULT_BASE_URL = "http://127.0.0.1:5168";
const DEFAULT_INPUT_FILE = ".codex-prospect-save.json";

const allowedFields = new Set([
  "displayName",
  "email",
  "threadsUrl",
  "followers",
  "code",
  "messageVersion",
  "messageTemplateId",
  "messageBody",
]);

const blockedFields = new Set([
  "responseStatus",
  "firstMessageDate",
  "secondMessageDate",
  "lastContactDate",
  "resumeContact",
]);

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
  const absoluteInputPath = path.resolve(process.cwd(), inputPath);
  const config = JSON.parse(await readFile(absoluteInputPath, "utf8"));
  const baseUrl = String(config.baseUrl ?? process.env.OUTREACH_API_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const updates = normalizeUpdates(config);

  if (updates.length === 0) {
    throw new Error(`No updates found in ${inputPath}.`);
  }

  const pendingBefore = await getJson(`${baseUrl}/api/creators/pending`);
  const pendingById = new Map(pendingBefore.map((creator) => [creator.id, creator]));
  const touched = [];

  for (const update of updates) {
    const existing = pendingById.get(update.id);
    if (!existing) {
      throw new Error(`Prospect ${update.id} is not queued. Stopping before any unsafe workflow change.`);
    }

    const payload = sanitizePayload(update.fields, update.id);
    if (Object.keys(payload).length === 0) {
      throw new Error(`Prospect ${update.id} has no allowed fields to update.`);
    }

    if (dryRun) {
      touched.push({ id: update.id, handle: existing.handle ?? existing.profileUrl, fields: Object.keys(payload) });
      continue;
    }

    const saved = await putJson(`${baseUrl}/api/creators/${update.id}`, payload);
    touched.push({ id: update.id, handle: saved.handle ?? existing.handle ?? existing.profileUrl, fields: Object.keys(payload) });
  }

  if (!dryRun) {
    const pendingAfter = await getJson(`${baseUrl}/api/creators/pending`);
    const remainingIds = new Set(pendingAfter.map((creator) => creator.id));
    const moved = touched.filter((item) => !remainingIds.has(item.id));

    if (moved.length > 0) {
      throw new Error(`Saved updates, but these prospects are no longer queued: ${moved.map((item) => item.id).join(", ")}`);
    }
  }

  console.log(JSON.stringify({ dryRun, updatedCount: touched.length, updated: touched }, null, 2));
}

function normalizeUpdates(config) {
  const rawUpdates = config.updates ?? config;

  if (Array.isArray(rawUpdates)) {
    return rawUpdates.map((item) => {
      const { id, fields, ...rest } = item;
      return { id: requireId(id), fields: fields ?? rest };
    });
  }

  if (rawUpdates && typeof rawUpdates === "object") {
    return Object.entries(rawUpdates)
      .filter(([key]) => key !== "baseUrl")
      .map(([id, fields]) => ({ id: requireId(id), fields }));
  }

  throw new Error("Input must be an updates array or an object keyed by creator ID.");
}

function sanitizePayload(fields, id) {
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
    throw new Error(`Prospect ${id} update fields must be an object.`);
  }

  const payload = {};
  for (const [key, value] of Object.entries(fields)) {
    if (blockedFields.has(key)) {
      throw new Error(`Prospect ${id} includes blocked workflow field "${key}". Save it manually if that was intentional.`);
    }

    if (!allowedFields.has(key)) {
      throw new Error(`Prospect ${id} includes unknown field "${key}". Allowed fields: ${[...allowedFields].join(", ")}.`);
    }

    payload[key] = value;
  }

  return payload;
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

async function putJson(url, payload) {
  const response = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
  return parseResponse(response);
}

async function parseResponse(response) {
  const body = await response.text();
  let data = null;
  if (body) {
    try {
      data = JSON.parse(body);
    } catch {
      data = { message: body };
    }
  }

  if (!response.ok) {
    const message = data?.message ?? data?.detail ?? data?.title ?? `${response.status} ${response.statusText}`.trim();
    throw new Error(message);
  }

  return data;
}

function printUsage() {
  console.log(`Usage:
  node .codex-prospect-save.mjs [input-json] [--dry-run]

Default input file:
  ${DEFAULT_INPUT_FILE}

Example input:
  {
    "updates": [
      {
        "id": "00000000-0000-0000-0000-000000000001",
        "followers": 37281,
        "messageBody": "Hi..."
      }
    ]
  }

The command stays stable for Codex approval; only the JSON file changes.`);
}
