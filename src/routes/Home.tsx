import { useState, useEffect } from "react";
import { Flex, Button, Text } from "theme-ui";

import SignedInPage from "../components/account/SignedInPage";
import Link from "../components/Link";
import RoomList from "../components/rooms/RoomList";

import GettingStartedModal from "../modals/GettingStartedModal";

import HelpIcon from "../icons/HelpIcon";

import { useAuth } from "../contexts/AuthContext";
import { useServerStatus } from "../contexts/ServerStatusContext";

import { signOut } from "../network/api";

import SignIn from "./SignIn";
import Setup from "./Setup";

function Home() {
  const [isGettingStartedModalOpen, setIsGettingStartedModalOpen] =
    useState(false);

  // Reset password on visiting home
  const { setPassword } = useAuth();
  useEffect(() => {
    setPassword("");
  }, [setPassword]);

  const { account, setup, refresh } = useServerStatus();

  // While the host has setup reopened a visitor is offered it first
  const [prefersSignIn, setPrefersSignIn] = useState(false);

  async function handleSignOut() {
    try {
      await signOut();
    } finally {
      await refresh();
    }
  }

  if (!account) {
    if (setup === "open" && !prefersSignIn) {
      return <Setup reopened onSignInInstead={() => setPrefersSignIn(true)} />;
    }
    return <SignIn />;
  }

  return (
    <SignedInPage>
      <RoomList />
      <Flex
        mt={4}
        sx={{
          width: "100%",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text as="span" variant="body2">
          Signed in as <strong>{account.username}</strong>
        </Text>
        {account.administrator && (
          <Link to="/admin" variant="footer">
            Administration
          </Link>
        )}
        <Button variant="secondary" onClick={handleSignOut}>
          Sign out
        </Button>
      </Flex>
      <Button
        variant="secondary"
        mt={3}
        onClick={() => setIsGettingStartedModalOpen(true)}
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        Getting Started <HelpIcon />
      </Button>
      <Text variant="caption" as="p" sx={{ textAlign: "center" }}>
        Legacy v{process.env.REACT_APP_VERSION}
      </Text>
      <GettingStartedModal
        isOpen={isGettingStartedModalOpen}
        onRequestClose={() => setIsGettingStartedModalOpen(false)}
      />
    </SignedInPage>
  );
}

export default Home;
