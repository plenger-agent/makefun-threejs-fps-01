# Neon Breach FPS

A round-based tactical FPS in the browser, built with three.js 0.187.0
(WebGL2) for the make.fun threejs-fps-01 bounty. No build step, no network:
serve `game/` with any static server and open `index.html`.

## The game

You are NEON, the attacker, in SECTOR 7 — an original two-site neon map.
Push mid or the side lanes, plant the flux bomb at SITE A (cyan) or SITE B
(magenta), and hold it against four VOID bots that run routes, hold angles,
react to what they see and hear, and retake the site to defuse. First to 5
rounds takes the match (at most 9 rounds).

- **Gunplay:** three weapons (ARC-9 pistol, VOLT SMG, NB-7 pulse rifle) plus
  the FLUX grenade; headshots deal 2x damage; recoil and spread punish firing
  on the move; crouching steadies aim; Shift walks slow and steady.
- **Tactics:** buy economy between rounds ($800 start, $3,250 a round win),
  bomb plant (hold E in a site, 3.5s) and 40s fuse, 5s defuse by the bots,
  waypoints with routes, holds and reactions.
- **HUD:** health, armour, ammo, round timer, score, money, kill feed,
  crosshair that opens with spread, hitmarker (red for headshots).

## Controls

WASD move · mouse look · click fire · R reload · Ctrl/C crouch · Shift slow
walk · B buy menu · 1/2/3 weapons · G throw grenade · E plant (hold, in a site).

## Play it

```
node serve.ts        # http://localhost:8080
```

## Screenshots

`screenshots/` holds four real renders of the running game, staged with
`?shot=play|buy|plant|end`: a mid-lane firefight, the buy menu, a plant at
SITE A, and the round-end banner.

## Hand in

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` to `/output` and writes
`/output/dossier.json` with the kit's `vendor/makefun-threejs.ts`.
