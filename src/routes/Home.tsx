import { useState, useEffect } from "react";
import { Flex, Button, Text } from "theme-ui";
import { useHistory } from "react-router-dom";
import { useToasts } from "react-toast-notifications";

import SignedInPage from "../components/account/SignedInPage";
import RoomList from "../components/rooms/RoomList";

import GettingStartedModal from "../modals/GettingStartedModal";
import ChangePasswordModal from "../modals/ChangePasswordModal";

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

  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] =
    useState(false);
  const { addToast } = useToasts();
  function handlePasswordChanged() {
    setIsChangePasswordModalOpen(false);
    addToast("Password changed. Your other browsers have been signed out.");
  }

  const history = useHistory();

  if (!account) {
    if (setup === "open" && !prefersSignIn) {
      return <Setup reopened onSignInInstead={() => setPrefersSignIn(true)} />;
    }
    return <SignIn />;
  }

  return (
    <SignedInPage>
      <RoomList />
      <Text as="p" variant="body2" mt={4}>
        Signed in as <strong>{account.username}</strong>
      </Text>
      <Flex sx={{ flexWrap: "wrap", justifyContent: "center" }}>
        {account.administrator && (
          <Button variant="secondary" onClick={() => history.push("/admin")}>
            Administration
          </Button>
        )}
        <Button
          variant="secondary"
          onClick={() => setIsChangePasswordModalOpen(true)}
        >
          Change password
        </Button>
        <Button variant="secondary" onClick={handleSignOut}>
          Sign out
        </Button>
      </Flex>
      <Button
        variant="secondary"
        mt={2}
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
      <ChangePasswordModal
        isOpen={isChangePasswordModalOpen}
        onRequestClose={() => setIsChangePasswordModalOpen(false)}
        onChanged={handlePasswordChanged}
      />
      <GettingStartedModal
        isOpen={isGettingStartedModalOpen}
        onRequestClose={() => setIsGettingStartedModalOpen(false)}
      />
    </SignedInPage>
  );
}

export default Home;
