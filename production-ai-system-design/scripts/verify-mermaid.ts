import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

async function main() {
  const directory = fileURLToPath(new URL("../diagrams", import.meta.url));
  const files = (await readdir(directory)).filter((file) => file.endsWith(".mmd"));
  const errors: string[] = [];
  for (const file of files) {
    const source = await readFile(join(directory, file), "utf8");
    if (!/^(flowchart|sequenceDiagram)\b/.test(source.trim())) errors.push(`${file}: unsupported Mermaid declaration`);
    for (const [open, close] of [["[", "]"], ["(", ")"], ["{", "}"]] as const) if ((source.match(new RegExp(`\\${open}`, "g")) || []).length !== (source.match(new RegExp(`\\${close}`, "g")) || []).length) errors.push(`${file}: unbalanced ${open}${close}`);
  }
  if (files.length !== 7) errors.push(`Expected 7 diagrams, found ${files.length}`);
  if (errors.length) { console.error(errors.join("\n")); process.exitCode = 1; } else console.log(`Mermaid verification passed (${files.length} diagrams).`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
