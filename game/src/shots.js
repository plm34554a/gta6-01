// Costa Azul: Wheelman — screenshot staging. With ?shot=<name> in the URL the
// game skips the title screen and arranges a real, playable scene for the
// screenshots in shots.json: the same code paths as normal play, posed.
//   drive   — midday cruise downtown with traffic around the player
//   chase   — three-star pursuit, mission objective on the HUD
//   foot    — on foot in a busy street scene by the Hotel Del Mar
//   mission — the bank score: cash grabbed, escape to the pier under four stars

import { makeCar, makePoliceCar, startRoute } from './vehicles.js';
import { makePedestrian } from './people.js';
import { MISSION_DEFS } from './missions.js';

export function stageShotIfRequested(G, { startGame }) {
  const params = new URLSearchParams(location.search);
  const shot = params.get('shot');
  if (!shot) return false;

  startGame(false);
  document.getElementById('toasts').innerHTML = ''; // the welcome toast would contradict the posed scene
  const { city, player } = G;
  const L = city.landmarks;
  const place = (car, x, y, angle, speed = 0) => { car.x = x; car.y = y; car.angle = angle; car.speed = speed; return car; };
  // Clear ambient actors out of the posed area so nothing crashes the scene.
  const clearAround = (x, y, carR, pedR) => {
    for (let i = G.cars.length - 1; i >= 0; i--) {
      if (Math.hypot(G.cars[i].x - x, G.cars[i].y - y) < carR) G.cars.splice(i, 1);
    }
    for (let i = G.peds.length - 1; i >= 0; i--) {
      if (Math.hypot(G.peds[i].x - x, G.peds[i].y - y) < pedR) G.peds.splice(i, 1);
    }
  };

  if (shot === 'drive' || shot === 'chase') {
    // Put Marco in a Solano downtown, mid-block on a horizontal avenue.
    const y = city.roadH[3];
    const ax = city.roadV[4] + 120, ay = y - 19;
    clearAround(ax, ay, 300, 230);
    const car = place(makeCar(1, shot === 'chase' ? '#3498db' : '#e84118', ax, ay, 0, 'parked'), ax, ay, 0, shot === 'chase' ? 172 : 218);
    G.cars.push(car);
    player.inCar = car; car.playerDriven = true; car.everStolen = true;
    player.x = car.x; player.y = car.y;
    // Traffic on the same avenue: one car far ahead, an oncoming taxi, one behind.
    G.cars.push(place(makeCar(0, '#e74c3c', ax + 430, ay, 0, 0), ax + 430, ay, 0, 0));
    G.cars.push(place(makeCar(5, '#f7b731', ax + 300, y + 19, Math.PI, 0), ax + 300, y + 19, Math.PI, 0));
    G.cars.push(place(makeCar(3, '#2ecc71', ax - 210, ay, 0, 0), ax - 210, ay, 0, 0));
    for (let i = 0; i < 6; i++) {
      const ped = makePedestrian(ax - 150 + i * 58, y - 54, Math.random);
      G.peds.push(ped);
    }
    G.camera.x = car.x; G.camera.y = car.y;
  }

  if (shot === 'drive') {
    G.director.index = 1; // "Special Delivery" is next
    G.objective = G.director.objective(city);
    player.cash = 1050;
  }

  if (shot === 'chase') {
    const car = player.inCar;
    G.heat = 58; G.lastCrimeAt = G.now;
    for (let i = 0; i < 3; i++) {
      const cop = makePoliceCar(car.x - 120 - i * 78, car.y + (i % 2 ? 15 : -13), 0.08 * (i - 1));
      cop.speed = 176;
      G.cars.push(cop);
    }
    // Pose the delivery job as the active mission, on its timed step.
    G.director.index = 1;
    G.director.active = { def: MISSION_DEFS[1], stepIndex: 1, timer: 96, targetCar: null, holdProgress: 0 };
    player.cash = 2300;
  }

  if (shot === 'foot') {
    player.x = L.hotel.x - 30; player.y = L.hotel.y - 30;
    player.angle = 0.4; player.aimAngle = 0.4;
    for (let i = 0; i < 9; i++) {
      const ped = makePedestrian(player.x - 130 + i * 34, player.y - 26 + (i % 3) * 30, Math.random);
      G.peds.push(ped);
    }
    G.cars.push(place(makeCar(5, '#f7b731', player.x + 60, L.hotel.y - 19, 0, 96), player.x + 60, L.hotel.y - 19, 0, 96));
    G.cars.push(place(makeCar(2, '#fd79a8', player.x - 170, L.hotel.y + 19, Math.PI, 88), player.x - 170, L.hotel.y + 19, Math.PI, 88));
    G.director.index = 0;
    G.director.active = { def: MISSION_DEFS[0], stepIndex: 0, timer: 0, targetCar: null, holdProgress: 0 };
    G.camera.x = player.x; G.camera.y = player.y;
    player.cash = 250;
  }

  if (shot === 'mission') {
    player.x = L.bank.x; player.y = L.bank.y - 6;
    player.angle = Math.PI / 2; player.aimAngle = Math.PI / 2;
    G.heat = 92; G.lastCrimeAt = G.now;
    for (let i = 0; i < 3; i++) {
      const cop = makePoliceCar(player.x - 210 + i * 60, L.bank.y - 150 - (i % 2) * 40, Math.PI / 2.4);
      G.cars.push(cop);
    }
    G.cars.push(place(makeCar(4, '#f7b731', player.x + 90, L.bank.y - 19, 0, 0), player.x + 90, L.bank.y - 19, 0, 0));
    for (let i = 0; i < 5; i++) G.peds.push(makePedestrian(player.x - 90 + i * 42, player.y + 44, Math.random));
    G.director.index = 4;
    G.director.active = { def: MISSION_DEFS[4], stepIndex: 2, timer: 0, targetCar: null, holdProgress: 0 };
    G.camera.x = player.x; G.camera.y = player.y - 30;
    player.cash = 9000;
  }

  // Freeze the posed actors the frame the screenshot is taken: traffic keeps
  // rolling in drive/chase, but staged speeds are set so one warm-up second
  // settles everyone into natural places.
  setTimeout(() => { window.__shotReady = shot; }, 550);
  return true;
}
