// Stub — the assessment states auth/session infrastructure is already in place.
// Replace with your actual session provider (NextAuth, Clerk, etc.)
export async function getSession(): Promise<{ userId: string } | null> {
  throw new Error('getSession() must be implemented with your auth provider')
}
