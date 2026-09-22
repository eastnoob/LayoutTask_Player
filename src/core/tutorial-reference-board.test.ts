import { describe, expect, it } from "vitest";
import { buildTutorialReferenceBoardPage } from "./tutorial-reference-board";
import type { ExperimentTutorialReferenceBoardConfig } from "../types/experiment";

function board(): ExperimentTutorialReferenceBoardConfig {
  return {
    enabled: true,
    continueLabel: "Continue",
    items: [
      ["m01", "Armchairs and Coffee Table"],
      ["m03", "Dining Table and Chairs"],
      ["m04", "Bookcase"],
      ["m05", "Sofa and Coffee Table"],
    ].map(([id, name]) => ({
      id,
      name,
      allSvg: `assets/tutorial-reference/tutorial/whole/svg/${id}.svg`,
      variableSvg: `assets/tutorial-reference/tutorial/variable/svg/${id}.svg`,
      allAnimation: `assets/tutorial-reference/tutorial/whole/${id}.gif`,
      variableAnimation: `assets/tutorial-reference/tutorial/variable/${id}.gif`,
    })),
  };
}

describe("buildTutorialReferenceBoardPage", () => {
  it("renders each card as an SVG row above an independent GIF row", () => {
    const html = buildTutorialReferenceBoardPage({
      baseUrl: "/layout-task-generated/",
      board: board(),
    });

    expect(html.match(/<article class="layout-task-tutorial-board-card">/g)).toHaveLength(4);
    expect(html).toContain("/layout-task-generated/assets/tutorial-reference/tutorial/whole/svg/m01.svg");
    expect(html).toContain("/layout-task-generated/assets/tutorial-reference/tutorial/variable/svg/m01.svg");
    expect(html).toContain("/layout-task-generated/assets/tutorial-reference/tutorial/whole/m01.gif");
    expect(html).toContain("/layout-task-generated/assets/tutorial-reference/tutorial/variable/m01.gif");
    expect(html).toContain('class="layout-task-tutorial-board-svg-grid"');
    expect(html).toContain('class="layout-task-tutorial-board-gif-grid"');
    expect(html).toContain(">Armchairs and Coffee Table<");
    expect(html).toContain(">All Furniture<");
    expect(html).toContain(">Movable Item<");
    expect(html).not.toContain(">M01<");
    expect(html).not.toContain("Bedside Tables");
    expect(html).toContain("Reference board");
    expect(html).toContain("Study these default furniture arrangements carefully");
    expect(html).toContain("movable furniture will be marked in yellow");
    expect(html).not.toContain("relation.svg");
    expect(html).not.toContain("<h1");
  });
});
