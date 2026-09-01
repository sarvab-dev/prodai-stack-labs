export type ActionRequest<T> = { idempotencyKey: string; actorId: string; approved: boolean; payload: T };
export type ActionResult<T> = { duplicate: boolean; value: T };

export class IdempotentAction<TInput, TOutput> {
  private readonly completed = new Map<string, Promise<TOutput>>();
  constructor(private readonly authorize: (actorId: string, input: TInput) => boolean, private readonly execute: (input: TInput) => Promise<TOutput>) {}
  async run(request: ActionRequest<TInput>): Promise<ActionResult<TOutput>> {
    if (!request.approved) throw new Error("Human approval is required.");
    if (!this.authorize(request.actorId, request.payload)) throw new Error("Actor is not authorized.");
    const existing = this.completed.get(request.idempotencyKey);
    if (existing) return { duplicate: true, value: await existing };
    const operation = this.execute(request.payload);
    this.completed.set(request.idempotencyKey, operation);
    try { return { duplicate: false, value: await operation }; }
    catch (error) { this.completed.delete(request.idempotencyKey); throw error; }
  }
}
