import { ParameterType } from "jspsych";
import type { JsPsych, JsPsychPlugin, TrialType } from "jspsych";

// Future jsPsych bridge.
// 当前只是 skeleton，但接口位置已经固定：后续会把 standalone player
// 的启动逻辑包进 jsPsych trial lifecycle。
export interface LayoutTaskPluginParams {
  title?: string;
}

const info = {
  name: "layout-task",
  parameters: {
    title: {
      type: ParameterType.STRING,
      default: "Layout Task",
    },
  },
};

type Info = typeof info;

export class LayoutTaskPlugin implements JsPsychPlugin<Info> {
  static info = info;

  constructor(private readonly jsPsych: JsPsych) {
    void this.jsPsych;
  }

  trial(displayElement: HTMLElement, trial: TrialType<Info>): void {
    displayElement.innerHTML = `
      <section class="layout-task-shell">
        <header class="layout-task-header">
          <p class="layout-task-eyebrow">jsPsych Plugin Skeleton</p>
          <h1>${trial.title}</h1>
          <p class="layout-task-meta">This plugin shell is ready for future integration.</p>
        </header>
      </section>
    `;
  }
}

export default LayoutTaskPlugin;
