# How Atlas VTT aligns a map to its printed grid

Research for [#173](https://github.com/spitefulFr0g/owlbear-rodeo-bun/issues/173), part of the map [#169, Map: map alignment](https://github.com/spitefulFr0g/owlbear-rodeo-bun/issues/169). Read on 2026-10-16 against Atlas VTT 0.8.0.

Each claim is marked by where it comes from:

- **code**: the 0.8.0 source. This is the primary source. Links point at the `0.8.0` tag.
- **docs**: the project's site, atlas-vtt.dev. In places it still describes the 0.7.1 panel.
- **user report**: GitHub issues filed by users on the project.

I found no forum, Reddit or video discussion of its grid alignment.

## Short answer

Atlas looks for the grid itself the first time a new scene opens. It reads the map's pixels in a Web Worker on the GM's machine. A Fourier spectrum proposes cell sizes. It then fits one regular lattice to the line edges across the whole map, with sub-pixel least squares.

If the lines support no grid, Atlas hides the grid, turns snapping off and offers manual alignment.

To align by hand, the GM clicks two corners of one cell. That gives a rough size, and the same whole-map fit then makes it exact. A second measurement is needed only when the map's lines do not settle it.

The grid is fitted to the map, which is the reverse of our ADR 0010. The scene saves a cell size and an offset in the map image's own pixels. For cells that are not square, it also saves a stretch of the map.

## The project

- **What it is.** Atlas VTT, a virtual tabletop that runs as a plugin inside the Obsidian note-taking app. It is desktop only: `isDesktopOnly: true` in [manifest.json](https://github.com/atlas-vtt/atlas-vtt/blob/0.8.0/manifest.json). (code)
- **Repository.** https://github.com/atlas-vtt/atlas-vtt. It was formerly `ByteMirror/atlas-vtt`, which now redirects. The author is Fabian Urbanek (ByteMirror).
- **Docs.** https://atlas-vtt.dev/docs
- **Current version.** 0.8.0, tagged 2026-10-14. The first tags are from 2026-09-22, so the project is about a month old. Its versions have gone from 0.4.1 to 0.8.0 in about two weeks. ([CHANGELOG.md](https://github.com/atlas-vtt/atlas-vtt/blob/0.8.0/CHANGELOG.md))
- **Licence.** AGPL-3.0-only, with a section 7 exception for linking with Obsidian (README licence section). Releases up to 0.1.6 were PolyForm Noncommercial 1.0.0. That is why the [Obsidian community listing](https://community.obsidian.md/plugins/atlas-vtt) still says source-available and noncommercial.
- **Stack.** TypeScript, PixiJS with pixi-viewport, a React interface and a zustand store.
- **Maps per scene.** A scene has one map image, its `background`.

## From adding a map to an aligned grid

1. **Create the scene.** The GM imports the map image into the vault through the asset manager and creates a scene on it ([docs: Create a scene from a map](https://atlas-vtt.dev/docs/start/scene-from-map)).
   - The new scene file gets a default grid: square, 70 px, offset 0, and the flag `autoDetect: true` ([newSceneFile.ts](https://github.com/atlas-vtt/atlas-vtt/blob/0.8.0/src/app/services/newSceneFile.ts#L28-L46)). (code)
   - A grid setting added in 0.8.0 turns detection off for tables that play without a grid. (code, changelog)
2. **First open.** The first time the GM opens the scene, `autoDetectGridOnFirstLoad` clears the flag and runs detection, with a scan animation over the map. Its write is untracked, so it adds no undo step. ([gridAutoDetect.ts](https://github.com/atlas-vtt/atlas-vtt/blob/0.8.0/src/app/services/gridAutoDetect.ts#L37-L67), [firstGridDetection.ts](https://github.com/atlas-vtt/atlas-vtt/blob/0.8.0/src/app/services/firstGridDetection.ts#L26)) (code)
   - **Grid found.** The grid takes the result, is shown, and snapping is on.
   - **No grid found.** The grid is hidden and snapping is off. A notice says "No grid was found on this map, so none is shown." It offers an "Align the grid" link for 12 seconds ([gridAlignmentNotice.ts](https://github.com/atlas-vtt/atlas-vtt/blob/0.8.0/src/app/services/gridAlignmentNotice.ts#L7-L13)).
3. **Correct it by hand.** If the result is wrong or missing, the GM opens Grid Alignment from Grid settings ([docs: Line up the grid](https://atlas-vtt.dev/docs/guides/grid)). The 0.8.0 panel ([GridAlignmentOverlay.tsx](https://github.com/atlas-vtt/atlas-vtt/blob/0.8.0/src/app/react/components/GridAlignmentOverlay.tsx), [align.ts strings](https://github.com/atlas-vtt/atlas-vtt/blob/0.8.0/src/app/i18n/locales/en/align.ts)) has: (code)
   - an "Auto detect" button;
   - "Or align it yourself", with two tabs, Measure and Freehand;
   - a grid type picker: Square, Pointy, Flat;
   - Apply.
4. **Apply.** Apply writes the grid in one undoable step. It also resizes and resnaps every token, because token sizes count cells ([PixiRendererOrchestrator.ts](https://github.com/atlas-vtt/atlas-vtt/blob/0.8.0/src/app/PixiRendererOrchestrator.ts#L675-L685), [storeFactory.ts](https://github.com/atlas-vtt/atlas-vtt/blob/0.8.0/src/app/storeFactory.ts#L506-L512)). Escape or closing the panel cancels and restores the saved grid and stretch. (code)

Detection runs on its own only for new scenes. The only code that sets `autoDetect` is `newSceneFile`. (code)

How many clicks it takes:

- **Detection works:** none.
- **Measure, when the lines settle it:** two clicks and Apply.
- **Measure, when they do not:** up to four pairs of clicks.

## Measuring a cell by hand

### Measure tab

Sources: [IntersectionsTab.tsx](https://github.com/atlas-vtt/atlas-vtt/blob/0.8.0/src/app/react/components/IntersectionsTab.tsx), [gridAlignmentMath.ts](https://github.com/atlas-vtt/atlas-vtt/blob/0.8.0/src/app/pixi/gridAlignmentMath.ts), [hexAlignmentMath.ts](https://github.com/atlas-vtt/atlas-vtt/blob/0.8.0/src/app/pixi/hexAlignmentMath.ts), [useGridFit.ts](https://github.com/atlas-vtt/atlas-vtt/blob/0.8.0/src/app/react/hooks/useGridFit.ts). (code)

- **Quadrants.** The map is split into four quadrants. The camera zooms into one at a time and dims the rest. A click outside the active quadrant (allowing a 10% margin) is ignored.
- **Square grids.** The panel says "Click a corner of a cell.", then "Now the next corner to the right." The second click is locked to the first click's row.
- **Hex grids.** The panel says "Click a corner of a hex.", then "Now a neighbouring corner of the same hex."
  - The pair is read as an edge, as opposite corners, or as corners across the hex.
  - The orientation comes from the pair's angle.
  - The size follows from the length. For an edge, the size is length × √3.
- **The first pair becomes a hint.** The measured size and type are passed to detection, which runs on the map's lines with these limits ([detectGrid.ts](https://github.com/atlas-vtt/atlas-vtt/blob/0.8.0/src/app/pixi/spectralEngine/detectGrid.ts#L76-L80), [L300-L313](https://github.com/atlas-vtt/atlas-vtt/blob/0.8.0/src/app/pixi/spectralEngine/detectGrid.ts#L300-L313)):
  - only sizes within ±13% of the measurement, starting at 0, ±5% and ±10%;
  - a lower bar for support, 0.02 instead of 0.05;
  - a stretch of up to 1.5.
- **When the lines support it**, alignment is done after one pair.
- **When they do not**, the panel says "The map's lines did not settle it. Measure one more cell." It allows up to four pairs.
- **Without line support after all pairs**, the size is the mean of the pair distances. The offset is the circular mean of every clicked point modulo the size ([gridAlignmentMath.ts](https://github.com/atlas-vtt/atlas-vtt/blob/0.8.0/src/app/pixi/gridAlignmentMath.ts#L74-L140)).
- **Never counted or typed.** The user does not count columns or rows, and cannot type them.

### Freehand tab

Sources: [FreehandTab.tsx](https://github.com/atlas-vtt/atlas-vtt/blob/0.8.0/src/app/react/components/FreehandTab.tsx), [FreehandGridPreview.ts](https://github.com/atlas-vtt/atlas-vtt/blob/0.8.0/src/app/pixi/FreehandGridPreview.ts#L23). (code)

- A preview patch follows the cursor. Its cell is a fixed 80 px on screen.
- The panel says "Zoom until a preview cell covers one cell of the map, then click."
- The cell size becomes 80 divided by the zoom.
- The result is not fitted to the map's lines. This is the route for maps with no printed grid.
- The tab was added in 0.4.0, which also removed an older Quick tab ([CHANGELOG.md](https://github.com/atlas-vtt/atlas-vtt/blob/0.8.0/CHANGELOG.md)).

### What 0.8.0 removed

The 0.7.1 panel had more controls (code, `git show 0.7.1:src/app/i18n/locales/en/align.ts`):

- arrow-key nudging, with Shift for sub-pixel steps;
- "Place again" and Reset;
- a "Fit to the map's lines" toggle;
- a disagreement read-out, "Measurements disagree by up to {residual} px";
- a coverage read-out, "{percent}% of the grid found on the map";
- notices that the map was stretched or turned.

0.8.0 ("Improved UX for Grid Alignment panel") removed all of them. The docs site still describes them. In 0.8.0 there is no way to type a cell size or to nudge the grid.

## How auto-detection works

Everything is in [src/app/pixi/spectralEngine/](https://github.com/atlas-vtt/atlas-vtt/tree/0.8.0/src/app/pixi/spectralEngine) and runs in a Web Worker ([detectionWorker.ts](https://github.com/atlas-vtt/atlas-vtt/blob/0.8.0/src/app/pixi/spectralEngine/detectionWorker.ts)). Nothing runs on a server. (code)

1. **Read the picture.**
   - Luminance is 0.299 R + 0.587 G + 0.114 B.
   - The image is read at most 4096 px on its long side (`MAX_ANALYSIS_SIDE`).
   - Maps under 64 px are skipped.
   - Sources: [grayImage.ts](https://github.com/atlas-vtt/atlas-vtt/blob/0.8.0/src/app/pixi/spectralEngine/grayImage.ts), [detectGrid.ts](https://github.com/atlas-vtt/atlas-vtt/blob/0.8.0/src/app/pixi/spectralEngine/detectGrid.ts#L28).
2. **Spectrum.** Two local-contrast versions of the image are made, one taking contrast before shrinking and one after. Each becomes a windowed 512 × 512 FFT power spectrum ([gridProposals.ts](https://github.com/atlas-vtt/atlas-vtt/blob/0.8.0/src/app/pixi/spectralEngine/gridProposals.ts#L14-L22)).
3. **Proposals.** A grid shows as peaks at fixed angles in the spectrum: squares at 0° and 90°, flat hexes at multiples of 60°, pointy hexes at 30° plus multiples of 60°.
   - Each peak is scored against the median of its ring, read at 72 points.
   - Only power above 3 × that median counts.
   - The score is summed over harmonics, each weighted 0.85 of the one before, much like a pitch detector.
   - It keeps two proposals per grid type, with periods from 4 to 128 spectrum pixels.
   - Source: [spectralHypotheses.ts](https://github.com/atlas-vtt/atlas-vtt/blob/0.8.0/src/app/pixi/spectralEngine/spectralHypotheses.ts#L35-L43).
4. **Coarse lattice search.** For each proposal:
   - about 800 cell edges are profiled once;
   - each edge casts one vote of at most 1;
   - sizes within ±3% are tried in 30 steps, with up to 96 offsets per axis;
   - votes are tallied per edge direction.
   - Source: [latticeSearch.ts](https://github.com/atlas-vtt/atlas-vtt/blob/0.8.0/src/app/pixi/spectralEngine/latticeSearch.ts#L18-L23).
5. **Sub-pixel fit.** Up to 2500 edges are measured, each on its own ([latticeFit.ts](https://github.com/atlas-vtt/atlas-vtt/blob/0.8.0/src/app/pixi/spectralEngine/latticeFit.ts#L57-L70)).
   - The measurement is the signed distance to the nearest line. The line's centre is the centroid of the response above half its peak.
   - These distances are linear in the unknowns: shift x, shift y, change of size, and optionally aspect and rotation. So one weighted least-squares solve updates them all.
   - Robust Tukey weights are used, with a cutoff that shrinks to 0.75 px. Meanwhile the measuring window narrows from 8 to 4 to 2 px.
   - The source describes it as "the manual alignment tool with every edge of the map clicked" ([latticeFit.ts L9](https://github.com/atlas-vtt/atlas-vtt/blob/0.8.0/src/app/pixi/spectralEngine/latticeFit.ts#L9)).
6. **Is it a grid?** Support is the share of edges that have a line within ±0.75 px, corrected for chance ([latticeFit.ts](https://github.com/atlas-vtt/atlas-vtt/blob/0.8.0/src/app/pixi/spectralEngine/latticeFit.ts#L185-L205), [refineGrid.ts](https://github.com/atlas-vtt/atlas-vtt/blob/0.8.0/src/app/pixi/spectralEngine/refineGrid.ts#L36-L44)).
   - It must be 5σ above binomial noise.
   - The weakest edge direction is the one that counts, so a map of horizontal stripes alone fails.
   - Square grids are also scored on long edges, up to 400 px, to catch faint lines.
7. **Thresholds.** Below 0.05 support means no grid. 0.5 is decisive, and 0.9 is settled. A cell under 8 px is never accepted, and one under 12 px only with decisive support ([detectGrid.ts](https://github.com/atlas-vtt/atlas-vtt/blob/0.8.0/src/app/pixi/spectralEngine/detectGrid.ts#L30-L53)).
8. **The right size, not a multiple.** Half and double of every supported fit are tried, and 3× and 5× as well ([detectGrid.ts `chooseFit`](https://github.com/atlas-vtt/atlas-vtt/blob/0.8.0/src/app/pixi/spectralEngine/detectGrid.ts#L264), [subGrid.ts](https://github.com/atlas-vtt/atlas-vtt/blob/0.8.0/src/app/pixi/spectralEngine/subGrid.ts#L17-L71)).
   - It picks the strongest grid type and shape. If two are within 0.02, the more regular one wins.
   - It then takes the densest size that is not a "finer copy". A finer copy is a grid where only every 2nd, 3rd or 5th line is really on the map.
9. **Second round.** This runs only if nothing is decisive, with at most 15 proposals ([gridProposals.ts](https://github.com/atlas-vtt/atlas-vtt/blob/0.8.0/src/app/pixi/spectralEngine/gridProposals.ts#L99-L150)). It tries:
   - stretched aspects, in 1% steps up to about ±25%;
   - small rotations, in 0.5° steps up to ±4°;
   - a spectrum of line contrast;
   - finer windows of 2048 and 1024 px at the map's middle.
10. **Large cells.** These are searched on a shrunken image, where a cell is about 96 px, and then refit at full size ([detectGrid.ts](https://github.com/atlas-vtt/atlas-vtt/blob/0.8.0/src/app/pixi/spectralEngine/detectGrid.ts#L115), [refineGrid.ts](https://github.com/atlas-vtt/atlas-vtt/blob/0.8.0/src/app/pixi/spectralEngine/refineGrid.ts#L145)).
11. **Result.** `{cellSize, offsetX, offsetY, gridType, confidence, mapStretch?}`, in the map's pixels at full size ([detectGrid.ts `gridInWorld`](https://github.com/atlas-vtt/atlas-vtt/blob/0.8.0/src/app/pixi/spectralEngine/detectGrid.ts#L426)).

I found no time budget and no published accuracy figures. The tests use synthetic parchment maps ([tests/gpu/gridDetectOverview.gpu.test.ts](https://github.com/atlas-vtt/atlas-vtt/blob/0.8.0/tests/gpu/gridDetectOverview.gpu.test.ts)).

The changelog traces how this grew:

- **0.2.0.** Auto-detect on first open arrived. It now "lines up across the whole map instead of drifting towards the edges, finds faint grids on busy art, and no longer reports a grid on maps that have none".
- **0.7.1.** "Significantly improved reliability and precision of grid alignment both in auto and manual mode", and it "detects stretched hexes and pointy hex grids much better".
- **0.8.0.** Tokens "no longer snap to a default hidden grid if no grid was found".

Source: [CHANGELOG.md](https://github.com/atlas-vtt/atlas-vtt/blob/0.8.0/CHANGELOG.md).

## What is saved and where

All of this is from the code.

- **Where.** The grid is saved per scene, as `state.grid` in the scene's `.atlasmap` file in the Obsidian vault ([gridTypes.ts](https://github.com/atlas-vtt/atlas-vtt/blob/0.8.0/src/app/types/gridTypes.ts#L11-L42), [newSceneFile.ts](https://github.com/atlas-vtt/atlas-vtt/blob/0.8.0/src/app/services/newSceneFile.ts#L28-L58)).
- **Alignment fields.**
  - `type`: `square`, `hex-horizontal` (flat-top) or `hex-vertical` (pointy-top).
  - `size`: the cell, in map pixels.
  - `offsetX` and `offsetY`.
  - `mapStretch {x, y, rotation?}`, optional.
  - `autoDetect`, kept only until the first load.
- **Display fields.** Visibility, snapping, opacity, line style and units.
- **World units.** World units are the map image's pixels. The map sits at 0, 0 at its natural size times the stretch ([MapImage.ts `worldRect`](https://github.com/atlas-vtt/atlas-vtt/blob/0.8.0/src/app/pixi/mapImage/MapImage.ts#L74)).
- **Nothing on the image.** Nothing is saved on the map image or its asset. Two scenes on the same image are aligned separately.
- **Offset.** For squares, the offset is reduced modulo the cell. For hexes, it is re-based to the hex that holds the origin ([gridOffset.ts](https://github.com/atlas-vtt/atlas-vtt/blob/0.8.0/src/app/grid/gridOffset.ts#L14)).

## Edge cases

### Edges that cut through a cell

The grid is an unbounded lattice with an offset, and detection uses edges across the whole map. Nothing assumes the image is a whole number of cells, so the cells at the border are simply partial. The hex numbering skips half hexes at the edges. (code)

### Cells that are not quite square

The grid stays regular. Instead, the map image is stretched along one axis so that its cells become square ([mapStretch.ts](https://github.com/atlas-vtt/atlas-vtt/blob/0.8.0/src/app/grid/mapStretch.ts#L23-L41)). (code)

- The image only ever grows, so no pixel is lost.
- The stretch goes up to 1.5×, and the rotation up to 5°.
- Auto-detect accepts a stretched square grid only up to 1.1. A measured hint allows up to 1.5.
- When the stretch changes, objects move to keep their spot on the map (`movedWithMap`, [mapStretch.ts L100](https://github.com/atlas-vtt/atlas-vtt/blob/0.8.0/src/app/grid/mapStretch.ts#L100)).

### Hex grids

Both flat-top and pointy-top hexes are detected and can be measured. Stretched hexes are allowed up to 1.5. (code)

### Maps with no printed grid

- **Detection.** It reports no grid rather than guessing, using the chance-corrected support test. (code)
- **What the GM sees.** The grid is hidden and snapping is off, and the GM is offered alignment. (code)
- **Freehand is the only help.** (code) Atlas does not estimate a size from the image; that is what #425 asks for.
- **The docs agree.** According to the grid guide, auto-detection needs visible grid lines. (docs, as quoted in #425)

## What users report

These are all user reports, as GitHub issues on [atlas-vtt/atlas-vtt](https://github.com/atlas-vtt/atlas-vtt/issues). Keep these points in mind when reading them:

- They were filed on versions 0.4.1 to 0.7.0, before the 0.7.1 alignment rework and the 0.8.0 panel. None is from 0.8.0, which was released two days before this note.
- None has a reply from the maintainer.
- Searches found no forum, Reddit or YouTube discussion. A [Geeky Gadgets article](https://www.geeky-gadgets.com/obsidian-virtual-tabletop-atlasvt/) (2026-10-02) mentions only "configurable grids".

What works well:

- "The Auto align work great for square maps though." ([#97](https://github.com/atlas-vtt/atlas-vtt/issues/97), 0.4.1)

What works badly:

- **Hex maps.** They are hard to get right, and Freehand "is reliant on zooming in and out and will never quite capture the grid right" ([#97](https://github.com/atlas-vtt/atlas-vtt/issues/97)).
- **Slightly off sizes.** "I have a map with a cell size of 70 px, but the existing alignment tools end up with 68.49 px" ([#145](https://github.com/atlas-vtt/atlas-vtt/issues/145), 0.4.2).
- **Known counts that cannot be used.**
  - "I have maps that I use that I know are 17x22 grid squares, but sometimes the auto-finder doesn't get it quite right, especially on the maps without a pre-printed grid" ([#217](https://github.com/atlas-vtt/atlas-vtt/issues/217), 0.4.2).
  - Width and height in tiles, from Dungeon Painter Studio ([#107](https://github.com/atlas-vtt/atlas-vtt/issues/107)).
  - A "204p grid" ([#142](https://github.com/atlas-vtt/atlas-vtt/issues/142)).
  - A slider, because the grid seems "locked to the image size" ([#132](https://github.com/atlas-vtt/atlas-vtt/issues/132)).
- **Eyeballing.** "right now im basically eyeballing it and its extremely hard to actually get the correct size for the map grid" ([#197](https://github.com/atlas-vtt/atlas-vtt/issues/197)). A comment there asks to set X and Y separately, because "some maps come a little skewed".
- **A finer grid than the printed one.** The map's printed squares are 10 ft and the user wants 5 ft. They cannot click a midpoint precisely, and in Freehand the scroll wheel "always overshoots" the zoom ([#383](https://github.com/atlas-vtt/atlas-vtt/issues/383), 0.6.0).
- **Gridless maps of unusual resolution.** "the automatic grid placement ends up failing and making the map too large or too small" ([#407](https://github.com/atlas-vtt/atlas-vtt/issues/407), 0.7.0).
- **An estimate for gridless maps.** [#425](https://github.com/atlas-vtt/atlas-vtt/issues/425) asks for an "Owlbear Rodeo-style" size estimate for gridless maps, which is our upstream's behaviour.
- **Fixed since.** Distance per cell was added in 0.6.0 ([#230](https://github.com/atlas-vtt/atlas-vtt/issues/230)). Line gaps at some zoom levels were fixed ([#127](https://github.com/atlas-vtt/atlas-vtt/issues/127)).

The ask that keeps coming back is a number to type: a cell size in pixels, or columns × rows. 0.8.0 has neither.

## Sources

Code, Atlas VTT at tag 0.8.0. Paths are under https://github.com/atlas-vtt/atlas-vtt/blob/0.8.0/:

- `manifest.json`, `README.md`, `CHANGELOG.md`
- `src/app/types/gridTypes.ts`, `src/app/grid/mapStretch.ts`, `src/app/grid/gridOffset.ts`
- `src/app/services/newSceneFile.ts`, `gridAutoDetect.ts`, `firstGridDetection.ts`, `gridAlignmentNotice.ts`
- `src/app/pixi/spectralEngine/`: `detectGrid.ts`, `gridProposals.ts`, `spectralHypotheses.ts`, `latticeSearch.ts`, `latticeFit.ts`, `refineGrid.ts`, `subGrid.ts`, `grayImage.ts`, `edgeProfile.ts`, `detectionWorker.ts`
- `src/app/pixi/gridAlignmentMath.ts`, `hexAlignmentMath.ts`, `GridAlignmentController.ts`, `FreehandGridPreview.ts`, `mapImage/MapImage.ts`
- `src/app/react/components/GridAlignmentOverlay.tsx`, `IntersectionsTab.tsx`, `FreehandTab.tsx`; `src/app/react/hooks/useGridFit.ts`
- `src/app/PixiRendererOrchestrator.ts`, `src/app/storeFactory.ts`
- `src/app/i18n/locales/en/align.ts`, `map.ts`, `grid.ts`, at 0.8.0 and at 0.7.1

Docs, which lag the code:

- https://atlas-vtt.dev/docs
- https://atlas-vtt.dev/docs/guides/grid
- https://atlas-vtt.dev/docs/start/scene-from-map

User reports: issues [#97](https://github.com/atlas-vtt/atlas-vtt/issues/97), [#107](https://github.com/atlas-vtt/atlas-vtt/issues/107), [#127](https://github.com/atlas-vtt/atlas-vtt/issues/127), [#132](https://github.com/atlas-vtt/atlas-vtt/issues/132), [#142](https://github.com/atlas-vtt/atlas-vtt/issues/142), [#145](https://github.com/atlas-vtt/atlas-vtt/issues/145), [#197](https://github.com/atlas-vtt/atlas-vtt/issues/197), [#217](https://github.com/atlas-vtt/atlas-vtt/issues/217), [#230](https://github.com/atlas-vtt/atlas-vtt/issues/230), [#383](https://github.com/atlas-vtt/atlas-vtt/issues/383), [#407](https://github.com/atlas-vtt/atlas-vtt/issues/407), [#425](https://github.com/atlas-vtt/atlas-vtt/issues/425).

Other:

- https://community.obsidian.md/plugins/atlas-vtt
- https://www.geeky-gadgets.com/obsidian-virtual-tabletop-atlasvt/

## What this suggests for us

These are suggestions only. The decisions belong to later tickets under [#169](https://github.com/spitefulFr0g/owlbear-rodeo-bun/issues/169).

- **Keep the method, flip the output.** Atlas fits the grid to the map. ADR 0010 fits the map to the grid at 150 units a cell. A detected `{cellSize, offset}` in image pixels converts directly:
  - The map's scale is 150 / cellSize.
  - The map is moved so that the image point at the offset lands on a scene grid line.
  - Both steps only scale and move the map.
  - A stretch becomes different x and y scales.
- **It fits the grid we already save on a map.** Our map grid is an inset rectangle plus columns × rows ([src/types/Grid.ts](../../src/types/Grid.ts)). `fitMap` in [src/scene/mapItem.ts](../../src/scene/mapItem.ts) turns that grid into a scale and a position.
  - A lattice converts to that grid: put the inset's top left at the offset, set columns to the whole cells that fit, and put the bottom right at offset + columns × cell.
  - Partial cells at the border fall outside the inset, so maps whose edges cut a cell need no new field.
  - `fitMap` already scales x and y separately for square grids, so slightly non-square cells need no new field either.
- **Our detector has no right answer when an edge cuts a cell.** `getGridSizeFromImage` in [src/helpers/grid.ts](../../src/helpers/grid.ts) only picks from the divisors of gcd(width, height). That assumes the image is a whole number of cells starting at its top-left corner. A map whose edges cut a cell has no right answer in that list. A whole-map lattice fit like Atlas's makes no such assumption, so it covers the "edge to edge, including cut cells" part of the bar.
- **Detection can stay in the browser.** Atlas does all of it in a worker on the GM's machine, from pixels it has already loaded. That matches our rule that the server never reads an image.
- **One measured cell and a whole-map fit meet "no counting, under 30 seconds".** Two clicks give a rough size, and the fit makes it exact from every line on the map.
  - All four of our routes (New scene importer, dock drop, placed map, second map) could share that one step.
  - Atlas only runs detection on new scenes, with one map each. Our placed-map and second-map routes would need the fit to run on demand, for each map.
- **Swapping a map moves nothing else.** After alignment Atlas resizes and resnaps every token, because its grid follows the map. Under ADR 0010 only the map moves, which is the better outcome for a second map or a swapped map.
- **Refuse rather than guess.** Atlas's chance-corrected support test, at 5σ, gives a clear "no grid" answer. For a gridless map we could then fall back to our existing size estimate and mark it as an estimate. Atlas users ask for exactly that estimate in #425.
- **Guard against half and double the cell.** Atlas tries ×½, ×2, ×3 and ×5, and rejects a size where only every nth line is on the map. A detector of our own needs some such check.
- **Keep a typed fallback.** Atlas users keep asking for a typed cell size or columns × rows, and 0.8.0 removed nudging. Our map already has columns × rows from upstream, which answers #107 and #217 directly. That makes it worth keeping beside any detector, even though counting is not the main path. Freehand's zoom-to-match is reported as imprecise, so it is a weak model for our gridless case.
- **Hex names.** Atlas's `hex-horizontal` is flat-top and `hex-vertical` is pointy-top. Before reusing any reading of its results, check that this matches the meaning of our `hexHorizontal` and `hexVertical`.
- **Licence.** Atlas is AGPL-3.0-only. Our project carries upstream's licence, which allows personal use only and no commercial use, so it does not grant what the AGPL requires. Copying Atlas code would therefore need a licence decision first. Reading it and writing our own does not.
