// Two missed 15-second board resyncs require a fresh snapshot before a command.
export const GAMING_BOARD_MAX_AGE_MS = 30_000
export function gamingBoardStale(serverTime: string | undefined, now: number) {
  return !serverTime || !Number.isFinite(Date.parse(serverTime)) || now - Date.parse(serverTime) > GAMING_BOARD_MAX_AGE_MS
}
