import { FormEvent, useState } from "react";
import { Box, Button, Flex, Text } from "theme-ui";

import AccountPage from "../components/account/AccountPage";
import {
  PasswordField,
  UsernameField,
} from "../components/account/AccountFields";
import FormError from "../components/account/FormError";

import { useServerStatus } from "../contexts/ServerStatusContext";

import { ApiError, signIn } from "../network/api";

/** The home page of a signed out visitor */
function SignIn() {
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
      await signIn(username.trim(), password);
      await refresh();
    } catch (error) {
      if (error instanceof ApiError) {
        setError(error);
      }
      setIsSending(false);
    }
  }

  const canSubmit = !!username.trim() && !!password && !isSending;

  return (
    <AccountPage title="Sign in">
      <Box as="form" onSubmit={handleSubmit}>
        <UsernameField value={username} onChange={setUsername} autoFocus />
        <PasswordField value={password} onChange={setPassword} />
        <FormError error={error} />
        <Flex py={2}>
          <Button sx={{ flexGrow: 1 }} disabled={!canSubmit}>
            Sign in
          </Button>
        </Flex>
      </Box>
      <Text as="p" variant="caption" mt={2} sx={{ textAlign: "center" }}>
        Here to play? Open the room link your GM sent you. Players need no
        account.
      </Text>
    </AccountPage>
  );
}

export default SignIn;
