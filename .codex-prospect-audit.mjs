#!/usr/bin/env node

import process from "node:process";

const DEFAULT_BASE_URL = "http://127.0.0.1:5168";

const checks = [
  {
    language: "Swedish",
    pattern: /\b(tranings|traning|aterhamt|garna|arlig|ar intresserad|ocksa|far|anvandare|gar over|pa |inlagg|kanns|satt|fortroend|fortjanar|later)\b/i,
  },
  {
    language: "German",
    pattern: /\b(koennt|wuerd|fuer|gefaellt|natuerlich|fuehlt|ueberzeugt)\b/i,
  },
  {
    language: "French",
    pattern: /\b(facon|cree|creer|createur|recuperation|entrainement|plait|recois|amenes|indefiniment|maniere|honnete|acces|ca)\b/i,
  },
];

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

  const baseUrl = String(process.env.OUTREACH_API_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const pending = await getJson(`${baseUrl}/api/creators/pending`);
  const findings = [];

  for (const creator of pending) {
    const message = creator.messageBody ?? "";
    for (const check of checks) {
      const match = check.pattern.exec(message);
      if (match) {
        findings.push({
          id: creator.id,
          handle: creator.handle,
          profileUrl: creator.profileUrl,
          language: check.language,
          matched: match[0],
          messageStarts: message.slice(0, 120),
        });
        break;
      }
    }
  }

  console.log(JSON.stringify({
    ok: findings.length === 0,
    checkedCount: pending.length,
    findings,
  }, null, 2));

  if (findings.length > 0) {
    process.exitCode = 1;
  }
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

function printUsage() {
  console.log(`Usage:
  node .codex-prospect-audit.mjs

Scans queued prospect drafts for likely ASCII transliteration in languages that need native diacritics.`);
}
