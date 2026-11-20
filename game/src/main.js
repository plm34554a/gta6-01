// Costa Azul: Wheelman — the game itself. Owns the world state and the frame
// loop: player on foot and behind the wheel, traffic, the wanted system and the
// Costa Azul PD, collisions, pickups, missions, saving, menus and sound.
// Rendering lives in render.js, the HUD in hud.js, the story in missions.js.

import { WORLD, TUNING, CAR_COLORS, clamp } from './config.js';
import { buildCity } from './city.js';
import { SoundFX } from './audio.js';
import { Input } from './input.js';
import { makeCar, makePoliceCar, stepCarPhysics, damageCar, trafficControl, startRoute, policeControl } from './vehicles.js';
import { makePlayer, makePedestrian, updatePedestrian, scarePeds, spawnBullet, updateBullets } from './people.js';
import { MissionDirector } from './missions.js';
import { Camera, drawScene } from './render.js';
import { Hud } from './hud.js';
import { stageShotIfRequested } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const view = { w: 0, h: 0 };
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  view.w = window.innerWidth; view.h = window.innerHeight;
  canvas.width = view.w * dpr; canvas.height = view.h * dpr;
  canvas.dataset.dpr = dpr;
}
window.addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------------------

const G = {
  mode: 'menu', // menu | playing | paused | busted | wasted
  now: 0,
  city: buildCity(7),
  player: null,
  cars: [], peds: [], bullets: [], effects: [], pickups: [],
  heat: 0, stars: 0, lastCrimeAt: -99,
  camera: new Camera(),
  sfx: new SoundFX(),
  input: new Input(canvas),
  hud: new Hud(),
  director: null,
  objective: null, missionActive: false, missionTimer: null, holdProgress: 0, bustedProgress: 0,
  reloading: false,
  policeTimer: 0, saveTimer: 0, earned: 0,
  rand: Math.random,
};
G.player = makePlayer(G.city.landmarks.safehouse.x, G.city.landmarks.safehouse.y - 46);

const hooks = {
  toast: (t, b) => { G.hud.toast(t, b); document.getElementById('status').textContent = t + ' ' + b; },
  phone: (text) => { G.sfx.phoneRing(); G.hud.phone(text); },
  addCash: (n) => { G.player.cash += n; G.earned += n; G.sfx.cash(); },
  addHeat: (n) => addHeat(n),
  spawnMissionCar: (kind) => spawnMissionCar(kind),
  sfx: G.sfx,
};
G.director = new MissionDirector(hooks);

function addHeat(n) {
  G.heat = clamp(G.heat + n, 0, 150);
  G.lastCrimeAt = G.now;
}
function starsForHeat(h) { return h <= 0 ? 0 : h < 18 ? 1 : h < 40 ? 2 : h < 68 ? 3 : h < 96 ? 4 : 5; }

// ---- world population --------------------------------------------------------

function spawnInitialWorld() {
  const { city } = G;
  const spots = [...city.parkingSpots];
  for (let i = spots.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0;[spots[i], spots[j]] = [spots[j], spots[i]]; }
  for (let i = 0; i < TUNING.parkedCarCount && i < spots.length; i++) {
    const s = spots[i];
    G.cars.push(makeCar((Math.random() * 6) | 0, CAR_COLORS[(Math.random() * CAR_COLORS.length) | 0], s.x, s.y, s.angle, 'parked'));
  }
  for (let i = 0; i < TUNING.trafficCount; i++) {
    const p = city.randomRoadPoint(Math.random);
    const car = makeCar((Math.random() * 6) | 0, CAR_COLORS[(Math.random() * CAR_COLORS.length) | 0], p.x, p.y, 0, 'traffic');
    startRoute(car, city, Math.random);
    G.cars.push(car);
  }
  for (let i = 0; i < TUNING.pedestrianCount; i++) {
    const p = sidewalkSpawn();
    G.peds.push(makePedestrian(p.x, p.y, Math.random));
  }
  const L = city.landmarks;
  const defs = [
    { kind: 'cash', x: L.marina.x + 30, y: L.marina.y - 44 }, { kind: 'cash', x: L.pier.x, y: L.pier.y },
    { kind: 'cash', x: L.hotel.x - 60, y: L.hotel.y + 30 }, { kind: 'cash', x: WORLD.beachX + 70, y: 300 },
    { kind: 'ammo', x: L.armory.x, y: L.armory.y + 26 }, { kind: 'ammo', x: L.garage.x + 56, y: L.garage.y + 24 },
    { kind: 'ammo', x: L.hospital.x - 50, y: L.hospital.y + 24 },
  ];
  G.pickups = defs.map((d) => ({ ...d, active: true, respawnAt: 0, phase: Math.random() * 6 }));
}

