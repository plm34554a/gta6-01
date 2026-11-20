// Costa Azul: Wheelman — rendering. The static city is one pre-rendered canvas;
// each frame we blit the visible slice, then draw everything that moves: cars
// (with liveries, police light bars, damage smoke), pedestrians, the player,
// bullets, pickups, particles and the objective marker. Camera chases the
// player with a velocity look-ahead and eases its zoom out as speed builds.

import { WORLD, clamp, lerp } from './config.js';

export class Camera {
  constructor() { this.x = 0; this.y = 0; this.zoom = 1; this.shake = 0; }
  follow(target, dt, view) {
    const look = target.inCar ? 0.34 : 0.12;
    const tx = target.x + (target.vx || 0) * look;
    const ty = target.y + (target.vy || 0) * look;
    const k = 1 - Math.pow(0.0015, dt);
    this.x = lerp(this.x, tx, k);
    this.y = lerp(this.y, ty, k);
    const speedZoom = target.inCar ? clamp(1 - Math.abs(target.inCar.speed) / 2600, 0.78, 1) : 1;
    this.zoom = lerp(this.zoom, speedZoom, 1 - Math.pow(0.01, dt));
    this.shake = Math.max(0, this.shake - dt * 26);
    const vw = view.w / this.zoom, vh = view.h / this.zoom;
    this.x = clamp(this.x, vw / 2 - 60, WORLD.width - vw / 2 + 60);
    this.y = clamp(this.y, vh / 2 - 60, WORLD.height - vh / 2 + 60);
  }
  // Screen-space origin of the world view (before zoom).
  origin(view) {
    const sx = (Math.random() - 0.5) * this.shake, sy = (Math.random() - 0.5) * this.shake;
    return { x: this.x - view.w / (2 * this.zoom) + sx, y: this.y - view.h / (2 * this.zoom) + sy };
  }
}

