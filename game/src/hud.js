// Costa Azul: Wheelman — the HUD. DOM panels for cash, wanted stars, health,
// weapon and the current objective; a toast feed for events; Delia's phone
// messages for the story; and the minimap: a canvas that redraws the streets,
// the sea, and every blip that matters around the player, every frame.

import { WORLD, clamp } from './config.js';

export class Hud {
  constructor() {
    this.el = {};
    for (const id of ['cash', 'stars', 'healthfill', 'weapon', 'objective', 'mission', 'speed', 'timer', 'district']) {
      this.el[id] = document.getElementById('hud-' + id);
    }
    this.toastBox = document.getElementById('toasts');
    this.phoneBox = document.getElementById('phone');
    this.phoneText = document.getElementById('phone-text');
    this.phoneUntil = 0;
    this.clock = 0;
    this.map = document.getElementById('minimap').getContext('2d');
    this.lastObjective = '';
  }

  toast(title, body = '', ms = 3400) {
    const div = document.createElement('div');
    div.className = 'toast';
    div.innerHTML = `<strong></strong><span></span>`;
    div.querySelector('strong').textContent = title;
    div.querySelector('span').textContent = body;
    this.toastBox.appendChild(div);
    setTimeout(() => div.classList.add('show'));
    setTimeout(() => { div.classList.remove('show'); setTimeout(() => div.remove(), 400); }, ms);
    while (this.toastBox.children.length > 3) this.toastBox.firstChild.remove();
  }

  phone(text, ms = 7000) {
    this.phoneText.textContent = text;
    this.phoneBox.classList.add('show');
    this.phoneUntil = this.clock + ms / 1000;
  }

  update(dt, game) {
    this.clock += dt;
    if (this.phoneUntil && this.clock > this.phoneUntil) {
      this.phoneBox.classList.remove('show');
      this.phoneUntil = 0;
    }
    const p = game.player;
    this.el.cash.textContent = '$' + p.cash.toLocaleString('en-US');
    this.el.stars.textContent = '★'.repeat(game.stars) + '☆'.repeat(5 - game.stars);
    this.el.stars.classList.toggle('hot', game.stars >= 3);
    this.el.healthfill.style.width = clamp(p.health, 0, 100) + '%';
    this.el.healthfill.style.background = p.health < 30 ? '#e84118' : '#2ed573';
    this.el.weapon.textContent = p.inCar
      ? (p.inCar.type.name + ' · ' + Math.round(Math.abs(p.inCar.speed) * 0.36) + ' km/h')
      : (game.reloading ? 'RELOADING…' : `PISTOL ${p.mag}/${p.reserve}`);
    this.el.speed.textContent = p.inCar ? Math.round(Math.abs(p.inCar.speed) * 0.36) + '' : '';
    const obj = game.objective;
    if (obj) {
      const dist = obj.x != null ? ` — ${Math.round(Math.hypot(p.x - obj.x, p.y - obj.y) / 10)}m` : '';
      const text = obj.text + dist;
      if (text !== this.lastObjective) { this.el.objective.textContent = text; this.lastObjective = text; }
      this.el.mission.textContent = obj.mission ? 'JOB · ' + obj.mission.toUpperCase() : 'COSTA AZUL';
      if (obj.step?.kind === 'holdout' && game.holdProgress > 0) {
        this.el.timer.textContent = 'GRABBING CASH… ' + Math.ceil(obj.step.time - game.holdProgress) + 's';
      } else if (obj.step?.kind === 'timedGoto' && game.missionTimer != null) {
        this.el.timer.textContent = '⏱ ' + Math.max(0, Math.ceil(game.missionTimer)) + 's';
      } else if (game.bustedProgress > 0.05) {
        this.el.timer.textContent = 'THE POLICE ARE ON YOU — MOVE!';
      } else this.el.timer.textContent = '';
    }
    this.el.district.textContent = districtName(game.city, p.x, p.y);
    this.drawMinimap(game);
  }

  drawMinimap(game) {
    const g = this.map;
    const S = 196, R = 760; // canvas size, world radius shown
    const { city, player } = game;
    const scale = S / (R * 2);
    const px = (x) => (x - player.x) * scale + S / 2;
    const py = (y) => (y - player.y) * scale + S / 2;

    g.fillStyle = '#0d2b3a'; g.fillRect(0, 0, S, S);
    g.fillStyle = '#123f2c';
    g.fillRect(px(0), py(0), WORLD.beachX * scale, WORLD.height * scale);
    g.fillStyle = '#c9a959'; g.fillRect(px(WORLD.beachX), py(0), (WORLD.waterX - WORLD.beachX) * scale, WORLD.height * scale);
    g.fillStyle = '#14607f'; g.fillRect(px(WORLD.waterX), py(0), (WORLD.width - WORLD.waterX) * scale, WORLD.height * scale);

    g.strokeStyle = 'rgba(230,230,220,0.75)'; g.lineWidth = Math.max(2, WORLD.roadWidth * scale * 0.7);
    for (const vx of city.roadV) { g.beginPath(); g.moveTo(px(vx), py(0)); g.lineTo(px(vx), py(WORLD.height)); g.stroke(); }
    for (const hy of city.roadH) { g.beginPath(); g.moveTo(px(0), hy * scale - player.y * scale + S / 2); g.lineTo(px(WORLD.beachX + 130), py(hy)); g.stroke(); }

    const dot = (x, y, color, r) => { g.fillStyle = color; g.beginPath(); g.arc(px(x), py(y), r, 0, Math.PI * 2); g.fill(); };
    for (const car of game.cars) {
      if (Math.abs(car.x - player.x) > R || Math.abs(car.y - player.y) > R) continue;
      if (car.kind === 'police') dot(car.x, car.y, (game.now * 2 | 0) % 2 ? '#3fa9ff' : '#ff5252', 3.4);
      else if (car.kind === 'target') dot(car.x, car.y, '#ff3838', 3.6);
      else dot(car.x, car.y, 'rgba(220,220,220,0.7)', 2.2);
    }
    const obj = game.objective;
    if (obj && obj.x != null) {
      const cx = clamp(px(obj.x), 10, S - 10), cy = clamp(py(obj.y), 10, S - 10);
      g.fillStyle = '#ffd94d';
      g.beginPath(); g.arc(cx, cy, 5 + Math.sin(game.now * 5) * 1.4, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#000'; g.lineWidth = 1.4; g.stroke();
    }
    // Player arrow at the centre, turned to facing.
    g.save();
    g.translate(S / 2, S / 2);
    g.rotate((player.inCar ? player.inCar.angle : player.angle) + Math.PI / 2);
    g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(0, -7); g.lineTo(5, 6); g.lineTo(0, 3); g.lineTo(-5, 6); g.closePath(); g.fill();
    g.strokeStyle = '#000'; g.lineWidth = 1.2; g.stroke();
    g.restore();
  }
}

function districtName(city, x, y) {
  if (x >= 3028) return 'MARINA & BEACH';
  const col = Math.round(x / 328), row = Math.round(y / 328);
  if (col >= 3 && col <= 5 && row >= 2 && row <= 4) return 'DOWNTOWN';
  if (row <= 1) return 'PALM HEIGHTS';
  if (col <= 1) return 'WESTSIDE';
  if (row >= 6) return 'SOUTH DOCKS';
  return 'COSTA AZUL';
}
