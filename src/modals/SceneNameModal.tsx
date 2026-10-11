import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { Box, Button, Flex, Input, Label, Text } from "theme-ui";

import Modal from "../components/Modal";

import { maxSceneNameLength } from "../sceneRules";

type SceneNameModalProps = {
  isOpen: boolean;
  onRequestClose: () => void;
  /** Resolves with nothing once the server has taken the name, or with why it refused */
  onSubmit: (name: string) => Promise<string | undefined>;
  /** The name to start from */
  name: string;
};

/** Renames a scene */
function SceneNameModal({
  isOpen,
  onRequestClose,
  onSubmit,
  name: startName,
}: SceneNameModalProps) {
  const [name, setName] = useState(startName);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string>();

  // Start from a clean form each time the modal opens
  useEffect(() => {
    if (isOpen) {
      setName(startName);
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
    const refused = await onSubmit(name.trim());
    if (refused) {
      setError(refused);
      setIsSending(false);
    }
  }

  return (
    <Modal
      contentLabel="Rename scene"
      isOpen={isOpen}
      onRequestClose={onRequestClose}
      onAfterOpen={focusInput}
      style={{ content: { maxWidth: "300px", width: "100%" } }}
    >
      <Box as="form" onSubmit={handleSubmit}>
        <Label py={2}>Rename scene</Label>
        <Box my={2}>
          <Label htmlFor="sceneName">Name</Label>
          <Input
            id="sceneName"
            name="sceneName"
            value={name}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setName(event.target.value)
            }
            maxLength={maxSceneNameLength}
            autoComplete="off"
            ref={inputRef}
          />
          <Text as="p" variant="caption" mt={1}>
            Up to {maxSceneNameLength} characters. The list is sorted by name.
          </Text>
        </Box>
        {error && (
          <Text as="p" role="alert" variant="caption" sx={{ color: "highlight" }}>
            {error}
          </Text>
        )}
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
            Rename
          </Button>
        </Flex>
      </Box>
    </Modal>
  );
}

export default SceneNameModal;
