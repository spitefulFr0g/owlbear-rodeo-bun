import { Box, Flex, IconButton, Input, Label, Text } from "theme-ui";
import { useToasts } from "react-toast-notifications";

import CopyIcon from "../../icons/CopyIcon";

import { copyText } from "../../helpers/clipboard";

type OneUseLinkBoxProps = {
  /** What the link is for, e.g. "Invite link" */
  label: string;
  link: string;
  /** When the link stops working, in milliseconds since the epoch */
  expiresAt: number;
  /** Who to hand it to, e.g. "the person you are inviting" */
  recipient: string;
};

function formatDay(time: number) {
  return new Date(time).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
  });
}

/** A freshly made invite or reset link, ready to be copied and handed over */
function OneUseLinkBox({
  label,
  link,
  expiresAt,
  recipient,
}: OneUseLinkBoxProps) {
  const { addToast } = useToasts();

  async function handleCopy() {
    try {
      await copyText(link);
      addToast("Link copied.");
    } catch {
      addToast("Unable to copy. Select the link and copy it yourself.");
    }
  }

  return (
    <Box my={2} p={2} bg="muted" sx={{ borderRadius: "4px" }}>
      <Label htmlFor="oneUseLink">{label}</Label>
      <Flex sx={{ alignItems: "center" }}>
        <Input
          id="oneUseLink"
          value={link}
          readOnly
          onFocus={(event: React.FocusEvent<HTMLInputElement>) =>
            event.target.select()
          }
        />
        <IconButton
          ml={1}
          title="Copy"
          aria-label={`Copy ${label}`}
          onClick={handleCopy}
          sx={{ flexShrink: 0 }}
        >
          <CopyIcon />
        </IconButton>
      </Flex>
      <Text as="p" variant="caption" mt={1}>
        Send it to {recipient}. It works once, until {formatDay(expiresAt)}, and
        is not shown again.
      </Text>
    </Box>
  );
}

export default OneUseLinkBox;
