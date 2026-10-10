import { useState, useRef, useEffect, ChangeEvent, FormEvent } from "react";
import { Box, Input, Button, Label, Flex, Text } from "theme-ui";

import { useAuth } from "../contexts/AuthContext";

import Modal from "../components/Modal";
import { formatWait } from "../components/account/FormError";

type AuthModalProps = {
  isOpen: boolean;
  onSubmit: (newPassword: string) => void;
  /** When the server takes passwords again after too many wrong ones */
  waitUntil?: number;
  /** The server checked the last password sent and refused it */
  refused?: boolean;
};

function AuthModal({ isOpen, onSubmit, waitUntil, refused }: AuthModalProps) {
  const { password, setPassword } = useAuth();
  const [tmpPassword, setTempPassword] = useState<string>(password);

  // Seconds left to wait, counted down while the modal is open
  const [waitSeconds, setWaitSeconds] = useState(0);
  useEffect(() => {
    if (!isOpen || waitUntil === undefined) {
      setWaitSeconds(0);
      return;
    }
    const until = waitUntil;
    function update() {
      setWaitSeconds(Math.max(0, Math.ceil((until - Date.now()) / 1000)));
    }
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [isOpen, waitUntil]);
  const isWaiting = waitSeconds > 0;

  // Opening a room's link sends whatever this browser used last, so only a
  // password the person typed here is called wrong
  const [submitted, setSubmitted] = useState(false);

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    setTempPassword(event.target?.value);
  }

  function handleSubmit(event: FormEvent<HTMLElement>): void {
    event.preventDefault();
    if (isWaiting) {
      return;
    }
    setSubmitted(true);
    setPassword(tmpPassword);
    onSubmit(tmpPassword);
  }

  const inputRef = useRef<HTMLInputElement>(null);
  function focusInput(): void {
    inputRef.current && inputRef.current?.focus();
    // The password is hidden, so retyping it replaces what was refused
    inputRef.current?.select();
  }

  return (
    <Modal contentLabel="Room password" isOpen={isOpen} allowClose={false} onAfterOpen={focusInput}>
      <Box as="form" onSubmit={handleSubmit}>
        <Label py={2} htmlFor="password">
          Enter password
        </Label>
        <Input
          id="password"
          type="password"
          value={tmpPassword}
          onChange={handleChange}
          ref={inputRef}
          autoComplete="off"
        />
        {refused && submitted && !isWaiting && (
          <Text as="p" variant="body2" mt={2} role="alert" sx={{ color: "error" }}>
            Wrong password. Check it and try again.
          </Text>
        )}
        {isWaiting && (
          <Text as="p" variant="body2" mt={2} role="alert" sx={{ color: "error" }}>
            Too many wrong passwords. Try again in {formatWait(waitSeconds)}.
          </Text>
        )}
        <Flex py={2}>
          <Button sx={{ flexGrow: 1 }} disabled={isWaiting}>
            Join
          </Button>
        </Flex>
      </Box>
    </Modal>
  );
}

export default AuthModal;
