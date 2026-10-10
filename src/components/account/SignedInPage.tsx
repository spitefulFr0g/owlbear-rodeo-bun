import React from "react";
import { Flex, Image, Text } from "theme-ui";

import Footer from "../Footer";

import owlington from "../../images/Owlington.png";

/** The frame shared by the pages of a signed in account */
function SignedInPage({ children }: { children: React.ReactNode }) {
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
        {children}
      </Flex>
      <Footer />
    </Flex>
  );
}

export default SignedInPage;
