import { Text } from "theme-ui";

import { ApiError } from "../../network/api";

/** How long is left of a wait, in words */
export function formatWait(seconds: number) {
  if (seconds < 60) {
    const rounded = Math.max(1, Math.ceil(seconds));
    return `${rounded} second${rounded === 1 ? "" : "s"}`;
  }
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

/** The server's reason for refusing a form, shown above its button */
function FormError({ error }: { error?: ApiError }) {
  if (!error) {
    return null;
  }
  return (
    <Text as="p" variant="body2" my={2} role="alert" sx={{ color: "error" }}>
      {error.retryAfterSeconds === undefined
        ? error.message
        : `Too many wrong passwords. Try again in ${formatWait(
            error.retryAfterSeconds
          )}.`}
    </Text>
  );
}

export default FormError;
