import { Text } from "theme-ui";

import Link from "../Link";

type LinkProblemProps = {
  /** What went wrong and what to do about it */
  children: React.ReactNode;
};

/** Shown in place of a form when its invite or reset link can't be used */
function LinkProblem({ children }: LinkProblemProps) {
  return (
    <>
      <Text as="p" variant="body2" my={2} sx={{ textAlign: "center" }}>
        {children}
      </Text>
      <Text as="p" variant="body2" my={2} sx={{ textAlign: "center" }}>
        <Link to="/">Go to sign in</Link>
      </Text>
    </>
  );
}

export default LinkProblem;
