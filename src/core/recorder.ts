import type { LayoutTaskEvent } from "../types/events";
import type { RuntimeTaskConfig } from "../types/runtime";
import type { DisplayInfo, LayoutTaskResult } from "../types/result";
import { elapsedMs, now } from "../utils/time";

// Recorder collects trial-time facts but does not decide export policy.
// 它保存“实验里发生了什么”；至于导出 full 还是 final-only，由 encoder 决定。
export class Recorder {
  private readonly events: LayoutTaskEvent[] = [];
  private startTime = 0;
  private endTime = 0;

  constructor(
    private readonly options: {
      config: RuntimeTaskConfig;
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
      // context is the self-describing block for downstream decoding/analysis.
      // 把关键解释参数写进 JSON，本体单独拿出去分析时也不怕丢 header 语义。
      context: buildResultContext(this.options.config),
      events: this.events,
      final_state: this.options.getFinalState(),
      locked: true,
      copy_timestamp: copyTimestamp,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    };
  }
}

function buildResultContext(config: RuntimeTaskConfig): LayoutTaskResult["context"] {
  // This is not just "nice metadata"; it is analysis-critical provenance.
  // It records the world/grid assumptions and each object's starting pose + limits.
  return {
    world: {
      viewBox: config.world.viewBox,
      origin: config.world.origin,
      grid_size: config.world.grid.size,
      grid_snap: config.world.grid.snap,
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