function sidewalkSpawn() {
  const { city } = G;
  if (Math.random() < 0.5) {
    const vx = city.roadV[(Math.random() * city.roadV.length) | 0];
    return { x: vx + (Math.random() < 0.5 ? -47 : 47), y: 40 + Math.random() * (WORLD.height - 80) };
  }
  const hy = city.roadH[(Math.random() * city.roadH.length) | 0];
  return { x: 40 + Math.random() * (WORLD.beachX - 80), y: hy + (Math.random() < 0.5 ? -47 : 47) };
}

function spawnMissionCar(kind) {
  const { city } = G;
  let car;
  if (kind === 'cometa') {
    const h = city.landmarks.hotel;
    car = makeCar(4, '#f7b731', h.x - 24, h.y, 0, 'target'); // the gold Cometa GT at the hotel
  } else {
    const p = city.randomRoadPoint(Math.random);
    car = makeCar(0, '#d63031', p.x, p.y, 0, 'target');      // the Ferro crew's red Palmera
    startRoute(car, city, Math.random);
  }
  G.cars.push(car);
  return car;
}

function removeCar(car) {
  const i = G.cars.indexOf(car);
  if (i >= 0) G.cars.splice(i, 1);
}
G.removeCar = removeCar;
G.onMissionComplete = () => saveGame();
G.onMissionFail = () => {};

// ---- save / load ---------------------------------------------------------------

function saveGame() {
  try {
    localStorage.setItem(TUNING.saveKey, JSON.stringify({
      cash: G.player.cash, idx: G.director.index, storyDone: G.director.storyDone,
      x: G.player.x, y: G.player.y, earned: G.earned,
    }));
  } catch { /* storage unavailable */ }
}
function loadSave() {
  try { return JSON.parse(localStorage.getItem(TUNING.saveKey)); } catch { return null; }
}

// ---- player ---------------------------------------------------------------------

function nearestCarForEntry() {
  let best = null, bd = Infinity;
  for (const car of G.cars) {
    if (car.disabled) continue;
    const d = Math.hypot(car.x - G.player.x, car.y - G.player.y);
    if (d < TUNING.interactRange + car.type.length * 0.4 && d < bd) { bd = d; best = car; }
  }
  return best;
}

function enterCar(car) {
  const p = G.player;
  if (car.kind === 'traffic') {
    // The driver bails out and runs.
    const ped = makePedestrian(car.x + 16, car.y + 10, Math.random);
    ped.fleeUntil = G.now + 3; ped.fleeFrom = { x: car.x, y: car.y };
    G.peds.push(ped);
    car.kind = 'parked'; car.route = null;
  }
  if (!car.everStolen) {
    car.everStolen = true;
    const witnessed = G.cars.some((c) => c.kind === 'police' && Math.hypot(c.x - p.x, c.y - p.y) < 320) ||
      G.peds.some((pd) => Math.hypot(pd.x - p.x, pd.y - p.y) < 130);
    if (witnessed) { addHeat(20); hooks.toast('Car stolen!', 'Someone saw that.'); }
  }
  car.playerDriven = true;
  p.inCar = car;
  G.sfx.doorSlam();
}

