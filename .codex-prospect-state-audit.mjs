#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DEFAULT_BASE_URL = "http://127.0.0.1:5168";

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

async function main() {
  const inputPath = process.argv.slice(2).find((arg) => !arg.startsWith("-"));
  if (!inputPath) {
    throw new Error("Usage: node .codex-prospect-state-audit.mjs <verification-json>");
  }

  const config = JSON.parse(await readFile(path.resolve(process.cwd(), inputPath), "utf8"));
  const raw = config.expectations ?? config.ids ?? config;
  const ids = (Array.isArray(raw) ? raw : Object.keys(raw)).map((item) =>
    typeof item === "string" ? item : item.id,
  );
  const baseUrl = String(config.baseUrl ?? process.env.OUTREACH_API_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const [pending, directoryPage] = await Promise.all([
    getJson(`${baseUrl}/api/creators/pending`),
    getJson(`${baseUrl}/api/creators?PageNumber=1&PageSize=500`),
  ]);
  const pendingById = new Map(pending.map((item) => [item.id, item]));
  const directory = Array.isArray(directoryPage) ? directoryPage : directoryPage.items ?? [];
  const directoryById = new Map(directory.map((item) => [item.id, item]));
  const results = ids.map((id) => {
    const queued = pendingById.get(id);
    const nonQueued = directoryById.get(id);
    const item = queued ?? nonQueued;
    return {
      id,
      handle: item?.handle ?? item?.profileUrl ?? null,
      location: queued ? "queued" : nonQueued ? "directory-non-queued" : "not-found",
      followers: item?.followers ?? null,
      responseStatus: item?.responseStatus ?? null,
      firstMessageDate: item?.firstMessageDate ?? null,
      lastContactDate: item?.lastContactDate ?? null,
      isReadyForAction: item?.isReadyForAction ?? null,
    };
  });
  console.log(JSON.stringify({
    checkedCount: results.length,
    queuedCount: results.filter((item) => item.location === "queued").length,
    nonQueuedCount: results.filter((item) => item.location === "directory-non-queued").length,
    notFoundCount: results.filter((item) => item.location === "not-found").length,
    results,
  }, null, 2));
}

async function getJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const body = await response.text();
  const data = body ? JSON.parse(body) : null;
  if (!response.ok) {
    throw new Error(data?.message ?? data?.detail ?? data?.title ?? `${response.status} ${response.statusText}`.trim());
  }
  return data;
}
