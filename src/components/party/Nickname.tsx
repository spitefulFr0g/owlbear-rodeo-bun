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
        <Text
          as="span"
          variant="caption"
          sx={{ display: "block", color: role === "gm" ? "primary" : "text" }}
        >
          {role === "gm" ? "GM" : role === "trusted" ? "Trusted player" : "Player"}
        </Text>
      </Text>
      {diceRolls && <DiceRolls rolls={diceRolls} />}
    </Flex>
  );
}

export default Nickname;
