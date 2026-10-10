import { FormEvent, useEffect, useState } from "react";
import { Box, Button, Flex, Text } from "theme-ui";
import { useHistory, useParams } from "react-router-dom";

import AccountPage from "../components/account/AccountPage";
import {
  PasswordField,
  UsernameField,
  PASSWORD_MIN_LENGTH,
  USERNAME_MIN_LENGTH,
} from "../components/account/AccountFields";
import FormError from "../components/account/FormError";
import LinkProblem from "../components/account/LinkProblem";
import LoadingOverlay from "../components/LoadingOverlay";

import { useServerStatus } from "../contexts/ServerStatusContext";

import { ApiError, acceptInvite, checkInvite } from "../network/api";

type LinkState = "checking" | "usable" | "invalid" | "unreachable";

/** Where an invite link leads: the invited person makes their own account */
function Invite() {
  const { token } = useParams<{ token: string }>();
  const { refresh } = useServerStatus();
  const history = useHistory();

  const [linkState, setLinkState] = useState<LinkState>("checking");
  useEffect(() => {
    let cancelled = false;
    setLinkState("checking");
    checkInvite(token).then(
      () => !cancelled && setLinkState("usable"),
      (error) =>
        !cancelled &&
        setLinkState(
          error instanceof ApiError && error.code === "link_invalid"
            ? "invalid"
            : "unreachable"
        )
    );
    return () => {
      cancelled = true;
    };
  }, [token]);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<ApiError>();

  async function handleSubmit(event: FormEvent<HTMLElement>) {
    event.preventDefault();
    setIsSending(true);
    setError(undefined);
    try {
      await acceptInvite(token, username.trim(), password);
      await refresh();
      history.replace("/");
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === "link_invalid") {
          setLinkState("invalid");
        } else {
          setError(error);
        }
      }
      setIsSending(false);
    }
  }

  const canSubmit =
    username.trim().length >= USERNAME_MIN_LENGTH &&
    password.length >= PASSWORD_MIN_LENGTH &&
    !isSending;

  if (linkState === "checking") {
    return <LoadingOverlay bg="background" />;
  }

  if (linkState === "invalid") {
    return (
      <AccountPage title="This invite can't be used">
        <LinkProblem>
          An invite link works once and for 7 days. This one has been used, has
          run out, or was not copied in full. Ask the administrator of this
          server for a new one.
        </LinkProblem>
      </AccountPage>
    );
  }

  if (linkState === "unreachable") {
    return (
      <AccountPage title="Unable to check this invite">
        <LinkProblem>
          The server could not be reached. Reload the page to try again.
        </LinkProblem>
      </AccountPage>
    );
  }

  return (
    <AccountPage title="You're invited">
      <Text as="p" variant="body2" mb={2} sx={{ textAlign: "center" }}>
        Pick a username and password to make your account on this server.
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
            Create account
          </Button>
        </Flex>
      </Box>
    </AccountPage>
  );
}

export default Invite;
