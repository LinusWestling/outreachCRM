#!/usr/bin/env node

import { writeFile } from "node:fs/promises";

const ids = process.argv.slice(2);
const response = await fetch("http://127.0.0.1:5168/api/creators/pending");
if (!response.ok) throw new Error(`Pending API returned ${response.status}`);
const pending = await response.json();
const wanted = new Set(ids);
const prospects = pending.filter((creator) => wanted.has(creator.id)).map(({ id, handle, profileUrl, messageBody }) => ({ id, handle, profileUrl, messageBody }));
if (prospects.length !== ids.length || prospects.some((creator) => !creator.messageBody?.trim())) throw new Error("A requested prospect is missing or has no saved DM.");
await writeFile(".codex-prospect-send-export.json", JSON.stringify(prospects));
console.log(JSON.stringify({ count: prospects.length }));
