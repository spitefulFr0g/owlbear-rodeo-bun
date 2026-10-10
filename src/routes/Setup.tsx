import { FormEvent, useState } from "react";
import { Box, Button, Flex, Text } from "theme-ui";

import AccountPage from "../components/account/AccountPage";
import {
  PasswordField,
  UsernameField,
  PASSWORD_MIN_LENGTH,
  USERNAME_MIN_LENGTH,
} from "../components/account/AccountFields";
import FormError from "../components/account/FormError";

import { useServerStatus } from "../contexts/ServerStatusContext";

import { ApiError, setup } from "../network/api";

type SetupProps = {
  /**
   * True when the host has reopened setup on a server that already has
   * accounts, false for the first run
   */
  reopened?: boolean;
  /** Leave the form for the sign in form, offered when setup was reopened */
  onSignInInstead?: () => void;
};

/**
 * Shown on every page until the server has an administrator, and on the home
 * page of a signed out visitor while the host has setup reopened
 */
function Setup({ reopened, onSignInInstead }: SetupProps) {
  const { refresh } = useServerStatus();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<ApiError>();

  async function handleSubmit(event: FormEvent<HTMLElement>) {
    event.preventDefault();
    setIsSending(true);
    setError(undefined);
    try {
      await setup(username.trim(), password);
      await refresh();
    } catch (error) {
      if (error instanceof ApiError) {
        setError(error);
        // Someone else finished setup first, move on to what is there now
        if (error.code === "setup_closed") {
          await refresh();
        }
      }
      setIsSending(false);
    }
  }

  const canSubmit =
    username.trim().length >= USERNAME_MIN_LENGTH &&
    password.length >= PASSWORD_MIN_LENGTH &&
    !isSending;

  return (
    <AccountPage
      title={reopened ? "Create a new administrator" : "Set up this server"}
    >
      <Text as="p" variant="body2" mb={2} sx={{ textAlign: "center" }}>
        {reopened
          ? "The host has reopened setup. One new administrator can be created. Every account, room and image already here is kept."
          : "Create the first account. It is the administrator of this server and can invite everyone else."}
      </Text>
      <Box as="form" onSubmit={handleSubmit}>
        <UsernameField
          value={username}
          onChange={setUsername}
          autoFocus
          showRule
        />
        <PasswordField value={password} onChange={setPassword} isNew />
        <FormError error={error} />
        <Flex py={2}>
          <Button sx={{ flexGrow: 1 }} disabled={!canSubmit}>
            Create administrator
          </Button>
        </Flex>
      </Box>
      {onSignInInstead && (
        <Button variant="secondary" onClick={onSignInInstead}>
          Sign in to an account you have instead
        </Button>
      )}
    </AccountPage>
  );
}

export default Setup;
