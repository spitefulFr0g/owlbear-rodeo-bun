import { useCallback, useEffect, useState } from "react";
import { Box, Button, Flex, Text } from "theme-ui";

import AccountRow from "./AccountRow";
import OneUseLinkBox from "./OneUseLinkBox";
import FormError from "../account/FormError";
import RemoveAccountModal from "../../modals/RemoveAccountModal";
import LoadingOverlay from "../LoadingOverlay";
import QuotaField from "../QuotaField";

import {
  Account,
  ApiError,
  OneUseLink,
  createInvite,
  createResetLink,
  getLibraryQuotas,
  listAccounts,
  setAccountQuota,
  setAdministrator,
  removeAccount,
} from "../../network/api";
import { QuotaUsage, checkQuota } from "../../sceneRules/library";

function asApiError(error: unknown, message: string) {
  return error instanceof ApiError
    ? error
    : new ApiError("unknown", message, 0);
}

/** Every account on the server, and the way to let another person in */
function AccountList({
  self,
  onChanged,
}: {
  self: Account;
  onChanged: () => Promise<void>;
}) {
  const [removing, setRemoving] = useState<Account>();
  const [isChanging, setIsChanging] = useState(false);

  async function handleAdministrator(account: Account) {
    setIsChanging(true);
    setError(undefined);
    try {
      await setAdministrator(account.id, !account.administrator);
      await onChanged();
      await load();
    } catch (error) {
      setError(asApiError(error, "Unable to change the administrator mark."));
      await onChanged();
    }
    setIsChanging(false);
  }

  async function handleRemove() {
    if (!removing) return;
    await removeAccount(removing.id);
    setRemoving(undefined);
    setReset(undefined);
    await onChanged();
    await load();
  }
  const [accounts, setAccounts] = useState<Account[]>();
  const [libraries, setLibraries] = useState<Map<string, QuotaUsage>>();
  const [error, setError] = useState<ApiError>();

  const load = useCallback(async () => {
    setError(undefined);
    try {
      const [accounts, quotas] = await Promise.all([
        listAccounts(),
        getLibraryQuotas(),
      ]);
      setAccounts(accounts);
      setLibraries(
        new Map(
          quotas.accounts.map((account) => [
            account.id,
            { ...account.usage, quota: account.quota },
          ])
        )
      );
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

  const [reset, setReset] = useState<{ account: Account; link: OneUseLink }>();

  async function handleReset(account: Account) {
    setError(undefined);
    try {
      setReset({ account, link: await createResetLink(account.id) });
    } catch (error) {
      setError(asApiError(error, "Unable to make a reset link."));
    }
  }

  // The server refuses to leave itself without an administrator
  const onlyAdministrator =
    accounts?.filter((account) => account.administrator).length === 1;

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
          id="invite-link"
          label="Invite link"
          link={`${window.location.origin}/invite/${invite.token}`}
          expiresAt={invite.expiresAt}
          recipient="the person you are inviting"
        />
      )}
      {reset && (
        <OneUseLinkBox
          id="reset-link"
          label={`Reset link for ${reset.account.username}`}
          link={`${window.location.origin}/reset/${reset.link.token}`}
          expiresAt={reset.link.expiresAt}
          recipient={reset.account.username}
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
            >
              <Flex
                sx={{ gap: 1, flexWrap: "wrap", justifyContent: "flex-end" }}
              >
                <Button
                  variant="secondary"
                  py={1}
                  disabled={
                    isChanging || (account.administrator && onlyAdministrator)
                  }
                  title={
                    account.administrator && onlyAdministrator
                      ? "The last administrator must keep the administrator mark."
                      : undefined
                  }
                  onClick={() => handleAdministrator(account)}
                  aria-label={`${account.administrator ? "Unmake" : "Make"} ${
                    account.username
                  } an administrator`}
                >
                  {account.administrator
                    ? "Unmake administrator"
                    : "Make administrator"}
                </Button>
                {/* The server never lets an administrator remove themselves */}
                {account.id !== self.id && (
                  <Button
                    variant="secondary"
                    py={1}
                    disabled={isChanging}
                    onClick={() => setRemoving(account)}
                    aria-label={`Remove ${account.username}`}
                  >
                    Remove account
                  </Button>
                )}
                <Button
                  variant="secondary"
                  py={1}
                  sx={{ flexShrink: 0 }}
                  aria-label={`Reset the password of ${account.username}`}
                  onClick={() => handleReset(account)}
                >
                  Reset password
                </Button>
              </Flex>
              {libraries?.has(account.id) && (
                <AccountQuota
                  account={account}
                  usage={libraries.get(account.id)!}
                  onSave={async (bytes) => {
                    await setAccountQuota(account.id, bytes);
                    await load();
                  }}
                />
              )}
            </AccountRow>
          ))}
        </Box>
      )}
      <RemoveAccountModal
        account={removing}
        onRequestClose={() => setRemoving(undefined)}
        onConfirm={handleRemove}
      />
      <Text as="p" variant="caption" mt={2}>
        An invite link is the only way onto this server. The person who opens it
        picks their own username and password.
      </Text>
    </Box>
  );
}

/**
 * The account library's quota. The page shows no storage figure per account,
 * only whether a lowered quota has left the library over it.
 */
function AccountQuota({
  account,
  usage,
  onSave,
}: {
  account: Account;
  usage: QuotaUsage;
  onSave: (bytes: number) => Promise<void>;
}) {
  return (
    <Box sx={{ width: "100%" }}>
      <QuotaField
        id={`account-quota-${account.id}`}
        label={`Account library quota for ${account.username}`}
        bytes={usage.quota}
        onSave={onSave}
      />
      {!checkQuota(usage, 0) && (
        <Text as="p" variant="caption" m={0} sx={{ color: "error" }}>
          This library is over its quota. Nothing has been deleted, but new
          imports and moves in are refused until it is back under.
        </Text>
      )}
    </Box>
  );
}

export default AccountList;
