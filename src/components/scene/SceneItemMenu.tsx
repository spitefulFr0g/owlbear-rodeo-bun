import { Box, Button, Input, Label, Select, Text, Textarea, Flex } from "theme-ui";
import { v4 as uuid } from "uuid";
import { useParty } from "../../contexts/PartyContext";
import { itemOwners } from "../../helpers/itemOwners";
import MapMenu from "../map/MapMenu";
import { useScene } from "../../scene/SceneContext";
import {
  Item,
  ItemFields,
  layers,
  Layer,
  statusRingsKey,
} from "../../sceneRules";
import { copySelection } from "../../scene/selection";
import { visibilityEntry } from "../../helpers/visibilityEntry";
import colors, { Color, colorOptions } from "../../helpers/colors";
import { useSettings } from "../../contexts/SettingsContext";
import { textLineHeight, TextSize, textSizeOf, textSizes } from "../../helpers/textItem";

export default function SceneItemMenu({
  position,
  close,
}: {
  position: { x: number; y: number } | null;
  close: () => void;
}) {
  const { scene, selection, act, readOnly, setSelection, canChange, person } = useScene();
  const party = useParty();
  const { setSettings } = useSettings();
  const items = selection
    .map((id) => scene?.items[id])
    .filter((item): item is Item => !!item);
  const all = (predicate: (item: Item) => boolean) =>
    items.length > 0 && items.every(predicate);
  const tokens = all(
    (item) =>
      item.kind === "image" &&
      ["character", "mount", "prop", "attachment"].includes(item.layer)
  );
  const mayUpdate = (fields: ItemFields) => all(item =>
    canChange({ type: "update", id: item.id, fields }));
  const visibility = visibilityEntry(person, items, (item, hidden) =>
    canChange({ type: "update", id: item.id, fields: { hidden } }));
  function update(fields: ItemFields) {
    act(items.map((item) => ({ type: "update", id: item.id, fields })));
  }
  const plainText = all((item) => item.kind === "text" && !item.square);
  /** The Text tool places its next text in the colour and size last chosen here. */
  function rememberText(change: { color?: Color; size?: TextSize }) {
    if (plainText)
      setSettings((settings) => ({ ...settings, text: { ...settings.text, ...change } }));
  }
  const rings = (item: Item): string[] =>
    Array.isArray(item.metadata[statusRingsKey])
      ? (item.metadata[statusRingsKey] as string[])
      : [];
  return (
    <MapMenu
      isOpen={!!position && !!items.length && !readOnly}
      onRequestClose={close}
      left={position?.x}
      top={position?.y}
      onModalContent={(node) => {
        if (!node) return;
        const rect = node.getBoundingClientRect();
        node.style.left = `${Math.max(0, Math.min(rect.x, window.innerWidth - rect.width))}px`;
        node.style.top = `${Math.max(0, Math.min(rect.y, window.innerHeight - rect.height))}px`;
      }}
    >
      <Box p={2} sx={{ width: 220, maxHeight: "80vh", overflowY: "auto" }}>
        {tokens && (
          <>
            <Label>
              Label
              <Input
                aria-label="Item label"
                disabled={!mayUpdate({ label: "" })}
                maxLength={10000}
                value={items[0].kind === "image" ? items[0].label : ""}
                onChange={(event) => update({ label: event.target.value })}
              />
            </Label>
            <Label>
              Size (cells)
              <Input
                aria-label="Token size"
                disabled={!mayUpdate({ scale: { x: 1, y: 1 } })}
                type="number"
                min="0.1"
                step="0.5"
                value={
                  items[0].kind === "image" && scene
                    ? (items[0].width * items[0].scale.x) /
                      scene.grid.unitsPerCell
                    : 1
                }
                onChange={(event) => {
                  const size = Number(event.target.value);
                  if (!scene || !Number.isFinite(size) || size <= 0) return;
                  act(
                    items
                      .filter((item) => item.kind === "image")
                      .map((item) => {
                        const factor =
                          (size * scene.grid.unitsPerCell) /
                          (item.kind === "image"
                            ? item.width * item.scale.x
                            : 1);
                        return {
                          type: "update",
                          id: item.id,
                          fields: {
                            scale: {
                              x: item.scale.x * factor,
                              y: item.scale.y * factor,
                            },
                          },
                        };
                      })
                  );
                }}
              />
            </Label>
            <Label>Status rings</Label>
            <Flex sx={{ flexWrap: "wrap" }}>
              {colorOptions
                .filter((color) => color !== "primary")
                .map((color) => (
                  <Button
                    key={color}
                    aria-label={`Status ring ${color}`}
                disabled={!mayUpdate({ metadata: { [statusRingsKey]: [] } })}
                    title={color}
                    sx={{
                      backgroundColor: colors[color],
                      width: 28,
                      height: 28,
                      padding: 0,
                      margin: 1,
                      border: items.every((item) => rings(item).includes(color))
                        ? "2px solid white"
                        : "2px solid transparent",
                    }}
                    onClick={() => {
                      const remove = items.every((item) =>
                        rings(item).includes(color)
                      );
                      act(
                        items.map((item) => ({
                          type: "update",
                          id: item.id,
                          fields: {
                            metadata: {
                              [statusRingsKey]: remove
                                ? rings(item).filter((value) => value !== color)
                                : [
                                    ...rings(item).filter(
                                      (value) => value !== color
                                    ),
                                    color,
                                  ],
                            },
                          },
                        }))
                      );
                    }}
                  />
                ))}
            </Flex>
          </>
        )}
        {all((item) => "color" in item) && (
          <Label>
            Colour
            <Select
              aria-label="Item colour"
                disabled={!mayUpdate({ color: "red" })}
              value={"color" in items[0] ? items[0].color : ""}
              onChange={(event) => {
                update({ color: event.target.value });
                rememberText({ color: event.target.value as Color });
              }}
            >
              {colorOptions.map((color) => (
                <option key={color} value={color}>
                  {color}
                </option>
              ))}
            </Select>
          </Label>
        )}
        {all((item) => item.kind === "text") && (
          <Label>
            Text
            <Textarea
              aria-label="Item text"
                disabled={!mayUpdate({ text: "" })}
              maxLength={10000}
              value={items[0].kind === "text" ? items[0].text : ""}
              onChange={(event) => update({ text: event.target.value })}
            />
          </Label>
        )}
        {plainText && scene && (
          <Label>
            Size
            <Select
              aria-label="Text size"
              disabled={!mayUpdate({ size: 1 })}
              value={sameValue(items.map((item) =>
                item.kind === "text" ? textSizeOf(item.size, scene.grid.unitsPerCell) : ""))}
              onChange={(event) => {
                const size = event.target.value as TextSize;
                update({ size: textLineHeight(size, scene.grid.unitsPerCell) });
                rememberText({ size });
              }}
            >
              <option value="" disabled>
                Mixed sizes
              </option>
              {textSizes.map((size) => (
                <option key={size} value={size}>
                  {size[0].toUpperCase() + size.slice(1)}
                </option>
              ))}
            </Select>
          </Label>
        )}
        <Label>
          Layer
          <Select
            aria-label="Item layer"
                disabled={!layers.some(layer => layer !== "grid" && layer !== "ruler" && mayUpdate({ layer }))}
            value={
              items.every((item) => item.layer === items[0].layer)
                ? items[0]?.layer
                : ""
            }
            onChange={(event) => update({ layer: event.target.value as Layer })}
          >
            <option value="" disabled>
              Mixed layers
            </option>
            {layers
              .filter((layer) => layer !== "grid" && layer !== "ruler")
              .map((layer) => (
                <option key={layer} value={layer} disabled={!mayUpdate({ layer })}>
                  {layer[0].toUpperCase() + layer.slice(1)}
                </option>
              ))}
          </Select>
        </Label>
        {person.role === "gm" && (
          <>
            <Label>
              Owner
              <Select
                aria-label="Item owner"
                value={items.every(item => item.owner === items[0].owner) ? items[0]?.owner : ""}
                onChange={event => update({ owner: event.target.value })}
              >
                <option value="" disabled>Mixed owners</option>
                {itemOwners(party, items.map(item => item.owner)).map(owner => (
                  <option key={owner.id} value={owner.id}>{owner.name}</option>
                ))}
              </Select>
            </Label>
            <Button
              onClick={() => update({ locked: !items.every(item => item.locked) })}
            >
              {items.every(item => item.locked) ? "Unlock" : "Lock"}
            </Button>
          </>
        )}
        <Button
          disabled={!visibility.enabled}
          title={visibility.hint}
          onClick={() => update({ hidden: visibility.label === "Hide" })}
        >
          {visibility.label}
        </Button>
        {visibility.hint && <Text variant="caption" as="p">{visibility.hint}</Text>}
        {all(
          (item) =>
            item.layer === "fog" &&
            (item.kind === "shape" || item.kind === "curve")
        ) && (
          <Button
            disabled={!mayUpdate({ cut: !items.every(item => "cut" in item && item.cut) })}
            onClick={() =>
              update({ cut: !items.every((item) => "cut" in item && item.cut) })
            }
          >
            {items.every((item) => "cut" in item && item.cut) ? "Uncut" : "Cut"}
          </Button>
        )}
        <Flex mt={2}>
          <Button
            disabled={!all(item => canChange({ type: "add", item }))}
            onClick={() => {
              if (!scene) return;
              const copies = copySelection(
                items,
                {
                  x: scene.grid.unitsPerCell / 4,
                  y: scene.grid.unitsPerCell / 4,
                },
                items.map(() => uuid()),
                Object.values(scene.items)
              );
              if (act(copies.map((item) => ({ type: "add", item }))))
                setSelection(copies.map((item) => item.id));
              close();
            }}
          >
            Duplicate
          </Button>
          <Button
            disabled={!all(item => canChange({ type: "delete", id: item.id }))}
            onClick={() => {
              act(items.map((item) => ({ type: "delete", id: item.id })));
              setSelection([]);
              close();
            }}
          >
            Delete
          </Button>
        </Flex>
      </Box>
    </MapMenu>
  );
}

/** The value every entry shares, or "" when they differ. */
function sameValue(values: string[]): string {
  return values.every((value) => value === values[0]) ? values[0] ?? "" : "";
}