function exitCar() {
  const p = G.player, car = p.inCar;
  if (!car) return;
  car.playerDriven = false;
  if (car.kind === 'traffic') car.kind = 'parked';
  const side = car.angle + Math.PI / 2;
  const spot = G.city.collideCircle(car.x - Math.cos(side) * (car.type.width / 2 + 16), car.y - Math.sin(side) * (car.type.width / 2 + 16), TUNING.playerRadius);
  p.x = spot.x; p.y = spot.y;
  p.inCar = null;
  G.sfx.doorSlam();
}

function updatePlayer(dt) {
  const p = G.player, input = G.input, city = G.city;
  const prevX = p.x, prevY = p.y;

  if (p.inCar) {
    const car = p.inCar;
    const control = {
      throttle: (input.down('KeyW', 'ArrowUp') ? 1 : 0) + (input.down('KeyS', 'ArrowDown') ? -1 : 0),
      steer: (input.down('KeyA', 'ArrowLeft') ? -1 : 0) + (input.down('KeyD', 'ArrowRight') ? 1 : 0),
      handbrake: input.down('Space'),
    };
    const impact = stepCarPhysics(car, control, dt, city);
    if (impact > 150) {
      G.camera.shake = Math.min(14, impact * 0.05);
      G.sfx.hitCar();
      hurtPlayer((impact - 140) * 0.05);
      if (G.cars.some((c) => c.kind === 'police' && Math.hypot(c.x - car.x, c.y - car.y) < 300)) addHeat(8);
    }
    if (control.handbrake && Math.abs(car.speed) > 160 && Math.random() < 0.3) G.sfx.screech();
    p.x = car.x; p.y = car.y; p.angle = car.angle;
    if (car.disabled && !car.ejected) {
      car.ejected = true;
      hurtPlayer(22);
      hooks.toast('Car wrecked!', 'Your ride is done. Get out and run!');
      exitCar();
    }
    if (input.justPressed('KeyE', 'KeyF')) exitCar();
  } else {
    // On foot: WASD movement, mouse aim.
    let mx = (input.down('KeyD', 'ArrowRight') ? 1 : 0) - (input.down('KeyA', 'ArrowLeft') ? 1 : 0);
    let my = (input.down('KeyS', 'ArrowDown') ? 1 : 0) - (input.down('KeyW', 'ArrowUp') ? 1 : 0);
    const mag = Math.hypot(mx, my) || 1;
    const sprint = input.down('ShiftLeft', 'ShiftRight');
    const speed = sprint ? TUNING.playerSprintSpeed : TUNING.playerWalkSpeed;
    p.moving = mx !== 0 || my !== 0;
    if (p.moving) {
      p.x += (mx / mag) * speed * dt;
      p.y += (my / mag) * speed * dt;
      p.walkPhase += dt * (sprint ? 12 : 9);
      const fixed = city.collideCircle(p.x, p.y, TUNING.playerRadius);
      p.x = fixed.x; p.y = fixed.y;
    }
    const o = G.camera.origin(view);
    const wx = o.x + input.mouseX / G.camera.zoom, wy = o.y + input.mouseY / G.camera.zoom;
    p.aimAngle = Math.atan2(wy - p.y, wx - p.x);
    p.angle = p.aimAngle;

    if (input.justPressed('KeyE', 'KeyF')) {
      const car = nearestCarForEntry();
      if (car && Math.abs(car.speed) < 46) enterCar(car);
      else if (car) hooks.toast('Too fast!', 'That car is moving — wait for it to stop.');
    }
    updateShooting(dt);
  }

  p.vx = dt > 0 ? (p.x - prevX) / dt : 0;
  p.vy = dt > 0 ? (p.y - prevY) / dt : 0;

  // Pickups.
  for (const pk of G.pickups) {
    if (!pk.active) { if (G.now > pk.respawnAt) pk.active = true; else continue; }
    if (Math.hypot(pk.x - p.x, pk.y - p.y) < 30) {
      pk.active = false; pk.respawnAt = G.now + 40;
      if (pk.kind === 'cash') { const n = 120 + ((Math.random() * 200) | 0); p.cash += n; hooks.toast('Cash found', '+$' + n); G.sfx.pickup(); }
      else { p.reserve += 48; hooks.toast('Ammo', '+48 rounds'); G.sfx.pickup(); }
    }
  }
}

