import { useEffect, useState } from "react";
import { Box, Button, Flex, Text } from "theme-ui";

import Modal from "../components/Modal";
import FormError from "../components/account/FormError";
import { ApiError, Account } from "../network/api";

type RemoveAccountModalProps = {
  account?: Account;
  onRequestClose: () => void;
  onConfirm: () => Promise<void>;
};

function RemoveAccountModal({
  account,
  onRequestClose,
  onConfirm,
}: RemoveAccountModalProps) {
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<ApiError>();

  useEffect(() => {
    setIsSending(false);
    setError(undefined);
  }, [account]);

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
          : new ApiError(
              "unknown",
              "Unable to remove the account. Try again.",
              0
            )
      );
      setIsSending(false);
    }
  }

  return (
    <Modal
      isOpen={!!account}
      onRequestClose={isSending ? undefined : onRequestClose}
      allowClose={!isSending}
      contentLabel="Remove account"
      style={{ content: { maxWidth: "340px", width: "100%" } }}
    >
      <Box>
        <Text as="h2" variant="heading" py={2}>
          Remove account?
        </Text>
        <Text as="p" variant="body2" sx={{ overflowWrap: "anywhere" }}>
          Remove “{account?.username}”? Their sign-ins will end and their rooms
          will pass to you. Nothing in their rooms will be deleted. This cannot
          be undone.
        </Text>
        <FormError error={error} />
        <Flex py={2}>
          <Button
            sx={{ flexGrow: 1 }}
            m={1}
            ml={0}
            disabled={isSending}
            onClick={onRequestClose}
          >
            Cancel
          </Button>
          <Button
            sx={{ flexGrow: 1 }}
            m={1}
            mr={0}
            disabled={isSending}
            onClick={handleConfirm}
          >
            {isSending ? "Removing…" : "Remove"}
          </Button>
        </Flex>
      </Box>
    </Modal>
  );
}

export default RemoveAccountModal;
