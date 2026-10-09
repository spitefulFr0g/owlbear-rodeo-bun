import { useEffect, useState } from "react";
import { Flex, IconButton, Text } from "theme-ui";
import { useParams } from "react-router-dom";
import { useToasts } from "react-toast-notifications";

import RadioIconButton from "../RadioIconButton";

import DisplayPopoutIcon from "../../icons/DisplayPopoutIcon";
import DisplayLinkIcon from "../../icons/DisplayLinkIcon";
import DisplayFreezeIcon from "../../icons/DisplayFreezeIcon";

import { useUserId } from "../../contexts/UserIdContext";

import Session from "../../network/Session";

import { Map } from "../../types/Map";

type DisplayControlsProps = {
  map: Map | null;
  session: Session;
};

async function copyText(text: string) {
  // The clipboard api is missing on a page loaded over http from another machine
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const input = document.createElement("textarea");
  input.value = text;
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(input);
  if (!copied) {
    throw new Error("Unable to copy");
  }
}

/** The cast display controls, seen only by the player that cast displays follow */
function DisplayControls({ map, session }: DisplayControlsProps) {
  const { id: gameId }: { id: string } = useParams();
  const userId = useUserId();
  const { addToast } = useToasts();

  const isFollowed = !!map && !!userId && map.owner === userId;

  // The server only hands the token to the player being followed
  const [displayToken, setDisplayToken] = useState<string | null>(null);
  useEffect(() => {
    if (!isFollowed) {
      setDisplayToken(null);
      return;
    }
    let active = true;
    let retry: ReturnType<typeof setTimeout>;
    // Only one request at a time, counting the wait before a retry
    let requesting = false;
    function request() {
      if (requesting || !session.socket?.connected) {
        return;
      }
      requesting = true;
      session.socket.emit("get_display_token", (token: string | null) => {
        if (!active) {
          return;
        }
        setDisplayToken(token);
        // Our map may not have reached the server yet
        if (token) {
          requesting = false;
        } else {
          retry = setTimeout(() => {
            requesting = false;
            request();
          }, 1000);
        }
      });
    }
    // The token changes with the server, so ask again when we rejoin
    function handleStatus(status: string) {
      if (status === "joined") {
        request();
      } else {
        // An answer to a request made before the connection dropped never comes
        clearTimeout(retry);
        requesting = false;
      }
    }
    request();
    session.on("status", handleStatus);
    return () => {
      active = false;
      clearTimeout(retry);
      session.off("status", handleStatus);
    };
  }, [isFollowed, session]);

  const [frozen, setFrozen] = useState(false);
  useEffect(() => {
    function handleDisplayFrozen(frozen: boolean) {
      setFrozen(!!frozen);
    }

    session.socket?.on("display_frozen", handleDisplayFrozen);

    return () => {
      session.socket?.off("display_frozen", handleDisplayFrozen);
    };
  });

  if (!isFollowed) {
    return null;
  }

  const displayLink =
    displayToken &&
    `${window.location.origin}/display/${gameId}#${displayToken}`;

  function handlePopout() {
    if (!displayLink) {
      return;
    }
    const popout = window.open(
      displayLink,
      `display-${gameId}`,
      "popup,width=1280,height=720"
    );
    if (!popout) {
      addToast("Unable to open the display, allow popups for this page");
    }
  }

  async function handleCopy() {
    if (!displayLink) {
      return;
    }
    try {
      await copyText(displayLink);
      addToast("Display link copied");
    } catch {
      addToast("Unable to copy the display link");
    }
  }

  function handleFreeze() {
    session.socket?.emit("display_freeze", !frozen);
  }

  return (
    <Flex
      sx={{
        position: "absolute",
        // Sits beside the full screen button
        right: "44px",
        bottom: 0,
        alignItems: "center",
        backgroundColor: "overlay",
        borderRadius: "16px",
      }}
      m={2}
    >
      {frozen && (
        <Text
          variant="caption"
          sx={{ color: "primary", whiteSpace: "nowrap" }}
          ml={3}
          mr={1}
        >
          Display frozen
        </Text>
      )}
      <RadioIconButton
        title={frozen ? "Unfreeze Display" : "Freeze Display"}
        onClick={handleFreeze}
        isSelected={frozen}
        aria-pressed={frozen}
      >
        <DisplayFreezeIcon />
      </RadioIconButton>
      <IconButton
        aria-label="Copy Display Link"
        title="Copy Display Link"
        onClick={handleCopy}
        disabled={!displayLink}
      >
        <DisplayLinkIcon />
      </IconButton>
      <IconButton
        aria-label="Open Display"
        title="Open Display"
        onClick={handlePopout}
        disabled={!displayLink}
      >
        <DisplayPopoutIcon />
      </IconButton>
    </Flex>
  );
}

export default DisplayControls;