function updateShooting(dt) {
  const p = G.player, input = G.input;
  G.reloading = p.reloadingUntil > G.now;
  if (G.reloading && p.reloadingUntil <= G.now + dt && p.reloadingUntil > G.now - dt) { /* finishing this frame */ }
  if (p.reloadingUntil && G.now >= p.reloadingUntil) {
    const take = Math.min(TUNING.pistolMag - p.mag, p.reserve);
    p.mag += take; p.reserve -= take; p.reloadingUntil = 0;
  }
  if (input.justPressed('KeyR') && p.mag < TUNING.pistolMag && p.reserve > 0 && !p.reloadingUntil) {
    p.reloadingUntil = G.now + TUNING.pistolReloadTime; G.sfx.reload();
  }
  if (!input.mouseDown || p.reloadingUntil) return;
  if (G.now - p.lastShotAt < TUNING.pistolFireDelay) return;
  if (p.mag <= 0) {
    G.sfx.dryFire();
    p.lastShotAt = G.now;
    if (p.reserve > 0) { p.reloadingUntil = G.now + TUNING.pistolReloadTime; G.sfx.reload(); }
    return;
  }
  p.lastShotAt = G.now;
  p.mag--;
  spawnBullet(G.bullets, p.x + Math.cos(p.aimAngle) * 18, p.y + Math.sin(p.aimAngle) * 18, p.aimAngle + (Math.random() - 0.5) * 0.03, true);
  G.effects.push({ x: p.x + Math.cos(p.aimAngle) * 22, y: p.y + Math.sin(p.aimAngle) * 22, vx: 0, vy: 0, life: 0.06, maxLife: 0.06, size: 7, color: '#ffd94d' });
  G.sfx.gunshot();
  scarePeds(G.peds, p.x, p.y, 240, G.now);
  if (G.cars.some((c) => c.kind === 'police' && Math.hypot(c.x - p.x, c.y - p.y) < 340)) addHeat(7);
}

function hurtPlayer(n) {
  const p = G.player;
  if (G.mode !== 'playing') return;
  p.health -= n;
  const hurt = document.getElementById('hurt');
  hurt.style.opacity = clamp(n / 22, 0.25, 0.95);
  setTimeout(() => { hurt.style.opacity = 0; }, 130);
  if (p.health <= 0) { p.health = 0; endRun('wasted'); }
}

// ---- traffic, police, collisions -------------------------------------------------

function updateCars(dt) {
  const p = G.player;
  const blockers = G.cars;
  for (const car of G.cars) {
    if (car.playerDriven || car.disabled) continue;
    if (car.kind === 'traffic' || (car.kind === 'target' && car.route)) {
      trafficControl(car, G.city, blockers, dt, Math.random);
    } else if (car.kind === 'police') {
      const control = policeControl(car, { x: p.x, y: p.y, onFoot: !p.inCar }, dt, G.city);
      const impact = stepCarPhysics(car, control, dt, G.city);
      if (impact > 170) damageCar(car, 4);
    }
  }
  updateCarCollisions(dt);
  updateCarPedCollisions(dt);
}

function updateCarCollisions(dt) {
  const cars = G.cars;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const minD = (a.type.length + b.type.length) * 0.36;
      const d2 = dx * dx + dy * dy;
      if (d2 > minD * minD || d2 === 0) continue;
      const d = Math.sqrt(d2), ux = dx / d, uy = dy / d, push = (minD - d) / 2;
      if (!a.playerDriven && a.kind !== 'traffic') { a.x -= ux * push; a.y -= uy * push; }
      if (!b.playerDriven && b.kind !== 'traffic') { b.x += ux * push; b.y += uy * push; }
      const closing = Math.abs(a.speed - b.speed) + Math.abs(a.speed) * 0.3;
      if (closing > 105 && G.now - (a.lastImpact || 0) > 0.4) {
        a.lastImpact = b.lastImpact = G.now;
        const dmg = (closing - 90) * 0.11;
        damageCar(a, dmg); damageCar(b, dmg);
        const playerInvolved = a.playerDriven || b.playerDriven;
        if (playerInvolved) {
          G.camera.shake = Math.min(16, closing * 0.06);
          G.sfx.hitCar();
          hurtPlayer((closing - 100) * 0.045);
          const other = a.playerDriven ? b : a;
          if (other.kind === 'police') addHeat(16);
          else if (G.cars.some((c) => c.kind === 'police' && Math.hypot(c.x - G.player.x, c.y - G.player.y) < 380)) addHeat(6);
        }
      }
      const swap = (a.speed + b.speed) / 2;
      if (!a.disabled) a.speed = swap * 0.7;
      if (!b.disabled) b.speed = swap * 0.7;
    }
  }
}

