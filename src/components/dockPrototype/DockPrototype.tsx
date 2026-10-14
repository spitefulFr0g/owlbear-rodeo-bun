// PROTOTYPE: the dock and Asset Manager for v0.5.0 (#136, decisions 20–27),
// on fixed data. Four layouts on the room route, switched by ?variant=A..D,
// with ?role=gm|player. Replaces the token bar while ?variant= is present.
// Throwaway: lives only on the prototype/dock-asset-manager branch.
import { ReactNode } from "react";

import PrototypeSwitcher, { useSearchParam, useSetSearchParam } from "../PrototypeSwitcher";
import useSetting from "../../hooks/useSetting";

import { Proto, Role, tabLabel, usePrototype } from "./model";
import VariantA, { name as nameA } from "./VariantA";
import VariantB, { name as nameB } from "./VariantB";
import VariantC, { name as nameC } from "./VariantC";
import VariantD, { name as nameD } from "./VariantD";

const variants = [
  { key: "A", name: nameA },
  { key: "B", name: nameB },
  { key: "C", name: nameC },
  { key: "D", name: nameD },
];

function StateReadout({ proto, fullScreen }: { proto: Proto; fullScreen: boolean }) {
  const rows: [string, string][] = [
    ["role", proto.role],
    ["tab", tabLabel(proto.tab)],
    ["filter", proto.filter],
    ["search", proto.search ? `"${proto.search}"` : "—"],
    ["order", proto.sort],
    ["dock", fullScreen ? "hidden (fullscreen)" : proto.collapsed ? "collapsed to tabs" : "open"],
    ["manager", proto.managerOpen ? `open, ${proto.managerType}` : "closed"],
    ["selected", proto.selected?.name ?? "—"],
    ["last action", proto.lastAction],
  ];
  return (
    <div
      style={{
        position: "fixed",
        top: 8,
        left: "calc(50% + 40px)",
        transform: "translateX(-50%)",
        zIndex: 1000,
        background: "rgba(17,17,17,0.92)",
        color: "#ddd",
        border: "1px solid #ff0",
        borderRadius: 6,
        padding: "4px 10px",
        fontFamily: "system-ui, sans-serif",
        fontSize: 11,
        display: "flex",
        flexWrap: "wrap",
        gap: "2px 12px",
        maxWidth: 460,
        pointerEvents: "none",
      }}
    >
      {rows.map(([key, value]) => (
        <span key={key}>
          <span style={{ color: "#ff0" }}>{key}</span> {value}
        </span>
      ))}
    </div>
  );
}

function Prototype({ role, variant, canvas }: { role: Role; variant: string; canvas: ReactNode }) {
  const proto = usePrototype(role);
  const [fullScreen] = useSetting<boolean>("map.fullScreen");
  const setParam = useSetSearchParam();
  const props = { proto, canvas, fullScreen };
  return (
    <>
      {variant === "A" && <VariantA {...props} />}
      {variant === "B" && <VariantB {...props} />}
      {variant === "C" && <VariantC {...props} />}
      {variant === "D" && <VariantD {...props} />}
      <StateReadout proto={proto} fullScreen={fullScreen} />
      <PrototypeSwitcher variants={variants} current={variant}>
        <button
          onClick={() => setParam("role", role === "gm" ? "player" : "gm")}
          style={{
            background: "#ff0",
            color: "#111",
            border: "none",
            borderRadius: 999,
            padding: "2px 10px",
            cursor: "pointer",
            fontWeight: 600,
          }}
          title="Switch between the GM's view and a player's view (Mira)"
        >
          {role === "gm" ? "GM view" : "Player view (Mira)"}
        </button>
      </PrototypeSwitcher>
    </>
  );
}

function DockPrototype({ canvas }: { canvas: ReactNode }) {
  const variant = (useSearchParam("variant") ?? "A").toUpperCase();
  const role: Role = useSearchParam("role") === "player" ? "player" : "gm";
  // A fresh state per role, so each view starts from the fixed data
  return <Prototype key={role} role={role} variant={variant} canvas={canvas} />;
}

export default DockPrototype;
