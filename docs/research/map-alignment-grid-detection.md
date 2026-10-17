# How a printed grid can be detected in the browser

Research for [#174](https://github.com/spitefulFr0g/owlbear-rodeo-bun/issues/174), part of map [#169](https://github.com/spitefulFr0g/owlbear-rodeo-bun/issues/169). Read on 2026-10-17. The question: how can a map's printed grid (cell size and offset) be found from its pixels in the browser, and how well does our current detector do it?

Sources are numbered and listed at the end. Each claim says what it rests on:

- **measured**: a probe run in this session. Scripts and outputs are in scratch folders outside the repo (see [16]).
- **code**: source code, ours or third-party. Third-party code was read as text and never run.
- **search**: a web page seen only in search results, not opened.
- **inference**: my reasoning from the sources above. It is not a finding.

## Short answer

Yes, a printed grid can be found from pixels in the browser. The usual method looks for the repeating lines. Sum the edge strength along each column and each row, then find the repeat distance with autocorrelation (or an FFT). The offset comes from fitting the repeats. A Hough transform finds the lines directly, but it needs more tuning. Atlas VTT fits one lattice to the edges across the whole map, and reports "no grid" when the lines do not support one [7].

Our detector does none of this. It takes a column count from a small neural network, or guesses from the image's width and height, then snaps the answer to a divisor of those dimensions. On our probes that is wrong for most realistic maps. A 2048 × 2048 map with 22 columns comes back as 16 × 16. The detector never says "no grid": a blank texture comes back as 32 × 32.

The pixel work is cheap. A classical pass over an 8000 px map takes about 0.1 s of plain JavaScript in Node (measured). The network predict took about 1 s on Node's CPU backend (measured). We have not measured the browser.

## What our detector does today

It runs when a map is added to the library. In `src/helpers/libraryUpload.ts` (line 19), the size is the first of these that is set [14]:

1. The saved library default for that item.
2. A size written in the file name as `NxM`, read by `filenameGridSize` in `src/helpers/library.ts`.
3. For a map only, `getGridSizeFromImage`.
4. Otherwise, no size.

`getGridSizeFromImage` in `src/helpers/grid.ts` tries three things in order [14]:

1. **Network** (`gridSizeML`). It draws the image 2048 px wide, takes a 32-row strip from the middle, converts it to luma, and runs it through a small network. The network outputs one number: a column count. The code then picks the candidate closest to that number. A candidate is `width / s` for each divisor `s` of `gcd(width, height)`, and it counts only if it is between 11 and 199. If no candidate is valid, it uses the raw number as the column count and works out the rows from the aspect ratio.
2. **Heuristic** (`gridSizeHeuristic`). It uses only the width and height. It picks the candidate with the smallest z-score against mean counts of 31.6 columns and 32.6 rows (standard deviations 14.4 and 15.6). The code comment says these come from "> 1500 maps from the web" [14].
3. **Fallback**: 22 × 22.

The model is never asked whether a grid is present. It always returns a number. The model files are in `src/ml/gridSize/` (a 141 KB `model.json` and a 2.27 MB weights file). The commit that updated the model says "Update grid ml to use MobileNet V2" [14]. The training data is not in the repo.

There is no Web Worker anywhere under `src/` [14]. All of this runs on the page's main thread.

## How a printed grid can be found from pixels

These are the approaches with working code or a clear description behind them. The first three are the ones the sources use.

1. **Projections and autocorrelation** (AutoGrid [1], quickimport [6]). Sum an edge measure along each column and each row. A printed grid makes these sums repeat at the cell width and height, so the autocorrelation of each sum has peaks at multiples of the cell. The first strong peak gives the period. The offset comes from the phase that best fits the peaks in a comb. AutoGrid's code uses a 2-pixel line response, trims 5% from each edge, weights the lags with a prior, and refines each peak with a parabola [1]. This is cheap and works in the browser. Weak point: a fine pattern in the art can give a peak at half the cell (inference).
2. **Hough transform** (Battle Map TV [5], Duda and Hart [8], OpenCV [9]). Find edges, let each edge pixel vote for the straight lines it could lie on, and take the strongest lines. Battle Map TV uses Canny edges with an Otsu threshold, only the lines at 0 and 90 degrees, and merges nearby lines. It takes the median gap between lines as the cell size and scores it by the share of gaps close to that median. It starts its Hough threshold at 1500 and iterates [5]. The axis-only search means it cannot handle rotated maps (inference from the code).
3. **Spectrum (FFT)** (Atlas [7], sibling note). A printed grid puts peaks in the 2D power spectrum, at its frequency and its harmonics. Atlas scores the peaks at fixed angles for each grid type, and sums the harmonics with decreasing weight [7]. I found no canonical source that describes this for grid-size detection (see "What we could not find").
4. **Lattice fit** (Atlas [7], AutoGrid [1]). Once a candidate period exists, fit one lattice (period in x and y, offset, and optionally stretch and rotation) to every edge on the map by weighted least squares. Robust weights drop outlying edges. Atlas measures up to 2500 edges to sub-pixel accuracy and accepts a grid only when the share of edges on the lattice is 5σ above chance [7]. In the code I read, this is the only route with an explicit "no grid" answer.
5. **Template matching** (AutoGrid [1]). Cut a cell-sized patch and score shifts across the map. This fails when the art repeats the same patch (inference).

## Edge cases

- **Half or double the cell.** An extra fine pattern, or lines drawn at half the cell, can give a half-cell peak. quickimport picks the smallest lag among its top five peaks, so it is exposed to this [6] (code, and inference about the effect). Atlas tries half, double, 3× and 5× of each fit, and rejects a "finer copy" where only every second, third or fifth line is on the map [7].
- **Faint or dashed lines.** The network read a faint 22-column grass strip as 28.2 columns and a faint 80-column strip as 79.5 (measured). Projections over the whole map are more likely to hold up on faint lines, since they add many edges together (inference).
- **Edge cells cut by the border.** The divisor method assumes the map is a whole number of cells. For a 4096 px map with 22.5 cells, the heuristic returns 32 × 32, and the snap returns 16 × 16 for a raw network output of 22.5 (measured). A lattice fit has no such assumption, and Atlas makes none [7].
- **Busy art.** Repeating textures such as wood or tiles compete with the grid for the strongest peak (inference). Grass and Water, which have no known count, came back as 32 columns (measured).
- **No printed grid.** Our code always returns a grid (measured). Atlas uses a chance-corrected support test and says "no grid" [7].
- **Hex grids.** Not probed. Atlas detects flat-top and pointy-top hexes [7]. Our upload detector only returns square counts [14].
- **Non-divisor counts.** Our snap can never return 22 for 2048 px or 22.5 for 4096 px (measured below).
- **Coarse working resolution.** quickimport works at 1600 px. On an 8000 px map, each working pixel is 5 source pixels, so the period is an integer in those units (code [6]). A half-pixel error per cell could add up to about 200 px over 80 cells (inference).

## What we measured

### The current detector

Scripts: `probe-today.mjs` in `/tmp/gridprobe-run/` [16]. It loads our TensorFlow.js model from `src/ml/gridSize/` on Node's CPU backend. It copies the strip, snap and heuristic logic from `grid.ts`; it does not import it. Inputs are the sample textures at 2048 × 2048 and synthetic strips with a grid drawn over a flat or grass background. Node 24.19.0.

**Heuristic, image dimensions only (measured):**

| Image | Truth | Heuristic returns |
|---|---|---|
| 2048 × 2048 | 22 × 22 (Stone texture) | 32 × 32 |
| 8000 × 6000 | 80 × 60 at 100 px | 32 × 24 |
| 7000 × 5000 | 70 × 50 at 100 px | 35 × 25 |
| 4200 × 2800 | 30 × 20 at 140 px | 30 × 20 |
| 4096 × 4096 | 22.5 × 22.5 (edge cells cut) | 32 × 32 |
| 3500 × 2450 | 25 × 17.5 at 140 px | 50 × 35 |
| 1400 × 1400 | 10 × 10 at 140 px | 35 × 35 |
| 4001 × 3001 | none (coprime sides) | null |

**Snap, if the network were exact (measured):**

| Image | Raw network output | Snap returns |
|---|---|---|
| 2048 × 2048 | 22 | 16 × 16 |
| 8000 × 6000 | 80 | 80 × 60 |
| 7000 × 5000 | 70 | 70 × 50 |
| 4200 × 2800 | 30 | 30 × 20 |
| 4096 × 4096 | 22.5 | 16 × 16 |
| 3500 × 2450 | 25 | 20 × 14 |
| 4001 × 3001 | 40 | 40 × 30 (raw fallback) |

For 2048 px, the only valid counts that divide the image are powers of two (16, 32, 64, 128), so 22 is impossible. The same holds for 4096 px. For 3500 × 2450, the nearest valid count to 25 is 20. The snap is fine when the true count divides the image and the network is close.

**Network, on the sample textures (measured):**

| Texture | Raw network output (columns) | Code returns |
|---|---|---|
| Stone | 22.05 | 16 × 16 |
| Blank | 27.34 | 32 × 32 |
| Grass | 31.51 | 32 × 32 |
| Sand | 34.52 | 32 × 32 |
| Water | 39.67 | 32 × 32 |
| Wood | 6.30 | 16 × 16 |

Only Stone has a known count (22). Blank has no grid. The others have no known truth, so this table shows what the code returns, not an error rate. Blank is wrong by definition.

**Network, on synthetic strips (measured; truth is the column count):**

| Columns (truth) | Flat, strong lines | Grass, strong lines | Grass, faint lines |
|---|---|---|---|
| 8 | 12.6 | 19.4 | 36.4 |
| 12 | 12.1 | 9.8 | 18.8 |
| 16 | 15.9 | 16.3 | 32.8 |
| 22 | 21.9 | 22.0 | 28.2 |
| 30 | 29.8 | 29.8 | 29.8 |
| 40 | 36.8 | 39.7 | 39.6 |
| 50 | 49.6 | 49.6 | 49.9 |
| 64 | 62.0 | 63.9 | 64.0 |
| 80 | 39.6 | 35.8 | 79.5 |
| 100 | 22.4 | 20.4 | 100.5 |
| 130 | 25.4 | 36.8 | 78.3 |

Shifting the grid by half a cell changed the grass answer by one column or less for 16 to 64 columns (measured). Reading the table (inference): with strong lines and 16 to 64 columns, the raw network is usually within a few columns of the truth. It is unreliable with 8 or 12 columns and with 80 or more. At 80 and above, faint lines gave a better answer than strong ones, which does not fit a simple pattern.

**Predict time (measured):** a median of 1025 ms over 50 runs on Node's CPU backend. That is not the browser, which may use WebGL. It is not comparable to a browser run.

### The classical probe did not finish

`probe-classic.mjs` never reached its results (measured: it printed only its header). Reading the code, the cause is in its widening loop (lines 68 to 85): `span` takes the value `Infinity`, so `k` starts at minus infinity and the loop never ends. No accuracy figure exists for any classical method on our inputs. The probe was run twice, as the rules allow, and the original in `/tmp/gridprobe/` was left unchanged [16].

### Cost at 8000 px

Script: `/tmp/gridprobe-run/cost.mjs` [16]. Node 24.19.0, one thread, synthetic 8000 × 8000 RGBA data, best of three runs. The medians matched the best times.

| Pass | Input size | Time |
|---|---|---|
| Luma and row/column sums over RGBA | 8000 × 8000 (244 MiB) | 117 ms |
| AutoGrid-style core: 2-px line response, projections, two autocorrelations over lags 20 to 1024 | 4096 px | 73 ms |
| quickimport-style core: 3 × 3 Sobel magnitude, projections, autocorrelation over lags 8 to 800 | 1600 px | 119 ms |

Not timed: image decode, canvas readback, the downscale and grey conversion, any Hough or FFT step, and anything in a browser.

Reading:

- The classical passes are cheap next to the network (measured): 73 to 119 ms, against about 1 s for one network predict on Node's CPU backend. The browser may change the network number (inference).
- A full 8000 px RGBA buffer is 244 MiB (256 MB). Our code avoids that by drawing to a 2048 px canvas before reading [14]. The browser still decodes the full image when it draws it (inference).
- A Web Worker keeps the page responsive during these loops. Atlas runs its whole detector in one [7]. We have no worker today [14]. Getting the image into a worker needs a transferable bitmap or an `OffscreenCanvas` (inference, not checked here).

## Licences

- **Owlbear Rodeo (ours).** The README says "This project is for **personal** use only. We do not offer a license for commercial use." [13]. The repo root has no LICENSE file.
- **AutoGrid.** MIT [2]. The Foundry listing names MrPrimate as the author [3]. The LICENSE file and the local copy name Jack Holloway, 2026 [2]. Both are MIT, so the grant is the same. The copyright holder is unclear and should be checked before any code is copied. AutoGrid's README says it is forked from DDB Importer's code [1].
- **DDB Importer.** MIT [4].
- **Atlas VTT.** AGPL-3.0-only, with an exception for linking to Obsidian [7] (see the #173 note).
- **Battle Map TV.** The PyPI licence field is null, and the classifier says GPL-3.0 [5]. The file I read has no licence header.
- **quickimport.** No origin or licence found [6].

Inference: MIT code can be copied with its copyright and licence notice kept, and the ticket says MIT is compatible with our licence. AGPL code is not compatible. The GPL classifier on Battle Map TV has the same problem for copying (inference). The methods (projections, autocorrelation, Hough, FFT) are not licensed. The code is. Reading a source and writing our own code from the method is the route the sibling note takes.

## What we could not find or verify

- **No canonical source for FFT grid-size detection.** Search found a 2025 arXiv preprint on FFT lattice peaks [12], a paper on repeated-pattern perception [11], and two US patents on autocorrelation period estimation. I did not read them in full, so they are leads only.
- **No published accuracy for AutoGrid, Battle Map TV or quickimport.** AutoGrid ships 13 tests [1]. I did not run them. Atlas has no published figures either (sibling).
- **Not run.** AutoGrid's tests, Battle Map TV and quickimport were read as text only, as the rules require.
- **No measured accuracy for any classical method.** The classical probe did not finish.
- **Not probed:** hex grids, rotated or stretched grids, and maps cut by the border on our code.
- **No browser numbers.** There is no measured decode time, readback time, WebGL time or worker timing.
- **Probe copies.** The probe copies the logic from `grid.ts` rather than importing it, so it can drift from the source.
- **Model training data.** Not in the repo.
- **Search-only sources.** The Duda and Hart paper [8] and the OpenCV tutorial [9] were seen in search results. The method descriptions here are general, not quoted from those pages.

## What this suggests for us

- **Our detector cannot say no.** The network and the heuristic always answer, and a blank texture gets 32 × 32 (measured). A new detector needs a "no grid" answer the GM can see. Atlas's chance-corrected 5σ support test is the one explicit rule in the code I read [7] (inference that it fits us).
- **Drop the divisor snap first.** Two of the wrong answers come from the snap, not the network: 22 becomes 16 and 22.5 becomes 16 (measured). A lattice search can return any cell size and offset, so it is not limited to divisors of the image size (inference).
- **Keep the network as a hint.** Its raw count is close on strong grids of 16 to 64 columns (measured). Atlas also uses a measured hint, with a ±13% window [7]. A window around the network's count could seed a lattice search, but the network is wrong for Wood (6.3) and for blank maps, so it cannot be the only source (inference).
- **Move the pixel work off the page.** The network predict is the largest cost we measured, about 1 s on CPU in Node. Classical passes at 4096 px take under 0.1 s (measured). A worker would keep the page responsive. Check the browser time before choosing (inference).
- **Keep the first guess editable.** Wrong first guesses are common on our probes, so the detected grid must show on the map with a quick way to correct it. Atlas users keep asking for typed counts and cell sizes [7]. Our map already stores columns and rows from upstream, which is the typed fallback (see the sibling note on the inset and columns).
- **Map a detected cell to our units by moving the map.** Under [ADR 0010](../adr/0010-world-units-are-pixels-at-a-fixed-cell-size.md), the cell stays at 150 units, so the map is scaled by 150 divided by the detected cell and moved so the offset lands on a grid line (inference, following the sibling note). The cell itself is never changed. [ADR 0003](../adr/0003-scenes-arrive-with-the-item-model.md) says a scene has one grid, so every map in a scene is scaled to the same cell (inference).
- **Licence.** Only MIT code can be copied, and only with its notice kept. Settle the AutoGrid copyright-holder question first. For the AGPL and GPL-labelled sources, write our own code from the method (inference, needs a decision).

## References

1. AutoGrid, by MrPrimate. Source: https://github.com/MrPrimate/auto-grid. Read from a local copy (`GridDetector.ts`, `SceneGridDetector.ts`, `GridResolver.ts`, `GridDetectionCandidate.ts`, `README.md`). Not run.
2. AutoGrid licence, MIT. https://raw.githubusercontent.com/MrPrimate/auto-grid/main/LICENSE.md
3. AutoGrid on the Foundry VTT package listing (author named as MrPrimate). https://foundryvtt.com/packages/auto-grid (search result, not opened).
4. DDB Importer, by MrPrimate, MIT licence. https://github.com/mrprimate/ddb-importer and https://raw.githubusercontent.com/MrPrimate/ddb-importer/master/LICENSE.md
5. Battle Map TV. https://github.com/Conengmo/battle-map-tv. Package metadata (licence field null, GPL-3.0 classifier): https://pypi.org/pypi/battle-map-tv/json. Read `scale_detection.py` from a local copy. Not run.
6. quickimport grid detection service (`grid-detection-service.js`, `signal-processing-utils.js`). No URL: origin and licence unknown. Read from a local copy. Not run.
7. Atlas VTT 0.8.0, spectral engine source: https://github.com/atlas-vtt/atlas-vtt/tree/0.8.0/src/app/pixi/spectralEngine. Licence and line references in the sibling note, `docs/research/map-alignment-atlas-vtt.md` (#173).
8. R. O. Duda and P. E. Hart, "Use of the Hough transformation to detect lines and curves in pictures", Communications of the ACM, 1972. https://cacmb4.acm.org/magazines/1972/1/12129-use-of-the-hough-transformation-to-detect-lines-and-curves-in-pictures (search result, not opened).
9. OpenCV, Hough Line Transform tutorial. https://docs.opencv.org/4.11.0/d6/d10/tutorial_py_houghlines.html (search result, not opened).
10. Liu and Collins, repeated-pattern perception, CVPR 2000 (CMU copy). https://www.ri.cmu.edu/pub_files/pub2/liu_yanxi_2000_2/liu_yanxi_2000_2.pdf (search result; a lead on lattice detection, method not checked).
11. Repeated-pattern perception, CMU project page (search result; lead only). https://www.ri.cmu.edu/project/a-computational-model-for-repeated-pattern-perception-using-crystallographic-groups
12. arXiv 2511.09734, 2025 preprint on FFT lattice peaks. https://arxiv.org/pdf/2511.09734 (search result; not read in full).
13. Owlbear Rodeo README, licence section (lines 140 to 152): [README.md](../../README.md).
14. Our code, read in this worktree: [src/helpers/grid.ts](../../src/helpers/grid.ts), [src/helpers/libraryUpload.ts](../../src/helpers/libraryUpload.ts) (line 19), [src/helpers/library.ts](../../src/helpers/library.ts) (`filenameGridSize`), [src/ml/gridSize/GridSizeModel.ts](../../src/ml/gridSize/GridSizeModel.ts). Model commit 69431c1, "Update grid ml to use MobileNet V2". The search of `src/` for "Worker" found no matches.
15. ADR 0010, [world units are pixels at a fixed cell size](../adr/0010-world-units-are-pixels-at-a-fixed-cell-size.md). ADR 0003, [scenes arrive with the item model](../adr/0003-scenes-arrive-with-the-item-model.md).
16. Probe scripts and outputs, not committed: originals in `/tmp/gridprobe/`, run copies and outputs in `/tmp/gridprobe-run/` (`probe-today.mjs` with `today.out`, `probe-classic.mjs` with `classic.out`, `cost.mjs` with `cost.out`).
