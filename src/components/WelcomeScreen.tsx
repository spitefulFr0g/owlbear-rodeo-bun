import { Flex, Text, Box } from "theme-ui";
import { useRoom } from "../contexts/RoomContext";
import { useParty } from "../contexts/PartyContext";

export default function WelcomeScreen() {
  const room = useRoom();
  const party = useParty();
  // The GM is here but is who everyone else is waiting for
  const people = Object.entries(party).filter(([, person]) => person.nickname && person.role !== "gm");
  return (
    <Flex p={4} sx={{ flexGrow: 1, flexBasis: 0, height: "100%", flexDirection: "column", minWidth: 0, overflowY: "auto", textAlign: "center" }}>
      <Box my="auto" sx={{ width: "100%", overflowWrap: "anywhere" }}>
        <Text as="h1" variant="heading" sx={{ fontSize: 5 }}>{room.name || "Room"}</Text>
        <Text as="p" variant="body2" mt={2}>Waiting for the GM</Text>
        {people.length > 0 && (
          <Box mt={4}>
            <Text as="h2" variant="heading">Who is waiting</Text>
            <Box as="ul" sx={{ listStyle: "none", padding: 0 }}>
              {people.map(([id, person]) => <Text as="li" key={id} my={2}>{person.nickname}</Text>)}
            </Box>
          </Box>
        )}
      </Box>
    </Flex>
  );
}
