#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import process from "node:process";

const DEFAULT_BASE_URL = "http://127.0.0.1:5168";
// Allow-list of unavailable queued prospects the user approved for completion, kept
// locally in .codex-prospect-complete-unavailable.json as [{ "id": "...", "handle": "..." }].
const ALLOWED_PROSPECTS = await readAllowedProspects();

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

async function main() {
  const id = valueAfter(process.argv.slice(2), "--id");
  const allowedHandle = ALLOWED_PROSPECTS.get(id);
  if (!allowedHandle) {
    throw new Error(`This helper is limited to explicitly allowed unavailable queued prospects.`);
  }

  const baseUrl = String(process.env.OUTREACH_API_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const pending = await getJson(`${baseUrl}/api/creators/pending`);
  const creator = pending.find((item) => item.id === id);
  if (!creator) throw new Error(`Queued prospect ${id} was not found.`);
  if (normalizeHandle(creator.handle) !== allowedHandle) {
    throw new Error(`Prospect identity mismatch: expected @${allowedHandle}.`);
  }

  const completed = await postJson(`${baseUrl}/api/creators/pending/${id}/complete`, {
    email: creator.email ?? null,
    threadsUrl: creator.threadsUrl ?? null,
    followers: creator.followers ?? null,
    code: creator.code ?? null,
    messageTemplateId: creator.messageTemplateId ?? null,
    messageVersion: creator.messageVersion ?? null,
    messageBody: creator.messageBody ?? null,
    firstMessageDate: creator.firstMessageDate ?? null,
    lastContactDate: creator.lastContactDate ?? null,
  });

  console.log(JSON.stringify({
    id: completed.id,
    handle: completed.handle ?? creator.handle ?? null,
    status: completed.status ?? null,
    responseStatus: completed.responseStatus ?? null,
    lastContactDate: completed.lastContactDate ?? null,
  }, null, 2));
}

function valueAfter(args, name) {
  const index = args.indexOf(name);
  const value = index === -1 ? null : args[index + 1];
  if (!value || value.startsWith("-")) throw new Error(`${name} requires a value.`);
  return value;
}

function normalizeHandle(value) {
  return String(value ?? "").trim().replace(/^@/, "").toLowerCase();
}

async function getJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  return parseResponse(response);
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
  return parseResponse(response);
}

async function parseResponse(response) {
  const body = await response.text();
  const data = body ? JSON.parse(body) : null;
  if (!response.ok) throw new Error(data?.message ?? data?.detail ?? data?.title ?? `${response.status} ${response.statusText}`);
  return data;
}

async function readAllowedProspects() {
  try {
    const entries = JSON.parse(await readFile(new URL("./.codex-prospect-complete-unavailable.json", import.meta.url), "utf8"));
    return new Map(entries.map((entry) => [entry.id, normalizeHandle(entry.handle)]));
  } catch {
    return new Map();
  }
}
