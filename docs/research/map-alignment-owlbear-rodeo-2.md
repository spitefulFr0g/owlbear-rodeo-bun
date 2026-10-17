# How Owlbear Rodeo 2.x aligns a map to its printed grid

Research for [#170](https://github.com/spitefulFr0g/owlbear-rodeo-bun/issues/170), part of map [#169](https://github.com/spitefulFr0g/owlbear-rodeo-bun/issues/169). Sources were read on 16 October 2026.

Every claim names its source by number from the list below. **Inference** marks something worked out from the data model or code, not stated in a source. **Video** marks something seen only in an official docs or blog video. **Forum** marks material from users, not from Owlbear Rodeo.

## Short answer

- Owlbear Rodeo 2.x never changes the scene grid to fit a map. A scene cell is 150 units, and the extension SDK can read that number but has no way to set it [S9, S12]. Alignment changes three values on the image: its grid DPI (how many image pixels make one cell), its grid offset (the image pixel that should sit on a grid point) and its scale (x and y can differ) [S5, S10, S12].
- A GM sets those values in one of four ways: the filename (`49x28`, `150DPI`), typed Columns × Rows with decimals, the alignment rulers (corner, scale handles, precision rail), and since 7 May 2026 a guided tool with three steps, Offset, Size and Refine, that uses a magnifier [S1, S5, S8, S11].
- No source describes 2.x detecting a grid from the image pixels. Grid "detection" in 2.x means reading the filename [S1, S7, S8].
- The values are saved as defaults on the image asset. Each placed map item gets its own copy. Align Image on a placed map changes that item only. The Image Editor changes the defaults and offers to update the copy in the open scene [S1, S2, S10].

## Sources

First-party documentation:

- S1. Docs, "Aligning a Map": https://docs.owlbear.rodeo/docs/aligning-a-map/ (the page still describes only the rulers and the Columns × Rows bar)
- S2. Docs, "Images": https://docs.owlbear.rodeo/docs/images/
- S3. Docs, "Scenes": https://docs.owlbear.rodeo/docs/scenes/
- S4. Docs, "Migrate from 1.0 to 2.0": https://docs.owlbear.rodeo/docs/migration/migrate-from-1-to-2/

First-party blog, by the developers:

- S5. "Effortless Map Alignment", 7 May 2026: https://blog.owlbear.rodeo/effortless-map-alignment/
- S6. Beta patch notes: patch 1 (29 Jul 2022) https://blog.owlbear.rodeo/owlbear-rodeo-2-0-beta-patch-1/, patch 8 (24 Jan 2023) https://blog.owlbear.rodeo/owlbear-rodeo-2-0-beta-patch-8/, patch 9 (1 Mar 2023) https://blog.owlbear.rodeo/owlbear-rodeo-2-0-beta-patch-9/, patch 10 (18 Apr 2023) https://blog.owlbear.rodeo/owlbear-rodeo-2-0-beta-patch-10/
- S7. Release notes: 2.1 (14 Nov 2023) https://blog.owlbear.rodeo/owlbear-rodeo-2-1-release-notes/, 2.2 (14 Feb 2024) https://blog.owlbear.rodeo/owlbear-rodeo-2-2-release-notes/, 2.3 (9 Oct 2024) https://blog.owlbear.rodeo/owlbear-rodeo-2-3-release-notes/
- S8. "Isometric Grid Support", 3 Dec 2024: https://blog.owlbear.rodeo/isometric-grid-support/
- S13. 2.4 release notes, 23 May 2026: https://blog.owlbear.rodeo/owlbear-rodeo-2-4-release-notes/

Extension SDK, documentation and package:

- S9. Grid API: https://docs.owlbear.rodeo/extensions/apis/scene/grid
- S10. Image item and Assets API: https://docs.owlbear.rodeo/extensions/reference/items/image, https://docs.owlbear.rodeo/extensions/apis/assets
- S11. Builders: https://docs.owlbear.rodeo/extensions/reference/builders/image-upload, https://docs.owlbear.rodeo/extensions/reference/builders/scene-upload
- S12. `@owlbear-rodeo/sdk` 3.1.0 on npm: `lib/types/items/ImageGrid.d.ts`, `lib/api/scene/SceneGridApi.d.ts`, `lib/builders/ImageUploadBuilder.js`, `lib/builders/SceneUploadBuilder.js`

First-party extension code, by the Owlbear Rodeo organisation:

- S14. `owlbear-rodeo/prefabs`, `src/addItems.ts`, function `getImageBounds`: https://github.com/owlbear-rodeo/prefabs/blob/main/src/addItems.ts
- S15. `owlbear-rodeo/colored-rings`, `src/helpers.ts`, function `buildStatusRing`: https://github.com/owlbear-rodeo/colored-rings/blob/main/src/helpers.ts

Forum material:

- F1. r/OwlbearRodeo, seen only as search-result snippets through a third-party Reddit mirror (https://redlib.ssps.io/r/OwlbearRodeo/hot). I could not open the threads themselves, so treat this as low confidence.

## Two generations of the tool

**Transform rulers and the Columns × Rows bar, 2.0 until May 2026.** One set of controls appears wherever a map is aligned. A bar has Columns and Rows fields for a grid of known size. The alignment rulers are for a grid of unknown size; the docs say they are "inspired by a physical drafting table" [S1]. The rulers live in a Transform mode, which had a Z shortcut from beta patch 1 [S6]. While Transform mode is on, the grid is drawn as a solid orange line so you can check your work [S1]. Since 2.1 it switches to a highlight colour automatically [S7].

**The alignment tool, 7 May 2026.** The developer wrote a new tool "100% focused on map alignment" instead of replacing the transform tool, so the transform tool still exists [S5]. It builds the docs' three recommended steps into the interface as Offset, Size and Refine [S5]. The docs page has not caught up and still describes only the rulers [S1].

## From adding a map to an aligned map

There are three entry points, and the docs name the first as the one most used [S1]:

1. **Scene Importer, before the scene exists.** In the Asset Manager's Scene tab, click Add and drop in a map image [S1, S3]. The left panel becomes a preview editor. Grid type, measurement and colour sit in a sidebar on the right; since 2.1 the sidebar is always visible [S3, S7]. The Columns × Rows bar sits on top of the preview. The rulers come up with the Transform button in the bottom toolbar [S1]. If the filename holds a grid size or DPI, the map arrives already sized [S1, S7]. The grid colour is picked from the map's brightness [S3]. Click Import to create the scene and add the map to the Maps library [S3]. The importer remembers your settings, such as a 1.5 m grid, between uses [S4].
2. **Align Image, on a map already in an open scene.** Maps are locked by default, so you usually double-click to select the map. Then open the context menu's three dots or right-click, and choose Align Image [S1]. The Columns × Rows bar floats over the map and the rulers appear in the scene [S1]. This menu item was called Edit until 2.1 [S7].
3. **Image Editor, for the image's defaults.** Click Edit on a map tile in the Asset Manager, then the Transform button [S1, S2]. When you save, future placements use the new values. If the open scene contains that map, a prompt offers Update to apply the values there too [S1].

Images added through the asset manager's New tab also have an import **Size** option. The choices are Auto, Set DPI, Set Columns and Set Rows. The docs say only that Auto works "based on the image type and resolution" [S2].

## How a cell is measured

- **Filename.** A name containing `49x28` sets 49 columns and 28 rows [S1]. Beta patch 10 added decimal numbers [S6]. From 2.2, a value such as `Ocean 150DPI.jpg` sets the image DPI directly [S7]. Dungeon Scrawl already writes the grid size into its export filename [S1].
- **Typed Columns × Rows.** For known grids, such as a Patreon post saying "40x22" or a Dungeondraft map's width and height [S1]. **Video:** the fields show two decimal places and update live while the rulers are dragged, for example 30.11 × 18.53 changing to 30.05 × 18.50 [S1, precision rail video].
- **Alignment rulers, three steps** [S1]:
  1. *Align the corner.* Drag the ruler's corner onto the top-left of any grid cell you can see on the map. It does not have to be the map's edge.
  2. *Scale the ruler.* Drag the size handles until the ruler's four marks sit on the map's grid lines.
  3. *Refine with the precision rail.* The rail reaches to the far end of the map, and you fix the leftover drift there. The docs show that step 2 alone left "tens of pixels" of error at the far corner, because the error adds up across every cell, and they note that "many VTTs will only allow this level of alignment". **Video:** the rail is a band across the map with a handle labelled with the image DPI and the distance from the corner, for example "65dpi (150ft)".
- **One axis at a time.** Hold Shift while aligning to change one axis and leave the other fixed [S1]. The docs present this as the fix for hex maps. Beta patch 8 added single-axis alignment for hex grids that do not match Owlbear Rodeo's hex shape, and made the scale control respond linearly to input [S6]. 2.3 added a lock button to the alignment toolbar that decides "whether you can control each axis independently" [S7].
- **Slow movement.** Hold Ctrl or Cmd to slow the drag down, or zoom in [S1]. While moving a map, the same key turns snapping off [S2].
- **New tool, May 2026** [S5]:
  - *Offset:* drag an anchor onto a point of the map's grid. When pressed, the anchor turns into a large magnifier with a crosshair shaped like the current grid (square, hexagon and so on).
  - *Size:* drag an anchor so a drawn cell matches one printed cell. The drawn cell follows the grid type.
  - *Refine:* the whole map is covered by a highlighted grid. Hovering any cell corner shows an anchor that nudges the map, so drift is fixed "at the point where you can see it".
  - A Next button appears below the cursor; the toolbar also moves between steps.
  - The developer says the tool is "effortless to pick up but also lightning fast for experienced users". No timings are published.
- **Automatic detection.** None from image pixels is described anywhere in 2.x [S1, S5, S6, S7, S8]. 2.4 added computer vision, but for fog ("Forecast"), not for grids [S13]. The legacy 1.x code, which this fork inherited, did run an in-browser model to guess the grid size; see the last section.

## What is saved, and where

| Level | Alignment fields | How it changes |
| --- | --- | --- |
| Image asset (library) | Default `grid.dpi`, `grid.offset`, `scale`, `rotation` | Filename, import Size option, Scene Importer, Image Editor [S1, S2, S10, S11] |
| Placed image item | `grid.dpi`, `grid.offset` (image pixels), `scale` (x and y), `position`, `rotation`, plus `image.width` and `image.height` | Align Image; the Update prompt after an Image Editor save [S1, S10, S12] |
| Scene | `grid.dpi` (150 by default), `type`, `scale` (a string such as `5ft`), `measurement`, `style` | Grid controls change type, scale, colour and so on. Nothing documented changes `dpi`: the SDK has `getDpi` but no setter, and the scene builder fixes it at 150 [S3, S9, S11, S12] |

The SDK describes `ImageGrid.dpi` as "Dots per inch of the image. Determines the resolution of one grid cell in the image." Offset is described as "relative to the image" [S10, S12]. The blog explains that offset "drives the image's snapping point and center of rotation" [S5]. Both builders default to 150 DPI, offset (0, 0) and scale (1, 1) [S12].

Owlbear Rodeo's own extension code turns these fields into a size on the scene [S14]. `colored-rings` uses the same DPI ratio [S15]:

```ts
const dpiScale = dpi / item.grid.dpi; // dpi = the scene grid's DPI
const width = item.image.width * dpiScale * item.scale.x;
const height = item.image.height * dpiScale * item.scale.y;
const offsetX = (item.grid.offset.x / item.image.width) * width;
const min = { x: item.position.x - offsetX, /* same for y */ };
```

So a map with 70-pixel printed cells and `grid.dpi` 70 shows 150-unit cells at scale 1. The item's `position` is where its offset pixel lands.

**Inference:** typing Columns sets `grid.dpi` to the image width divided by the column count. Rows that disagree with that, once the axes are unlocked, can only be stored as a different `scale.y`, because `grid.dpi` is a single number. Default snapping pulls the item's position, which is its offset pixel, onto a grid point [S2, S5]. So once the offset sits on a printed grid corner, moving the map keeps the printed grid on the scene grid.

## Edge cases

- **Edges that cut through a cell.** The rulers and the Offset step anchor on any visible cell corner, not on the image edge [S1, S5]. Column and row counts take decimals in the bar and in filenames [S1, S6]. **Inference:** a map that starts half a cell in has a fractional count, such as 40.5, and an offset that is not (0, 0). Nothing forces the edges to fall on grid lines.
- **Cells that are not quite square.** Scale has separate x and y values, and the lock or Shift changes one axis at a time [S1, S7, S10]. The docs discuss this only for hex maps.
- **Hex grids.** Hex sizes do not fit whole pixels, so many hex maps carry drift "baked into the image". The rulers' answer is to fix one axis, then hold Shift and use the precision rail again on the drifting axis [S1]. The new tool's Refine works anywhere on the map and is described as working "great on hex maps" [S5]. 2.3-era patches added more hex snapping points "for better snapping for map alignment" [S8]. The scene's DPI means different things by grid type: cell width for vertical hex, cell height for horizontal hex, and the height after transform for isometric and dimetric [S9].
- **Isometric and dimetric.** These grid types arrived in December 2024 [S8]. The new tool's crosshair and Size drawing follow the grid type [S5]. The docs do not cover aligning isometric maps.
- **No printed grid.** No source gives a method for this. The tools available are Set DPI on import, the scale handles, and turning the grid down (opacity) or turning snapping off [S2, S3].
- **A wrong grid after placing items. Forum, F1:** one user asked how to shift the grid a few pixels without disturbing fog and placed items. **Inference:** in 2.x you move the map, not the grid, so tokens and fog stay on the grid but no longer match the map underneath.

## Touch screens

- The new tool's magnifier "will lift up to get out of the way of your finger" [S5]. This is the only touch-specific alignment behaviour in any source.
- The rulers' precision helpers are keyboard modifiers: Shift for one axis and Ctrl/Cmd for slow movement [S1]. The docs give zoom as the only alternative. **Inference:** the 2.3 lock button is the only way to change one axis without a keyboard, and the typed Columns × Rows fields work on any device.

## What works well and what works badly

What works well, according to the developers:

- Maps with a known grid size align with no dragging at all, from the filename or two typed numbers [S1, S7].
- The precision rail fixes accumulated drift that a corner-plus-scale fit leaves behind [S1].

What works badly, admitted in first-party sources:

- The transform tool is "not very intuitive" and "doesn't do a good job teaching you how to use it", so the developers relied "heavily on guides and tutorials" [S5].
- Users struggled most "when users want to align a map once that it has already been imported" [S6, patch 9]. This led to renaming the modes to Edit, and later to Align Image [S6, S7].
- In December 2024 they fixed "the alignment controls not working in the Scene importer on the first try" [S8].
- Hex maps need extra work because the drift is in the artwork [S1].
- A map must be unlocked or double-clicked before it can be aligned [S1].

Users' reports:

- **Forum, F1:** a user said Align Image did not seem to work on a map with a grid already printed on it, and the ruler snapped awkwardly. The advice was to turn grid snapping off.
- I found no user reports, good or bad, about the May 2026 tool.

## What this suggests for us

These are suggestions only. The decisions belong to later tickets under #169.

- **The data model already fits ADR 0010.** The cell stays at 150 units. Each map carries a cell size in image pixels, an offset in image pixels and an x/y scale, and its size on the scene is `pixels × 150 / dpi × scale`. Using the SDK's own field names (`grid.dpi`, `grid.offset`) keeps the extension question that ADR 0010 left open cheap to answer.
- **Anchor on a printed corner, not on the image edge.** Offset plus decimal cell counts is how 2.x handles edges that cut through a cell. Our bar needs the same: never assume the map's edge is a grid line.
- **Measure the cell by distance, not by counting.** The precision rail and Refine both divide the error by the number of cells between two points. A tool that takes one corner, a rough cell size and a second corner far away, then rounds the number of cells between them, gets an exact size with no counting. That fits within 30 seconds.
- **Make the first guess automatically, in the browser.** 2.x reads only filenames. This fork already reads filenames and has the legacy in-browser model and heuristic (`getGridSizeFromImage` in `src/helpers/grid.ts`, called from `src/helpers/libraryUpload.ts`). Running it on the client keeps the rule that the server never reads an image. The guess still has to be easy to correct.
- **Design for touch from the start.** Use a lock button rather than Shift-only for single-axis changes, and a magnifier that lifts clear of the finger. Don't make Ctrl/Cmd the only route to precision.
- **Decide early where alignment lives.** 2.x keeps defaults on the asset and copies on each item, and users got lost aligning after import. Offering "also save as this image's default" when aligning a placed map would avoid a separate Image Editor trip.
- **Show the scene grid in a highlight colour while aligning,** as 2.x has done since 2.1.
