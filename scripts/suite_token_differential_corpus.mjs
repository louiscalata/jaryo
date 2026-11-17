/** Evaluate a JSONL corpus twice per case without replacing the comparison oracle. */
import fs from 'node:fs';
import readline from 'node:readline';
import { pathToFileURL } from 'node:url';

const [modulePath, casesPath, outputPath] = process.argv.slice(2);
if (process.argv.length !== 5) throw new Error('expected module, corpus, and output paths');
const { compareTokenTexts } = await import(pathToFileURL(modulePath).href);
const lines = readline.createInterface({ input: fs.createReadStream(casesPath), crlfDelay: Infinity });
const output = fs.openSync(outputPath, 'w');
try {
  for await (const line of lines) {
    if (!line) continue;
    const { e, s } = JSON.parse(line);
    let row;
    try {
      const first = JSON.stringify(compareTokenTexts(e, s));
      const second = JSON.stringify(compareTokenTexts(e, s));
      row = first === second ? `{"ok":${first}}` : '{"err":"NONDETERMINISTIC"}';
    } catch (error) {
      row = JSON.stringify({ err: error.code === 'INVALID_INPUT' ? 'INVALID_INPUT' : `OTHER:${error.name}` });
    }
    fs.writeSync(output, `${row}\n`);
  }
} finally {
  fs.closeSync(output);
}
