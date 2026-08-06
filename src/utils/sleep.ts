/** Tiny sleep helper used by FCM retry / queue backoff. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default sleep;
