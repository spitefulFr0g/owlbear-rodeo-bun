import { useCallback, useEffect, useMemo, useRef } from "react";
import Konva from "konva";
import { Group } from "react-konva";
import { v4 as uuid } from "uuid";
import { useScene, useToolPermissions } from "../../scene/SceneContext";
import { worldNodeId } from "../../scene/worldPosition";
import {
  attachesTo,
  copySelection,
  moveSelection,
} from "../../scene/selection";
import { Change, Item, Layer, layers } from "../../sceneRules";
import { useMapStage } from "../../contexts/MapStageContext";
import { useSetPreventMapInteraction } from "../../contexts/MapInteractionContext";
import { useKeyboard } from "../../contexts/KeyboardContext";
import { useGridSnappingSensitivity } from "../../contexts/GridContext";
import useSetting from "../../hooks/useSetting";
import useSceneSnapping from "../../hooks/useSceneSnapping";
import shortcuts from "../../shortcuts";
import World from "./World";
import { SceneImage } from "./SceneImages";
import SceneText from "./SceneText";
import SceneDrawing from "./SceneDrawing";
import { coveredFog, fogItem, fogItems, fogShape } from "../../scene/fogItem";

/** All kinds share one interaction, preview and final batch. */
export default function SceneSelection({
  active,
  boxSelect,
  layer,
  onMenuOpen,
}: {
  active: boolean;
  boxSelect: boolean;
  layer?: Layer;
  onMenuOpen: (position: { x: number; y: number } | null) => void;
}) {
  const { scene, selection, setSelection, readOnly, act, canSelect } = useScene();
  const stageRef = useMapStage();
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  useEffect(() => {
    onMenuOpen(null);
    if (layer)
      setSelection((prev) =>
        prev.filter((id) => sceneRef.current?.items[id]?.layer === layer)
      );
  }, [active, layer, setSelection, onMenuOpen]);
  const root = useRef<Konva.Group>(null);
  const selectedRef = useRef(selection);
  selectedRef.current = selection;
  const transformRef = useRef<Konva.Transformer>();
  useEffect(() => {
    transformRef.current?.nodes(
      stageRef.current
        ?.find(".scene-item")
        .filter((node) => selectedRef.current.includes(node.id())) || []
    );
  }, [selection, stageRef]);
  useEffect(() => {
    const stage = stageRef.current;
    if (!scene || !stage) return;
    function context(event: Konva.KonvaEventObject<MouseEvent>) {
      event.evt.preventDefault();
      if (readOnly) return;
      let node: Konva.Node | null = event.target;
      while (node && !scene!.items[node.id()]) node = node.getParent();
      if (!node || !canSelect(scene!.items[node.id()]) || (layer && scene!.items[node.id()].layer !== layer)) return;
      if (!selectedRef.current.includes(node.id())) setSelection([node.id()]);
      const rect = stage!.container().getBoundingClientRect();
      const pointer = stage!.getPointerPosition() || { x: 0, y: 0 };
      onMenuOpen({ x: rect.left + pointer.x, y: rect.top + pointer.y });
    }
    stage.on("contextmenu.itemMenu dblclick.itemMenu dbltap.itemMenu", context);
    return () => {
      stage.off(".itemMenu");
    };
  }, [scene, readOnly, layer, setSelection, stageRef, onMenuOpen, canSelect]);
  const clipboard = useRef<Item[]>([]);
  const prevent = useSetPreventMapInteraction();
  const snap = useSceneSnapping();
  const sensitivity = useGridSnappingSensitivity();
  const snapRef = useRef(snap);
  snapRef.current = snap;
  const sensitivityRef = useRef(sensitivity);
  sensitivityRef.current = sensitivity;
  const copies = useCallback((source: Item[], dx: number, dy: number) => {
    const added = copySelection(
      source,
      { x: dx, y: dy },
      source.map(() => uuid())
    );
    if (act(added.map((item) => ({ type: "add", item }))))
      setSelection(added.map((item) => item.id));
  }, [act, setSelection]);
  useKeyboard((event) => {
    if (!active || readOnly || !scene) return;
    const selected = selection.map((id) => scene.items[id]).filter(Boolean);
    if (shortcuts.copy(event)) {
      clipboard.current = selected;
      event.preventDefault();
    }
    if (shortcuts.paste(event)) {
      copies(
        clipboard.current,
        scene.grid.unitsPerCell / 4,
        scene.grid.unitsPerCell / 4
      );
      event.preventDefault();
    }
    if (shortcuts.delete(event)) {
      act(selected.map((item) => ({ type: "delete", id: item.id })));
      setSelection([]);
      event.preventDefault();
    }
  });
  useEffect(() => {
    if (!active || !scene || !root.current || !stageRef.current) return;
    const world = root.current;
    const stage = stageRef.current;
    const nodes = () =>
      stage
        .find(".scene-item")
        .filter(
          (node) =>
            !!scene.items[node.id()] &&
            canSelect(scene.items[node.id()]) &&
            (!layer || scene.items[node.id()].layer === layer)
        );
    const selectedNodes = () =>
      nodes().filter((node) => selectedRef.current.includes(node.id()));
    const transformer = new Konva.Transformer({
      flipEnabled: false,
      // Include stroke so horizontal and vertical lines have usable handles.
      ignoreStroke: false,
      centeredScaling: true,
      enabledAnchors: ["middle-left", "middle-right"],
      rotateAnchorOffset: 30,
    });
    world.add(transformer);
    transformRef.current = transformer;
    transformer.nodes(readOnly ? [] : selectedNodes());
    transformer.rotationSnaps(
      sensitivityRef.current === -1
        ? []
        : Array.from({ length: 24 }, (_, i) => i * 15)
    );
    transformer.boundBoxFunc((old, next) => {
      if (next.width < 1 || next.height < 1) return old;
      const scale = world.getAbsoluteScale().x;
      const cell = scene.grid.unitsPerCell * scale;
      let width = next.width;
      const nearest = Math.round(width / cell) * cell;
      if (
        scene.grid.snap &&
        sensitivityRef.current > 0 &&
        nearest > 0 &&
        Math.abs(nearest - width) < cell * sensitivityRef.current
      )
        width = nearest;
      // The existing side handles resize proportionally about the centre.
      const height = (old.height * width) / old.width;
      const dx = (next.width - width) / 2;
      const dy = (next.height - height) / 2;
      const cosine = Math.cos(next.rotation);
      const sine = Math.sin(next.rotation);
      return {
        ...next,
        width,
        height,
        x: next.x + dx * cosine - dy * sine,
        y: next.y + dx * sine + dy * cosine,
      };
    });
    const finishTransform = () => {
      const changes: Change[] = selectedNodes().map((node) => ({
        type: "update",
        id: node.id(),
        fields: {
          position: node.position(),
          rotation: node.rotation(),
          scale: node.scale(),
        },
      }));
      if (!act(changes))
        selectedNodes().forEach((node) => {
          const item = scene.items[node.id()];
          node.position(item.position);
          node.rotation(item.rotation);
          node.scale(item.scale);
        });
      prevent(false);
    };
    transformer.on("transformstart", () => prevent(true));
    transformer.on("transformend", finishTransform);
    transformer.on("transform", () =>
      transformer.rotationSnaps(
        sensitivityRef.current === -1
          ? []
          : Array.from({ length: 24 }, (_, i) => i * 15)
      )
    );
    let start: { x: number; y: number } | undefined;
    let moving: Konva.Node[] = [];
    let originals: Item[] = [];
    let duplicate = false;
    let box: Konva.Rect | undefined;
    const point = () =>
      world
        .getAbsoluteTransform()
        .copy()
        .invert()
        .point(stage.getPointerPosition() || { x: 0, y: 0 });
    function down(event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
      if (
        ("button" in event.evt && event.evt.button !== 0) ||
        ("touches" in event.evt && event.evt.touches.length > 1) ||
        readOnly ||
        transformer.isTransforming()
      )
        return;
      let node: Konva.Node | null = event.target;
      while (node && !scene!.items[node.id()] && node !== transformer)
        node = node.getParent();
      if (node === transformer) return;
      if (node && scene!.items[node.id()] && (!canSelect(scene!.items[node.id()]) || (layer && scene!.items[node.id()].layer !== layer)))
        node = null;
      onMenuOpen(null);
      if (!node && !boxSelect) {
        setSelection([]);
        return;
      }
      start = point();
      prevent(true);
      if (node && scene!.items[node.id()]) {
        const id = node.id();
        if (event.evt.shiftKey) {
          setSelection((prev) =>
            prev.includes(id)
              ? prev.filter((value) => value !== id)
              : [...prev, id]
          );
          start = undefined;
          prevent(false);
          return;
        }
        const ids = selectedRef.current.includes(id)
          ? selectedRef.current
          : [id];
        setSelection(ids);
        moving = nodes().filter((value) => ids.includes(value.id()));
        // Higher token layers attach by overlap at the start of the action.
        for (const candidate of nodes()) {
          const item = scene!.items[candidate.id()];
          if (layer || item.kind !== "image" || moving.includes(candidate))
            continue;
          if (
            moving.some((base) =>
              attachesTo(
                scene!.items[base.id()],
                item,
                scene!.grid.unitsPerCell
              )
            )
          )
            moving.push(candidate);
        }
        originals = moving.map((value) => scene!.items[value.id()]);
        duplicate = event.evt.altKey;
      } else {
        moving = [];
        box = new Konva.Rect({
          x: start.x,
          y: start.y,
          stroke: "#66aaff",
          strokeWidth: 1 / world.getAbsoluteScale().x,
          listening: false,
        });
        world.add(box);
      }
    }
    function move() {
      if (!start) return;
      const end = point();
      if (box)
        box.setAttrs({
          x: Math.min(start.x, end.x),
          y: Math.min(start.y, end.y),
          width: Math.abs(end.x - start.x),
          height: Math.abs(end.y - start.y),
        });
      else if (moving.length) {
        const first = originals[0].position;
        const target = snapRef.current({
          x: first.x + end.x - start.x,
          y: first.y + end.y - start.y,
        });
        moving.forEach((node, i) =>
          node.position({
            x: originals[i].position.x + target.x - first.x,
            y: originals[i].position.y + target.y - first.y,
          })
        );
      }
      world.getLayer()?.batchDraw();
    }
    function up() {
      if (!start) return;
      if (box) {
        setSelection(
          nodes()
            .filter((node) =>
              Konva.Util.haveIntersection(
                box!.getClientRect(),
                node.getClientRect()
              )
            )
            .map((node) => node.id())
        );
        box.destroy();
        box = undefined;
      } else if (moving.length) {
        const dx = moving[0].x() - originals[0].position.x;
        const dy = moving[0].y() - originals[0].position.y;
        if (duplicate) {
          moving.forEach((node, i) => node.position(originals[i].position));
          copies(originals, dx, dy);
        } else if (
          (dx || dy) &&
          !act(moveSelection(originals, { x: dx, y: dy }))
        )
          moving.forEach((node, i) => node.position(originals[i].position));
      }
      start = undefined;
      prevent(false);
    }
    stage.on("mousedown.selection touchstart.selection", down);
    stage.on("mousemove.selection touchmove.selection", move);
    stage.on("mouseup.selection touchend.selection", up);
    return () => {
      stage.off(".selection");
      box?.destroy();
      // Selection effects must never reuse the destroyed transformer.
      if (transformRef.current === transformer) transformRef.current = undefined;
      transformer.destroy();
      prevent(false);
    };
  }, [
    active,
    boxSelect,
    layer,
    scene,
    readOnly,
    act,
    canSelect,
    copies,
    prevent,
    setSelection,
    stageRef,
    onMenuOpen,
  ]);
  if (!scene) return null;
  return (
    <>
      {active && (
        <World>
          <Group ref={root} />
        </World>
      )}
    </>
  );
}

