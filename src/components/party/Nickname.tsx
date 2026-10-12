import colors from "../../helpers/colors";
import { PlayerColour } from "../../helpers/playerColour";
import { Text, Flex } from "theme-ui";

import DiceRolls from "./DiceRolls";
import { DiceRoll } from "../../types/Dice";
import { Role } from "../../types/Room";

type NicknameProps = {
  nickname: string;
  diceRolls?: DiceRoll[];
  role?: Role;
  color?: PlayerColour;
  sceneMark?: string;
};

function Nickname({ nickname, diceRolls, role, color, sceneMark }: NicknameProps) {
  return (
    <Flex sx={{ flexDirection: "column" }}>
      <Text
        as="p"
        my={1}
        variant="body2"
        sx={{
          position: "relative",
          overflowWrap: "anywhere",
        }}
      >
        {color && <Text as="span" role="img" aria-label={`${color} colour`} sx={{ color: colors[color], mr: 1 }}>●</Text>}
        {nickname}
        <Text
          as="span"
          variant="caption"
          sx={{ display: "block", color: role === "gm" ? "primary" : "text" }}
        >
          {role === "gm" ? "GM" : role === "trusted" ? "Trusted player" : "Player"}
        </Text>
        {sceneMark && (
          <Text as="span" variant="caption" sx={{ display: "block", overflowWrap: "anywhere" }}>
            <span aria-hidden="true">↗ </span>{sceneMark}
          </Text>
        )}
      </Text>
      {diceRolls && <DiceRolls rolls={diceRolls} />}
    </Flex>
  );
}

export default Nickname;
