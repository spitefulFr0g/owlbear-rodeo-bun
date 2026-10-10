import { useEffect, useState } from "react";
import { Box, Button, Flex, Text } from "theme-ui";

import Modal from "../components/Modal";
import FormError from "../components/account/FormError";
import { ApiError, Room } from "../network/api";

type DeleteRoomModalProps = {
  room?: Room;
  onRequestClose: () => void;
  onConfirm: () => Promise<void>;
};

function DeleteRoomModal({
  room,
  onRequestClose,
  onConfirm,
}: DeleteRoomModalProps) {
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<ApiError>();

  useEffect(() => {
    setIsSending(false);
    setError(undefined);
  }, [room]);

  async function handleConfirm() {
    if (isSending) return;
    setIsSending(true);
    setError(undefined);
    try {
      await onConfirm();
    } catch (error) {
      setError(
        error instanceof ApiError
          ? error
          : new ApiError("unknown", "Unable to delete the room. Try again.", 0)
      );
      setIsSending(false);
    }
  }

  return (
    <Modal
      isOpen={!!room}
      onRequestClose={isSending ? undefined : onRequestClose}
      allowClose={!isSending}
      contentLabel="Delete room"
      style={{ content: { maxWidth: "340px", width: "100%" } }}
    >
      <Box>
        <Text as="h2" variant="heading" py={2}>Delete room?</Text>
        <Text as="p" variant="body2" sx={{ overflowWrap: "anywhere" }}>
          Delete “{room?.name}”? Everyone in the room will be disconnected.
          The room and images used only by it will be removed. This cannot be undone.
        </Text>
        <FormError error={error} />
        <Flex py={2}>
          <Button sx={{ flexGrow: 1 }} m={1} ml={0} disabled={isSending} onClick={onRequestClose}>
            Cancel
          </Button>
          <Button sx={{ flexGrow: 1 }} m={1} mr={0} disabled={isSending} onClick={handleConfirm}>
            {isSending ? "Deleting…" : "Delete"}
          </Button>
        </Flex>
      </Box>
    </Modal>
  );
}

export default DeleteRoomModal;
