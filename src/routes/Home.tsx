import { useState, useEffect } from "react";
import { Flex, Button, Image, Text } from "theme-ui";

import Footer from "../components/Footer";
import RoomList from "../components/rooms/RoomList";

import GettingStartedModal from "../modals/GettingStartedModal";

import HelpIcon from "../icons/HelpIcon";

import { useAuth } from "../contexts/AuthContext";
import { useServerStatus } from "../contexts/ServerStatusContext";

import { signOut } from "../network/api";

import SignIn from "./SignIn";

import owlington from "../images/Owlington.png";

function Home() {
  const [isGettingStartedModalOpen, setIsGettingStartedModalOpen] =
    useState(false);

  // Reset password on visiting home
  const { setPassword } = useAuth();
  useEffect(() => {
    setPassword("");
  }, [setPassword]);

  const { account, refresh } = useServerStatus();

  async function handleSignOut() {
    try {
      await signOut();
    } finally {
      await refresh();
    }
  }

  if (!account) {
    return <SignIn />;
  }

  return (
    <Flex
      sx={{
        flexDirection: "column",
        justifyContent: "space-between",
        minHeight: "100%",
        alignItems: "center",
      }}
    >
      <Flex
        sx={{
          flexDirection: "column",
          alignItems: "center",
          width: "100%",
          maxWidth: "480px",
          flexGrow: 1,
        }}
        p={3}
      >
        <Flex sx={{ alignItems: "center" }} mb={3}>
          <Image src={owlington} alt="" sx={{ width: "72px" }} mr={2} />
          <Text variant="display" as="h1" sx={{ fontSize: 5 }}>
            Owlbear Rodeo
          </Text>
        </Flex>
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
      </Flex>
      <Footer />
    </Flex>
  );
}

export default Home;
