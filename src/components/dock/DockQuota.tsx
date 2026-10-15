import prettyBytes from "pretty-bytes";
import { Box, Flex, Text } from "theme-ui";

import { QuotaBar, sectionColours } from "../../helpers/dock";

/**
 * The quota bars at the foot of the dock, each split into coloured parts by
 * whose uploads fill it
 */
function DockQuota({ bars }: { bars: QuotaBar[] }) {
  if (bars.length === 0) return null;
  return (
    <Box sx={{ px: 2, py: 1, borderTop: "1px solid", borderColor: "muted", flexShrink: 0 }}>
      {bars.map((bar) => {
        const full = bar.quota > 0 && bar.used >= bar.quota;
        const breakdown = bar.parts
          .filter((part) => part.bytes > 0)
          .map((part) => `${part.label}: ${prettyBytes(part.bytes)}`)
          .join("\n");
        return (
          <Box key={bar.label} py={1} title={breakdown || undefined}>
            <Flex sx={{ justifyContent: "space-between" }}>
              <Text variant="caption" sx={{ fontSize: 0 }}>
                {bar.label}
              </Text>
              <Text variant="caption" sx={{ fontSize: 0, color: full ? "highlight" : undefined }}>
                {prettyBytes(bar.used)} of {prettyBytes(bar.quota)}
              </Text>
            </Flex>
            <Flex
              role="meter"
              aria-label={`${bar.label} storage`}
              aria-valuemin={0}
              aria-valuemax={bar.quota}
              aria-valuenow={bar.used}
              sx={{ height: "4px", mt: "2px", bg: "muted", borderRadius: "2px", overflow: "hidden" }}
            >
              {bar.parts.map((part, index) => (
                <Box
                  key={index}
                  sx={{
                    width: `${bar.quota > 0 ? Math.min((part.bytes / bar.quota) * 100, 100) : 0}%`,
                    bg: sectionColours[part.section].accent,
                    // Players' parts alternate shade so neighbours stay apart
                    opacity: part.section === "players" && index % 2 === 0 ? 0.7 : 1,
                  }}
                />
              ))}
            </Flex>
          </Box>
        );
      })}
    </Box>
  );
}

export default DockQuota;
