import { encodeNativePayload, invoke } from "../codex-ui-control.js";
import {
  freshObservation,
  sameTarget,
  type DesktopProvider,
  type ProviderObservation,
  type ProviderReply,
  type ProviderRequest,
} from "./types.js";

export class ClaudeProvider implements DesktopProvider {
  readonly id = "claude" as const;
  constructor(private readonly call = invoke) {}
  async read(): Promise<ProviderObservation> {
    const reply = await this.call("provider-read", undefined, 8000);
    if (!reply.providerState)
      throw new Error("Provider helper returned no observation");
    return reply.providerState;
  }
  async perform(request: ProviderRequest): Promise<ProviderReply> {
    if (request.target.provider !== this.id)
      throw new Error("Wrong provider target");
    const before = await this.read();
    if (
      !freshObservation(before) ||
      before.foreground !== this.id ||
      !sameTarget(before.target, request.target)
    ) {
      throw new Error("Target changed; select again");
    }
    const reply = await this.call(
      "claude",
      encodeNativePayload(request),
      ["plan", "permission-cycle"].includes(request.operation) ? 15000 : 10000,
    );
    if (!reply.providerState)
      throw new Error("Claude returned no verified result");
    return reply.providerState as ProviderReply;
  }
}
export const claudeProvider = new ClaudeProvider();
