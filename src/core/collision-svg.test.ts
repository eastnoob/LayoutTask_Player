import { describe, expect, it } from "vitest";
import { parseCollisionSvg } from "./collision-svg";

describe("parseCollisionSvg", () => {
  it("parses marked rect collision elements", () => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg">
        <rect id="room" data-collision="contain" x="0" y="0" width="400" height="300" />
      </svg>
    `;

    expect(parseCollisionSvg(svg)).toEqual([
      { id: "room", type: "contain", shape: "rect", x: 0, y: 0, width: 400, height: 300 },
    ]);
  });

  it("parses marked polygon collision elements", () => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg">
        <polygon id="pillar" data-layout-collision="block" points="10,10 30,10 30,30 10,30" />
      </svg>
    `;

    expect(parseCollisionSvg(svg)).toEqual([
      {
        id: "pillar",
        type: "block",
        shape: "polygon",
        points: [
          { x: 10, y: 10 },
          { x: 30, y: 10 },
          { x: 30, y: 30 },
          { x: 10, y: 30 },
        ],
      },
    ]);
  });

  it("parses whitespace-separated polygon point streams", () => {
    const svg = `<svg><polygon id="pillar" data-collision="block" points="10 10 30 10 30 30 10 30" /></svg>`;

    expect(parseCollisionSvg(svg)).toEqual([
      {
        id: "pillar",
        type: "block",
        shape: "polygon",
        points: [
          { x: 10, y: 10 },
          { x: 30, y: 10 },
          { x: 30, y: 30 },
          { x: 10, y: 30 },
        ],
      },
    ]);
  });

  it("parses comma-separated polygon point streams", () => {
    const svg = `<svg><polygon id="pillar" data-collision="block" points="10,10,30,10,30,30,10,30" /></svg>`;

    expect(parseCollisionSvg(svg)).toEqual([
      {
        id: "pillar",
        type: "block",
        shape: "polygon",
        points: [
          { x: 10, y: 10 },
          { x: 30, y: 10 },
          { x: 30, y: 30 },
          { x: 10, y: 30 },
        ],
      },
    ]);
  });

  it("ignores visual SVG elements without collision markers", () => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg">
        <rect id="visual" x="0" y="0" width="10" height="10" />
        <polygon id="decoration" points="0,0 10,0 10,10" />
        <path id="linework" d="M 0 0 L 10 10" />
      </svg>
    `;

    expect(parseCollisionSvg(svg)).toEqual([]);
  });

  it("ignores commented-out marked collision elements", () => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg">
        <!-- <rect id="room" data-collision="contain" x="0" y="0" width="400" height="300" /> -->
      </svg>
    `;

    expect(parseCollisionSvg(svg)).toEqual([]);
  });

  it("throws a clear error for invalid collision marker values", () => {
    const svg = `<svg><rect id="room" data-collision="blok" x="0" y="0" width="400" height="300" /></svg>`;

    expect(() => parseCollisionSvg(svg)).toThrow("Collision element room has invalid data-collision value 'blok'");
  });

  it("throws a clear error for unsupported marked path elements", () => {
    const svg = `<svg><path id="wall" data-collision="block" d="M 0 0 L 10 10" /></svg>`;

    expect(() => parseCollisionSvg(svg)).toThrow("Unsupported collision SVG element: path#wall");
  });

  it("throws a clear error for polygons with fewer than three points", () => {
    const svg = `<svg><polygon id="bad" data-collision="block" points="0,0 10,0" /></svg>`;

    expect(() => parseCollisionSvg(svg)).toThrow("Collision polygon bad must contain at least 3 points");
  });

  it("throws a clear error for odd polygon point streams", () => {
    const svg = `<svg><polygon id="bad" data-collision="block" points="0 0 10" /></svg>`;

    expect(() => parseCollisionSvg(svg)).toThrow("Collision polygon bad must contain x,y coordinate pairs");
  });

  it("throws a clear error for malformed polygon point streams", () => {
    const svg = `<svg><polygon id="bad" data-collision="block" points="0,0 nope,10 10,10" /></svg>`;

    expect(() => parseCollisionSvg(svg)).toThrow("Collision polygon bad has invalid points");
  });

  it("rejects explicit empty rect numeric attributes", () => {
    const svg = `<svg><rect id="room" data-collision="contain" x="" y="0" width="400" height="300" /></svg>`;

    expect(() => parseCollisionSvg(svg)).toThrow("Collision element room has invalid x");
  });
});
