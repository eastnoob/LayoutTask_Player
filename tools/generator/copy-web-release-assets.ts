import { cp, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export interface CopyWebReleaseAssetsOptions {
  publicDir: string;
  distDir: string;
}

export async function copyWebReleaseAssets(options: CopyWebReleaseAssetsOptions): Promise<void> {
  const publicDir = path.resolve(options.publicDir);
  const distDir = path.resolve(options.distDir);
  const experimentDir = path.join(publicDir, "experiment");
  const distExperimentDir = path.join(distDir, "experiment");
  await mkdir(distExperimentDir, { recursive: true });

  for (const entry of await readdir(experimentDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".json")) {
      await cp(path.join(experimentDir, entry.name), path.join(distExperimentDir, entry.name));
    }
  }

  await cp(
    path.join(publicDir, "layout-task-run12-core23-persistent"),
    path.join(distDir, "layout-task-run12-core23-persistent"),
    { recursive: true },
  );
}

async function main(): Promise<void> {
  const distDir = process.argv[2];
  if (!distDir) {
    console.error("Usage: tsx tools/generator/copy-web-release-assets.ts <dist-dir>");
    process.exitCode = 1;
    return;
  }
  await copyWebReleaseAssets({ publicDir: path.resolve("public"), distDir });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
