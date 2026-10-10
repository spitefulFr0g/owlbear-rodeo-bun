import { FormEvent, useEffect, useState } from "react";
import { Box, Button, Flex, Label } from "theme-ui";

import Modal from "../components/Modal";
import {
  PasswordField,
  PASSWORD_MIN_LENGTH,
} from "../components/account/AccountFields";
import FormError from "../components/account/FormError";

import { ApiError, changePassword } from "../network/api";

type ChangePasswordModalProps = {
  isOpen: boolean;
  onRequestClose: () => void;
  /** Called once the server has taken the new password */
  onChanged: () => void;
};

/** An account holder changes their own password by giving the current one */
function ChangePasswordModal({
  isOpen,
  onRequestClose,
  onChanged,
}: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<ApiError>();

  // Start from a clean form each time the modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentPassword("");
      setNewPassword("");
      setIsSending(false);
      setError(undefined);
    }
  }, [isOpen]);

  async function handleSubmit(event: FormEvent<HTMLElement>) {
    event.preventDefault();
    setIsSending(true);
    setError(undefined);
    try {
      await changePassword(currentPassword, newPassword);
      onChanged();
    } catch (error) {
      if (error instanceof ApiError) {
        setError(error);
      }
      setIsSending(false);
    }
  }

  const canSubmit =
    !!currentPassword &&
    newPassword.length >= PASSWORD_MIN_LENGTH &&
    !isSending;

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onRequestClose}
      style={{ content: { maxWidth: "300px", width: "100%" } }}
    >
      <Box as="form" onSubmit={handleSubmit}>
        <Label py={2}>Change password</Label>
        <PasswordField
          value={currentPassword}
          onChange={setCurrentPassword}
          label="Current password"
          id="currentPassword"
          autoFocus
        />
        <PasswordField
          value={newPassword}
          onChange={setNewPassword}
          label="New password"
          id="newPassword"
          isNew
        />
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
          <Button sx={{ flexGrow: 1 }} m={1} mr={0} disabled={!canSubmit}>
            Change
          </Button>
        </Flex>
      </Box>
    </Modal>
  );
}

export default ChangePasswordModal;
