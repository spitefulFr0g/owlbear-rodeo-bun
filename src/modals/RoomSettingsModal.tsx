import { ReactNode, useEffect, useRef, useState } from "react";
import { Button, Checkbox, Divider, Flex, Input, Label, Text } from "theme-ui";
import { useParams } from "react-router-dom";
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
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [displayLink, setDisplayLink] = useState("");
  const { id: roomId }: { id: string } = useParams();
  const request = useRef(0);
  const feedback = useRef<HTMLDivElement>(null);
  // Nothing from the last visit is shown when the settings open again
  useEffect(() => {
    if (!isOpen) {
      setPassword("");
      setMessage("");
      setError("");
      setDisplayLink("");
    }
  }, [isOpen]);
  // The answer sits below the settings, so bring it into view
  useEffect(() => {
    if (message || error) feedback.current?.scrollIntoView({ block: "nearest" });
  }, [message, error, displayLink]);
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

  function changeAccess(
    event: "room_password" | "new_display_link",
    value?: string | null
  ) {
    if (!isGM || pending) return;
    if (!session.socket?.connected) {
      setError("The room is disconnected. Reconnect before changing its settings.");
      return;
    }
    setPending(true);
    setError("");
    setMessage("");
    const id = ++request.current;
    const answer = (
      timeout: Error | null,
      result?: { ok: boolean; error?: string; token?: string }
    ) => {
      if (request.current !== id) return;
      setPending(false);
      if (timeout) setError("The room did not answer. Please try again.");
      else if (!result?.ok)
        setError(
          result?.error === "not_room_gm"
            ? "Only the room's GM can change these settings."
            : "The room could not save that setting. Please try again."
        );
      else if (event === "room_password") {
        setPassword("");
        setMessage(
          value
            ? "Room password saved. People already in the room stay connected."
            : "Room password removed. People already in the room stay connected."
        );
      } else if (result.token) {
        setDisplayLink(
          `${window.location.origin}/display/${roomId}#${result.token}`
        );
        session.emit("displayToken", result.token);
        setMessage(
          "New display link ready. Cast displays using the old link have been disconnected."
        );
      } else setError("The room did not return a display link. Please try again.");
    };
    if (event === "room_password")
      session.socket.timeout(10000).emit(event, value, answer);
    else session.socket.timeout(5000).emit(event, answer);
  }

  if (!isGM) return null;
  const switches = room.switches || defaultRoomSwitches;
  return (
    <Modal
      contentLabel="Room settings"
      isOpen={isOpen}
      onRequestClose={onRequestClose}
      style={{ content: { width: "420px", maxWidth: "100%", overflowY: "auto" } }}
    >
      <Flex sx={{ flexDirection: "column" }}>
        <Text as="h2" variant="heading" py={2}>Room settings</Text>
        <Divider />
        <Flex
          role="group"
          aria-labelledby="room-switches"
          sx={{ flexDirection: "column" }}
        >
          <Text id="room-switches" my={2}>Allow players to use:</Text>
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
        </Flex>
        <Text variant="caption" my={2}>
          The GM and trusted players can use every tool whatever these switches
          say.
        </Text>
        <Divider />
        <Label htmlFor="room-password" py={2}>Room password</Label>
        <Text variant="caption" mb={2}>
          Set or change the password for new players. People already in the room
          stay connected.
        </Text>
        <Flex
          as="form"
          sx={{ flexDirection: "column" }}
          onSubmit={(e) => {
            e.preventDefault();
            changeAccess("room_password", password);
          }}
        >
          <Input
            id="room-password"
            type="password"
            autoComplete="new-password"
            value={password}
            disabled={pending}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Flex my={2} sx={{ gap: 2 }}>
            <Button type="submit" disabled={pending || !password}>
              Save password
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={pending || room.hasPassword === false}
              onClick={() => changeAccess("room_password", null)}
            >
              Remove password
            </Button>
          </Flex>
        </Flex>
        <Divider />
        <Text as="h3" variant="heading" py={2}>Display link</Text>
        <Text variant="caption" mb={2}>
          Replace the display link and disconnect cast displays using the old link.
        </Text>
        <Button disabled={pending} onClick={() => changeAccess("new_display_link")}>
          New display link
        </Button>
        {displayLink && (
          <>
            <Label htmlFor="new-display-link" mt={2}>New display link</Label>
            <Input
              id="new-display-link"
              readOnly
              value={displayLink}
              onFocus={(e) => e.target.select()}
            />
          </>
        )}
        <Flex ref={feedback} sx={{ flexDirection: "column" }}>
          {message && <Text role="status" my={2}>{message}</Text>}
          {error && (
            <Text role="alert" my={2} sx={{ color: "error" }}>
              {error}
            </Text>
          )}
        </Flex>
        {children}
      </Flex>
    </Modal>
  );
}
