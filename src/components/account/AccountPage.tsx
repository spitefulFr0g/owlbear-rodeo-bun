import React from "react";
import { Flex, Image, Text } from "theme-ui";

import owlington from "../../images/Owlington.png";

type AccountPageProps = {
  title: string;
  children: React.ReactNode;
};

/** The frame shared by the setup, sign in, invite and reset forms */
function AccountPage({ title, children }: AccountPageProps) {
  return (
    <Flex
      sx={{
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100%",
      }}
      p={3}
    >
      <Flex sx={{ flexDirection: "column", width: "100%", maxWidth: "300px" }}>
        <Text variant="display" as="h1" sx={{ textAlign: "center" }}>
          Owlbear Rodeo
        </Text>
        <Image
          src={owlington}
          alt=""
          my={2}
          sx={{ width: "120px", alignSelf: "center" }}
        />
        <Text variant="heading" as="h2" my={2} sx={{ textAlign: "center" }}>
          {title}
        </Text>
        {children}
      </Flex>
    </Flex>
  );
}

export default AccountPage;
