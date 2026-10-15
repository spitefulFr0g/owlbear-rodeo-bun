import { Text } from "theme-ui";
import prettyBytes from "pretty-bytes";

import { QuotaUsage, checkQuota } from "../sceneRules/library";

/**
 * What a library or player holds against its quota, uploads in progress
 * included, with a plain note when a lowered quota leaves it over
 */
function LibraryQuotaLine({
  label,
  usage,
}: {
  label: string;
  usage: QuotaUsage;
}) {
  const over = !checkQuota(usage, 0);
  return (
    <>
      <Text as="p" variant="caption" m={0}>
        {label}: {prettyBytes(usage.bytes + usage.reservedBytes)} used of{" "}
        {prettyBytes(usage.quota)}
      </Text>
      {over && (
        <Text as="p" variant="caption" m={0} sx={{ color: "error" }}>
          Over its quota. Nothing has been deleted, but new uploads and moves
          in are refused until it is back under.
        </Text>
      )}
    </>
  );
}

export default LibraryQuotaLine;