/** Keep layer placement unchanged while all kinds share the same controller. */
export function SceneItems({
  placement,
  fogShapes = true,
}: {
  placement: "belowGrid" | "aboveGrid" | "aboveRuler";
  fogShapes?: boolean;
}) {
  const { scene, person } = useScene();
  const permissions = useToolPermissions();
  const [fogOpacity] = useSetting<number>("fog.editOpacity");
  const editsFog = person.role !== "display" && permissions.fog;
  const cover = useMemo(() => {
    if (!scene || placement !== "aboveRuler" || !fogShapes || editsFog) return [];
    const fog = fogItems(scene);
    // Hidden owned shapes remain a hint, but never contribute to coverage.
    return [...coveredFog(fog), ...fog.filter(item => item.hidden).map(fogShape)];
  }, [scene, placement, fogShapes, editsFog]);
  if (!scene) return null;
  const items = Object.values(scene.items)
    .filter((item) =>
      placement === "belowGrid"
        ? item.layer === "map"
        : placement === "aboveRuler"
          ? item.layer === "fog"
          : item.layer !== "map" && item.layer !== "fog"
    )
    .filter(
      (item) =>
        fogShapes ||
        item.kind === "image" ||
        item.kind === "text" ||
        item.kind === "line"
    )
    .sort(
      (a, b) =>
        layers.indexOf(a.layer) - layers.indexOf(b.layer) || a.order - b.order
    );
  return (
    <World id={placement === "aboveGrid" ? worldNodeId : undefined}>
      {cover.map(shape => (
        <SceneDrawing key={shape.id} item={fogItem(shape, "gm", false, false)} listening={false} />
      ))}
      {items.filter(item => editsFog || item.layer !== "fog" || item.kind === "image" || item.kind === "text" || item.kind === "line").map((item) =>
        item.kind === "image" ? (
          <SceneImage
            key={item.id}
            item={item}
            labelSize={scene.grid.unitsPerCell / 6}
          />
        ) : item.kind === "text" ? (
          <SceneText name="scene-item" key={item.id} item={item} />
        ) : (
          <SceneDrawing
            name="scene-item"
            key={item.id}
            item={
              item.layer === "fog" && item.kind !== "line" && item.cut
                ? { ...item, color: "red" }
                : item
            }
            opacity={
              item.layer === "fog" && editsFog
                ? fogOpacity
                : item.blend
                  ? 0.5
                  : 1
            }
          />
        )
      )}
    </World>
  );
}
