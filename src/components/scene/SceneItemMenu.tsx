import { Box, Button, Input, Label, Select, Textarea, Flex } from "theme-ui";
import { v4 as uuid } from "uuid";
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
import colors, { colorOptions } from "../../helpers/colors";

export default function SceneItemMenu({
  position,
  close,
}: {
  position: { x: number; y: number } | null;
  close: () => void;
}) {
  const { scene, selection, act, readOnly, setSelection } = useScene();
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
  function update(fields: ItemFields) {
    act(items.map((item) => ({ type: "update", id: item.id, fields })));
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
                maxLength={10000}
                value={items[0].kind === "image" ? items[0].label : ""}
                onChange={(event) => update({ label: event.target.value })}
              />
            </Label>
            <Label>
              Size (cells)
              <Input
                aria-label="Token size"
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
              value={"color" in items[0] ? items[0].color : ""}
              onChange={(event) => update({ color: event.target.value })}
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
              maxLength={10000}
              value={items[0].kind === "text" ? items[0].text : ""}
              onChange={(event) => update({ text: event.target.value })}
            />
          </Label>
        )}
        <Label>
          Layer
          <Select
            aria-label="Item layer"
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
                <option key={layer} value={layer}>
                  {layer[0].toUpperCase() + layer.slice(1)}
                </option>
              ))}
          </Select>
        </Label>
        {all(
          (item) =>
            item.layer === "fog" &&
            (item.kind === "shape" || item.kind === "curve")
        ) && (
          <Button
            onClick={() =>
              update({ cut: !items.every((item) => "cut" in item && item.cut) })
            }
          >
            {items.every((item) => "cut" in item && item.cut) ? "Uncut" : "Cut"}
          </Button>
        )}
        <Flex mt={2}>
          <Button
            onClick={() => {
              if (!scene) return;
              const copies = copySelection(
                items,
                {
                  x: scene.grid.unitsPerCell / 4,
                  y: scene.grid.unitsPerCell / 4,
                },
                items.map(() => uuid())
              );
              if (act(copies.map((item) => ({ type: "add", item }))))
                setSelection(copies.map((item) => item.id));
              close();
            }}
          >
            Duplicate
          </Button>
          <Button
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
