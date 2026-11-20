# gta6-01

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/plm34554a/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/plm34554a/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Costa Azul: Wheelman** is an original open-world crime game that runs in a desktop browser from static files — no build step, no network. You are Marco Reyes, a getaway driver in the sun-soaked city of Costa Azul: pastel art-deco blocks, palm-lined avenues, a beach and marina on the east shore, and a police force that does not forgive.

Explore the whole city on foot or behind the wheel. Traffic flows through the street grid and pedestrians stroll (and flee) on the sidewalks; any car can be stolen with a press of **E** and driven with a chase camera that leans into the speed. Crimes raise your wanted stars — shoplifting a car is one thing, gunfire in front of a patrol is another — and the Costa Azul PD answers with Interceptors that hunt, ram and box you in. Get caught standing next to a unit and you are **BUSTED**; take too much damage and you wake up **WASTED** at St. Lucia Hospital, poorer either way.

The story is five jobs for fixer Delia Voss, phoned in as you reach her garage, Voss Auto Works: steal a guest's Cometa GT from the Hotel Del Mar, run a package across town against the clock, cool off a heat wave, wreck a rival crew's car, and finally walk into the Costa Azul Bank at midday and escape to the Old Pier. Each job pays cash, the chain unlocks as you finish the last, and progress (cash, story, position) saves to localStorage so you can continue later. Cash and ammo pickups dot the alleys, the marina and the armory for free-roam mayhem after the credits.

The HUD carries a live minimap (streets, the sea, traffic, flashing police blips, your objective marker), health, cash, wanted stars, weapon and ammo, speed while driving, and the current objective with its distance. Every sound — engine, sirens, gunshots, the phone, a small synthesized groove — is generated with WebAudio; there are no audio files and no borrowed assets: the city, names, characters and story are all original.

**Controls:** WASD/arrows walk and drive · mouse aims, click shoots on foot · **E** steal/enter/exit a car · **Shift** sprint · **Space** handbrake · **R** reload · **P**/**Esc** pause · **M** mute.

## Run it

```sh
node serve.ts
```

Then open the printed local address (http://localhost:8080) in a desktop browser. To produce the hand-in output instead: `MAKEFUN_OUTPUT_DIR=out node main.ts` copies `game/` and `screenshots/` to `out/` and writes the `dossier.json` the judge reads.

---

<sub>Entered on [make.fun](https://make.fun/?ref=9321azde&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
