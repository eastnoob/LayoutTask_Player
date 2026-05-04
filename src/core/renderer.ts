import type { RuntimeTaskConfig } from "../types/runtime";
import type { FinalState } from "../types/result";

export interface RendererRefs {
  root: HTMLElement;
  svg?: SVGSVGElement;
  backgroundElement?: SVGElement;
  objectElements: Map<string, SVGElement>;
}

export class LayoutTaskRenderer {
  readonly refs: RendererRefs;

  constructor(
    private readonly options: {
      root: HTMLElement;
      config: RuntimeTaskConfig;
    },
  ) {
    this.refs = {
      root: options.root,
      objectElements: new Map<string, SVGElement>(),
    };
  }

  mount(): RendererRefs {
    return this.refs;
  }

  renderShell(state: FinalState): void {
    const objectCount = Object.keys(state).length;
    this.options.root.innerHTML = `
      <section class="layout-task-shell">
        <header class="layout-task-header">
          <p class="layout-task-eyebrow">Layout Task</p>
          <h1>${this.options.config.title ?? this.options.config.taskId}</h1>
          <p class="layout-task-meta">QID: ${this.options.config.qid} · Objects: ${objectCount}</p>
        </header>
        <div class="layout-task-panel">
          <p>Project skeleton ready. Runtime config is loaded and renderer placeholder is mounted.</p>
        </div>
      </section>
    `;
  }

  destroy(): void {
    this.options.root.innerHTML = "";
  }
}
