import React, { useEffect, useState, useContext } from "react";
import { EventEmitter } from "events";

const keyboardEmitter = new EventEmitter();
keyboardEmitter.setMaxListeners(100);

const KeyboardContext = React.createContext({ keyEmitter: keyboardEmitter });

/** Marks an element whose key presses never reach the room's shortcuts */
const ownsKeys = "data-owns-keys";
export const ownKeys = { [ownsKeys]: true };

export function KeyboardProvider({ children }: { children: React.ReactNode }) {
  const [keyEmitter] = useState(keyboardEmitter);
  useEffect(() => {
    function handleKeyDown(event: Event) {
      // Ignore text input
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      // Ignore keys pressed in the dock and the windows above the room, so
      // Delete on an asset leaves the selected items alone. A window portalled
      // to the body cannot stop them reaching this listener itself. Key ups
      // still pass, so a key held over the room is released.
      if (
        event.target instanceof Element &&
        event.target.closest(`[${ownsKeys}]`)
      ) {
        return;
      }
      keyEmitter.emit("keyDown", event);
    }

    function handleKeyUp(event: Event) {
      // Ignore text input
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      keyEmitter.emit("keyUp", event);
    }

    document.body.addEventListener("keydown", handleKeyDown);
    document.body.addEventListener("keyup", handleKeyUp);
    document.body.tabIndex = 1;
    return () => {
      document.body.removeEventListener("keydown", handleKeyDown);
      document.body.removeEventListener("keyup", handleKeyUp);
      document.body.tabIndex = 0;
    };
  }, [keyEmitter]);

  return (
    <KeyboardContext.Provider value={{ keyEmitter }}>
      {children}
    </KeyboardContext.Provider>
  );
}

export function useKeyboard(
  onKeyDown?: (event: KeyboardEvent) => void,
  onKeyUp?: (event: KeyboardEvent) => void
) {
  const context = useContext(KeyboardContext);
  if (context === undefined) {
    throw new Error("useKeyboard must be used within a KeyboardProvider");
  }
  const { keyEmitter } = context;
  useEffect(() => {
    if (onKeyDown) {
      keyEmitter.on("keyDown", onKeyDown);
    }
    if (onKeyUp) {
      keyEmitter.on("keyUp", onKeyUp);
    }

    return () => {
      if (onKeyDown) {
        keyEmitter.off("keyDown", onKeyDown);
      }
      if (onKeyUp) {
        keyEmitter.off("keyUp", onKeyUp);
      }
    };
  });
}

/**
 * Handler to handle a blur event. Useful when using a shortcut that uses the Alt or Cmd
 * @param {FocusEvent} onBlur
 */
export function useBlur(onBlur: EventListenerOrEventListenerObject) {
  useEffect(() => {
    if (onBlur) {
      window.addEventListener("blur", onBlur);
    }
    return () => {
      if (onBlur) {
        window.removeEventListener("blur", onBlur);
      }
    };
  });
}

export default KeyboardContext;
