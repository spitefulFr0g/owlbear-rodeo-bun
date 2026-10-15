import { useEffect, useState } from "react";
import { Button, Flex, Input, Label, Text } from "theme-ui";

import { bytesToMegabytes, megabytesToBytes } from "../helpers/quotaInput";

type QuotaFieldProps = {
  id: string;
  label: string;
  /** The quota the server holds now, in bytes */
  bytes: number;
  /** The most the server will take, in bytes, as a hint to the input */
  maxBytes?: number;
  disabled?: boolean;
  /** Saves the quota, rejecting with the server's plain reason */
  onSave: (bytes: number) => Promise<void>;
};

/** A quota typed in megabytes, saved on its own */
function QuotaField({
  id,
  label,
  bytes,
  maxBytes,
  disabled,
  onSave,
}: QuotaFieldProps) {
  const [text, setText] = useState(bytesToMegabytes(bytes));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Show the server's value again whenever it changes
  useEffect(() => {
    setText(bytesToMegabytes(bytes));
  }, [bytes]);

  const typed = megabytesToBytes(text);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (typed === undefined) return;
    setSaving(true);
    setError("");
    try {
      await onSave(typed);
    } catch (error) {
      setError(
        error instanceof Error && error.message
          ? error.message
          : "The quota could not be saved. Please try again."
      );
    }
    setSaving(false);
  }

  return (
    <Flex as="form" sx={{ flexDirection: "column" }} onSubmit={handleSubmit}>
      <Label htmlFor={id} variant="body2" sx={{ fontSize: 1 }}>
        {label}
      </Label>
      <Flex sx={{ alignItems: "center", gap: 2 }}>
        <Input
          id={id}
          inputMode="decimal"
          value={text}
          disabled={disabled || saving}
          onChange={(event) => setText(event.target.value)}
          aria-invalid={typed === undefined}
          aria-describedby={maxBytes === undefined ? undefined : `${id}-max`}
          sx={{ width: "120px" }}
        />
        <Text as="span" variant="body2">
          MB
        </Text>
        <Button
          type="submit"
          variant="secondary"
          py={1}
          disabled={
            disabled || saving || typed === undefined || typed === bytes
          }
        >
          Save
        </Button>
      </Flex>
      {maxBytes !== undefined && (
        <Text id={`${id}-max`} as="p" variant="caption" m={0}>
          At most {bytesToMegabytes(maxBytes)} MB.
        </Text>
      )}
      {typed === undefined && (
        <Text as="p" variant="caption" m={0} sx={{ color: "error" }}>
          Type a number of megabytes, 0 or more.
        </Text>
      )}
      {error && (
        <Text as="p" variant="body2" my={1} role="alert" sx={{ color: "error" }}>
          {error}
        </Text>
      )}
    </Flex>
  );
}

export default QuotaField;
