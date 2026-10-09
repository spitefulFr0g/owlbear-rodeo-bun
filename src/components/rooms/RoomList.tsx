import { useCallback, useEffect, useState } from "react";
import { Box, Button, Flex, Text } from "theme-ui";
import { useToasts } from "react-toast-notifications";

import RoomRow from "./RoomRow";
import FormError from "../account/FormError";
import LoadingOverlay from "../LoadingOverlay";

import RoomNameModal from "../../modals/RoomNameModal";

import { copyText } from "../../helpers/clipboard";

import {
  ApiError,
  Room,
  createRoom,
  listRooms,
  renameRoom,
} from "../../network/api";

function sortByName(rooms: Room[]) {
  return [...rooms].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );
}

/** The rooms the signed in account is the GM of */
function RoomList() {
  const { addToast } = useToasts();

  const [rooms, setRooms] = useState<Room[]>();
  const [error, setError] = useState<ApiError>();

  const load = useCallback(async () => {
    setError(undefined);
    try {
      setRooms(await listRooms());
    } catch (error) {
      setError(
        error instanceof ApiError
          ? error
          : new ApiError("unknown", "Unable to load your rooms.", 0)
      );
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [renamingRoom, setRenamingRoom] = useState<Room>();

  async function handleCreate(name: string, password: string) {
    const room = await createRoom(name, password);
    setRooms((rooms) => sortByName([...(rooms || []), room]));
    setIsCreateModalOpen(false);
  }

  async function handleRename(name: string) {
    if (!renamingRoom) {
      return;
    }
    const renamed = await renameRoom(renamingRoom.id, name);
    setRooms((rooms) =>
      sortByName(
        (rooms || []).map((room) => (room.id === renamed.id ? renamed : room))
      )
    );
    setRenamingRoom(undefined);
  }

  async function handleInvite(room: Room) {
    const link = `${window.location.origin}/game/${room.id}`;
    try {
      await copyText(link);
      addToast(`Link to ${room.name} copied. Send it to your players.`);
    } catch {
      addToast(`Unable to copy. The link is ${link}`);
    }
  }

  return (
    <Box sx={{ width: "100%" }}>
      <Flex sx={{ alignItems: "center", justifyContent: "space-between" }}>
        <Text as="h2" variant="heading" sx={{ fontSize: 3 }}>
          Your rooms
        </Text>
        <Button py={1} onClick={() => setIsCreateModalOpen(true)}>
          New room
        </Button>
      </Flex>
      {error && (
        <Flex sx={{ alignItems: "center", justifyContent: "space-between" }}>
          <FormError error={error} />
          <Button variant="secondary" onClick={load}>
            Try again
          </Button>
        </Flex>
      )}
      {!rooms && !error && (
        <Box sx={{ position: "relative", height: "96px" }}>
          <LoadingOverlay bg="transparent" />
        </Box>
      )}
      {rooms && rooms.length === 0 && (
        <Text as="p" variant="body2" my={4} sx={{ textAlign: "center" }}>
          No rooms yet. Make one, then invite your players with its link.
        </Text>
      )}
      {rooms && rooms.length > 0 && (
        <Box as="ul" mt={2} p={0} sx={{ listStyle: "none" }}>
          {rooms.map((room) => (
            <RoomRow
              key={room.id}
              room={room}
              onInvite={handleInvite}
              onRename={setRenamingRoom}
            />
          ))}
        </Box>
      )}
      <RoomNameModal
        isOpen={isCreateModalOpen}
        onRequestClose={() => setIsCreateModalOpen(false)}
        onSubmit={handleCreate}
        title="New room"
        submitText="Create"
        askPassword
      />
      <RoomNameModal
        isOpen={!!renamingRoom}
        onRequestClose={() => setRenamingRoom(undefined)}
        onSubmit={handleRename}
        title="Rename room"
        submitText="Rename"
        name={renamingRoom?.name}
      />
    </Box>
  );
}

export default RoomList;
