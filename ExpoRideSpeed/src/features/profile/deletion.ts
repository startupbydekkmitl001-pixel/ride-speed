export type DeletionReceipt = { requestId: string; state: "requested" | "deleted" };
export function parseDeletionReceipt(raw: string | null): DeletionReceipt | null {
  try {
    const value = raw ? JSON.parse(raw) : null;
    return value && typeof value.requestId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.requestId) && ["requested", "deleted"].includes(value.state) ? { requestId: value.requestId, state: value.state } : null;
  } catch { return null; }
}
export async function requestAccountDeletion(requestId: string, invoke: (body: { confirmation: "DELETE"; requestId: string }) => Promise<unknown>, ensure: () => void) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) throw new Error("DELETION_INVALID_REQUEST");
  ensure();
  const value = await invoke({ confirmation: "DELETE", requestId });
  ensure();
  if (!value || typeof value !== "object" || !("state" in value) || value.state !== "deleted" || !("requestId" in value) || value.requestId !== requestId) throw new Error("DELETION_INVALID_RESPONSE");
}

export async function finishAccountDeletion(
  receipt: DeletionReceipt,
  invoke: (body: { confirmation: "DELETE"; requestId: string }) => Promise<unknown>,
  ensure: () => void,
  persist: (receipt: DeletionReceipt) => Promise<void>,
  cleanup: () => Promise<void>,
) {
  if (!parseDeletionReceipt(JSON.stringify(receipt))) throw new Error("DELETION_INVALID_REQUEST");
  ensure();
  await persist(receipt); // Durable identity must precede any remote request.
  ensure();
  if (receipt.state !== "deleted") {
    await requestAccountDeletion(receipt.requestId, invoke, ensure);
    receipt = { ...receipt, state: "deleted" };
    await persist(receipt); // A failed cleanup retries locally, without another deletion.
    ensure();
  }
  await cleanup();
  ensure();
}
