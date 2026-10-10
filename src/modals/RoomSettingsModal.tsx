import { ReactNode, useEffect, useRef, useState } from "react";
import { Checkbox, Divider, Flex, Label, Text } from "theme-ui";
import Modal from "../components/Modal";
import { useRole, useRoom } from "../contexts/RoomContext";
import { defaultRoomSwitches, getRoleControls } from "../helpers/roomControls";
import Session from "../network/Session";
import { RoomSwitches } from "../types/Room";

const switchLabels: Record<keyof RoomSwitches, string> = {
  tokens: "Tokens",
  drawing: "Drawing",
  notes: "Notes and text",
  fog: "Fog",
  uploads: "Uploads",
};

/** Additional room settings can be supplied here without changing switch handling. */
export default function RoomSettingsModal({
  session,
  isOpen,
  onRequestClose,
  children,
}: {
  session: Session;
  isOpen: boolean;
  onRequestClose: () => void;
  children?: ReactNode;
}) {
  const room = useRoom();
  const isGM = getRoleControls(useRole()).room;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(0);
  useEffect(() => {
    return () => {
      request.current = -1;
    };
  }, []);

  function changeSwitch(key: keyof RoomSwitches, value: boolean) {
    if (!isGM || pending) return;
    if (!session.socket?.connected) {
      setError(
        "The room is disconnected. Reconnect before changing its settings."
      );
      return;
    }
    setPending(true);
    setError("");
    const id = ++request.current;
    session.socket
      .timeout(5000)
      .emit(
        "room_switches",
        { [key]: value },
        (timeout: Error | null, result?: { ok: boolean; error?: string }) => {
          if (request.current !== id) return;
          setPending(false);
          if (timeout) setError("The room did not answer. Please try again.");
          else if (!result?.ok)
            setError(
              result?.error === "not_room_gm"
                ? "Only the room's GM can change these settings."
                : "The room could not save that setting. Please try again."
            );
        }
      );
  }

  if (!isGM) return null;
  const switches = room.switches || defaultRoomSwitches;
  return (
    <Modal isOpen={isOpen} onRequestClose={onRequestClose}>
      <Flex sx={{ flexDirection: "column" }}>
        <Label py={2}>Room settings</Label>
        <Divider />
        <Text my={2}>Allow players to use:</Text>
        {(Object.keys(switchLabels) as (keyof RoomSwitches)[]).map((key) => (
          <Label key={key} py={2}>
            <Checkbox
              checked={switches[key]}
              disabled={pending}
              onChange={(e) => changeSwitch(key, e.target.checked)}
            />
            {switchLabels[key]}
          </Label>
        ))}
        <Text variant="caption" my={2}>
          The GM and trusted players can use every tool whatever these switches
          say.
        </Text>
        {error && (
          <Text role="alert" color="red" my={2}>
            {error}
          </Text>
        )}
        {children}
      </Flex>
    </Modal>
  );
}
