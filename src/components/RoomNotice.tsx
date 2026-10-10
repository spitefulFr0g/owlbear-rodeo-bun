import React from "react";
import { Flex, Text } from "theme-ui";

import Link from "./Link";

type RoomNoticeProps = {
  title: string;
  /** What happened and what to do about it */
  children: React.ReactNode;
};

/** Fills the page in place of a room that can't be shown, with a way home */
function RoomNotice({ title, children }: RoomNoticeProps) {
  return (
    <Flex
      sx={{
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        height: "100%",
        textAlign: "center",
      }}
      p={4}
    >
      <Text variant="heading" as="h1" sx={{ fontSize: 5 }}>
        {title}
      </Text>
      <Text as="p" variant="body2" my={2} sx={{ maxWidth: "420px" }}>
        {children}
      </Text>
      <Text as="p" variant="body2" mt={2}>
        <Link to="/">Back to the home page</Link>
      </Text>
    </Flex>
  );
}

export default RoomNotice;
