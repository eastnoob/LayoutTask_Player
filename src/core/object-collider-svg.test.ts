import { describe, expect, it } from "vitest";
import { parseObjectColliderSvg } from "./object-collider-svg";

describe("parseObjectColliderSvg", () => {
  it("parses rect and polygon elements into local polygons", () => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg">
        <rect id="body" x="10" y="20" width="30" height="40" />
        <polygon id="nose" points="0,0 10,0 5,8" />
      </svg>
    `;

    expect(parseObjectColliderSvg(svg)).toEqual([
      {
        id: "body",
        points: [
          { x: 10, y: 20 },
          { x: 40, y: 20 },
          { x: 40, y: 60 },
          { x: 10, y: 60 },
        ],
      },
      {
        id: "nose",
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 5, y: 8 },
        ],
      },
    ]);
  });

  it("parses closed straight-line paths into local polygons", () => {
    const svg = `<svg><path id="outline" d="M 0 0 H 12 V 8 L 0 8 Z" /></svg>`;

    expect(parseObjectColliderSvg(svg)).toEqual([
      {
        id: "outline",
        points: [
          { x: 0, y: 0 },
          { x: 12, y: 0 },
          { x: 12, y: 8 },
          { x: 0, y: 8 },
        ],
      },
    ]);
  });

  it("rejects malformed path data with unrecognized content", () => {
    const svg = `<svg><path id="bad-path" d="M 0 0 L 10 0 # L 0 10 Z" /></svg>`;

    expect(() => parseObjectColliderSvg(svg)).toThrow("Object collider path bad-path has invalid d attribute");
  });

  it("flattens cubic paths and preserves the element id", () => {
    const svg = `<svg><path id="curve" d="M 0 0 C 4 0 8 10 12 10 Z" /></svg>`;

    const [polygon] = parseObjectColliderSvg(svg);

    expect(polygon.id).toBe("curve");
    expect(polygon.points[0]).toEqual({ x: 0, y: 0 });
    expect(polygon.points.at(-1)).toEqual({ x: 12, y: 10 });
    expect(polygon.points.length).toBeGreaterThan(2);
    expect(polygon.points).toContainEqual(expect.not.objectContaining({ x: 0, y: 0 }));
  });

  it("flattens smooth cubic paths with S commands", () => {
    const svg = `<svg><path id="smooth-cubic" d="M 0 0 C 4 0 8 10 12 10 S 20 20 24 10 Z" /></svg>`;

    const [polygon] = parseObjectColliderSvg(svg);

    expect(polygon.id).toBe("smooth-cubic");
    expect(polygon.points[0]).toEqual({ x: 0, y: 0 });
    expect(polygon.points.at(-1)).toEqual({ x: 24, y: 10 });
    expect(polygon.points.length).toBeGreaterThan(14);
  });

  it("flattens quadratic paths with Q commands", () => {
    const svg = `<svg><path id="quadratic" d="M 0 0 Q 6 12 12 0 Z" /></svg>`;

    const [polygon] = parseObjectColliderSvg(svg);

    expect(polygon.id).toBe("quadratic");
    expect(polygon.points[0]).toEqual({ x: 0, y: 0 });
    expect(polygon.points.at(-1)).toEqual({ x: 12, y: 0 });
    expect(polygon.points.length).toBeGreaterThan(2);
  });

  it("flattens smooth quadratic paths with T commands", () => {
    const svg = `<svg><path id="smooth-quadratic" d="M 0 0 Q 6 12 12 0 T 24 0 Z" /></svg>`;

    const [polygon] = parseObjectColliderSvg(svg);

    expect(polygon.id).toBe("smooth-quadratic");
    expect(polygon.points[0]).toEqual({ x: 0, y: 0 });
    expect(polygon.points.at(-1)).toEqual({ x: 24, y: 0 });
    expect(polygon.points.length).toBeGreaterThan(14);
  });

  it("rejects unsupported SVG elements that can hide or reference geometry", () => {
    for (const tag of ["image", "use", "mask", "clipPath", "filter"]) {
      const svg = `<svg><${tag} id="bad" /></svg>`;

      expect(() => parseObjectColliderSvg(svg), tag).toThrow(`Unsupported object collider SVG element: ${tag}`);
    }
  });

  it("ignores non-solid and hidden shapes", () => {
    const svg = `
      <svg>
        <rect id="fill-none" x="0" y="0" width="10" height="10" fill="none" />
        <polygon id="display-none" points="0,0 10,0 10,10" display="none" />
        <path id="hidden" d="M 0 0 L 10 0 L 10 10 Z" visibility="hidden" />
        <rect id="transparent" x="0" y="0" width="10" height="10" opacity="0" />
        <rect id="style-fill-none" x="0" y="0" width="10" height="10" style="fill: none" />
        <rect id="style-fill-opacity-zero" x="0" y="0" width="10" height="10" style="fill-opacity: 0" />
        <!-- <rect id="commented" x="0" y="0" width="20" height="20" /> -->
        <rect id="solid" x="1" y="2" width="3" height="4" />
      </svg>
    `;

    expect(parseObjectColliderSvg(svg)).toEqual([
      {
        id: "solid",
        points: [
          { x: 1, y: 2 },
          { x: 4, y: 2 },
          { x: 4, y: 6 },
          { x: 1, y: 6 },
        ],
      },
    ]);
  });

  it("ignores child geometry in hidden groups", () => {
    const svg = `
      <svg>
        <g display="none">
          <rect id="hidden-child" x="0" y="0" width="10" height="10" />
        </g>
        <rect id="solid" x="1" y="2" width="3" height="4" />
      </svg>
    `;

    expect(parseObjectColliderSvg(svg)).toEqual([
      {
        id: "solid",
        points: [
          { x: 1, y: 2 },
          { x: 4, y: 2 },
          { x: 4, y: 6 },
          { x: 1, y: 6 },
        ],
      },
    ]);
  });

  it("ignores child geometry in groups hidden by style", () => {
    const svg = `
      <svg>
        <g style="display:none">
          <polygon id="hidden-child" points="0,0 10,0 10,10" />
        </g>
        <polygon id="solid" points="1,2 4,2 4,6" />
      </svg>
    `;

    expect(parseObjectColliderSvg(svg)).toEqual([
      {
        id: "solid",
        points: [
          { x: 1, y: 2 },
          { x: 4, y: 2 },
          { x: 4, y: 6 },
        ],
      },
    ]);
  });

  it("rejects transforms on supported shapes", () => {
    const svg = `<svg><polygon id="moved" transform="translate(10 0)" points="0,0 10,0 10,10" /></svg>`;

    expect(() => parseObjectColliderSvg(svg)).toThrow("Object collider element moved uses unsupported transform");
  });

  it("rejects transforms on groups", () => {
    const svg = `<svg><g id="moved-group" transform="translate(10 0)"><rect x="0" y="0" width="10" height="10" /></g></svg>`;

    expect(() => parseObjectColliderSvg(svg)).toThrow("Object collider group moved-group uses unsupported transform");
  });

  it("rejects rounded rects", () => {
    const svg = `<svg><rect id="rounded" x="0" y="0" width="10" height="10" rx="2" /></svg>`;

    expect(() => parseObjectColliderSvg(svg)).toThrow("Object collider rect rounded uses unsupported rounded corners");
  });

  it("rejects empty colliders", () => {
    const svg = `<svg><!-- ignored --><rect id="empty" fill="none" x="0" y="0" width="10" height="10" /></svg>`;

    expect(() => parseObjectColliderSvg(svg)).toThrow(
      "Object collider SVG did not contain any supported solid polygons",
    );
  });
});
