import { initJsPsych } from "jspsych";
import InstructionsPlugin from "@jspsych/plugin-instructions";
import LayoutTaskPlugin from "./plugins/jspsych-layout-task";
import "./styles/layout-task.css";

export function createExperiment() {
  const jsPsych = initJsPsych();

  const timeline = [
    {
      type: InstructionsPlugin,
      pages: ["欢迎使用 Layout Task 示例实验。"],
      show_clickable_nav: true,
    },
    {
      type: LayoutTaskPlugin,
      title: "Layout Task Trial Placeholder",
    },
  ];

  return { jsPsych, timeline };
}
