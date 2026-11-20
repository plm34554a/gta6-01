// Costa Azul: Wheelman — the city of Costa Azul.
// Generates the street grid, blocks, buildings, parks, parking lots, the beach and
// marina, pre-renders the whole static world to one offscreen canvas, and answers
// the questions the rest of the game asks: what surface is this, does a circle hit
// a building, where is a random point on a road.

import { WORLD, PALETTE, makeRng } from './config.js';

const ROAD = WORLD.roadWidth;
const HALF = ROAD / 2;

// Landmark blocks by [blockCol, blockRow]: the story hangs off these places.
const LANDMARK_BLOCKS = {
  safehouse: { at: [0, 1], name: 'Azul Palms Apartments', short: 'HOME' },
  garage:    { at: [0, 4], name: 'Voss Auto Works',      short: 'VOSS AUTO' },
  bank:      { at: [4, 3], name: 'Costa Azul Bank',      short: 'BANK' },
  hotel:     { at: [8, 1], name: 'Hotel Del Mar',        short: 'HOTEL DEL MAR' },
  police:    { at: [5, 5], name: 'Costa Azul PD',        short: 'POLICE' },
  hospital:  { at: [2, 6], name: 'St. Lucia Hospital',   short: 'HOSPITAL' },
  armory:    { at: [6, 2], name: 'Sol Armory',           short: 'ARMORY' },
};

