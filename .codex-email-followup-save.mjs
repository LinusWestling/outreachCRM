#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DEFAULT_BASE_URL = "http://127.0.0.1:5168";
const DEFAULT_INPUT_FILE = ".codex-email-followup-save.json";

const allowedFields = new Set([
  "emailTemplateId",
  "emailSubject",
  "emailBody",
]);

const blockedFields = new Set([
  "displayName",
  "email",
  "threadsUrl",
  "followers",
  "code",
  "messageVersion",
  "messageTemplateId",
  "messageBody",
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
  const days = Number.parseInt(String(config.daysWithoutContact ?? 7), 10);
  if (!Number.isFinite(days) || days < 0) {
    throw new Error("daysWithoutContact must be a non-negative integer.");
  }

  const baseUrl = String(config.baseUrl ?? process.env.OUTREACH_API_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const updates = normalizeUpdates(config);

  if (updates.length === 0) {
    throw new Error(`No updates found in ${inputPath}.`);
  }

  const candidatesBefore = await getEmailFollowUpCandidates(baseUrl, days);
  const candidatesById = new Map(candidatesBefore.map((creator) => [creator.id, creator]));
  const touched = [];

  for (const update of updates) {
    const existing = candidatesById.get(update.id);
    if (!existing) {
      throw new Error(`Creator ${update.id} is not an email follow-up candidate. Stopping before any unsafe workflow change.`);
    }

    const payload = sanitizePayload(update.fields, update.id);
    if (Object.keys(payload).length === 0) {
      throw new Error(`Creator ${update.id} has no allowed fields to update.`);
    }

    if (dryRun) {
      touched.push({ id: update.id, handle: existing.handle ?? existing.profileUrl, fields: Object.keys(payload) });
      continue;
    }

    const saved = await putJson(`${baseUrl}/api/creators/${update.id}`, payload);
    touched.push({ id: update.id, handle: saved.handle ?? existing.handle ?? existing.profileUrl, fields: Object.keys(payload) });
  }

  if (!dryRun) {
    const candidatesAfter = await getEmailFollowUpCandidates(baseUrl, days);
    const remainingIds = new Set(candidatesAfter.map((creator) => creator.id));
    const moved = touched.filter((item) => !remainingIds.has(item.id));

    if (moved.length > 0) {
      throw new Error(`Saved updates, but these creators are no longer email follow-up candidates: ${moved.map((item) => item.id).join(", ")}`);
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
      .filter(([key]) => key !== "baseUrl" && key !== "daysWithoutContact")
      .map(([id, fields]) => ({ id: requireId(id), fields }));
  }

  throw new Error("Input must be an updates array or an object keyed by creator ID.");
}

function sanitizePayload(fields, id) {
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
    throw new Error(`Creator ${id} update fields must be an object.`);
  }

  const payload = {};
  for (const [key, value] of Object.entries(fields)) {
    if (blockedFields.has(key)) {
      throw new Error(`Creator ${id} includes blocked workflow field "${key}". Save it manually if that was intentional.`);
    }

    if (!allowedFields.has(key)) {
      throw new Error(`Creator ${id} includes unknown field "${key}". Allowed fields: ${[...allowedFields].join(", ")}.`);
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
    } catch (error) {
      if (!response.ok) {
        const preview = body.length > 1000 ? `${body.slice(0, 1000)}...` : body;
        throw new Error(`${response.status} ${response.statusText}: ${preview}`);
      }

      throw error;
    }
  }

  if (!response.ok) {
    const message = data?.message ?? data?.detail ?? data?.title ?? `${response.status} ${response.statusText}`.trim();
    throw new Error(message);
  }

  return data;
}

async function getEmailFollowUpCandidates(baseUrl, days) {
  try {
    return await getJson(`${baseUrl}/api/creators/email-follow-up-candidates?daysWithoutContact=${days}`);
  } catch (error) {
    const message = String(error?.message ?? "");
    if (!message.includes("405")) {
      throw error;
    }
  }

  const all = await listCreatorsFallback(baseUrl);
  const threshold = dateMinusDays(todayIso(), days);
  return all
    .filter((creator) => String(creator.responseStatus ?? "") === "No")
    .filter((creator) => creator.responded !== true)
    .filter((creator) => typeof creator.email === "string" && creator.email.trim())
    .filter((creator) => {
      const lastContact = creator.lastContactDate ?? creator.firstMessageDate ?? null;
      return typeof lastContact === "string" && lastContact <= threshold;
    });
}

async function listCreatorsFallback(baseUrl) {
  const pageSize = 200;
  const creators = [];

  for (let pageNumber = 1; pageNumber <= 20; pageNumber += 1) {
    const params = new URLSearchParams({
      HasEmail: "true",
      ResponseStatus: "No",
      PageSize: String(pageSize),
      PageNumber: String(pageNumber),
    });
    const page = await getJson(`${baseUrl}/api/creators?${params}`);
    const items = Array.isArray(page) ? page : page.items ?? [];
    creators.push(...items);

    if (Array.isArray(page) || creators.length >= (page.totalCount ?? 0) || items.length === 0) {
      break;
    }
  }

  return creators;
}

function todayIso() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
}

function dateMinusDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function printUsage() {
  console.log(`Usage:
  node .codex-email-followup-save.mjs [input-json] [--dry-run]

Default input file:
  ${DEFAULT_INPUT_FILE}

Example input:
  {
    "daysWithoutContact": 7,
    "updates": [
      {
        "id": "00000000-0000-0000-0000-000000000001",
        "emailTemplateId": "00000000-0000-0000-0000-000000000002",
        "emailSubject": "Quick follow-up",
        "emailBody": "Hi..."
      }
    ]
  }

The command stays stable for Codex approval; only the JSON file changes.`);
}
