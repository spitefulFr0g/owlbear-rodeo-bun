import { Flex, Text, Box } from "theme-ui";

import Footer from "../components/Footer";
import Markdown from "../components/Markdown";

import assets from "../docs/assets";

import database from "../docs/faq/database.md?raw";
import maps from "../docs/faq/maps.md?raw";
import general from "../docs/faq/general.md?raw";
import connection from "../docs/faq/connection.md?raw";

function FAQ() {
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
          maxWidth: "500px",
          flexGrow: 1,
        }}
        m={4}
      >
        <Text mb={2} variant="heading" as="h1" sx={{ fontSize: 5 }}>
          Frequently Asked Questions
        </Text>
        <Box my={1} id="general">
          <Markdown source={general} assets={assets} />
        </Box>
        <Box my={1} id="maps">
          <Markdown source={maps} assets={assets} />
        </Box>
        <Box my={1} id="database">
          <Markdown source={database} assets={assets} />
        </Box>
        <Box my={1} id="connection">
          <Markdown source={connection} assets={assets} />
        </Box>
      </Flex>
      <Footer />
    </Flex>
  );
}

export default FAQ;
