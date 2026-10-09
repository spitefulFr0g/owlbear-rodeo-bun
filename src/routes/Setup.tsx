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

/** Shown on every page until the server has an administrator */
function Setup() {
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
    <AccountPage title="Set up this server">
      <Text as="p" variant="body2" mb={2} sx={{ textAlign: "center" }}>
        Create the first account. It is the administrator of this server and
        can invite everyone else.
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
    </AccountPage>
  );
}

export default Setup;
