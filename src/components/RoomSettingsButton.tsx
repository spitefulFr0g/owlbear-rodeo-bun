import { useState } from "react";
import { Button } from "theme-ui";
import { useRole } from "../contexts/RoomContext";
import { getRoleControls } from "../helpers/roomControls";
import Session from "../network/Session";
import RoomSettingsModal from "../modals/RoomSettingsModal";

export default function RoomSettingsButton({ session }: { session: Session }) {
  const [open, setOpen] = useState(false);
  if (!getRoleControls(useRole()).room) return null;
  return (
    <>
      <Button m={1} sx={{ fontSize: 1 }} onClick={() => setOpen(true)}>
        Room settings
      </Button>
      <RoomSettingsModal
        session={session}
        isOpen={open}
        onRequestClose={() => setOpen(false)}
      />
    </>
  );
}
