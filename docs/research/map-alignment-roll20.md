# How Roll20 aligns a map to its printed grid

Research for [#171](https://github.com/spitefulFr0g/owlbear-rodeo-bun/issues/171), a ticket on [Map: map alignment (#169)](https://github.com/spitefulFr0g/owlbear-rodeo-bun/issues/169). Read on 2026-10-16.

**Sources.** Most of this comes from the Roll20 help centre, the Roll20 blog and the Roll20 change log. The help centre's pages refuse automated fetches, so its articles were read through the help centre's public articles API (`help.roll20.net/api/v2/help_center/en-us/articles/<id>.json`); the links below go to the articles' own pages. Anything taken from the Roll20 community forums is marked **[forum]**, with the poster's role and the date. Reddit, the community-run Roll20 wiki and Roll20's demo videos could not be read, so nothing here comes from them. Numbered references are listed at the end.

**Roll20's words.** Roll20 calls a scene a *page*, the scene's grid the *page grid*, an image item a *graphic*, and the Map layer the *Map & Background layer*. *Printed grid* means the grid drawn into a map's image, as in #169.

## In short

Roll20 never detects a printed grid. The GM points it out by hand. Since 19 August 2026 there are two tools [7, 14]. The new guided tool (an open beta, free to every GM) has three steps: put a crosshair on one printed intersection, scale a 3×3 sample grid until it matches the printed grid, then drag any line to remove drift. The Legacy tool has the GM trace a 3×3 box and then fine-tune by hand. Both leave the page's cell at its size, 70 px by default, and change only the map graphic's width, height and position. The new tool then resizes the page to fit the map and locks the map. The alignment is stored only on that one graphic on that one page; the image in the Art Library keeps nothing.

## The flow, from adding a map to having it aligned

### Dropping the map

- The GM drags an image file onto the tabletop. It uploads to the Art Library and appears on the tabletop [4].
- **Smart Sizing.** Dropping an image on an *empty* Map layer opens a prompt with three choices: resize the page to match the image, resize the image to fit the page, or launch Align to Grid. Closing it or choosing "Leave everything as is" leaves both alone. The prompt can be turned off under Settings, Graphics, "Disable auto sizing of assets dropped on the Map Layer" [1].
- An image bigger than the page dropped on the Token or Light layer gets an offer to switch to the Map layer, which then triggers Smart Sizing [1]. The trigger is an image above 1750×1750 px [8].
- Roll20's own map tutorial makes a map in Dungeon Scrawl at 70 px per cell, picks "Adjust Page Size" in the prompt, and reaches for Align to Grid only "if for some reason, your map is NOT lining up properly" [9].

### The new tool (beta, "Recommended")

1. **Open it.** Open the Map layer, which shows a hotbar, and choose Align to Grid, the second button. The GM picks the Beta tool or the Legacy tool [1]. It also opens from Page Settings [7, 2026-09-28].
2. **Anchor.** "Align the crosshair with a grid intersection on your map." The crosshair adapts to the grid type: a hex grid gets a three-way crosshair "to match the vertex where three edges meet". The overlay colour can be changed if the default does not stand out against the map [1].
3. **Scale.** "Resize the sample grid (a 3x3 for square grids, a cluster of hexes for hex grids) until it matches the grid printed on your map" [1].
4. **Fine Tune.** "Drag from any grid intersection or line to correct drift," or use on-screen X/Y "ticker" buttons [1]. A Roll20 designer explained it to a confused user: "you can use the little crosshairs that pop up to draaaag your image to make it match the grid" [15, **forum**, Roll20 Team, 2026-08-19].
5. **Done.** "Your page resizes to fit the map exactly, and everything locks in place so it can't be bumped out of alignment mid-session" [1].

At every step the GM can drag by hand, nudge with the arrow keys ("1px, or 10px while holding Shift") or press the on-screen X/Y buttons [1]. The GM "can go back at any time throughout the process without starting completely from scratch" [13]. Tokens, Dynamic Lighting and Map Pins already on the page are not disturbed [14]. A toggle hides the off-screen parts of tokens on the Map layer while aligning [7, 2026-09-23]. The tool is disabled on maps connected to Dungeon Scrawl [7, 2026-10-06]. Roll20 is "considering allowing the automatic page resize that takes place after alignment to be toggled on and off", so as not to force "GMs to give up too much autonomy" [14]. The Legacy tool goes away when the beta ends [14].

### The Legacy tool

The help centre's steps [1]:

1. Zoom in to 150%.
2. Be on the Map & Background layer.
3. Right-click the map, Advanced, Align to Grid.
4. "Click and drag to trace a 3x3 (three across & three down) square box aligned with the grid on your map. Disregard the Roll20 grid for now."
5. On release a window appears; click its Align to Grid button.
6. The map is resized "to match fairly closely to Roll20's grid". Fine-tune with the horizontal and vertical scaling handles.

The fine-tuning the help centre then gives (credited to Gauss, a Forum Champion) is a loop: hold Alt and drag the map until its grid lines up "in the center of the map"; then open Advanced, Set Dimensions and change the width while vertical lines sit left or right of the page grid, and the height while horizontal lines sit above or below; "repeat the above step until the grid matches your entire map" [1].

Roll20's own summary of this process: it "takes several manual steps and has a less-than-stellar success rate", "sometimes warping your map along the way or leaving strips of unused canvas on the sides" [12].

## How a cell is measured

- **Nothing is detected.** None of the help centre articles, blog posts or change log entries read for this describes finding a printed grid automatically. Every method has the GM mark the grid by hand or type numbers.
- **New tool:** one anchored intersection, a 3×3 sample grid scaled over the printed grid, then dragging any line or intersection anywhere on the map. Roll20 describes "precise control over independent axes" [12].
- **Legacy tool:** a hand-traced 3×3 box at 150% zoom, from which the tool works out a cell size and resizes the map. A staff member: "The alignment tool just updates the width and height of a graphic" [19, **forum**, Roll20 Production Team, 2021-02-24]. Gauss: "Roll20 resizes the map not the grid" [18, **forum**, Forum Champion, 2013-04-07]. A user on what the box gives: "it guesses what the grid size it. Almost every time, it's like 35x36 or 34x37", and "we're unable to edit the values after measuring" [17, **forum**, 2012-12].
- **Typing numbers.** Set Dimensions takes pixels, or "Units", the number of cells [5]. A staff member: "If it's a whole number of grid units orthogonally, you'd be better off counting them and setting the size that way" [19, **forum**, 2021]. When the printed cell is a known number of pixels, the help centre gives the other direction too: keep the map at its own size and set the page's cell size to it, for example 64 ÷ 70 ≈ 0.914, then correct the scale to 5 ÷ 0.914 ≈ 5.47 ft so measuring still reads 5 ft. It warns: "This presumes that there are no partial grid borders. If there are, you will need to use the Align to Grid tool" [1].
- **Aids to seeing the grid.** Zoom to 150% (Legacy) [1]; change the overlay colour (new) [1]; set the page grid to "a highly visible" contrasting colour (a Pro user's method in the help centre) [1]; temporarily make the page very large, such as 200×200, so the map can be spread out before tracing [1]. Roll20 names the folk method it set out to replace: "Turn your grid bright pink, crank up the opacity, and hope you get lucky!" [13].

## Page settings: cell size and page size

- **Cell size.** Page Settings, Cell Width (Cell Height for Hex (H) grids), entered as a multiplier of 70 px or as pixels; the dialog converts. 0.5 makes each cell 35 px [2]. The new Map-layer hotbar has "Canvas Dimensions: Set the cell size (default is 70 pixels/cell)" [14]. "Roll20 uses a baseline of 70 pixels equals 1 inch, when displayed at 100%" [2].
- **Changing the cell size is the escape hatch, not the norm.** A Roll20 staff member: "Changing the grid size to be 32x32 is, to us, an advanced operation. You're working against what the software expects" [17, **forum**, Roll20 Team, 2012-12]. The help centre: "If you find that using a grid size other than 1 creates a problem contact us, so we can help you to fix this while keeping the grid size at 1" [1].
- **Page size.** Width and height "in increments of 70 pixels, or put the total pixels of your canvas and Roll20 will convert it" [2]. It is stored in units of cells, 25 by 25 by default [6].
- **Where the grid starts.** Until the new tool, the page grid always started at the page's top-left corner "with only complete cells" [13]. A page now also stores a horizontal and vertical grid offset [6], and the hotbar's Grid Settings can "Adjust grid offset by exact pixels" [14].
- **Scale** is a distance per cell, 5 ft by default; with the grid off it is the distance per 70 px [2]. Scale and cell size are separate, so halving the cell means halving the scale by hand [1].
- **Grid type** is square, Hex (V), Hex (H), dimetric or isometric [3, 6]. Turning the grid off also turns off snapping; opacity 0 hides the lines but keeps snapping [2].

## What is saved, and where

The Mod Scripts Objects reference lists what a page and a graphic hold [6]:

- **The page:** `width` and `height` "in units"; `snapping_increment`, the "size of a grid space in units", 1 by default; `grid_type`; `grid_offset_x` and `grid_offset_y`; `scale_number` and `scale_units`; `showgrid`, `grid_opacity`, `gridcolor`, `diagonaltype`.
- **The map graphic:** `layer` (`map`); `left` and `top`, the "number of pixels from the left edge of the map to the center of the graphic"; `width` and `height` in pixels; `rotation`; `lockMovement`; `disableSnapping`; `isdrawing`; `imgsrc`.

So an alignment is the map graphic's own width, height and centre on one page, plus that page's size and grid settings. There is no field for a measured printed cell, an anchor, or an alignment as such, and nothing is written to the image in the Art Library. Placing the same image again starts over: an Art Library image dragged onto a page without a grid lands at a default 100×100 px [7, 2026-08-12], and holding Alt now places it at its original dimensions instead of 70×70 px [7, 2026-09-28]. The help centre's way to avoid aligning a map twice is to copy the whole page into a separate "map library game" with the Transmogrifier, a paid perk, "so you never have to go through that setup again for that map" [1].

## Edge cases

### Edges that cut through a cell

- **Why it was hard.** The page grid started at the page corner with only whole cells, so "imagine your map has a 70px grid baked into the artwork... but the artist added a 25px border around it. With the current tool... the only way to use that map is to force the border to hang off the page" [13].
- **Snapping fights it.** With the grid on, snapping applies to maps as well as tokens: a moved image snaps to the grid, and "an image will scale to the nearest grid line in either direction". Images scale from their centre. Holding Alt while moving, rotating or scaling ignores snapping [4]. A graphic can also be set to ignore snapping (Advanced Transform, Disable Grid Snapping) [5] or be set "As Drawing", which also ignores snapping [4].
- **Legacy workarounds.** Gauss: "Alt will allow you to move the map in case the map has incomplete grid edges" [17, **forum**, 2012-12]. A Pro user's method, printed in the help centre: set the map to 700×700 px, set "is drawing", put its top-left one row and column in, then drag the bottom edge until the lines along the left edge match and the right edge until the lines along the top edge match; for "old maps [that] ended about halfway into another row/column", use "is drawing" so the overhang sits in a border row or column [1]. Another user's advice was simply "Trim the edges so that incomplete grids are not on the map image" [17, **forum**, 2012-12].
- **New tool.** The anchor is any printed intersection, not the image's corner, and Roll20 says the tool handles "bordered art, offset grids" [1]. Since Done then fits the page to the map exactly, a bordered map needs the page grid shifted off the page corner, which the new grid offset fields allow. No source says the tool writes those fields, so this is an inference.

### Cells that are not quite square, or unevenly spaced

- **Legacy.** The traced box is measured on each axis, which is why users saw sizes like "35x36" [17, **forum**]. Fine-tuning is per axis too: the side handles stretch one axis [4], and Set Dimensions takes width and height separately [1].
- **New.** "Precise control over independent axes" [12]; "works on maps that used to be impossible to align: bordered art, offset grids, unevenly spaced lines" [1]; Fine Tune corrects "any drift or odd-sizing" [14].
- **The limit.** A graphic has one width and one height [6], so the map can only be stretched evenly on each axis. Lines that are truly uneven can be fitted on average, not exactly. This follows from the stored fields; no source says it outright.
- **Drift.** A user: "even though it aligns up correctly on some squares, on other squares its always off. It seems when I look to the left the grid phases left, and when I look right, the grid phases right" [18, **forum**, 2013-04-07]. Another explained it: with a 59 px map cell on a 60 px grid, the cells match at the start, drift out of phase across the map, and the cure is to count how many times they fall out of phase and stretch by that many cells [16, **forum**, 2013].

### Hex grids

- **Legacy.** "The current Align to Grid process doesn't work for Hex or Isometric grids" [13]. The help centre's hex method is manual: rough-size the map with the handles, count hexes to find the map's centre, Alt-drag that intersection onto a page intersection, then adjust the height and the width with Set Dimensions, repeating until they fit; for Hex (V) swap the axes [1]. Gauss: "there is no easy solution. It requires the Set Dimensions tool and a lot of incremental changes" [16, **forum**]. A user could match "about 10x10 hexes... but anything larger than that starts to drift off" [16, **forum**, 2013]. Another: "change the roll20 hex size until it matches in one dimension and then set the image dimensions until it matches in both dimensions. The hexes seem to be not quite symmetrical, so you end up having to squash the image a bit" [20, **forum**, 2020-09].
- **New.** The same three steps, with the three-way crosshair and a cluster of hexes as the sample, on every grid type including both hex orientations [1, 14]. A Pro user tried "a simple dungeon floor grid and a huge overland hex map": "The updated Align to Grid tool made this an easy task" [15, **forum**, 2026-08-19].

### Maps with no printed grid

There is nothing to trace, so the map is sized by other means: Smart Sizing's "resize image to fit page" or "resize page to match image" [1]; Set Dimensions in cells when the GM knows how many cells across the map should be [5]; or the pixels-per-cell arithmetic above [1]. With the grid off, Page Scale sets the distance per 70 px [2]. Maps made for Roll20 arrive at the right size: Dungeon Scrawl exports at 70 px per cell, or 140 px per cell for subscribers [7, 2026-08-12].

### Rotated maps and tiles

- A user found that aligning a rotated map "accessed the dimensions of the image in an unrotated state and resized the Canvas to match the original orientation". Staff: "alignment is positioning the image relative to its un-rotated self. We will get this fixed" [15, **forum**, 2026-08-30 and 2026-09-09]. Fixed on 2026-10-06 [7].
- Map tiles are aligned one at a time with Scale to Grid in the right-click menu, which "resize[s] and align[s] individual tiles" [1].

## Touch screens

- Roll20's tabletop is officially supported on Apple and Android tablets in the browser, not on phones; the page currently says Table on Tablet "is undergoing maintenance" and recommends a desktop [10]. On a phone, "You won't see maps or move tokens" [11].
- On a tablet, tap and hold "for about a second and a half" opens the right-click menu, one finger selects, moves and resizes, and two fingers pan [10].
- Nothing in the help centre or blog says how Align to Grid behaves on touch. The new tool's dragging and on-screen X/Y buttons need no keyboard. The Legacy fine-tuning relies on Alt, which a tablet has no key for, so on touch the way round snapping would be the long-press menu's Disable Grid Snapping or "is drawing" (an inference). One user tried the beta "on my iPad" and found it "fine... Liking the interface so far" [15, **forum**, 2026-08-19].

## What users report

**The Legacy tool, badly.** Roll20 paraphrased what its community said in a Discord feedback session [12]: "Align to grid = click, drag, and pray"; "Half the time I still end up with two grids overlapping each other"; "Some maps just won't line up no matter what I do"; "I usually turn the grid opacity down so my players don't notice". Its designer: "plenty of GMs would rather avoid the tool altogether", and it has "a black box problem (you make decisions and get an output, but the middle is a mystery)" [13]. It was "buried several layers deep in a right-click menu" [14]. Forum complaints: a one-pixel tracing error spoils a large map and the measured values cannot be edited [17, **forum**, 2012]; drift across the map [18, **forum**, 2013]; hex maps drift past about 10×10 [16, **forum**, 2013].

**The new tool, well** [15, **forum**, official beta thread, August to September 2026]: "This is a huge improvement over the older system!" (a Forum Champion); the dungeon and overland hex map quote above; "Works very well, thanks"; "I love being able to access the grid controls without needing to open the page dialog!".

**The new tool, badly** [15, **forum**]: "Step 3 is a little wonky for me... Do you drag the intersection on the map or the little crosshairs that pop up?"; the rotated-map bug above; complaints of "more clutter on my workspace" and that "the arrows for resizing the canvas have been removed"; one user prefers the old way but calls the new one "an improvement". The launch was rolled back on 2026-08-20 over a bug that moved drawings, including Dynamic Lighting lines, to the page's top-left corner, and relaunched on 2026-08-26 [7, 15]; that bug was in drawings, not in the alignment itself.

## Not found

No source says what players see while the GM aligns a map, the arithmetic behind the Scale step, or whether Done changes the page's grid offset or cell size as well as the map. The demo videos, which might show some of this, could not be read.

## What this suggests for us

Suggestions only; the decisions belong to later tickets on #169.

1. **Roll20 already works the ADR 0010 way.** Its cell is a fixed 70 px, and both of its tools change the map's size and position, never the cell. Its staff call changing the cell size "working against what the software expects". That supports keeping the scene's cell at 150 units and scaling the map.
2. **Anchor, scale, fine-tune fits the bar.** Nothing in it counts columns or rows, and anchoring on a printed intersection instead of the image's corner is what copes with edges that cut through a cell. Roll20 needed a grid offset and a page resize because its grid starts at the page corner. Our scene is unbounded and its origin has no meaning (ADR 0010), so the same result is just moving the map until the anchor sits on a scene intersection: no offset to store and no page to resize.
3. **Measure across the map, not one 3×3 patch.** Drift on large maps is the most repeated complaint, and even Roll20's new tool needs a third step to correct it. The bar asks for the grid to lie on the printed lines "from one edge of the map to the other". A second point far from the anchor would divide any error by the number of cells between the two, instead of multiplying a 3×3 error across the map.
4. **Keep the two axes separate.** Both Roll20 tools measure and adjust width and height independently, and printed cells that are not quite square are common. This bears on the open "Shift to adjust one axis" aid in #169.
5. **Do not snap the map's edges while aligning.** Most of Roll20's border workarounds (Alt, "is drawing", Disable Grid Snapping) exist because snapping pulls the map's edge onto the scene grid. If anything snaps during alignment, it should be the printed intersection onto the scene's intersection.
6. **Precision aids Roll20 found it needed:** zooming in (150% recommended), an overlay colour the GM can change, arrow-key nudges of 1 px and 10 px with Shift, and on-screen X/Y buttons, which also work on a touch screen without tuning for it. This bears on "Precision aids" in #169.
7. **Keep the alignment with the asset.** Roll20 stores it only on the map graphic on one page, so every reuse starts again, and its own help centre suggests copying whole pages to a second game to avoid that. v0.5.0 already keeps a grid on Map assets; storing the measured alignment there would let a dock drop and a second map in the same scene reuse it. This bears on "Storing an alignment".
8. **A guided manual tool can meet the bar on its own.** Roll20 has no grid detection at all and its new tool is still well received. An upload-time guess could prefill the anchor and scale, but the manual path is the floor. This bears on "The upload-time guess".
9. **One flow for hex.** Roll20 keeps the same three steps for hex grids and changes only the crosshair (three edges meeting) and the sample (a cluster of hexes). That suggests the square method can carry over. This bears on "Printed hex grids".
10. **A map with no printed grid needs a size, not a measurement.** Roll20 offers cells across and pixels per cell; either matches "its intended size" in #169's definition of alignment.
11. **Smaller lessons.** Align the map as it is displayed, rotation included (Roll20's rotation bug). Let the GM step back without starting over. Lock the map when done (the glossary's Locked item). Leave tokens and other items where they are. Make the tool easy to find: Roll20 moved it out of a nested right-click menu onto the Map layer itself.

## References

Roll20 help centre (dates are each article's last update):

1. [Sizing and Aligning Maps](https://help.roll20.net/hc/en-us/articles/360039243994-Sizing-and-Aligning-Maps), 2026-08-19.
2. [Page Settings](https://help.roll20.net/hc/en-us/articles/360039675373-Page-Settings), 2026-09-14.
3. [Map Grid Types](https://help.roll20.net/hc/en-us/articles/4416143791767-Map-Grid-Types), 2026-09-11.
4. [Importing and Manipulating Images](https://help.roll20.net/hc/en-us/articles/360039178654-Importing-and-Manipulating-Images), 2026-09-28.
5. [Right Click Menu](https://help.roll20.net/hc/en-us/articles/35999226799127-Right-Click-Menu), 2026-06-08.
6. [Mod Scripts: Objects](https://help.roll20.net/hc/en-us/articles/360037772793-Mod-Scripts-Objects), 2026-09-28.
7. [Change Log](https://help.roll20.net/hc/en-us/articles/360037772613-Change-Log), 2026-10-13; entries cited by date.
8. [VTT Quality of Life & Feature Improvements](https://help.roll20.net/hc/en-us/articles/25289127045143-VTT-Quality-of-Life-Feature-Improvements), 2026-08-25.
9. [5. Setting up your map in Roll20](https://help.roll20.net/hc/en-us/articles/29257877241495-5-Setting-up-your-map-in-Roll20), 2026-09-29.
10. [Table on Tablet](https://help.roll20.net/hc/en-us/articles/360037774593-Table-on-Tablet), 2026-10-16.
11. [Using Roll20 on Mobile Devices](https://help.roll20.net/hc/en-us/articles/4411213438231-Using-Roll20-on-Mobile-Devices), 2026-10-17.

Roll20 blog:

12. [Improving Roll20's Map Alignment Process](https://blog.roll20.net/posts/align-to-grid-announcement/), 2026-07-23.
13. [Enhancing VTT Map Alignment: A Sneak Peek](https://blog.roll20.net/posts/align-to-grid-designer-diary/) (designer diary), 2026-08-11.
14. [Explore the New Align to Grid Feature in Beta](https://blog.roll20.net/posts/align-to-grid-new/), 2026-08-19.

Roll20 community forums (**forum**; posters' roles as the forum shows them):

15. [[Official] Try the New Align to Grid Beta](https://app.roll20.net/forum/post/12806812/official-try-the-new-align-to-grid-beta), 2026-08-19 to 2026-09-28; opened by Roll20 staff, replies from staff and users.
16. [Map alignment and you: Or 101 ways to get your grids in a row](https://app.roll20.net/forum/post/3688/map-alignment-and-you-or-101-ways-to-get-your-grids-in-a-row/), Gauss (Forum Champion), 2012-12-14 with replies into 2013.
17. [Edit Grid Pixel Size](https://app.roll20.net/forum/permalink/3593/), 2012-12-13; replies from Roll20 Team and Gauss.
18. [Problems using Align-To-Grid](https://app.roll20.net/forum/post/112715/problems-using-align-to-grid), 2013-04-07.
19. [Grid Alignment](https://app.roll20.net/forum/permalink/9841241/), 2021-02-24; replies from Roll20 Production Team and a Pro user.
20. [Align to grid with a hex map?](https://app.roll20.net/forum/post/9202973/align-to-grid-with-a-hex-map), 2020-09-20.
