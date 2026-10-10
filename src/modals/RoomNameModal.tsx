import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { Box, Button, Flex, Input, Label, Text } from "theme-ui";

import Modal from "../components/Modal";
import FormError from "../components/account/FormError";

import { ApiError } from "../network/api";

export const ROOM_NAME_MAX_LENGTH = 64;

type RoomNameModalProps = {
  isOpen: boolean;
  onRequestClose: () => void;
  /** Resolves once the server has taken the change, rejects with its refusal */
  onSubmit: (name: string, password: string) => Promise<void>;
  title: string;
  submitText: string;
  /** The name to start from when renaming */
  name?: string;
  /** Ask for an optional room password too, for a new room */
  askPassword?: boolean;
};

/** Names a new room or renames one */
function RoomNameModal({
  isOpen,
  onRequestClose,
  onSubmit,
  title,
  submitText,
  name: startName,
  askPassword,
}: RoomNameModalProps) {
  const [name, setName] = useState(startName || "");
  const [password, setPassword] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<ApiError>();

  // Start from a clean form each time the modal opens
  useEffect(() => {
    if (isOpen) {
      setName(startName || "");
      setPassword("");
      setIsSending(false);
      setError(undefined);
    }
  }, [isOpen, startName]);

  const inputRef = useRef<HTMLInputElement>(null);
  function focusInput() {
    inputRef.current && inputRef.current.select();
  }

  async function handleSubmit(event: FormEvent<HTMLElement>) {
    event.preventDefault();
    setIsSending(true);
    setError(undefined);
    try {
      await onSubmit(name.trim(), password);
    } catch (error) {
      if (error instanceof ApiError) {
        setError(error);
      }
      setIsSending(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onRequestClose}
      onAfterOpen={focusInput}
      style={{ content: { maxWidth: "300px", width: "100%" } }}
    >
      <Box as="form" onSubmit={handleSubmit}>
        <Label py={2}>{title}</Label>
        <Box my={2}>
          <Label htmlFor="roomName">Name</Label>
          <Input
            id="roomName"
            name="roomName"
            value={name}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setName(event.target.value)
            }
            maxLength={ROOM_NAME_MAX_LENGTH}
            autoComplete="off"
            ref={inputRef}
          />
          <Text as="p" variant="caption" mt={1}>
            Up to {ROOM_NAME_MAX_LENGTH} characters. Players see this name.
          </Text>
        </Box>
        {askPassword && (
          <Box my={2}>
            <Label htmlFor="roomPassword">Password (optional)</Label>
            <Input
              id="roomPassword"
              name="roomPassword"
              value={password}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setPassword(event.target.value)
              }
              autoComplete="off"
            />
            <Text as="p" variant="caption" mt={1}>
              Players type it to join. Leave empty to let anyone with the link
              in.
            </Text>
          </Box>
        )}
        <FormError error={error} />
        <Flex py={2}>
          <Button
            type="button"
            sx={{ flexGrow: 1 }}
            m={1}
            ml={0}
            onClick={onRequestClose}
          >
            Cancel
          </Button>
          <Button
            sx={{ flexGrow: 1 }}
            m={1}
            mr={0}
            disabled={!name.trim() || isSending}
          >
            {submitText}
          </Button>
        </Flex>
      </Box>
    </Modal>
  );
}

export default RoomNameModal;
