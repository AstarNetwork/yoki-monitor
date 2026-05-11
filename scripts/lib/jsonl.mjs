import { promises as fs } from "node:fs";
import { dirname } from "node:path";

// Append a single record to a JSONL file. Creates the file + parent dirs
// if missing. Each record is JSON-stringified on one line; if the record
// contains nested BigInts the caller must serialize them as strings first
// (JSON.stringify throws on BigInt).
export async function appendJsonl(filePath, record) {
  await fs.mkdir(dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(record)}\n`, "utf8");
}

// Read the entire JSONL file into an array. Empty/missing file → [].
export async function readJsonl(filePath) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return content
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line));
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

// Walk the JSONL file backwards, return the first record matching predicate.
// Useful for "find the last time we alerted at this severity" lookups.
export async function findLastJsonl(filePath, predicate) {
  const rows = await readJsonl(filePath);
  for (let i = rows.length - 1; i >= 0; i--) {
    if (predicate(rows[i])) return rows[i];
  }
  return null;
}

export async function readJson(filePath, fallback = null) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content);
  } catch (err) {
    if (err.code === "ENOENT") return fallback;
    throw err;
  }
}

export async function writeJson(filePath, data) {
  await fs.mkdir(dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}
