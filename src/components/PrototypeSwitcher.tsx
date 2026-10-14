// PROTOTYPE: floating bar that cycles ?variant= on the current route.
// Shown only in builds made with VITE_PROTOTYPE=true.
import { ReactNode, useEffect } from "react";
import { useHistory, useLocation } from "react-router-dom";

export type PrototypeVariant = { key: string; name: string };

export function useSearchParam(name: string) {
  return new URLSearchParams(useLocation().search).get(name);
}

export function useSetSearchParam() {
  const history = useHistory();
  const location = useLocation();
  return (name: string, value: string) => {
    const params = new URLSearchParams(location.search);
    params.set(name, value);
    history.replace({ ...location, search: params.toString() });
  };
}

function PrototypeSwitcher({
  variants,
  current,
  children,
}: {
  variants: PrototypeVariant[];
  current: string;
  children?: ReactNode;
}) {
  const setParam = useSetSearchParam();
  const index = Math.max(
    0,
    variants.findIndex((v) => v.key === current)
  );

  function go(step: number) {
    const next = variants[(index + step + variants.length) % variants.length];
    setParam("variant", next.key);
  }

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key === "ArrowLeft") go(-1);
      if (event.key === "ArrowRight") go(1);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  if (import.meta.env.VITE_PROTOTYPE !== "true") return null;

  const button = {
    background: "none",
    border: "none",
    color: "#fff",
    fontSize: 18,
    cursor: "pointer",
    padding: "0 10px",
  };
  return (
    <div
      style={{
        position: "fixed",
        bottom: 12,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 1000,
        background: "#111",
        color: "#fff",
        border: "2px solid #ff0",
        borderRadius: 999,
        boxShadow: "0 4px 16px rgba(0,0,0,0.6)",
        padding: "6px 10px",
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontFamily: "system-ui, sans-serif",
        fontSize: 13,
        maxWidth: "95vw",
      }}
    >
      <button style={button} onClick={() => go(-1)} aria-label="Previous variant">
        ←
      </button>
      <strong style={{ whiteSpace: "nowrap" }}>
        {variants[index].key} ({variants[index].name})
      </strong>
      <button style={button} onClick={() => go(1)} aria-label="Next variant">
        →
      </button>
      {children}
    </div>
  );
}

export default PrototypeSwitcher;
