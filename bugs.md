  1. WebSocket Reconnection Issues

  Problem: When a WebSocket disconnects (network drop, DO hibernation), the client
  doesn't automatically reconnect.
  Impact: Users lose real-time updates until they refresh manually.

  2. Optimistic Updates vs Server State

  Problem: Client shows optimistic updates immediately, but if the WebSocket message
  fails or gets rejected, the UI doesn't roll back.
  Impact: User sees a voxel placed, but it disappears when they refresh.

  3. Lamport Clock Drift

  Problem: Each client sends their own timestamp, but if clocks are very different,
  conflict resolution can be weird.
  Impact: Rare race conditions where newer changes get overwritten by older ones with
  bad timestamps.

  4. Rate Limiting Edge Cases

  Problem: If you drag-paint rapidly and hit rate limits, some voxels in the middle of
  your stroke might get dropped.
  Impact: Incomplete drawing strokes.

  5. DO Cold Start State

  Problem: When a DO cold starts, there's a brief window where WebSocket connections
  work but state might not be fully loaded.
  Impact: Very rare, but possible temporary state inconsistency.

  6. Multi-Tab Conflicts

  Problem: Same user in multiple tabs can create conflicting operations with the same
  playerId.
  Impact: Confusing behavior where your own changes seem to conflict.

  The persistence fix you deployed addresses the biggest issue. The others are mostly
  edge cases that would require more complex solutions (reconnection logic, rollback
  handling, etc.).