function updateCarPedCollisions(dt) {
  for (const car of G.cars) {
    if (Math.abs(car.speed) < 66) continue;
    for (const ped of G.peds) {
      if (ped.dead) continue;
      if (Math.hypot(ped.x - car.x, ped.y - car.y) < car.type.length * 0.52) {
        killPed(ped, car);
      }
    }
    // Running down the player on foot.
    const p = G.player;
    if (!p.inCar && car !== p.inCar && Math.hypot(p.x - car.x, p.y - car.y) < car.type.length * 0.52) {
      if (G.now - (car.lastHitPlayerAt || 0) > 0.8) {
        car.lastHitPlayerAt = G.now;
        hurtPlayer(car.kind === 'police' ? 13 : 17);
        const away = Math.atan2(p.y - car.y, p.x - car.x);
        const spot = G.city.collideCircle(p.x + Math.cos(away) * 30, p.y + Math.sin(away) * 30, TUNING.playerRadius);
        p.x = spot.x; p.y = spot.y;
        G.camera.shake = 8;
      }
    }
  }
}

function killPed(ped, byCar) {
  ped.dead = true; ped.downAt = G.now;
  G.effects.push({ x: ped.x, y: ped.y, vx: 0, vy: -6, life: 0.7, maxLife: 0.7, size: 12, color: '#8d2f39', grow: true, alpha: 0.55 });
  G.sfx.hitPerson();
  scarePeds(G.peds, ped.x, ped.y, 260, G.now);
  if (byCar.playerDriven) {
    addHeat(46);
    hooks.toast('You hit someone!', 'The whole street saw it. Run!');
  }
}

function updatePolice(dt) {
  G.stars = starsForHeat(G.heat);
  const p = G.player;
  // Decay heat while unseen.
  const nearestPolice = Math.min(...G.cars.filter((c) => c.kind === 'police').map((c) => Math.hypot(c.x - p.x, c.y - p.y)), Infinity);
  if (nearestPolice > 430 && G.now - G.lastCrimeAt > 3) G.heat = Math.max(0, G.heat - TUNING.heatDecayPerSecond * dt);

  const police = G.cars.filter((c) => c.kind === 'police');
  if (G.stars === 0) {
    for (const c of police) { c.kind = 'traffic'; startRoute(c, G.city, Math.random); }
  } else {
    const desired = Math.min(1 + G.stars, 6);
    G.policeTimer -= dt;
    if (police.length < desired && G.policeTimer <= 0) {
      G.policeTimer = 2.2;
      for (let tries = 0; tries < 8; tries++) {
        const spot = G.city.randomRoadPoint(Math.random);
        const d = Math.hypot(spot.x - p.x, spot.y - p.y);
        if (d > 620 && d < 980) {
          const car = makePoliceCar(spot.x, spot.y, Math.atan2(p.y - spot.y, p.x - spot.x));
          G.cars.push(car);
          break;
        }
      }
    }
  }
  // Despawn far-away units and clean wrecks.
  for (let i = G.cars.length - 1; i >= 0; i--) {
    const c = G.cars[i];
    if (c.kind === 'police' && Math.hypot(c.x - p.x, c.y - p.y) > 1600) G.cars.splice(i, 1);
  }

  // Busted: standing next to a unit, on foot or in a wreck.
  const vulnerable = !p.inCar || p.inCar.disabled;
  if (G.stars > 0 && vulnerable && nearestPolice < 54) {
    p.bustedProgress += dt / TUNING.bustedTime;
    if (p.bustedProgress >= 1) { endRun('busted'); return; }
  } else p.bustedProgress = Math.max(0, p.bustedProgress - dt * 1.6);
  G.bustedProgress = p.bustedProgress;

  // Siren loudness follows the nearest unit.
  G.sfx.setSiren(G.stars > 0 ? clamp(1 - nearestPolice / 720, 0, 1) : 0);
}

