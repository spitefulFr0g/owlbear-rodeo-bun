import { Flex, Text } from "theme-ui";

import SignedInPage from "../components/account/SignedInPage";
import AccountList from "../components/admin/AccountList";
import Link from "../components/Link";

import { useServerStatus } from "../contexts/ServerStatusContext";

import SignIn from "./SignIn";

/** Where an administrator looks after the server's accounts */
function Admin() {
  const { account } = useServerStatus();

  if (!account) {
    return <SignIn />;
  }

  return (
    <SignedInPage>
      <Flex
        mb={3}
        sx={{
          width: "100%",
          alignItems: "baseline",
          justifyContent: "space-between",
        }}
      >
        <Text as="h2" variant="heading" sx={{ fontSize: 3 }}>
          Administration
        </Text>
        <Link to="/" variant="footer">
          Back to your rooms
        </Link>
      </Flex>
      {account.administrator ? (
        <AccountList self={account} />
      ) : (
        <Text as="p" variant="body2" my={4} sx={{ textAlign: "center" }}>
          Only an administrator of this server can open this page.
        </Text>
      )}
    </SignedInPage>
  );
}

export default Admin;
