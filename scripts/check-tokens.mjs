// Fails when a hex colour appears outside src/styles/tokens.css.
// ESLint covers TypeScript; this covers CSS and HTML.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ALLOWED = 'src/styles/tokens.css';
const HEX = /(?<![&\w])#[0-9a-fA-F]{3,8}\b/g;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const files = ['index.html', ...walk('src').filter((f) => /\.(css|html)$/.test(f))].map((f) => f.replaceAll('\\', '/')).filter((f) => f !== ALLOWED);
let failures = 0;
for (const file of files) {
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      for (const match of line.match(HEX) ?? []) {
        console.error(`${file}:${i + 1}  ${match} is a hex colour outside ${ALLOWED}`);
        failures++;
      }
    });
}
if (failures) {
  console.error(`\n${failures} hex colour(s) found. Add a token to ${ALLOWED} and use var(--token).`);
  process.exit(1);
}
console.log(`check-tokens: ${files.length} files, no hex colours outside ${ALLOWED}`);