export function buildCity(seed) {
  const rng = makeRng(seed);
  const roadV = []; // x centrelines of vertical roads
  const roadH = []; // y centrelines of horizontal roads
  for (let i = 0; i <= WORLD.cols; i++) roadV.push(HALF + i * WORLD.blockPitch);
  for (let j = 0; j <= WORLD.rows; j++) roadH.push(HALF + j * WORLD.blockPitch);

  const buildings = [];   // {x,y,w,h,height,wall,roof,sign?}
  const blocks = [];      // {x,y,w,h,kind}
  const palms = [];       // {x,y,s}
  const parkingSpots = []; // {x,y,angle}
  const lamps = [];       // {x,y}

  const landmarkAt = new Map();
  for (const [key, def] of Object.entries(LANDMARK_BLOCKS)) landmarkAt.set(def.at.join(','), { key, ...def });

  for (let bi = 0; bi < WORLD.cols; bi++) {
    for (let bj = 0; bj < WORLD.rows; bj++) {
      const x = roadV[bi] + HALF, y = roadH[bj] + HALF;
      const w = WORLD.blockPitch - ROAD, h = WORLD.blockPitch - ROAD;
      const lm = landmarkAt.get(bi + ',' + bj);
      const downtown = bi >= 3 && bi <= 5 && bj >= 2 && bj <= 4;
      let kind = 'buildings';
      const roll = rng();
      if (lm) kind = 'landmark';
      else if (roll < 0.12) kind = 'park';
      else if (roll < 0.24) kind = 'parking';
      blocks.push({ x, y, w, h, kind });

      if (kind === 'park') {
        for (let k = 0; k < 7; k++) palms.push({ x: x + 24 + rng() * (w - 48), y: y + 24 + rng() * (h - 48), s: 0.8 + rng() * 0.5 });
        continue;
      }
      if (kind === 'parking') {
        for (let px = x + 30; px < x + w - 30; px += 34) {
          parkingSpots.push({ x: px, y: y + 36, angle: Math.PI / 2 });
          parkingSpots.push({ x: px, y: y + h - 36, angle: -Math.PI / 2 });
        }
        continue;
      }
      // Buildings: split the block into a small grid of plots with gutters.
      const nx = rng() < 0.45 ? 1 : 2;
      const nz = rng() < 0.45 ? 1 : 2;
      const gutter = 14, inset = 12;
      const pw = (w - inset * 2 - gutter * (nx - 1)) / nx;
      const ph = (h - inset * 2 - gutter * (nz - 1)) / nz;
      for (let ix = 0; ix < nx; ix++) {
        for (let iz = 0; iz < nz; iz++) {
          if (nx * nz > 1 && rng() < 0.14) continue; // a courtyard gap
          const bx = x + inset + ix * (pw + gutter) + (rng() * 6 - 3);
          const by = y + inset + iz * (ph + gutter) + (rng() * 6 - 3);
          const tall = downtown ? 62 + rng() * 70 : 20 + rng() * 44;
          buildings.push({
            x: bx, y: by, w: pw - (rng() * 8), h: ph - (rng() * 8),
            height: lm && ix === 0 && iz === 0 ? 34 : tall,
            wall: PALETTE.buildingWalls[(rng() * PALETTE.buildingWalls.length) | 0],
            roof: PALETTE.buildingRoofs[(rng() * PALETTE.buildingRoofs.length) | 0],
            sign: lm && ix === 0 && iz === 0 ? lm.short : null,
          });
        }
      }
      // Palms soften the sidewalk corners of ordinary blocks.
      if (rng() < 0.7) palms.push({ x: x + 14, y: y + 14, s: 0.9 });
      if (rng() < 0.7) palms.push({ x: x + w - 14, y: y + h - 14, s: 0.9 });
    }
  }

  // Beach palms and lamps along the avenues.
  for (let y = 60; y < WORLD.height - 40; y += 120 + rng() * 90) palms.push({ x: WORLD.beachX + 26 + rng() * 60, y, s: 1 + rng() * 0.5 });
  for (const vx of roadV) for (const hy of roadH) lamps.push({ x: vx + HALF + 6, y: hy + HALF + 6 });

  // Landmark marker points sit on the street in front of each place.
  const landmarks = {};
  for (const [key, def] of Object.entries(LANDMARK_BLOCKS)) {
    const [bi, bj] = def.at;
    landmarks[key] = {
      name: def.name,
      x: roadV[bi] + HALF + (WORLD.blockPitch - ROAD) / 2,
      y: roadH[bj + 1] + 0, // the road along the block's south side
    };
  }
  landmarks.marina = { name: 'Costa Azul Marina', x: WORLD.beachX + 96, y: roadH[5] };
  landmarks.pier = { name: 'Old Pier', x: WORLD.waterX + 96, y: roadH[5] };

  const city = {
    roadV, roadH, buildings, blocks, palms, lamps, parkingSpots, landmarks,
    staticCanvas: null,
    surfaceAt(x, y) {
      if (x >= WORLD.waterX) return isOnPier(x, y) ? 'pier' : 'water';
      if (x >= WORLD.beachX) return 'sand';
      for (const vx of roadV) if (Math.abs(x - vx) <= HALF) return 'road';
      for (const hy of roadH) if (Math.abs(y - hy) <= HALF) return 'road';
      return 'land';
    },
    collideCircle(x, y, r) {
      // Push a circle out of every building AABB and back inside the world.
      for (const b of buildings) {
        const nx = Math.max(b.x, Math.min(x, b.x + b.w));
        const ny = Math.max(b.y, Math.min(y, b.y + b.h));
        const dx = x - nx, dy = y - ny;
        const d2 = dx * dx + dy * dy;
        if (d2 < r * r) {
          if (d2 > 0.0001) { const d = Math.sqrt(d2); x = nx + (dx / d) * r; y = ny + (dy / d) * r; }
          else { // centre inside the box: push out through the nearest face
            const left = x - b.x, right = b.x + b.w - x, top = y - b.y, bot = b.y + b.h - y;
            const m = Math.min(left, right, top, bot);
            if (m === left) x = b.x - r; else if (m === right) x = b.x + b.w + r;
            else if (m === top) y = b.y - r; else y = b.y + b.h + r;
          }
        }
      }
      if (x > WORLD.waterX - r && !isOnPier(x, y)) x = Math.min(x, WORLD.waterX - r);
      x = Math.max(r, Math.min(WORLD.width - r, x));
      y = Math.max(r, Math.min(WORLD.height - r, y));
      return { x, y };
    },
    randomRoadPoint(rand) {
      if (rand() < 0.5) { const vx = roadV[(rand() * roadV.length) | 0]; return { x: vx, y: 40 + rand() * (WORLD.height - 80) }; }
      const hy = roadH[(rand() * roadH.length) | 0]; return { x: 40 + rand() * (WORLD.beachX - 80), y: hy };
    },
  };

  function isOnPier(x, y) {
    return x >= WORLD.beachX + 60 && x <= WORLD.waterX + 150 && Math.abs(y - roadH[5]) <= 30;
  }
  city.isOnPier = isOnPier;

  city.staticCanvas = prerender(city);
  return city;
}

// ---- static pre-render ----------------------------------------------------

