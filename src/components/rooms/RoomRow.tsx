import { Box, Button, Flex, IconButton, Text } from "theme-ui";
import prettyBytes from "pretty-bytes";
import { useHistory } from "react-router-dom";

import AddPartyMemberIcon from "../../icons/AddPartyMemberIcon";
import ChangeNicknameIcon from "../../icons/ChangeNicknameIcon";
import RemoveMapIcon from "../../icons/RemoveMapIcon";
import TokenLockIcon from "../../icons/TokenLockIcon";

import { Room } from "../../network/api";

type RoomRowProps = {
  room: Room;
  onInvite: (room: Room) => void;
  onRename: (room: Room) => void;
  onDelete: (room: Room) => void;
};

/** One of the account's rooms in its room list */
function RoomRow({ room, onInvite, onRename, onDelete }: RoomRowProps) {
  const history = useHistory();

  return (
    <Flex
      as="li"
      py={2}
      sx={{
        alignItems: "center",
        borderBottomStyle: "solid",
        borderBottomWidth: "1px",
        borderBottomColor: "border",
      }}
    >
      <Box sx={{ flexGrow: 1, minWidth: 0 }} mr={2}>
        <Flex sx={{ minWidth: 0, alignItems: "center" }}>
          <Text
            as="span"
            variant="heading"
            sx={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {room.name}
          </Text>
          {room.hasPassword && (
            <Box
              ml={1}
              title="Players need a password to join"
              aria-label="Players need a password to join"
              role="img"
              sx={{
                display: "flex",
                flexShrink: 0,
                opacity: 0.7,
                svg: { width: "16px", height: "16px" },
              }}
            >
              <TokenLockIcon />
            </Box>
          )}
        </Flex>
        <Text as="p" variant="caption" m={0}>
          {room.sizeBytes === undefined
            ? "Size unavailable"
            : prettyBytes(room.sizeBytes)}
        </Text>
      </Box>
      <IconButton
        title="Invite Players"
        aria-label={`Invite players to ${room.name}`}
        onClick={() => onInvite(room)}
        sx={{ flexShrink: 0 }}
      >
        <AddPartyMemberIcon />
      </IconButton>
      <IconButton
        title="Rename"
        aria-label={`Rename ${room.name}`}
        onClick={() => onRename(room)}
        sx={{ flexShrink: 0 }}
      >
        <ChangeNicknameIcon />
      </IconButton>
      <IconButton
        title="Delete"
        aria-label={`Delete ${room.name}`}
        onClick={() => onDelete(room)}
        sx={{ flexShrink: 0 }}
      >
        <RemoveMapIcon />
      </IconButton>
      <Button
        ml={2}
        py={1}
        sx={{ flexShrink: 0 }}
        aria-label={`Open ${room.name}`}
        onClick={() => history.push(`/game/${room.id}`)}
      >
        Open
      </Button>
    </Flex>
  );
}

export default RoomRow;
