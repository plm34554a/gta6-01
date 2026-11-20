// Costa Azul: Wheelman — the story: five jobs for fixer Delia Voss, told as a
// data-driven chain of objective steps (go here, steal that, lose the heat...).
// The MissionDirector owns the chain's state; main.js feeds it the world each
// frame and reads back the current objective for the HUD and minimap.

export const MISSION_DEFS = [
  {
    id: 'hot-wheels',
    title: 'Hot Wheels',
    reward: 800,
    intro: 'Delia: Marco, a guest at the Hotel Del Mar left his Cometa GT unlocked. Bring it to my garage — quietly, if you can.',
    outro: 'Delia: Clean work. The owner gets an insurance payout, we get a car. Everybody wins.',
    steps: [
      { kind: 'goto', at: 'hotel', text: 'Go to the Hotel Del Mar' },
      { kind: 'enterTarget', text: 'Steal the Cometa GT (press E beside it)' },
      { kind: 'deliverCar', at: 'garage', text: 'Deliver the Cometa to Voss Auto Works' },
    ],
  },
  {
    id: 'special-delivery',
    title: 'Special Delivery',
    reward: 1500,
    intro: 'Delia: A package is waiting at the marina. Pick it up and take it to the bank alley — fast, and do not stop for anyone.',
    outro: 'Delia: Right on time. The client pays extra for no questions asked.',
    steps: [
      { kind: 'goto', at: 'marina', text: 'Pick up the package at the Marina' },
      { kind: 'timedGoto', at: 'bank', time: 150, heat: 55, text: 'Deliver the package to the bank alley' },
    ],
  },
  {
    id: 'cool-off',
    title: 'Cool Off',
    reward: 1200,
    intro: 'Delia: The last job left heat all over the garage. Draw the patrols away, lose them, then lie low at your place.',
    outro: 'Delia: The street is quiet again. You are a ghost, Marco.',
    steps: [
      { kind: 'evade', heat: 58, text: 'Lose the police (reach zero stars)' },
      { kind: 'goto', at: 'safehouse', text: 'Lie low at Azul Palms Apartments' },
    ],
  },
  {
    id: 'rival-colors',
    title: 'Rival Colors',
    reward: 2000,
    intro: 'Delia: The Ferro crew is cruising my streets in a red Palmera, showing off. Wreck it. Ram it, shoot it — just stop it.',
    outro: 'Delia: The Ferros will think twice before cruising Costa Azul again.',
    steps: [
      { kind: 'disableTarget', text: 'Wreck the Ferro crew car (red Palmera)' },
      { kind: 'goto', at: 'garage', text: 'Return to Voss Auto Works' },
    ],
  },
  {
    id: 'the-azul-score',
    title: 'The Azul Score',
    reward: 7500,
    intro: 'Delia: One last job, Marco. The Costa Azul Bank, midday. Walk in, take the cash, and be on the pier before the city knows your name.',
    outro: 'Delia: That is the score of a lifetime. Costa Azul is yours now, Marco.',
    steps: [
      { kind: 'goto', at: 'bank', text: 'Go to the Costa Azul Bank' },
      { kind: 'holdout', at: 'bank', time: 8, onFoot: true, text: 'Grab the cash — stay in the circle' },
      { kind: 'escapeTo', at: 'pier', heat: 92, text: 'Escape to the Old Pier!' },
    ],
  },
];

export class MissionDirector {
  // hooks: {toast(title, body), phone(text), addCash(n), addHeat(n), spawnMissionCar(defIndex), sfx}
  constructor(hooks) {
    this.hooks = hooks;
    this.index = 0;          // next mission to run
    this.active = null;      // {def, stepIndex, timer, targetCar}
    this.storyDone = false;
  }

  get currentDef() { return this.active ? this.active.def : null; }

  objective(city) {
    if (this.active) {
      const step = this.active.def.steps[this.active.stepIndex];
      const point = this.stepPoint(city, step);
      return { text: step.text, x: point?.x, y: point?.y, mission: this.active.def.title, step };
    }
    if (!this.storyDone) {
      const next = MISSION_DEFS[this.index];
      const g = city.landmarks.garage;
      return { text: `Visit Voss Auto Works — next job: “${next.title}”`, x: g.x, y: g.y, mission: null, step: null };
    }
    return { text: 'Free roam — Costa Azul is yours. Cruise, cause trouble, stay free.', x: null, y: null, mission: null, step: null };
  }

