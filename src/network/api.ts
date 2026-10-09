/** An account on the server */
export type Account = {
  id: string;
  username: string;
  administrator: boolean;
};

/**
 * Where the server stands:
 * `required` no administrator exists yet, nothing else can be used
 * `open` an administrator exists and one more can be created
 * `closed` setup is done
 */
export type SetupState = "required" | "open" | "closed";

export type ServerStatus = {
  setup: SetupState;
  account: Account | null;
};

/** A request the server refused, with the reason it gave */
export class ApiError extends Error {
  code: string;
  status: number;
  retryAfterSeconds?: number;

  constructor(
    code: string,
    message: string,
    status: number,
    retryAfterSeconds?: number
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

// The server hosts the frontend, so talk to the same origin unless a
// separate broker is configured (e.g. the CRA dev server)
const serverUrl = process.env.REACT_APP_BROKER_URL || window.location.origin;

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${serverUrl}/api${path}`, {
      method,
      credentials: "include",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("offline", "Unable to reach the server.", 0);
  }
  let answer: any = undefined;
  try {
    answer = await response.json();
  } catch {
    // Not every answer has a body
  }
  if (!response.ok) {
    throw new ApiError(
      answer?.error || "unknown",
      answer?.message || "Something went wrong. Try again.",
      response.status,
      answer?.retryAfterSeconds
    );
  }
  return answer as T;
}

export function getStatus() {
  return request<ServerStatus>("GET", "/status");
}

export function setup(username: string, password: string) {
  return request<{ account: Account }>("POST", "/setup", {
    username,
    password,
  });
}

export function signIn(username: string, password: string) {
  return request<{ account: Account }>("POST", "/sign-in", {
    username,
    password,
  });
}

export function signOut() {
  return request<void>("POST", "/sign-out");
}
