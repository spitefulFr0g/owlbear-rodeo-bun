import { useState } from "react";
import { Button } from "theme-ui";
import { useToasts } from "react-toast-notifications";
import { useRole, useRoom } from "../contexts/RoomContext";
import Session from "../network/Session";

export default function SessionButton({ session }: { session: Session }) {
  const role = useRole();
  const room = useRoom();
  const [pending, setPending] = useState(false);
  const { addToast } = useToasts();
  if (role !== "gm") return null;
  return (
    <Button m={1} sx={{ fontSize: 1 }} disabled={pending} onClick={() => {
      setPending(true);
      session.socket?.timeout(5000).emit("session", !room.session,
        (error: Error | null, result?: { ok: boolean; error?: string }) => {
          setPending(false);
          if (error || !result?.ok) {
            addToast(error ? "The server did not answer. Try again." : "The session could not be changed.", { appearance: "error" });
          }
        });
    }}>
      {room.session ? "End session" : "Start session"}
    </Button>
  );
}
