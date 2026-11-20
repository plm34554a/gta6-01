// Costa Azul: Wheelman — cars: one arcade physics step shared by the player,
// traffic and police; a lane-graph driver for traffic; a pursuit driver for the
// Costa Azul PD. Cars are plain objects: position, angle, speed, health, kind.

import { WORLD, CAR_TYPES, clamp } from './config.js';

let nextCarId = 1;

export function makeCar(typeIndex, color, x, y, angle, kind) {
  const type = CAR_TYPES[typeIndex % CAR_TYPES.length];
  return {
    id: nextCarId++,
    type, color, x, y, angle,
    speed: 0,
    kind,                       // 'traffic' | 'parked' | 'police' | 'target'
    health: type.health,
    maxHealth: type.health,
    disabled: false,
    route: null,                // traffic: {fromI, fromJ, toI, toJ, t}
    cruise: 118 + Math.random() * 46,
    honkAt: 0,
    sirenPhase: Math.random() * Math.PI * 2,
    lastImpact: 0,
  };
}

export function makePoliceCar(x, y, angle) {
  const car = makeCar(1, '#f4f6f7', x, y, angle, 'police');
  car.type = { name: 'Interceptor', topSpeed: 356, accel: 196, grip: 3.6, health: 165, length: 49, width: 22 };
  car.maxHealth = car.health = 165;
  return car;
}

const SURFACE_GRIP = { road: 1, pier: 0.9, land: 0.72, sand: 0.5 };

// One physics step. control = {throttle -1..1, steer -1..1, handbrake bool}.
// Returns the impact speed if the car struck a building this step, else 0.
export function stepCarPhysics(car, control, dt, city) {
  const surface = city.surfaceAt(car.x, car.y);
  const gripMul = SURFACE_GRIP[surface] ?? 0.8;
  const top = car.type.topSpeed * (surface === 'road' ? 1 : 0.62);

  if (control.throttle > 0) car.speed += car.type.accel * gripMul * control.throttle * dt;
  else if (control.throttle < 0) {
    if (car.speed > 12) car.speed -= 300 * dt;                    // brake
    else car.speed = Math.max(car.speed + car.type.accel * 0.55 * control.throttle * dt, -96); // reverse
  }
  // Rolling drag and top speed.
  car.speed -= car.speed * (control.handbrake ? 1.9 : 0.55) * dt;
  car.speed = clamp(car.speed, -110, top);
  if (Math.abs(car.speed) < 2 && control.throttle === 0) car.speed = 0;

  const speedFactor = clamp(Math.abs(car.speed) / 130, 0, 1.5);
  const turn = control.steer * car.type.grip * speedFactor * (control.handbrake ? 1.5 : 1);
  car.angle += turn * dt * (car.speed < 0 ? -1 : 1);

  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;

  // Building collision tested at the nose and tail.
  const hx = Math.cos(car.angle) * car.type.length * 0.42;
  const hy = Math.sin(car.angle) * car.type.length * 0.42;
  const r = car.type.width * 0.52;
  const nose = city.collideCircle(nx + hx, ny + hy, r);
  const tail = city.collideCircle(nx - hx, ny - hy, r);
  let impact = 0;
  if (nose.x !== nx + hx || nose.y !== ny + hy || tail.x !== nx - hx || tail.y !== ny - hy) {
    impact = Math.abs(car.speed);
    car.x = (nose.x + tail.x) / 2; car.y = (nose.y + tail.y) / 2;
    car.speed = impact > 60 ? -car.speed * 0.22 : 0;
    if (impact > 90) damageCar(car, (impact - 80) * 0.16);
  } else {
    car.x = nx; car.y = ny;
  }
  return impact;
}

export function damageCar(car, amount) {
  if (car.disabled) return;
  car.health -= amount;
  if (car.health <= 0) { car.health = 0; car.disabled = true; car.speed = 0; }
}

// ---- traffic ---------------------------------------------------------------
// Traffic follows the intersection graph in the right-hand lane of each edge.

export function startRoute(car, city, rand) {
  const i = nearestIndex(city.roadV, car.x), j = nearestIndex(city.roadH, car.y);
  car.x = city.roadV[i]; car.y = city.roadH[j];
  const options = neighbours(city, i, j, -1, -1);
  const [ti, tj] = options[(rand() * options.length) | 0];
  car.route = { fromI: i, fromJ: j, toI: ti, toJ: tj, t: 0 };
}

