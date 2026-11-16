// Neon Breach FPS — a threejs-fps-01 entry (Node 22, standard library only).
// The game is game/: static ES modules with three.js 0.187.0 vendored under
// game/vendor/three, loaded through the import map in game/index.html. This
// program hands the entry in: it copies game/ and screenshots/ from beside
// this file into /output and writes /output/dossier.json with the kit's
// vendored library, vendor/makefun-threejs.ts, exactly as the starter does.
//
// Play it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The scorer's caps (reference/gate.json): only text_max_bytes shapes the
// dossier's bytes; the rest refuse an entry the scorer would refuse — more
// than 4 screenshots or one over 256 KiB, more than 993 files in game/ or
// 48 MiB of game files in all, beside /output's own 1000-entry cap.
const dossierPath = join(out, 'dossier.json');
writeFileSync(
  dossierPath,
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
  }),
);

// Read the dossier back and say what went in: a build that cannot report
// its own size is one nobody checked. The gate refuses a dossier over
// 1.5 MiB, so fail loudly here instead of handing in a dead entry.
const dossier = JSON.parse(readFileSync(dossierPath, 'utf8'));
const dossierBytes = statSync(dossierPath).size;
const gameFiles = readdirSync(join(out, 'game'), { recursive: true }).length;
const shotFiles = existsSync(join(out, 'screenshots'))
  ? readdirSync(join(out, 'screenshots')).filter((f) => !f.startsWith('.'))
  : [];
console.log(
  `Neon Breach FPS handed in: ${gameFiles} game files, ${shotFiles.length} screenshots, ` +
  `dossier ${dossierBytes} bytes (text ${dossier.text?.length ?? 0} bytes).`,
);
if (dossierBytes > 1572864) throw new Error(`dossier ${dossierBytes} bytes exceeds the 1.5 MiB gate cap`);