// ---- run lifecycle ---------------------------------------------------------------

function endRun(kind) {
  if (G.mode !== 'playing') return;
  G.mode = kind;
  G.sfx.setEngine(null); G.sfx.setSiren(0);
  const title = document.getElementById('end-title');
  const text = document.getElementById('end-text');
  title.textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
  title.className = 'bigverdict ' + kind;
  if (kind === 'busted') {
    const fine = Math.min(G.player.cash, 150 + ((G.player.cash * 0.1) | 0));
    G.player.cash -= fine;
    text.textContent = `The Costa Azul PD got you. Bail and fines cost you $${fine}. Delia is not impressed.`;
    G.sfx.bustedJingle();
  } else {
    const bill = Math.min(G.player.cash, 200);
    G.player.cash -= bill;
    text.textContent = `St. Lucia Hospital patched you up for $${bill}. The street is still out there.`;
    G.sfx.wastedJingle();
  }
  if (G.director.active) G.director.fail(G, kind === 'busted' ? 'You got busted.' : 'You got wasted.');
  document.getElementById('end').classList.remove('hidden');
  saveGame();
}

function respawn() {
  const h = G.city.landmarks.hospital;
  const p = G.player;
  if (p.inCar) { p.inCar.playerDriven = false; p.inCar = null; }
  p.x = h.x; p.y = h.y + 10;
  p.health = TUNING.playerMaxHealth;
  p.bustedProgress = 0;
  G.heat = 0; G.stars = 0;
  for (let i = G.cars.length - 1; i >= 0; i--) if (G.cars[i].kind === 'police') G.cars.splice(i, 1);
  document.getElementById('end').classList.add('hidden');
  G.mode = 'playing';
  saveGame();
}

function startGame(continueSave) {
  G.sfx.unlock();
  if (continueSave) {
    const s = loadSave();
    if (s) {
      G.player.cash = s.cash; G.earned = s.earned || 0;
      G.director.index = s.idx || 0; G.director.storyDone = !!s.storyDone;
      G.player.x = s.x; G.player.y = s.y;
    }
  } else {
    G.director.index = 0; G.director.storyDone = false;
    G.player = makePlayer(G.city.landmarks.safehouse.x, G.city.landmarks.safehouse.y - 46);
    G.earned = 0;
  }
  document.getElementById('menu').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  G.mode = 'playing';
  hooks.toast('Costa Azul', G.director.storyDone ? 'Free roam — the city is yours.' : 'Head to Voss Auto Works for your first job.');
}

// ---- frame loop ---------------------------------------------------------------------

