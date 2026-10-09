import { Flex, Text } from "theme-ui";

import { Account } from "../../network/api";

type AccountRowProps = {
  account: Account;
  /** True for the account looking at the list */
  isSelf: boolean;
  /** Buttons that act on the account */
  children?: React.ReactNode;
};

/** One account in the administrator's list of accounts */
function AccountRow({ account, isSelf, children }: AccountRowProps) {
  return (
    <Flex
      as="li"
      py={2}
      sx={{
        alignItems: "center",
        minHeight: "48px",
        borderBottomStyle: "solid",
        borderBottomWidth: "1px",
        borderBottomColor: "border",
      }}
    >
      <Flex sx={{ flexGrow: 1, minWidth: 0, alignItems: "baseline" }} mr={2}>
        <Text
          as="span"
          variant="heading"
          sx={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {account.username}
        </Text>
        {isSelf && (
          <Text as="span" variant="caption" ml={1} sx={{ flexShrink: 0 }}>
            (you)
          </Text>
        )}
        {account.administrator && (
          <Text
            as="span"
            variant="caption"
            ml={2}
            px={1}
            sx={{
              flexShrink: 0,
              borderRadius: "4px",
              borderStyle: "solid",
              borderWidth: "1px",
              borderColor: "primary",
            }}
          >
            Administrator
          </Text>
        )}
      </Flex>
      {children}
    </Flex>
  );
}

export default AccountRow;
