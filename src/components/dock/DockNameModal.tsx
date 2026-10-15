import React, { useEffect, useRef, useState } from "react";
import { Box, Button, Flex, Input, Label } from "theme-ui";

import Modal from "../Modal";
import { checkLibraryName } from "../../sceneRules/library";

type DockNameModalProps = {
  isOpen: boolean;
  label: string;
  name: string;
  submitText: string;
  onSubmit: (name: string) => void;
  onRequestClose: () => void;
};

/** Names a new folder, or renames an asset or folder */
function DockNameModal({ isOpen, label, name, submitText, onSubmit, onRequestClose }: DockNameModalProps) {
  const [value, setValue] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => setValue(name), [name, isOpen]);
  const checked = checkLibraryName(value);

  function handleSubmit(event: React.FormEvent<HTMLDivElement>) {
    event.preventDefault();
    if (checked) onSubmit(checked);
  }

  return (
    <Modal
      contentLabel={label}
      isOpen={isOpen}
      onRequestClose={onRequestClose}
      onAfterOpen={() => inputRef.current?.select()}
      style={{ content: { maxWidth: "300px" } }}
    >
      <Box as="form" onSubmit={handleSubmit}>
        <Label py={2} htmlFor="dockName">
          {label}
        </Label>
        <Input
          id="dockName"
          value={value}
          maxLength={100}
          autoComplete="off"
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => setValue(event.target.value)}
          ref={inputRef}
        />
        <Flex py={2}>
          <Button sx={{ flexGrow: 1 }} disabled={!checked}>
            {submitText}
          </Button>
        </Flex>
      </Box>
    </Modal>
  );
}

export default DockNameModal;