function update(dt) {
  G.now += dt;
  if (G.mode === 'menu') {
    // The city lives behind the title: traffic flows, people stroll.
    for (const car of G.cars) if (car.kind === 'traffic') trafficControl(car, G.city, G.cars, dt, Math.random);
    for (const ped of G.peds) updatePedestrian(ped, dt, { city: G.city, now: G.now, rand: Math.random });
    G.camera.x = WORLD.width / 2 + Math.sin(G.now * 0.045) * 620;
    G.camera.y = WORLD.height / 2 + Math.cos(G.now * 0.03) * 330;
    G.camera.zoom = 0.82;
    return;
  }
  if (G.mode !== 'playing') return;

  G.director.tryStart(G.player, G.city);
  updatePlayer(dt);
  updateCars(dt);
  for (const ped of G.peds) updatePedestrian(ped, dt, { city: G.city, now: G.now, rand: Math.random });
  for (let i = G.peds.length - 1; i >= 0; i--) if (G.peds[i].dead && G.now - G.peds[i].downAt > 24) G.peds.splice(i, 1);
  updateBullets(G.bullets, dt, {
    city: G.city, peds: G.peds, cars: G.cars, playerCar: G.player.inCar,
    onPedHit: (ped) => { if (!ped.dead) { killPed(ped, { playerDriven: true }); addHeat(14); } },
    onCarHit: (car) => {
      damageCar(car, 9);
      if (car.kind === 'police') addHeat(15);
      G.effects.push({ x: car.x, y: car.y, vx: 0, vy: 0, life: 0.12, maxLife: 0.12, size: 9, color: '#ffeaa7' });
    },
  });
  updatePolice(dt);
  if (G.mode !== 'playing') return; // busted mid-frame
  G.director.update(dt, G);
  G.objective = G.director.objective(G.city);
  G.missionActive = !!G.director.active;
  G.missionTimer = G.director.active ? G.director.active.timer : null;
  G.holdProgress = G.director.active ? (G.director.active.holdProgress || 0) : 0;

  for (let i = G.effects.length - 1; i >= 0; i--) {
    const fx = G.effects[i];
    fx.x += fx.vx * dt; fx.y += fx.vy * dt; fx.life -= dt;
    if (fx.life <= 0) G.effects.splice(i, 1);
  }

  // Engine note follows the player's car.
  const pc = G.player.inCar;
  G.sfx.setEngine(pc ? clamp(Math.abs(pc.speed) / pc.type.topSpeed, 0, 1) : null, pc && G.input.down('KeyW', 'ArrowUp') ? 1 : 0.35);

  // Interact prompt.
  const near = !pc && nearestCarForEntry();
  const prompt = document.getElementById('hud-interact');
  if (near) {
    prompt.classList.remove('hidden');
    document.getElementById('hud-interact-text').textContent = near.kind === 'target' ? 'Steal the car' : 'Get in ' + near.type.name;
  } else prompt.classList.add('hidden');

  G.camera.follow({ x: G.player.x, y: G.player.y, vx: G.player.vx, vy: G.player.vy, inCar: pc }, dt, view);
  G.saveTimer -= dt;
  if (G.saveTimer <= 0) { G.saveTimer = 10; saveGame(); }
}

function frame(tms) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.033, (tms - (frame.last || tms)) / 1000);
  frame.last = tms;
  const dpr = Number(canvas.dataset.dpr || 1);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#14607f';
  ctx.fillRect(0, 0, view.w, view.h);

  if (G.input.justPressed('KeyP', 'Escape') && (G.mode === 'playing' || G.mode === 'paused')) {
    G.mode = G.mode === 'playing' ? 'paused' : 'playing';
    document.getElementById('pause').classList.toggle('hidden', G.mode !== 'paused');
  }
  if (G.input.justPressed('KeyM')) { G.sfx.unlock(); G.sfx.setMuted(!G.sfx.muted); hooks.toast(G.sfx.muted ? 'Sound off' : 'Sound on'); }

  update(dt);
  drawScene(ctx, G, view);
  if (G.mode === 'playing' || G.mode === 'paused') G.hud.update(dt, G);
  G.input.endFrame();
}

// ---- boot ---------------------------------------------------------------------------

spawnInitialWorld();
G.objective = G.director.objective(G.city);
G.camera.x = G.player.x; G.camera.y = G.player.y;

const save = loadSave();
if (save && (save.idx > 0 || save.storyDone || save.cash > 250)) document.getElementById('btn-continue').classList.remove('hidden');
document.getElementById('btn-new').addEventListener('click', () => startGame(false));
document.getElementById('btn-continue').addEventListener('click', () => startGame(true));
document.getElementById('btn-resume').addEventListener('click', () => {
  G.mode = 'playing';
  document.getElementById('pause').classList.add('hidden');
});
document.getElementById('btn-quit').addEventListener('click', () => location.reload());
document.getElementById('btn-respawn').addEventListener('click', respawn);

stageShotIfRequested(G, { startGame });
requestAnimationFrame(frame);