function neighbours(city, i, j, exceptI, exceptJ) {
  const out = [];
  if (i > 0) out.push([i - 1, j]);
  if (i < WORLD.cols) out.push([i + 1, j]);
  if (j > 0) out.push([i, j - 1]);
  if (j < WORLD.rows) out.push([i, j + 1]);
  const filtered = out.filter(([a, b]) => !(a === exceptI && b === exceptJ));
  return filtered.length ? filtered : out;
}

function nearestIndex(lines, v) {
  let best = 0, bd = Infinity;
  lines.forEach((c, idx) => { const d = Math.abs(c - v); if (d < bd) { bd = d; best = idx; } });
  return best;
}

// Returns a control object for this traffic car; `blockers` are cars (and the
// player's car) it must not rear-end.
export function trafficControl(car, city, blockers, dt, rand) {
  const r = car.route;
  if (!r) { startRoute(car, city, rand); return { throttle: 0, steer: 0, handbrake: false }; }
  const ax = city.roadV[r.fromI], ay = city.roadH[r.fromJ];
  const bx = city.roadV[r.toI], by = city.roadH[r.toJ];
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  // Right-hand lane: offset to the right of travel.
  const lane = WORLD.roadWidth / 4;
  const px = ax + ux * len * r.t - uy * lane;
  const py = ay + uy * len * r.t + ux * lane;
  car.x = px; car.y = py;
  const targetAngle = Math.atan2(uy, ux);
  car.angle += clampAngle(targetAngle - car.angle) * Math.min(1, dt * 7);

  let want = car.cruise;
  for (const other of blockers) {
    if (other === car) continue;
    const ox = other.x - car.x, oy = other.y - car.y;
    const ahead = ox * ux + oy * uy;
    const side = Math.abs(ox * -uy + oy * ux);
    if (ahead > 0 && ahead < 74 && side < 20) want = Math.min(want, ahead < 38 ? 0 : other.speed * 0.9);
  }
  car.speed = clamp(car.speed + clamp(want - car.speed, -260 * dt, 150 * dt), 0, car.type.topSpeed);
  r.t += (car.speed * dt) / len;
  if (r.t >= 1) {
    const [ni, nj] = neighbours(city, r.toI, r.toJ, r.fromI, r.fromJ)[(rand() * neighbours(city, r.toI, r.toJ, r.fromI, r.fromJ).length) | 0];
    car.route = { fromI: r.toI, fromJ: r.toJ, toI: ni, toJ: nj, t: 0 };
  }
  return null; // traffic moves itself; physics step is skipped for routed cars
}

// ---- police ------------------------------------------------------------------
// Pursuit: steer at the player's position, probe ahead for buildings and steer
// around them, and pull up alongside when the player is on foot.

export function policeControl(car, target, dt, city) {
  const dx = target.x - car.x, dy = target.y - car.y;
  const dist = Math.hypot(dx, dy);
  const desired = Math.atan2(dy, dx);

  // Building probe: if the way ahead is walled, bias the heading to slide round.
  let heading = desired;
  const probeX = car.x + Math.cos(car.angle) * 52, probeY = car.y + Math.sin(car.angle) * 52;
  const probe = city.collideCircle(probeX, probeY, 14);
  if (probe.x !== probeX || probe.y !== probeY) {
    const left = desired + 0.9, right = desired - 0.9;
    const lx = car.x + Math.cos(left) * 52, ly = car.y + Math.sin(left) * 52;
    const lp = city.collideCircle(lx, ly, 14);
    heading = (lp.x === lx && lp.y === ly) ? left : right;
  }

  const diff = clampAngle(heading - car.angle);
  const steer = clamp(diff * 2.4, -1, 1);
  let throttle = 1;
  if (target.onFoot && dist < 120) throttle = dist < 40 ? 0 : 0.45; // pull up to make the arrest
  if (Math.abs(diff) > 2.4 && dist < 90) throttle = -0.6;           // turn around when overshot
  return { throttle, steer, handbrake: Math.abs(diff) > 1.2 && car.speed > 150 };
}

export function clampAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
