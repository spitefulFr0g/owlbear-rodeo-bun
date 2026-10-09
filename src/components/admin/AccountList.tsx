import { useCallback, useEffect, useState } from "react";
import { Box, Button, Flex, Text } from "theme-ui";

import AccountRow from "./AccountRow";
import OneUseLinkBox from "./OneUseLinkBox";
import FormError from "../account/FormError";
import LoadingOverlay from "../LoadingOverlay";

import {
  Account,
  ApiError,
  OneUseLink,
  createInvite,
  listAccounts,
} from "../../network/api";

function asApiError(error: unknown, message: string) {
  return error instanceof ApiError
    ? error
    : new ApiError("unknown", message, 0);
}

/** Every account on the server, and the way to let another person in */
function AccountList({ self }: { self: Account }) {
  const [accounts, setAccounts] = useState<Account[]>();
  const [error, setError] = useState<ApiError>();

  const load = useCallback(async () => {
    setError(undefined);
    try {
      setAccounts(await listAccounts());
    } catch (error) {
      setError(asApiError(error, "Unable to load the accounts."));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const [invite, setInvite] = useState<OneUseLink>();
  const [isInviting, setIsInviting] = useState(false);

  async function handleInvite() {
    setIsInviting(true);
    setError(undefined);
    try {
      setInvite(await createInvite());
    } catch (error) {
      setError(asApiError(error, "Unable to make an invite link."));
    }
    setIsInviting(false);
  }

  return (
    <Box sx={{ width: "100%" }}>
      <Flex sx={{ alignItems: "center", justifyContent: "space-between" }}>
        <Text as="h3" variant="heading" sx={{ fontSize: 2 }}>
          Accounts
        </Text>
        <Button py={1} onClick={handleInvite} disabled={isInviting}>
          {invite ? "New invite link" : "Invite someone"}
        </Button>
      </Flex>
      {invite && (
        <OneUseLinkBox
          label="Invite link"
          link={`${window.location.origin}/invite/${invite.token}`}
          expiresAt={invite.expiresAt}
          recipient="the person you are inviting"
        />
      )}
      {error && (
        <Flex sx={{ alignItems: "center", justifyContent: "space-between" }}>
          <FormError error={error} />
          {!accounts && (
            <Button variant="secondary" onClick={load}>
              Try again
            </Button>
          )}
        </Flex>
      )}
      {!accounts && !error && (
        <Box sx={{ position: "relative", height: "96px" }}>
          <LoadingOverlay bg="transparent" />
        </Box>
      )}
      {accounts && (
        <Box as="ul" mt={2} p={0} sx={{ listStyle: "none" }}>
          {accounts.map((account) => (
            <AccountRow
              key={account.id}
              account={account}
              isSelf={account.id === self.id}
            />
          ))}
        </Box>
      )}
      <Text as="p" variant="caption" mt={2}>
        An invite link is the only way onto this server. The person who opens it
        picks their own username and password.
      </Text>
    </Box>
  );
}

export default AccountList;
