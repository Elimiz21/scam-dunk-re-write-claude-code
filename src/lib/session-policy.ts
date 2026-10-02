export const WEB_IDLE_SESSION_SECONDS = 7 * 24 * 60 * 60;
export const WEB_ABSOLUTE_SESSION_SECONDS = 30 * 24 * 60 * 60;

export function isWebSessionExpired(input: {
  createdAt: number;
  lastActivityAt: number;
  now?: number;
}): boolean {
  const now = input.now ?? Date.now();
  return (
    now - input.lastActivityAt >= WEB_IDLE_SESSION_SECONDS * 1000 ||
    now - input.createdAt >= WEB_ABSOLUTE_SESSION_SECONDS * 1000
  );
}
