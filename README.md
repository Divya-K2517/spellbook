# Firefly Society

A dark garden of glowing fireflies. You shape the world (ponds, bushes, new fireflies, how far they can see); the fireflies decide what to do with it. *What happens when simple individuals influence their neighbors?*

Synchronization is an outcome the simulation may or may not produce. Nothing here promises it, and the social layer is fiction, not a claim about real fireflies.

```
npm install
npm run dev        # develop
npm run verify     # type check + model check + behavior checks + build
```

## How it is built

`firefly.yaml` is the system design (a MAGE model) and the source of truth for the application workflow. `npm run compile:machine` turns it into a transition table the app runs; `npm run model:check` explores every reachable state and proves the safety requirements (no layer without its prerequisite, no history view without history, no leaving with unsaved work, deletion always confirmed).

```
src/core/     pure TypeScript: the simulation and the workflow machine. No DOM, no framework.
src/app/      AppSession (the workflow, driven by the model) and the garden stores. No DOM.
src/render/   canvas drawing. Reads the simulation, never changes it.
src/ui/       Svelte screens. A thin layer over AppSession.
```

`npm run sim:check` enforces that boundary: the core and app layers may not touch the DOM.

## Growing it

- **A new layer** (a fourth rung on the ladder): write its systems in `src/core/sim/systems/`, add one entry to `LAYERS` in `src/core/sim/layers.ts`, add its id to `Layers` in the garden types, and add its switch events to `firefly.yaml`. Existing systems are untouched; a layer changes others only through the `hooks` seam.
- **A new personality**: one row in `PERSONALITY_RULES` (`config.ts`) plus its id. Rules are data.
- **Retuning**: every number lives in `DEFAULT_CONFIG`. A garden can run with its own config.
- **A new kind of recorded event or story**: add it to `EventLog`, then a template in `story.ts`. Stories read only from the log.
- **Another place to save gardens**: implement `GardenStore` (`src/app/storage/types.ts`) and change one line in `src/main.ts`.
- **A different front end**: build on `AppSession`; the Svelte UI is one consumer of it.
- **Saved-data changes**: bump `schemaVersion` and migrate in `readRecord`, the single entry point for stored data.

Fireflies are stored as flat typed arrays and neighbors are found with a spatial grid, so cost follows local crowding rather than the square of the population (about 2 ms per step at 300 fireflies; see `scripts/sim-check.ts`).
