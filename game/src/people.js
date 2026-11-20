// Costa Azul: Wheelman — people: the player character record, pedestrians who
// wander the sidewalks and flee from danger, and the bullets that fly between
// them. The player's own movement and shooting live in main.js; this module owns
// everyone else.

import { TUNING, clamp } from './config.js';

const SHIRTS = ['#ff6b81', '#feca57', '#48dbfb', '#1dd1a1', '#f368e0', '#ff9f43', '#c8d6e5', '#fd79a8', '#eccc68', '#7bed9f'];
const PANTS = ['#2f3542', '#57606f', '#ffffff', '#3742fa', '#6c5ce7', '#b2bec3'];

export function makePlayer(x, y) {
  return {
    x, y,
    angle: -Math.PI / 2,     // facing
    aimAngle: -Math.PI / 2,  // toward the mouse
    health: TUNING.playerMaxHealth,
    cash: 250,
    mag: TUNING.pistolMag,
    reserve: 96,
    reloadingUntil: 0,
    lastShotAt: 0,
    inCar: null,             // the car object being driven, or null on foot
    bustedProgress: 0,
    walkPhase: 0,
    moving: false,
  };
}

export function makePedestrian(x, y, rand) {
  return {
    x, y,
    angle: rand() * Math.PI * 2,
    speed: 52 + rand() * 30,
    target: null,
    fleeUntil: 0,
    fleeFrom: { x: 0, y: 0 },
    dead: false,
    downAt: 0,
    walkPhase: rand() * 6,
    shirt: SHIRTS[(rand() * SHIRTS.length) | 0],
    pants: PANTS[(rand() * PANTS.length) | 0],
    skin: ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'][(rand() * 5) | 0],
  };
}

// A point on a sidewalk: just off a random road centreline.
function sidewalkPoint(city, rand) {
  const off = (WORLD_HALF_ROAD + 9) * (rand() < 0.5 ? -1 : 1);
  if (rand() < 0.5) {
    const vx = city.roadV[(rand() * city.roadV.length) | 0];
    return { x: vx + off, y: 30 + rand() * 2300 };
  }
  const hy = city.roadH[(rand() * city.roadH.length) | 0];
  return { x: 30 + rand() * 2900, y: hy + off };
}
const WORLD_HALF_ROAD = 38;

export function updatePedestrian(ped, dt, ctx) {
  if (ped.dead) return;
  const now = ctx.now;
  ped.walkPhase += dt * (ped.fleeUntil > now ? 13 : 7);

  let tx, ty, speed;
  if (ped.fleeUntil > now) {
    tx = ped.x + (ped.x - ped.fleeFrom.x);
    ty = ped.y + (ped.y - ped.fleeFrom.y);
    speed = 168;
  } else {
    if (!ped.target || Math.hypot(ped.target.x - ped.x, ped.target.y - ped.y) < 14) {
      ped.target = sidewalkPoint(ctx.city, ctx.rand);
    }
    tx = ped.target.x; ty = ped.target.y;
    speed = ped.speed;
  }
  const dx = tx - ped.x, dy = ty - ped.y;
  const d = Math.hypot(dx, dy) || 1;
  const want = Math.atan2(dy, dx);
  let diff = want - ped.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  ped.angle += clamp(diff, -6 * dt, 6 * dt);
  ped.x += Math.cos(ped.angle) * speed * dt;
  ped.y += Math.sin(ped.angle) * speed * dt;
  const fixed = ctx.city.collideCircle(ped.x, ped.y, 9);
  ped.x = fixed.x; ped.y = fixed.y;
}

export function scarePeds(peds, x, y, radius, now) {
  for (const ped of peds) {
    if (ped.dead) continue;
    if (Math.hypot(ped.x - x, ped.y - y) < radius) {
      ped.fleeUntil = now + 2.2;
      ped.fleeFrom = { x, y };
    }
  }
}

// ---- bullets -----------------------------------------------------------------

export function spawnBullet(list, x, y, angle, fromPlayer) {
  list.push({
    x, y,
    vx: Math.cos(angle) * TUNING.bulletSpeed,
    vy: Math.sin(angle) * TUNING.bulletSpeed,
    travelled: 0,
    fromPlayer,
    dead: false,
  });
}

// ctx callbacks: onPedHit(ped, bullet), onCarHit(car, bullet), onPlayerHit(bullet)
export function updateBullets(list, dt, ctx) {
  for (const b of list) {
    const stepX = b.vx * dt, stepY = b.vy * dt;
    b.x += stepX; b.y += stepY;
    b.travelled += Math.hypot(stepX, stepY);
    if (b.travelled > TUNING.bulletRange) { b.dead = true; continue; }
    // Buildings stop bullets.
    const probe = ctx.city.collideCircle(b.x, b.y, 2);
    if (probe.x !== b.x || probe.y !== b.y) { b.dead = true; continue; }

    if (b.fromPlayer) {
      for (const ped of ctx.peds) {
        if (ped.dead) continue;
        if (Math.hypot(ped.x - b.x, ped.y - b.y) < 11) { b.dead = true; ctx.onPedHit(ped, b); break; }
      }
      if (b.dead) continue;
      for (const car of ctx.cars) {
        if (car === ctx.playerCar) continue;
        if (Math.abs(car.x - b.x) < car.type.length / 2 && Math.abs(car.y - b.y) < car.type.length / 2 &&
            Math.hypot(car.x - b.x, car.y - b.y) < car.type.length * 0.52) {
          b.dead = true; ctx.onCarHit(car, b); break;
        }
      }
    }
  }
  for (let i = list.length - 1; i >= 0; i--) if (list[i].dead) list.splice(i, 1);
}
