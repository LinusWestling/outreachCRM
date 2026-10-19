#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DEFAULT_BASE_URL = "http://127.0.0.1:5168";
const DEFAULT_INPUT_FILES = [".codex-email-followup-verify.json", ".codex-email-followup-save.json"];
const comparableFields = new Set([
  "emailTemplateId",
  "emailSubject",
  "emailBody",
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

  const inputPath = args.find((arg) => !arg.startsWith("-"));
  const config = await readConfig(inputPath);
  const days = Number.parseInt(String(config.daysWithoutContact ?? 7), 10);
  if (!Number.isFinite(days) || days < 0) {
    throw new Error("daysWithoutContact must be a non-negative integer.");
  }

  const baseUrl = String(config.baseUrl ?? process.env.OUTREACH_API_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const expectations = normalizeExpectations(config);

  if (expectations.length === 0) {
    throw new Error("No creator IDs or update expectations found.");
  }

  const candidates = await getEmailFollowUpCandidates(baseUrl, days);
  const candidatesById = new Map(candidates.map((creator) => [creator.id, creator]));
  const results = expectations.map((expectation) => verifyExpectation(expectation, candidatesById));
  const failures = results.filter((result) => !result.ok);

  console.log(JSON.stringify({
    ok: failures.length === 0,
    checkedCount: results.length,
    failures,
    results,
  }, null, 2));

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

async function readConfig(inputPath) {
  if (inputPath) {
    return JSON.parse(await readFile(path.resolve(process.cwd(), inputPath), "utf8"));
  }

  for (const candidate of DEFAULT_INPUT_FILES) {
    try {
      return JSON.parse(await readFile(path.resolve(process.cwd(), candidate), "utf8"));
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
    }
  }

  throw new Error(`No input file found. Create ${DEFAULT_INPUT_FILES.join(" or ")}.`);
}

function normalizeExpectations(config) {
  const raw = config.expectations ?? config.updates ?? config.ids ?? config;

  if (Array.isArray(raw)) {
    return raw.map((item) => {
      if (typeof item === "string") {
        return { id: requireId(item), expected: {} };
      }

      const { id, fields, expected, ...rest } = item;
      return { id: requireId(id), expected: pickComparableFields(expected ?? fields ?? rest) };
    });
  }

  if (raw && typeof raw === "object") {
    return Object.entries(raw)
      .filter(([key]) => key !== "baseUrl" && key !== "daysWithoutContact")
      .map(([id, expected]) => ({ id: requireId(id), expected: pickComparableFields(expected) }));
  }

  throw new Error("Input must be IDs, expectations, updates, or an object keyed by creator ID.");
}

function pickComparableFields(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const expected = {};
  for (const [key, fieldValue] of Object.entries(value)) {
    if (comparableFields.has(key)) {
      expected[key] = fieldValue;
    }
  }

  return expected;
}

function verifyExpectation(expectation, candidatesById) {
  const creator = candidatesById.get(expectation.id);
  if (!creator) {
    return {
      id: expectation.id,
      ok: false,
      failures: ["not an email follow-up candidate"],
    };
  }

  const failures = [];
  for (const [field, expectedValue] of Object.entries(expectation.expected)) {
    if (!valuesMatch(creator[field], expectedValue)) {
      failures.push(`${field}: expected ${JSON.stringify(expectedValue)}, got ${JSON.stringify(creator[field] ?? null)}`);
    }
  }

  return {
    id: expectation.id,
    handle: creator.handle ?? creator.profileUrl,
    ok: failures.length === 0,
    failures,
    checkedFields: Object.keys(expectation.expected),
  };
}

function valuesMatch(actual, expected) {
  const normalizedActual = actual ?? null;
  const normalizedExpected = expected === "" || expected === undefined ? null : expected;
  return normalizedActual === normalizedExpected;
}

function requireId(id) {
  if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error(`Invalid creator ID: ${id}`);
  }

  return id;
}

async function getJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const body = await response.text();
  const data = body ? JSON.parse(body) : null;

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
  node .codex-email-followup-verify.mjs [input-json]

Default input files, in order:
  ${DEFAULT_INPUT_FILES.join(", ")}

Example input:
  {
    "daysWithoutContact": 7,
    "expectations": [
      {
        "id": "00000000-0000-0000-0000-000000000001",
        "emailSubject": "Quick follow-up",
        "emailBody": "Hi..."
      }
    ]
  }

The command is read-only and stays stable for Codex approval; only the JSON file changes.`);
}
