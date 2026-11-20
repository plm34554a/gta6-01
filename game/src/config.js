// Costa Azul: Wheelman — shared tuning constants and the sun-soaked palette.
// Every module imports from here so the whole game can be rebalanced in one place.

export const WORLD = {
  width: 3400,          // px, includes the beach and water strip on the east edge
  height: 2372,         // px
  roadWidth: 76,        // full asphalt width of every street
  blockPitch: 328,      // distance between neighbouring road centrelines
  cols: 9,              // vertical roads are cols+1, indexed 0..cols
  rows: 7,              // horizontal roads are rows+1, indexed 0..rows
  beachX: 3028,         // x where the sand starts
  waterX: 3178,         // x where the sea starts
};

export const TUNING = {
  playerWalkSpeed: 158,
  playerSprintSpeed: 242,
  playerRadius: 11,
  playerMaxHealth: 100,
  interactRange: 46,          // how close to a car door the player must be to get in
  bulletSpeed: 760,
  bulletRange: 480,
  pistolMag: 12,
  pistolReloadTime: 1.1,
  pistolFireDelay: 0.21,
  trafficCount: 24,
  pedestrianCount: 46,
  parkedCarCount: 34,
  heatDecayPerSecond: 2.6,    // wanted heat lost while out of police sight
  bustedTime: 1.7,            // seconds standing next to a police car before arrest
  saveKey: 'costa-azul-wheelman-v1',
};

export const PALETTE = {
  grass: '#79b657',
  grassDark: '#6aa84c',
  sand: '#f2d98c',
  sandDark: '#e8cc74',
  water: '#2fa8c9',
  waterDeep: '#1f8fb5',
  asphalt: '#3d4148',
  asphaltEdge: '#2f3237',
  laneLine: '#f7e9a0',
  sidewalk: '#cfc8b8',
  curb: '#b3ab97',
  plaza: '#ddd3ba',
  buildingWalls: ['#f6e3c1', '#f9d5a7', '#f3b8a0', '#cfe8d8', '#bfe0ea', '#f7c9d4', '#efe6f2', '#ffe9a8'],
  buildingRoofs: ['#c96f4a', '#b85c48', '#8a7f72', '#5d8a96', '#7a6a9e', '#4f7d6a', '#a8546e', '#776655'],
  palmTrunk: '#8a6a48',
  palmLeaf: '#3e9e4f',
  palmLeafDark: '#2f7d3e',
};

export const CAR_TYPES = [
  { name: 'Palmera Coupe',  topSpeed: 342, accel: 178, grip: 3.4, health: 110, length: 46, width: 21, value: 1 },
  { name: 'Solano Sedan',   topSpeed: 288, accel: 142, grip: 3.0, health: 130, length: 48, width: 22, value: 1 },
  { name: 'Brisa Hatch',    topSpeed: 252, accel: 132, grip: 3.1, health: 100, length: 40, width: 20, value: 1 },
  { name: 'Duna Pickup',    topSpeed: 262, accel: 126, grip: 2.7, health: 170, length: 52, width: 23, value: 1 },
  { name: 'Cometa GT',      topSpeed: 408, accel: 224, grip: 3.8, health: 95,  length: 47, width: 21, value: 3 },
  { name: 'Taxi Sol',       topSpeed: 276, accel: 138, grip: 3.0, health: 125, length: 48, width: 22, value: 1 },
];

export const CAR_COLORS = ['#e74c3c', '#f39c12', '#f7f1e1', '#3498db', '#2ecc71', '#9b59b6', '#fd79a8', '#95a5a6', '#e67e22', '#1abc9c', '#dfe6e9', '#636e72'];

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
export function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
// Deterministic RNG (mulberry32) so staged screenshot scenes and the city are stable.
export function makeRng(seed) {
  let s = seed >>> 0;
  return function rng() {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
