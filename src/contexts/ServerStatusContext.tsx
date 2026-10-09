import React, { useCallback, useContext, useEffect, useState } from "react";

import { Account, getStatus, SetupState } from "../network/api";

type ServerStatusContextValue = {
  /** Undefined until the server has answered */
  setup?: SetupState;
  /** The account this browser is signed in as */
  account: Account | null;
  /** True when the server could not be reached */
  offline: boolean;
  /** Ask the server again, e.g. after signing in or out */
  refresh: () => Promise<void>;
};

const ServerStatusContext =
  React.createContext<ServerStatusContextValue | undefined>(undefined);

export function ServerStatusProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [setup, setSetup] = useState<SetupState>();
  const [account, setAccount] = useState<Account | null>(null);
  const [offline, setOffline] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const status = await getStatus();
      setSetup(status.setup);
      setAccount(status.account);
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = { setup, account, offline, refresh };
  return (
    <ServerStatusContext.Provider value={value}>
      {children}
    </ServerStatusContext.Provider>
  );
}

export function useServerStatus() {
  const context = useContext(ServerStatusContext);
  if (context === undefined) {
    throw new Error(
      "useServerStatus must be used within a ServerStatusProvider"
    );
  }
  return context;
}

export default ServerStatusContext;
