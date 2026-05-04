import type { LayoutTaskEvent } from "../types/events";
import type { LayoutTaskConfigLike } from "./types-internal";
import type { DisplayInfo, LayoutTaskResult } from "../types/result";
import { elapsedMs, now } from "../utils/time";

export class Recorder {
  private readonly events: LayoutTaskEvent[] = [];
  private startTime = 0;
  private endTime = 0;

  constructor(
    private readonly options: {
      config: LayoutTaskConfigLike;
      sessionId: string;
      getDisplayInfo?: () => Promise<DisplayInfo | undefined>;
      getFinalState: () => LayoutTaskResult["final_state"];
    },
  ) {}

  start(): void {
    this.startTime = now();
  }

  recordEvent(event: LayoutTaskEvent): void {
    this.events.push(event);
  }

  async finish(copyTimestamp?: number): Promise<LayoutTaskResult> {
    this.endTime = now();
    const display = await this.options.getDisplayInfo?.();

    return {
      schema: "layouttask.result.v1",
      exp: this.options.config.experimentId,
      qid: this.options.config.qid,
      task_id: this.options.config.taskId,
      session: this.options.sessionId,
      start_time: this.startTime,
      end_time: this.endTime,
      duration_ms: elapsedMs(this.startTime, this.endTime),
      display,
      task_config_hash: this.options.config.taskConfigHash,
      events: this.events,
      final_state: this.options.getFinalState(),
      locked: true,
      copy_timestamp: copyTimestamp,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    };
  }
}
