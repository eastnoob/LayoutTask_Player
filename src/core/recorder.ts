import type { LayoutTaskEvent } from "../types/events";
import type { RuntimeTaskConfig } from "../types/runtime";
import type { DisplayInfo, LayoutTaskResult, PageTimingInfo } from "../types/result";
import { elapsedMs, now } from "../utils/time";

interface RecorderOptions {
  config: RuntimeTaskConfig;
  sessionId: string;
  getDisplayInfo?: () => Promise<DisplayInfo | undefined>;
  getFinalState: () => LayoutTaskResult["final_state"];
  getPageTiming?: (submitTime: number, playerStartTime: number) => PageTimingInfo;
  nowImpl?: () => number;
  getUserAgent?: () => string | undefined;
}

// Recorder collects trial-time facts but does not decide export shape.
// 它负责生成稳定的 event timeline；encoder 再决定最终导出 full 还是 final-only。
export class Recorder {
  private readonly events: LayoutTaskEvent[] = [];
  private readonly nowImpl: () => number;
  private readonly getUserAgent: () => string | undefined;
  private startTime = 0;
  private endTime = 0;

  constructor(private readonly options: RecorderOptions) {
    this.nowImpl = options.nowImpl ?? now;
    this.getUserAgent =
      options.getUserAgent ??
      (() => (typeof navigator !== "undefined" ? navigator.userAgent : undefined));
  }

  start(): void {
    this.startTime = this.nowImpl();
  }

  recordEvent(event: Omit<LayoutTaskEvent, "i" | "t">): LayoutTaskEvent {
    const recordedEvent: LayoutTaskEvent = {
      ...event,
      i: this.events.length,
      t: elapsedMs(this.startTime, this.nowImpl()),
    };

    this.events.push(recordedEvent);
    return recordedEvent;
  }

  async finish(copyTimestamp?: number): Promise<LayoutTaskResult> {
    this.endTime = this.nowImpl();
    // Display info can be expensive / DOM-dependent, so it is gated by recording config.
    // 关闭后直接省略，不做空对象占位。
    const display = this.options.config.recording.record_display_info
      ? await this.options.getDisplayInfo?.()
      : undefined;

    const pageTiming = this.options.config.recording.record_page_timing
      ? this.options.getPageTiming?.(this.endTime, this.startTime)
      : undefined;

    return {
      schema: "layouttask.result.v1",
      exp: this.options.config.experimentId,
      qid: this.options.config.qid,
      task_id: this.options.config.taskId,
      session: this.options.sessionId,
      start_time: this.startTime,
      end_time: this.endTime,
      duration_ms: elapsedMs(this.startTime, this.endTime),
      page_timing: pageTiming,
      display,
      task_config_hash: this.options.config.taskConfigHash,
      // context makes the payload self-describing for offline analysis.
      // final_state 仍然始终保留；record_final_state 目前是 reserved toggle，不在这一步改 schema。
      context: buildResultContext(this.options.config),
      events: this.events,
      final_state: this.options.getFinalState(),
      locked: true,
      copy_timestamp: copyTimestamp,
      user_agent: this.options.config.recording.record_user_agent ? this.getUserAgent() : undefined,
    };
  }
}

function buildResultContext(config: RuntimeTaskConfig): LayoutTaskResult["context"] {
  return {
      world: {
        viewBox: config.world.viewBox,
        origin: config.world.origin,
        grid_size: config.world.grid.size,
        grid_snap: config.world.grid.snap,
        grid_origin: config.world.grid.origin,
      },
    objects: Object.fromEntries(
      config.objects.map((objectConfig) => [
        objectConfig.id,
        {
          origin: {
            x: objectConfig.x,
            y: objectConfig.y,
            r: objectConfig.rotation,
          },
          movement_step: objectConfig.behavior.movement.step ?? config.world.grid.size,
          rotation_step: objectConfig.behavior.rotation?.step ?? 45,
          limits: {
            left: objectConfig.behavior.movement.max_left,
            right: objectConfig.behavior.movement.max_right,
            up: objectConfig.behavior.movement.max_up,
            down: objectConfig.behavior.movement.max_down,
            cw: objectConfig.behavior.rotation?.max_cw,
            ccw: objectConfig.behavior.rotation?.max_ccw,
          },
        },
      ]),
    ),
  };
}