  stepPoint(city, step) {
    if (!step) return null;
    if ((step.kind === 'enterTarget' || step.kind === 'disableTarget') && this.active?.targetCar) {
      return this.active.targetCar;
    }
    if (step.at) return city.landmarks[step.at];
    return null;
  }

  tryStart(player, city) {
    if (this.active || this.storyDone) return false;
    const g = city.landmarks.garage;
    if (Math.hypot(player.x - g.x, player.y - g.y) > 90) return false;
    const def = MISSION_DEFS[this.index];
    this.active = { def, stepIndex: 0, timer: 0, targetCar: null, holdProgress: 0 };
    this.hooks.phone(def.intro);
    this.beginStep(city);
    return true;
  }

  beginStep(city) {
    const step = this.active.def.steps[this.active.stepIndex];
    if (step.heat) this.hooks.addHeat(step.heat);
    if (step.kind === 'enterTarget') this.active.targetCar = this.hooks.spawnMissionCar('cometa');
    if (step.kind === 'disableTarget') this.active.targetCar = this.hooks.spawnMissionCar('rival');
    if (step.kind === 'timedGoto') this.active.timer = step.time;
    if (step.kind === 'evade') this.hooks.toast('Heat is on!', 'Shake the patrols, then get to your apartment.');
  }

  update(dt, game) {
    if (!this.active) return;
    const { player, city } = game;
    const a = this.active;
    const step = a.def.steps[a.stepIndex];
    const point = this.stepPoint(city, step);
    let done = false;

    switch (step.kind) {
      case 'goto':
      case 'escapeTo':
        done = point && Math.hypot(player.x - point.x, player.y - point.y) < (step.kind === 'goto' ? 62 : 70);
        break;
      case 'timedGoto': {
        a.timer -= dt;
        if (a.timer <= 0) { this.fail(game, 'Out of time — the client walked away.'); return; }
        done = point && Math.hypot(player.x - point.x, player.y - point.y) < 62;
        break;
      }
      case 'enterTarget':
        done = !!a.targetCar && player.inCar === a.targetCar;
        if (done) { this.hooks.addHeat(30); this.hooks.toast('Car stolen!', 'Heat is rising — get it to the garage.'); }
        break;
      case 'deliverCar':
        done = !!a.targetCar && player.inCar === a.targetCar && point &&
               Math.hypot(player.x - point.x, player.y - point.y) < 78;
        break;
      case 'evade':
        done = game.stars === 0;
        break;
      case 'disableTarget':
        done = !!a.targetCar && a.targetCar.disabled;
        if (done) this.hooks.toast('Crew car wrecked!', 'Head back to Delia.');
        break;
      case 'holdout': {
        const inside = point && Math.hypot(player.x - point.x, player.y - point.y) < 56 && !player.inCar;
        if (inside) {
          a.holdProgress += dt;
          if (a.holdProgress >= step.time) done = true;
        } else a.holdProgress = Math.max(0, a.holdProgress - dt * 1.5);
        break;
      }
    }

    if (done) {
      a.stepIndex++;
      a.holdProgress = 0;
      if (a.stepIndex >= a.def.steps.length) this.complete(game);
      else this.beginStep(city);
    }
  }

  complete(game) {
    const def = this.active.def;
    this.hooks.addCash(def.reward);
    this.hooks.phone(def.outro);
    this.hooks.sfx.missionDone();
    if (this.active.targetCar && this.active.targetCar.kind === 'target') this.active.targetCar.kind = 'parked';
    this.active = null;
    this.index++;
    if (this.index >= MISSION_DEFS.length) {
      this.storyDone = true;
      this.hooks.toast('STORY COMPLETE', 'Marco Reyes owns the streets of Costa Azul. Free roam unlocked.');
    }
    game.onMissionComplete?.(def);
  }

  fail(game, why) {
    this.hooks.toast('JOB FAILED', why + ' Return to Voss Auto Works to try again.');
    this.hooks.sfx.missionFail();
    if (this.active.targetCar && this.active.targetCar.kind === 'target') {
      game.removeCar(this.active.targetCar);
    }
    this.active = null;
    game.onMissionFail?.();
  }
}
