import { useEffect, useState, useRef, useCallback } from "react";

import useDebounce from "./useDebounce";
import Session from "../network/Session";

/**
 * @param update The updated state or a state function passed into setState
 * @param sync Whether to sync the update with the session
 */
export type SetNetworkedState<S> = (
  update: React.SetStateAction<S>,
  sync?: boolean
) => void;

/**
 * Helper to sync a react state to a `Session`
 *
 * @param {S} initialState
 * @param {Session} session `Session` instance
 * @param {string} eventName Name of the event to send to the session
 * @param {number} debounceRate Amount to debounce before sending to the session (ms)
 */
function useNetworkedState<S extends { readonly [x: string]: any } | null>(
  initialState: S,
  session: Session,
  eventName: string,
  debounceRate: number = 500
): [S, SetNetworkedState<S>] {
  const [state, _setState] = useState(initialState);
  // Used to control whether the state needs to be sent to the socket
  const dirtyRef = useRef(false);

  // Update dirty at the same time as state
  const setState = useCallback<SetNetworkedState<S>>(
    (update, sync = true) => {
      dirtyRef.current = sync;
      _setState(update);
    },
    []
  );

  const debouncedState = useDebounce(state, debounceRate);
  useEffect(() => {
    if (dirtyRef.current) {
      session.socket?.emit(eventName, debouncedState);
      dirtyRef.current = false;
    }
  }, [
    session.socket,
    eventName,
    debouncedState,
  ]);

  useEffect(() => {
    function handleSocketEvent(data: S) {
      _setState(data);
    }

    session.socket?.on(eventName, handleSocketEvent);
    return () => {
      session.socket?.off(eventName, handleSocketEvent);
    };
  }, [session.socket, eventName]);

  return [state, setState];
}

export default useNetworkedState;
