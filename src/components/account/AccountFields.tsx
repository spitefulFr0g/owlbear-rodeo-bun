import { ChangeEvent } from "react";
import { Box, Input, Label, Text } from "theme-ui";

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 32;
export const PASSWORD_MIN_LENGTH = 8;

type FieldProps = {
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
};

type UsernameFieldProps = FieldProps & {
  /** Show the rule for picking a username, for forms that create one */
  showRule?: boolean;
};

export function UsernameField({
  value,
  onChange,
  autoFocus,
  showRule,
}: UsernameFieldProps) {
  return (
    <Box my={2}>
      <Label htmlFor="username">Username</Label>
      <Input
        id="username"
        name="username"
        value={value}
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          onChange(event.target.value)
        }
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={USERNAME_MAX_LENGTH}
        autoFocus={autoFocus}
      />
      {showRule && (
        <Text as="p" variant="caption" mt={1}>
          {USERNAME_MIN_LENGTH} to {USERNAME_MAX_LENGTH} characters: letters,
          numbers, dots, dashes and underscores.
        </Text>
      )}
    </Box>
  );
}

type PasswordFieldProps = FieldProps & {
  label?: string;
  id?: string;
  /** True when the form sets a password, false when it asks for one */
  isNew?: boolean;
};

export function PasswordField({
  value,
  onChange,
  autoFocus,
  label,
  id,
  isNew,
}: PasswordFieldProps) {
  return (
    <Box my={2}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        type="password"
        value={value}
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          onChange(event.target.value)
        }
        autoComplete={isNew ? "new-password" : "current-password"}
        autoFocus={autoFocus}
      />
      {isNew && (
        <Text as="p" variant="caption" mt={1}>
          At least {PASSWORD_MIN_LENGTH} characters.
        </Text>
      )}
    </Box>
  );
}

PasswordField.defaultProps = {
  label: "Password",
  id: "password",
};
