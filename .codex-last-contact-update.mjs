#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DEFAULT_BASE_URL = "http://127.0.0.1:5168";
const DEFAULT_INPUT_FILE = ".codex-last-contact-update.json";

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

async function main() {
  const inputPath = process.argv[2] ?? DEFAULT_INPUT_FILE;
  const config = JSON.parse(await readFile(path.resolve(process.cwd(), inputPath), "utf8"));
  const handles = requireHandles(config.handles);
  const lastContactDate = requireDate(config.lastContactDate);
  const baseUrl = String(config.baseUrl ?? process.env.OUTREACH_API_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const creators = (await getJson(`${baseUrl}/api/creators?PageSize=500`)).items ?? [];
  const byHandle = new Map(creators.map((creator) => [normalize(creator.handle), creator]));
  const selected = handles.map((handle) => {
    const creator = byHandle.get(normalize(handle));
    if (!creator) throw new Error(`Creator @${handle} was not found.`);
    if (!creator.lastContactDate) throw new Error(`Creator @${handle} has no existing Last date.`);
    return creator;
  });

  const updated = await putJson(`${baseUrl}/api/creators/bulk`, {
    creatorIds: selected.map((creator) => creator.id),
    firstMessageDate: null,
    lastContactDate,
    setResponseStatus: false,
    responseStatus: null,
    setMessage: false,
    messageTemplateId: null,
    messageVersion: null,
    messageBody: null,
  });

  const updatedById = new Map(updated.map((creator) => [creator.id, creator]));
  const mismatches = selected.filter((creator) => updatedById.get(creator.id)?.lastContactDate !== lastContactDate);
  if (mismatches.length) {
    throw new Error(`Last date was not updated for: ${mismatches.map((creator) => `@${creator.handle}`).join(", ")}`);
  }

  console.log(JSON.stringify({ updatedCount: selected.length, lastContactDate, handles: selected.map((creator) => creator.handle) }, null, 2));
}

function requireHandles(value) {
  if (!Array.isArray(value) || value.length === 0 || value.some((handle) => typeof handle !== "string" || !handle.trim())) {
    throw new Error("handles must be a non-empty array of creator handles.");
  }
  return value.map((handle) => handle.trim());
}

function requireDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("lastContactDate must use YYYY-MM-DD.");
  }
  return value;
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
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
  const data = body ? JSON.parse(body) : null;
  if (!response.ok) throw new Error(data?.message ?? `${response.status} ${response.statusText}`);
  return data;
}
