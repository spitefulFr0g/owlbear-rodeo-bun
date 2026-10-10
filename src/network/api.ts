/** An account on the server */
export type Account = {
  id: string;
  username: string;
  administrator: boolean;
};

/** A room as its GM sees it in their room list */
export type Room = {
  id: string;
  name: string;
  hasPassword: boolean;
  /** How much the room keeps on the server, missing on servers that don't count it */
  sizeBytes?: number;
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

export async function listRooms() {
  const { rooms } = await request<{ rooms: Room[] }>("GET", "/rooms");
  return rooms;
}

export async function createRoom(name: string, password: string) {
  const { room } = await request<{ room: Room }>("POST", "/rooms", {
    name,
    password,
  });
  return room;
}

export async function renameRoom(id: string, name: string) {
  const { room } = await request<{ room: Room }>("PATCH", `/rooms/${id}`, {
    name,
  });
  return room;
}

export function deleteRoom(id: string) {
  return request<void>("DELETE", `/rooms/${encodeURIComponent(id)}`);
}

/** A link that works once, for an invite or a password reset */
export type OneUseLink = {
  token: string;
  /** When it stops working, in milliseconds since the epoch */
  expiresAt: number;
};

export async function listAccounts() {
  const { accounts } = await request<{ accounts: Account[] }>(
    "GET",
    "/admin/accounts"
  );
  return accounts;
}

export function createInvite() {
  return request<OneUseLink>("POST", "/admin/invites");
}

/** Throws `link_invalid` when the invite can't be used */
export function checkInvite(token: string) {
  return request<{}>("GET", `/invites/${encodeURIComponent(token)}`);
}

export function acceptInvite(
  token: string,
  username: string,
  password: string
) {
  return request<{ account: Account }>(
    "POST",
    `/invites/${encodeURIComponent(token)}`,
    { username, password }
  );
}

export function createResetLink(accountId: string) {
  return request<OneUseLink>(
    "POST",
    `/admin/accounts/${encodeURIComponent(accountId)}/reset-link`
  );
}

/** Answers whose password the link resets, throws `link_invalid` otherwise */
export function checkReset(token: string) {
  return request<{ username: string }>(
    "GET",
    `/resets/${encodeURIComponent(token)}`
  );
}

export function acceptReset(token: string, password: string) {
  return request<{ account: Account }>(
    "POST",
    `/resets/${encodeURIComponent(token)}`,
    { password }
  );
}

export function changePassword(currentPassword: string, newPassword: string) {
  return request<void>("POST", "/account/password", {
    currentPassword,
    newPassword,
  });
}
