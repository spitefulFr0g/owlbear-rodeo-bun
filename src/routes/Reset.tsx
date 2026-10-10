import { FormEvent, useEffect, useState } from "react";
import { Box, Button, Flex, Text } from "theme-ui";
import { useHistory, useParams } from "react-router-dom";

import AccountPage from "../components/account/AccountPage";
import {
  PasswordField,
  PASSWORD_MIN_LENGTH,
} from "../components/account/AccountFields";
import FormError from "../components/account/FormError";
import LinkProblem from "../components/account/LinkProblem";
import LoadingOverlay from "../components/LoadingOverlay";

import { useServerStatus } from "../contexts/ServerStatusContext";

import { ApiError, acceptReset, checkReset } from "../network/api";

type LinkState = "checking" | "usable" | "invalid" | "unreachable";

/** Where a reset link leads: the account holder picks a new password */
function Reset() {
  const { token } = useParams<{ token: string }>();
  const { refresh } = useServerStatus();
  const history = useHistory();

  const [linkState, setLinkState] = useState<LinkState>("checking");
  const [username, setUsername] = useState("");
  useEffect(() => {
    let cancelled = false;
    setLinkState("checking");
    checkReset(token).then(
      ({ username }) => {
        if (!cancelled) {
          setUsername(username);
          setLinkState("usable");
        }
      },
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

  const [password, setPassword] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<ApiError>();

  async function handleSubmit(event: FormEvent<HTMLElement>) {
    event.preventDefault();
    setIsSending(true);
    setError(undefined);
    try {
      await acceptReset(token, password);
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

  if (linkState === "checking") {
    return <LoadingOverlay bg="background" />;
  }

  if (linkState === "invalid") {
    return (
      <AccountPage title="This reset link can't be used">
        <LinkProblem>
          A reset link works once and for 7 days. This one has been used, has
          run out, or was not copied in full. Ask the administrator of this
          server for a new one.
        </LinkProblem>
      </AccountPage>
    );
  }

  if (linkState === "unreachable") {
    return (
      <AccountPage title="Unable to check this reset link">
        <LinkProblem>
          The server could not be reached. Reload the page to try again.
        </LinkProblem>
      </AccountPage>
    );
  }

  return (
    <AccountPage title="Pick a new password">
      <Text as="p" variant="body2" mb={2} sx={{ textAlign: "center" }}>
        This sets a new password for <strong>{username}</strong> and signs that
        account out everywhere else.
      </Text>
      <Box as="form" onSubmit={handleSubmit}>
        {/* Lets a password manager file the new password under the account */}
        <input
          type="text"
          name="username"
          autoComplete="username"
          value={username}
          readOnly
          hidden
        />
        <PasswordField
          value={password}
          onChange={setPassword}
          label="New password"
          isNew
          autoFocus
        />
        <FormError error={error} />
        <Flex py={2}>
          <Button
            sx={{ flexGrow: 1 }}
            disabled={password.length < PASSWORD_MIN_LENGTH || isSending}
          >
            Set password
          </Button>
        </Flex>
      </Box>
    </AccountPage>
  );
}

export default Reset;
