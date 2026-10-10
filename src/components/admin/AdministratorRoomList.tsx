import { useEffect, useState } from "react";
import { Box, Button, Flex, Text } from "theme-ui";
import prettyBytes from "pretty-bytes";

import {
  AdministratorRoom,
  ApiError,
  deleteRoom,
  listAdministratorRooms,
} from "../../network/api";
import DeleteRoomModal from "../../modals/DeleteRoomModal";
import FormError from "../account/FormError";
import LoadingOverlay from "../LoadingOverlay";

function AdministratorRoomList({ revision }: { revision: number }) {
  const [data, setData] = useState<{
    rooms: AdministratorRoom[];
    totalBytes: number;
  }>();
  const [error, setError] = useState<ApiError>();
  const [deleting, setDeleting] = useState<AdministratorRoom>();

  async function load() {
    setError(undefined);
    try {
      setData(await listAdministratorRooms());
    } catch (error) {
      setError(
        error instanceof ApiError
          ? error
          : new ApiError("unknown", "Unable to load the rooms.", 0)
      );
    }
  }

  useEffect(() => {
    load();
  }, [revision]);

  async function handleDelete() {
    if (!deleting) return;
    await deleteRoom(deleting.id);
    setDeleting(undefined);
    await load();
  }

  return (
    <Box mt={4} sx={{ width: "100%" }}>
      <Flex sx={{ alignItems: "center", justifyContent: "space-between" }}>
        <Text as="h3" variant="heading" sx={{ fontSize: 2 }}>
          Every room
        </Text>
        <Button variant="secondary" py={1} onClick={load}>
          Refresh rooms
        </Button>
      </Flex>
      {data && (
        <Text as="p" variant="body2">
          Server total: {prettyBytes(data.totalBytes)}
        </Text>
      )}
      <Text as="p" variant="caption">
        The total includes the database and all server images. Shared images
        count once in the total and in each room that uses them.
      </Text>
      <FormError error={error} />
      {!data && !error && (
        <Box sx={{ position: "relative", height: "96px" }}>
          <LoadingOverlay bg="transparent" />
        </Box>
      )}
      {data &&
        (data.rooms.length ? (
          <Box as="ul" p={0} sx={{ listStyle: "none" }}>
            {data.rooms.map((room) => (
              <Flex
                as="li"
                key={room.id}
                py={2}
                sx={{
                  alignItems: "center",
                  borderBottom: "1px solid",
                  borderColor: "border",
                }}
              >
                <Box mr={2} sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Text
                    as="p"
                    variant="heading"
                    m={0}
                    sx={{ overflowWrap: "anywhere" }}
                  >
                    {room.name}
                  </Text>
                  <Text
                    as="p"
                    variant="caption"
                    m={0}
                    sx={{ overflowWrap: "anywhere" }}
                  >
                    GM: {room.gm.username} ·{" "}
                    {room.sizeBytes === undefined
                      ? "Size unavailable"
                      : prettyBytes(room.sizeBytes)}
                  </Text>
                </Box>
                <Button
                  variant="secondary"
                  py={1}
                  aria-label={`Delete ${room.name}`}
                  onClick={() => setDeleting(room)}
                >
                  Delete
                </Button>
              </Flex>
            ))}
          </Box>
        ) : (
          <Text as="p" variant="body2">
            There are no rooms on this server.
          </Text>
        ))}
      <DeleteRoomModal
        room={deleting}
        onRequestClose={() => setDeleting(undefined)}
        onConfirm={handleDelete}
      />
    </Box>
  );
}

export default AdministratorRoomList;