function prerender(city) {
  const { roadV, roadH, buildings, blocks, palms, lamps } = city;
  const c = document.createElement('canvas');
  c.width = WORLD.width; c.height = WORLD.height;
  const g = c.getContext('2d');

  // Sea, sand, then the city's grass base.
  g.fillStyle = PALETTE.waterDeep; g.fillRect(WORLD.waterX, 0, WORLD.width - WORLD.waterX, WORLD.height);
  g.fillStyle = PALETTE.water; g.fillRect(WORLD.waterX + 26, 0, WORLD.width - WORLD.waterX - 26, WORLD.height);
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 3;
  for (let y = 30; y < WORLD.height; y += 74) {
    g.beginPath();
    for (let x = WORLD.waterX + 40; x < WORLD.width - 10; x += 26) g.lineTo(x, y + Math.sin(x * 0.05 + y) * 4);
    g.stroke();
  }
  g.fillStyle = PALETTE.sand; g.fillRect(WORLD.beachX, 0, WORLD.waterX - WORLD.beachX, WORLD.height);
  g.fillStyle = PALETTE.sandDark; g.fillRect(WORLD.beachX, 0, 10, WORLD.height);
  g.fillStyle = PALETTE.grass; g.fillRect(0, 0, WORLD.beachX, WORLD.height);

  // Block grounds.
  for (const b of blocks) {
    g.fillStyle = b.kind === 'park' ? PALETTE.grassDark : b.kind === 'parking' ? '#555a61' : PALETTE.sidewalk;
    g.fillRect(b.x, b.y, b.w, b.h);
    g.strokeStyle = PALETTE.curb; g.lineWidth = 3; g.strokeRect(b.x, b.y, b.w, b.h);
    if (b.kind === 'parking') {
      g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 2;
      for (let px = b.x + 14; px < b.x + b.w - 14; px += 34) {
        g.beginPath(); g.moveTo(px, b.y + 12); g.lineTo(px, b.y + 58); g.stroke();
        g.beginPath(); g.moveTo(px, b.y + b.h - 12); g.lineTo(px, b.y + b.h - 58); g.stroke();
      }
    }
  }

  // Roads: asphalt strips, edge lines, dashed centrelines, crosswalks.
  g.fillStyle = PALETTE.asphalt;
  for (const vx of roadV) g.fillRect(vx - HALF, 0, ROAD, WORLD.height);
  for (const hy of roadH) g.fillRect(0, hy - HALF, WORLD.beachX + 130, ROAD);
  g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 2;
  for (const vx of roadV) { line(g, vx - HALF + 3, 0, vx - HALF + 3, WORLD.height); line(g, vx + HALF - 3, 0, vx + HALF - 3, WORLD.height); }
  for (const hy of roadH) { line(g, 0, hy - HALF + 3, WORLD.beachX + 130, hy - HALF + 3); line(g, 0, hy + HALF - 3, WORLD.beachX + 130, hy + HALF - 3); }
  g.strokeStyle = PALETTE.laneLine; g.lineWidth = 3; g.setLineDash([22, 20]);
  for (const vx of roadV) line(g, vx, 0, vx, WORLD.height);
  for (const hy of roadH) line(g, 0, hy, WORLD.beachX + 130, hy);
  g.setLineDash([]);
  g.fillStyle = 'rgba(255,255,255,0.65)';
  for (const vx of roadV) for (const hy of roadH) {
    for (let s = -HALF + 6; s < HALF - 8; s += 11) g.fillRect(vx - HALF + 4, hy + s, 12, 6);
  }

  // Marina pier and moored boats.
  g.fillStyle = '#9a744e'; g.fillRect(WORLD.beachX + 60, roadH[5] - 30, WORLD.waterX - WORLD.beachX + 90, 60);
  g.strokeStyle = '#7c5a38'; g.lineWidth = 3;
  for (let x = WORLD.beachX + 74; x < WORLD.waterX + 140; x += 22) line(g, x, roadH[5] - 30, x, roadH[5] + 30);
  const boatCols = ['#ffffff', '#e74c3c', '#f7dc6f', '#85c1e9'];
  for (let i = 0; i < 7; i++) {
    const bx = WORLD.waterX + 40 + (i % 3) * 62, by = roadH[5] - 120 + Math.floor(i / 3) * 130;
    g.fillStyle = boatCols[i % boatCols.length];
    g.beginPath(); g.ellipse(bx, by, 26, 11, 0.4, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#5d6d7e'; g.fillRect(bx - 3, by - 16, 5, 18);
  }
  // Beach umbrellas.
  const umb = ['#ff6b81', '#feca57', '#48dbfb', '#ff9f43'];
  for (let i = 0; i < 16; i++) {
    const ux = WORLD.beachX + 40 + (i * 53) % 100, uy = 120 + i * 137;
    g.fillStyle = umb[i % umb.length];
    g.beginPath(); g.arc(ux, uy, 13, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.arc(ux + 5, uy + 6, 13, 0, Math.PI * 2); g.fill();
  }

  // Buildings: long shadow, extruded south wall, roof, details, signs.
  for (const b of buildings) {
    const lift = b.height * 0.52, lean = b.height * 0.16;
    g.fillStyle = 'rgba(30,40,20,0.28)';
    g.fillRect(b.x + 12, b.y + 16, b.w, b.h);
    g.fillStyle = shade(b.wall, -18); // south wall catches the shade side
    g.beginPath();
    g.moveTo(b.x, b.y + b.h); g.lineTo(b.x + b.w, b.y + b.h);
    g.lineTo(b.x + b.w - lean, b.y + b.h - lift); g.lineTo(b.x - lean, b.y + b.h - lift);
    g.closePath(); g.fill();
    g.fillStyle = shade(b.wall, -34); // east wall, darker
    g.beginPath();
    g.moveTo(b.x + b.w, b.y); g.lineTo(b.x + b.w, b.y + b.h);
    g.lineTo(b.x + b.w - lean, b.y + b.h - lift); g.lineTo(b.x + b.w - lean, b.y - lift);
    g.closePath(); g.fill();
    // Wall windows on the south face.
    g.fillStyle = 'rgba(255,236,170,0.85)';
    for (let wx = b.x + 8; wx < b.x + b.w - 10; wx += 15) for (let wy = 0; wy < lift - 8; wy += 13) {
      g.fillRect(wx - lean * (wy / Math.max(lift, 1)), b.y + b.h - 6 - wy, 6, 7);
    }
    // Roof.
    g.fillStyle = b.roof;
    g.fillRect(b.x - lean, b.y - lift, b.w, b.h);
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2; g.strokeRect(b.x - lean, b.y - lift, b.w, b.h);
    g.fillStyle = 'rgba(255,255,255,0.16)'; g.fillRect(b.x - lean + 8, b.y - lift + 8, Math.min(30, b.w - 16), Math.min(20, b.h - 16));
    if (b.sign) {
      g.font = 'bold 21px system-ui, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      const tw = g.measureText(b.sign).width + 18;
      g.fillStyle = '#123a4d';
      g.fillRect(b.x - lean + b.w / 2 - tw / 2, b.y - lift + b.h / 2 - 15, tw, 30);
      g.fillStyle = '#ffd94d';
      g.fillText(b.sign, b.x - lean + b.w / 2, b.y - lift + b.h / 2 + 1);
    }
  }

  // Palms and lamps sit above the ground but below the traffic.
  for (const p of palms) {
    g.fillStyle = 'rgba(0,0,0,0.20)';
    g.beginPath(); g.ellipse(p.x + 9, p.y + 11, 17 * p.s, 12 * p.s, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = PALETTE.palmTrunk; g.lineWidth = 4;
    line(g, p.x - 4, p.y + 6, p.x, p.y);
    g.fillStyle = PALETTE.palmLeaf;
    for (let a = 0; a < 6; a++) {
      const ang = (a / 6) * Math.PI * 2 + p.x * 0.01;
      g.beginPath(); g.ellipse(p.x + Math.cos(ang) * 11 * p.s, p.y + Math.sin(ang) * 8 * p.s, 12 * p.s, 5 * p.s, ang, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = PALETTE.palmLeafDark; g.beginPath(); g.arc(p.x, p.y, 5 * p.s, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = '#ffd94d';
  for (const l of lamps) { g.beginPath(); g.arc(l.x, l.y, 3, 0, Math.PI * 2); g.fill(); }

  return c;
}

function line(g, x1, y1, x2, y2) { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); }

// Darken a #rrggbb colour by amt (negative) — used for wall shading.
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const gg = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amt));
  const b = Math.max(0, Math.min(255, (n & 0xff) + amt));
  return `rgb(${r},${gg},${b})`;
}
