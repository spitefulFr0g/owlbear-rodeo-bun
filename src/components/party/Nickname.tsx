import { Text, Flex } from "theme-ui";

import DiceRolls from "./DiceRolls";
import { DiceRoll } from "../../types/Dice";
import { Role } from "../../types/Room";

type NicknameProps = {
  nickname: string;
  diceRolls?: DiceRoll[];
  role?: Role;
};

function Nickname({ nickname, diceRolls, role }: NicknameProps) {
  return (
    <Flex sx={{ flexDirection: "column" }}>
      <Text
        as="p"
        my={1}
        variant="body2"
        sx={{
          position: "relative",
        }}
      >
        {nickname}
        {role === "gm" && (
          <Text
            as="span"
            variant="caption"
            ml={1}
            title="The GM, who runs this room"
            sx={{ color: "primary", fontWeight: "bold" }}
          >
            GM
          </Text>
        )}
      </Text>
      {diceRolls && <DiceRolls rolls={diceRolls} />}
    </Flex>
  );
}

export default Nickname;
