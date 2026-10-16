/** Store company pairs once regardless of which side sent the invitation. */
export function orderedTenantPair(left: string, right: string): [string, string] {
  if (!left || !right || left === right) {
    throw new Error("異なる2社を指定してください");
  }
  return left < right ? [left, right] : [right, left];
}
