import { initJsPsych } from "jspsych";
import InstructionsPlugin from "@jspsych/plugin-instructions";
import LayoutTaskPlugin from "./plugins/jspsych-layout-task";
import "./styles/layout-task.css";

// Minimal runnable jsPsych example.
// 这个文件不是 standalone 入口，而是给后续真正实验 timeline 一个可复制的最小模板。
export function createExperiment() {
  const jsPsych = initJsPsych();

  const timeline = [
    {
      // Keep one short instructions trial so plugin behavior can be tested in a normal timeline flow.
      // 先走一页 instructions，更接近真实实验而不是裸跑单个 task。
      type: InstructionsPlugin,
      pages: ["Welcome to the Layout Task demo. Click next to start the room01 trial."],
      show_clickable_nav: true,
    },
    {
      // Standard static-config usage: task is resolved from public/layout-task/manifest.json.
      // 研究者平时最可能用的就是这种 taskId + qid 模式。
      type: LayoutTaskPlugin,
      title: "Layout Task",
      taskId: "room01",
      qid: "Q1",
      autoFinishTrial: true,
      writeEncodedToData: true,
      writeResultToData: true,
      writeHeaderToData: true,
    },
  ];

  return { jsPsych, timeline };
}
