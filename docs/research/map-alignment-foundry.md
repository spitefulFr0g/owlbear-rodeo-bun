# How Foundry VTT aligns a printed grid to the scene grid

Research for [#172](https://github.com/spitefulFr0g/owlbear-rodeo-bun/issues/172), a ticket on [Map: map alignment (#169)](https://github.com/spitefulFr0g/owlbear-rodeo-bun/issues/169). Read on 2026-10-17.

**Sources.** The primary sources are Foundry's knowledge base article on scenes [1], Foundry's release notes [2 to 6] and the public API documentation for version 14.368 [7 to 9]. Where a live page could not be fetched, its saved copy from the research notes was read and is cited as a saved copy [10, 11]. Foundry's English strings files for v14, v13 and v11 were read from saved copies [12]. Community tools and code [13 to 17] are not Foundry's and are marked as community. The Foundry issue tracker could not be read (the fetch returned 404), so nothing here comes from it. Numbered references are listed at the end.

**Foundry's words.** Foundry calls a map the *background image* of a *scene*, and the scene's cell pattern the *grid*. *Printed grid* means the grid drawn into a map's image, as in #169. In v14 the tool is the *Grid Configuration Tool*. Its hint text says it configures "the grid and scene offset", and the scale control is labelled *Scene Scale* [12].

## In short

Foundry v14 never detects a printed grid. The GM sets the scene's grid size, then matches the overlay to the printed lines by hand. The Grid Configuration Tool moves the scene with the arrow keys and scales it with Shift+mousewheel or Shift+Up and Shift+Down, and typed fields set the offset [12]. The scene stores three kinds of value: `grid.size` for the cell, `width` and `height` for the scene's size, and `shiftX` and `shiftY` for the offset [7]. The v14 grid data has no offset of its own [10], so the scene's shift is the only offset. Foundry's own documented method for a cell size is arithmetic: count the cells across the image and divide [1]. The only automatic option is third-party: AutoGrid, Wayfinder Auto-Grid, and, for v13, Precision Grid Aligner [13 to 15].

Before v14 the offset appears to have belonged to the background texture [11, 17]. Release 9.245 changed the shift fields to "changing the background offset instead of grid offset" [2].

## The flow, from setting the grid to matching the lines

### Setting the grid first

- The knowledge base says changing the grid size "may change the alignment of walls, lights, notes, and tiles", and advises setting it "before you begin adding details to the scene" [1]. So the cell size comes first, and the alignment is a second step.
- The grid size is "The number of pixels which represent a single grid space" [1]. Foundry's default is 100 px.

### Opening the tool

- The knowledge base says to use "the icon to the left of the grid type dropdown" to open the Grid Configuration Tool, "which allows for the fine tuning of various grid options... in real time" [1].
- The same article's alignment paragraph puts a different icon in a different place: "the Grid Alignment Tool by clicking the angled-ruler icon to the right of the Grid Type dropdown" [1]. The article does not say which version it describes, and the two statements conflict. The v14 API page describes the Grid Configuration Tool as "A tool for fine-tuning the grid in a Scene", with `SceneConfig` as its sheet [10]. Whether v14 still has a separate Grid Alignment tool was not confirmed.

### Matching the lines

The v14 strings give the controls [12]:

1. **Scale.** "Use SHIFT+Mousewheel or SHIFT+Up Arrow and SHIFT+Down Arrow to adjust the scene scale."
2. **Offset.** "Configure the grid and scene offset using the mousewheel and arrow keys, or by manually setting the following fields." The fields are *Horizontal* and *Vertical*. Release 14.358 fixed "the arrow keys no longer offset the background when the Grid Configuration dialog was open" [5].
3. **Warning.** Opening the tool on a scene with no background shows: "This is not currently recommended and may produce unpredictable results."

There is no documented anchor, sample grid or check step. The tool is a live overlay that the GM adjusts until it looks right. The release notes and strings say nothing about the moment the GM is done, or about whether the change is kept or reset [5, 12].

## How a cell is measured

- **Counting.** The knowledge base's method: "examining the dimensions of the intended background image and counting the number of grid spaces and dividing the width and height by the number of vertical and horizontal squares". Its example is a 3080 by 2520 px image with 22 by 18 cells, which gives 140 px per cell [1]. (3080 ÷ 22 = 140 and 2520 ÷ 18 = 140.)
- **By eye.** The Grid Configuration Tool shows the grid over the scene in real time, and the GM matches it with the scale and offset controls [1, 12]. No Foundry source describes a measurement step beyond this.
- **Automatic.** None of Foundry's documents describe detecting a printed grid. The community detection tools are covered under "What users report" and are for #174, which this note does not cover.
- **The padded size.** The Scene class's `getDimensions` method "Apply[s] padding to enlarge the playable space and round[s] to the nearest 2x grid size to ensure symmetry", so that "the padding buffer around the map always contains whole grid spaces" [8]. The rounding formula is not given. The SquareGrid class has a `calculateDimensions(sceneWidth, sceneHeight, padding)` method with no description on its page, and it returns `columns`, `rows`, `x`, `y`, `width` and `height` [9].

## What is saved, and where

For v14 [7, 10]:

- **The scene.** `grid` (GridData), `width` and `height` ("normally the width of the background media"), `padding` ("the proportion of canvas padding applied around the outside of the scene dimensions to provide additional buffer space"), and `shiftX` and `shiftY` ("The shift of the scene rect in x-direction (pixels)" and the same for y).
- **The grid.** GridData holds `size`, `distance`, `units`, `type`, `alpha`, `color`, `thickness` and `style`. It has no offset field [10]. The only offset values are the scene's `shiftX` and `shiftY`.
- **The levels.** LevelData has `background`, `foreground` and `textures`. The `textures` field is typed as TextureData with `src`, `tint` and `alphaThreshold` left out [10]. Release 14.354 "Removed the unused offsetX/Y and rotation attributes from TextureData" [4].
- **The image file.** No field stores an alignment on the image. The alignment is scene data and level-texture data. This is read from the schema, not from a Foundry statement.

**A conflict to resolve.** The AutoGrid module writes `offsetX` and `offsetY` into a secondary level's `textures`, and its README says it was verified on v14 [13]. The v14 LevelData type takes `textures` from TextureData, and 14.354 removed `offsetX/Y` from TextureData [4, 10]. The v14 TextureData page could not be read (the URL tried returned 404) [11], so whether that write has any effect on v14 is unresolved.

## v11 and v13 differences

- **v9 and v10.** A third-party script from that era reads `canvas.scene.background.offsetX` [17]. The shift fields then moved the background, not the grid [2].
- **v11.** The padding hint reads "An amount of additional padding around the Scene background image which provides usable canvas space" [12]. The knowledge base's "Offset Background (pixels, X & Y)" [1] matches the v11 and v13 labels, but the article is unversioned.
- **v13.** The scene's `background` is `null | TextureData` [11], so the offset belonged to the scene's background texture. The v13 hint says "Configure the grid and background image position" [12]. Precision Grid Aligner is a v13-only community tool [15].
- **v14.** The hint says "scene offset" and the fields are `shiftX` and `shiftY` on the scene [7, 12]. The scale control is "Scene Scale" [12]. Level textures are typed without offset fields [10], and 14.354 removed them [4].
- **Minimum grid size.** The knowledge base says "minimum of 50px" [1], and the v11, v13 and v14 strings say "the minimum of 50px" in their grid-size error [12]. The v14 API constant `CONST.GRID_MIN_SIZE` is 20 [10]. The constant and the message disagree. The message is what a GM sees when a resize fails, so the 50 px figure is the one shown to users. Which value is enforced was not tested.

## Edge cases

### Edges that cut through a cell

- **No documented fix.** No Foundry document describes a crop, an "is drawing" flag or a whole-cell rule for a map with a partial cell at its edge. Padding is documented as "buffer space" [7, 8] and not as a way to hold a border.
- **Community, v13.** Precision Grid Aligner sets padding to 0 and "normalises width and height to whole cells" [15]. That trims or extends the map to whole cells. It is a v13 tool, and its behaviour on v14 was not checked.
- **Edges and padding.** Release 14.368 fixed "Canvas edges were not reset when changing a scene's dimensions or padding" [6]. The knowledge base warns that changing padding after a scene is detailed "will displace walls, lights, tokens, tiles, and notes" [1]. Release 14.352 made region shapes move with a padding change [3].

### Cells that are not quite square

- The saved GridData holds one `size` [10]. The SquareGrid class exposes `sizeX` and `sizeY` [9], but the saved pages do not say how they are derived from the scene's grid data or its scale. Unequal printed cells can therefore only be matched through the scene's scale, and whether the tool can split the axes was not confirmed.

### Hex grids

- The grid types include Hexagonal Columns (odd and even) and Hexagonal Rows (odd and even) [1]. No Foundry source describes how the alignment tool treats hex grids. A community hex guide gives a size of 76, padding of 0.25 and an offset of 38 over 2 [16]. These numbers were not checked against a v14 scene.

### Maps with no printed grid

- The GM sets the grid size and the scale by eye, or counts the cells as above [1, 12]. No Foundry source describes a size chosen from a rule.

## Touch screens

- The documented controls are the mousewheel, the arrow keys and typed fields [12]. A tablet can type into the fields, but a tablet has no mousewheel and no Shift key by default. This is an inference: the typed fields look like the only touch route to a scale or offset. No Foundry source says how the Shift-modified controls behave on touch.

## What users report

- **AutoGrid** (community) writes the grid size, the scene's width and height, `shiftX` and `shiftY`, and the level textures [13]. Its README says it was verified on v14 [13].
- **Wayfinder Auto-Grid** (community, verified on 14.367; requires Wayfinder Core) says "No scene data is touched until you confirm" [14].
- **Precision Grid Aligner** (community, v13 only) sets padding to 0, normalises width and height to whole cells, and uses Shift+G [15].
- No Foundry forum thread was read for this note.

## Not found

- The padding rounding formula. `getDimensions` describes the rounding in prose only [8].
- Whether the Grid Configuration Tool's scale changes `width`, `height` or `grid.size`, or only the scene's shift and scale. The strings name the scale and the offset, and say nothing about the grid size [12].
- The TextureData fields in v13 and v14. The v14 page returned 404 at the URL tried [11], and the saved v13 copy is a 404 page.
- The padding label in the v13 and v14 strings files. The saved copies do not include it, and v11 has only the hint [12].
- Whether the v14 tool still has a separate Grid Alignment tool, as the knowledge base says [1].
- What players see while the GM aligns a map.
- Foundry issue tracker entries. The fetch returned 404.

## What this suggests for us

Suggestions only; the decisions belong to later tickets on #169.

1. **Foundry keeps the alignment in the scene, and the cell stays put.** The grid has one size and no offset, and the scene's shift and scale do the rest. That matches ADR 0010 closely: keep the cell at 150 units and move and scale the map. It is unverified whether Scene Scale also changes the grid's size, so check that before copying the design.
2. **The whole control set is a wheel, arrow keys and typed numbers.** For us, touch needs drag and typed values, not Shift-modified controls. This bears on the touch parts of #169.
3. **Do not copy padding.** Foundry's padding gives a bounded canvas room to breathe, and its edge rules caused the bugs in 14.352 and 14.368. Our scene is unbounded and its origin has no meaning (ADR 0010), so padding would add nothing.
4. **Confirm before writing.** Wayfinder Auto-Grid touches no scene data until the GM confirms [14]. This fits "The upload-time guess" in #169: any guess is a prefill that the GM confirms.
5. **Settle the minimum cell in code.** Foundry's own message says 50 px and its constant says 20 [10, 12]. If #169 sets a minimum, pick one number and test it.

## References

Foundry knowledge base and release notes:

1. [Scenes](https://foundryvtt.com/article/scenes/), Foundry knowledge base; no version stated; read 2026-10-17.
2. [Release 9.245](https://foundryvtt.com/releases/9.245); read 2026-10-17.
3. Release 14.352, saved copy of https://foundryvtt.com/releases/14.352 (not re-fetched).
4. [Release 14.354](https://foundryvtt.com/releases/14.354); read 2026-10-17.
5. Release 14.358, saved copy of https://foundryvtt.com/releases/14.358 (not re-fetched).
6. [Release 14.368](https://foundryvtt.com/releases/14.368); read 2026-10-17.

Foundry API documentation, version 14 (version 14.368 by its footer):

7. [SceneData](https://foundryvtt.com/api/v14/interfaces/foundry.documents.types.SceneData.html); read 2026-10-17.
8. [Scene class](https://foundryvtt.com/api/v14/classes/foundry.documents.Scene.html), `getDimensions`; read 2026-10-17.
9. [SquareGrid class](https://foundryvtt.com/api/v14/classes/foundry.grid.SquareGrid.html), `calculateDimensions`; read 2026-10-17.
10. Saved copies of the v14 pages for LevelData, GridData, GridConfig and `CONST.GRID_MIN_SIZE` (not re-fetched individually).
11. Saved copies of the v13 SceneData page and of the TextureData pages for v13 and v14. The TextureData saved copy is a 404 page.

Foundry localisation strings (saved copies):

12. English strings files for v14 (`en.json`), v13 (`en-v13.json`) and v11 (`en-v11.json`).

Community (not Foundry's):

13. AutoGrid, by MrPrimate; README and source from a saved copy; the README says it was verified on v14. The listing URL was not recorded.
14. Wayfinder Auto-Grid; verified on 14.367; requires Wayfinder Core. The listing URL was not recorded.
15. Precision Grid Aligner; v13 only. The listing URL was not recorded.
16. A community hex guide on itch.io; its numbers were not checked.
17. A third-party script from the v9 and v10 era (`gridScale.js`), read for `canvas.scene.background.offsetX`; not checked against a version.