export function drawScene(g, game, view) {
  const { city, camera } = game;
  const o = camera.origin(view);
  g.save();
  g.scale(camera.zoom, camera.zoom);
  g.translate(-o.x, -o.y);

  // Static city slice.
  g.drawImage(city.staticCanvas, 0, 0);

  // Objective and mission-start markers pulse on the ground.
  const obj = game.objective;
  if (obj && obj.x != null) {
    const pulse = 1 + Math.sin(game.now * 4) * 0.12;
    g.strokeStyle = game.missionActive ? '#ffd94d' : '#39d0ff';
    g.lineWidth = 5;
    g.beginPath(); g.arc(obj.x, obj.y, 30 * pulse, 0, Math.PI * 2); g.stroke();
    g.fillStyle = game.missionActive ? 'rgba(255,217,77,0.16)' : 'rgba(57,208,255,0.14)';
    g.beginPath(); g.arc(obj.x, obj.y, 30 * pulse, 0, Math.PI * 2); g.fill();
  }
  if (game.holdProgress > 0) {
    g.strokeStyle = '#ffffff'; g.lineWidth = 6;
    g.beginPath(); g.arc(obj.x, obj.y, 40, -Math.PI / 2, -Math.PI / 2 + game.holdProgress * Math.PI * 2); g.stroke();
  }

  // Cash and ammo pickups bob and glow.
  for (const p of game.pickups) {
    const bob = Math.sin(game.now * 3 + p.phase) * 3;
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.beginPath(); g.ellipse(p.x, p.y + 8, 12, 5, 0, 0, Math.PI * 2); g.fill();
    if (p.kind === 'cash') {
      g.fillStyle = '#27ae60'; g.fillRect(p.x - 10, p.y - 6 + bob, 20, 12);
      g.fillStyle = '#abebc6'; g.fillRect(p.x - 10, p.y - 2 + bob, 20, 3);
      g.fillStyle = '#145a32'; g.font = 'bold 10px system-ui'; g.textAlign = 'center';
      g.fillText('$', p.x, p.y + 3 + bob);
    } else {
      g.fillStyle = '#7d3c98'; g.fillRect(p.x - 9, p.y - 7 + bob, 18, 14);
      g.fillStyle = '#f4ecf7'; g.font = 'bold 9px system-ui'; g.textAlign = 'center';
      g.fillText('AMMO', p.x, p.y + 3 + bob);
    }
  }

  for (const ped of game.peds) drawPed(g, ped, game.now);
  for (const car of game.cars) drawCar(g, car, game);
  if (!game.player.inCar) drawPlayer(g, game.player, game.now);

  // Bullets as short bright tracers.
  g.strokeStyle = '#ffeaa7'; g.lineWidth = 3; g.lineCap = 'round';
  for (const b of game.bullets) {
    g.beginPath(); g.moveTo(b.x - b.vx * 0.016, b.y - b.vy * 0.016); g.lineTo(b.x, b.y); g.stroke();
  }

  // Particles (smoke, sparks, dust, muzzle flashes).
  for (const fx of game.effects) {
    const a = clamp(fx.life / fx.maxLife, 0, 1);
    g.globalAlpha = a * (fx.alpha ?? 0.8);
    g.fillStyle = fx.color;
    g.beginPath(); g.arc(fx.x, fx.y, fx.size * (fx.grow ? (1.6 - a * 0.6) : 1), 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;
  g.restore();

  // Warm sunset vignette over the whole frame.
  const grad = g.createRadialGradient(view.w / 2, view.h / 2, view.h * 0.42, view.w / 2, view.h / 2, view.h * 0.95);
  grad.addColorStop(0, 'rgba(255,150,60,0)');
  grad.addColorStop(1, 'rgba(80,20,60,0.28)');
  g.fillStyle = grad;
  g.fillRect(0, 0, view.w, view.h);
}

function drawCar(g, car, game) {
  const { length: L, width: W } = car.type;
  g.save();
  g.translate(car.x, car.y);
  // Shadow first, unrotated-ish offset toward the sun's opposite.
  g.fillStyle = 'rgba(20,20,30,0.30)';
  g.beginPath(); g.ellipse(5, 7, L * 0.52, W * 0.62, car.angle, 0, Math.PI * 2); g.fill();
  g.rotate(car.angle);

  const isPolice = car.kind === 'police';
  const isTaxi = car.type.name === 'Taxi Sol';
  g.fillStyle = isPolice ? '#f4f6f7' : car.color;
  roundRect(g, -L / 2, -W / 2, L, W, 6); g.fill();
  if (isPolice) { g.fillStyle = '#1b2a4a'; roundRect(g, -L * 0.18, -W / 2, L * 0.4, W, 4); g.fill(); }
  if (isTaxi) { g.fillStyle = '#f7b731'; roundRect(g, -L * 0.1, -W / 2, L * 0.2, W, 3); g.fill(); }
  // Cabin and glass.
  g.fillStyle = '#1d2b3a';
  roundRect(g, -L * 0.16, -W * 0.38, L * 0.34, W * 0.76, 4); g.fill();
  g.fillStyle = 'rgba(140,210,255,0.75)';
  roundRect(g, L * 0.13, -W * 0.34, L * 0.08, W * 0.68, 3); g.fill(); // windshield
  // Headlights and tail lights.
  g.fillStyle = '#fff7ae';
  g.fillRect(L / 2 - 3, -W / 2 + 2, 3, 5); g.fillRect(L / 2 - 3, W / 2 - 7, 3, 5);
  g.fillStyle = '#ff3838';
  g.fillRect(-L / 2, -W / 2 + 2, 3, 5); g.fillRect(-L / 2, W / 2 - 7, 3, 5);
  // Wheels.
  g.fillStyle = '#14161a';
  for (const [wx, wy] of [[-L * 0.32, -W / 2 - 1], [L * 0.32, -W / 2 - 1], [-L * 0.32, W / 2 - 3], [L * 0.32, W / 2 - 3]]) {
    g.fillRect(wx - 5, wy, 10, 4);
  }
  if (isPolice) {
    // Light bar: red/blue strobes alternate with time.
    const on = Math.sin(game.now * 14 + car.sirenPhase) > 0;
    g.fillStyle = on ? '#ff2d2d' : '#5a1010'; g.fillRect(-8, -W / 2 + 2, 7, W - 4);
    g.fillStyle = on ? '#2255ff' : '#101d5a'; g.fillRect(1, -W / 2 + 2, 7, W - 4);
    if (game.now % 0.5 < 0.25) {
      g.globalAlpha = 0.10; g.fillStyle = on ? '#ff2d2d' : '#2255ff';
      g.beginPath(); g.arc(0, 0, 60, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
    }
  }
  g.restore();

  // Damage smoke drifts from a wrecked engine.
  if (car.health < car.maxHealth * 0.45 && Math.random() < 0.3) {
    game.effects.push({
      x: car.x + Math.cos(car.angle) * L * 0.4, y: car.y + Math.sin(car.angle) * L * 0.4,
      vx: 8 - Math.random() * 16, vy: -22 - Math.random() * 14,
      life: 0.9, maxLife: 0.9, size: 7 + Math.random() * 6,
      color: car.disabled ? '#2d3436' : '#636e72', grow: true, alpha: 0.5,
    });
  }
  // A floating tag marks the mission car.
  if (car.kind === 'target') {
    const bob = Math.sin(game.now * 5) * 4;
    g.fillStyle = '#ffd94d';
    g.beginPath();
    g.moveTo(car.x, car.y - 34 + bob); g.lineTo(car.x - 8, car.y - 46 + bob); g.lineTo(car.x + 8, car.y - 46 + bob);
    g.closePath(); g.fill();
  }
}

function drawPed(g, ped, now) {
  g.save();
  g.translate(ped.x, ped.y);
  g.fillStyle = 'rgba(20,20,30,0.25)';
  g.beginPath(); g.ellipse(2, 4, 8, 5, 0, 0, Math.PI * 2); g.fill();
  if (ped.dead) {
    g.rotate(ped.angle + Math.PI / 2);
    g.fillStyle = ped.shirt; roundRect(g, -5, -11, 10, 22, 5); g.fill();
    g.fillStyle = ped.skin; g.beginPath(); g.arc(0, -14, 5, 0, Math.PI * 2); g.fill();
    g.restore();
    return;
  }
  const bob = Math.sin(ped.walkPhase) * 1.6;
  g.rotate(ped.angle + Math.PI / 2);
  g.fillStyle = ped.pants;
  g.fillRect(-5, 2 + bob * 0.4, 4, 8); g.fillRect(1, 2 - bob * 0.4, 4, 8); // legs
  g.fillStyle = ped.shirt; roundRect(g, -6, -6, 12, 12, 5); g.fill();      // torso
  g.fillStyle = ped.skin; g.beginPath(); g.arc(0, -9, 5, 0, Math.PI * 2); g.fill(); // head
  g.restore();
}

function drawPlayer(g, player, now) {
  g.save();
  g.translate(player.x, player.y);
  g.fillStyle = 'rgba(20,20,30,0.3)';
  g.beginPath(); g.ellipse(2, 4, 9, 6, 0, 0, Math.PI * 2); g.fill();
  // Aim line and pistol toward the mouse.
  g.rotate(player.aimAngle);
  g.strokeStyle = '#14161a'; g.lineWidth = 4; g.lineCap = 'round';
  g.beginPath(); g.moveTo(6, 3); g.lineTo(17, 3); g.stroke();
  g.restore();
  g.save();
  g.translate(player.x, player.y);
  const bob = player.moving ? Math.sin(player.walkPhase) * 1.6 : 0;
  g.rotate(player.angle + Math.PI / 2);
  g.fillStyle = '#2d3436';
  g.fillRect(-5, 2 + bob * 0.4, 4, 8); g.fillRect(1, 2 - bob * 0.4, 4, 8);
  g.fillStyle = '#e84118'; roundRect(g, -6.5, -6, 13, 13, 5); g.fill(); // Marco's coral jacket
  g.fillStyle = '#f1c27d'; g.beginPath(); g.arc(0, -9, 5.2, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#20242a'; g.beginPath(); g.arc(0, -10.5, 5.2, Math.PI, Math.PI * 2); g.fill(); // hair
  g.restore();
}

export function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
