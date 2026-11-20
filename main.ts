// Costa Azul: Wheelman — hand-in program (Node 22, standard library only).
//
// The game itself is the static site in game/: an open-world crime game that a
// desktop browser runs offline from those files alone. This program's whole job
// is to package a run: copy game/ and screenshots/ into the output directory
// and write dossier.json there with the kit's buildDossier, so the sealed
// scorer sees exactly the bytes this repository holds.
//
// Run it the way the grader does (fresh container, repo read-only at /bot,
// writable /output), or locally with MAKEFUN_OUTPUT_DIR standing in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Play the game itself with `node serve.ts` (http://localhost:8080).

import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoDir = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The gate's caps, mirrored here so a bad hand-in fails loudly at packaging
// time instead of quietly at scoring time.
const CAPS = {
  text_max_bytes: 163840,                    // dossier text view: 160 KiB
  screenshots: { max: 4, max_bytes: 262144 }, // at most 4 shots, 256 KiB each
  game_max_files: 993,                        // files + directories under game/
  game_max_bytes: 50331648,                   // 48 MiB of game/
  game_path_max_bytes: 1000,                  // longest path under game/
};

function refuse(message: string): never {
  throw new Error(`costa-azul hand-in refused: ${message}`);
}

// Sanity-check the two inputs before copying anything.
const shotNames = existsSync(join(repoDir, 'screenshots'))
  ? readdirSync(join(repoDir, 'screenshots')).filter((n) => !n.startsWith('.'))
  : [];
if (shotNames.length < 3 || shotNames.length > CAPS.screenshots.max) {
  refuse(`screenshots/ holds ${shotNames.length} files; the entry needs 3 or 4`);
}
if (!existsSync(join(repoDir, 'game', 'index.html'))) {
  refuse('game/index.html is missing; there is no game to hand in');
}

mkdirSync(outDir, { recursive: true });
cpSync(join(repoDir, 'game'), join(outDir, 'game'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
cpSync(join(repoDir, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });

// buildDossier reads the copied tree back and writes the summary the judge
// reads: screenshots, the Game block, and the game's own sources in load order.
writeFileSync(join(outDir, 'dossier.json'), buildDossier(outDir, CAPS));
