import { cp, mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export interface CopyWebReleaseAssetsOptions {
  publicDir: string;
  distDir: string;
  entryConfig?: string;
}

export async function copyWebReleaseAssets(options: CopyWebReleaseAssetsOptions): Promise<void> {
  const publicDir = path.resolve(options.publicDir);
  const distDir = path.resolve(options.distDir);
  const experimentDir = path.join(publicDir, "experiment");
  const distExperimentDir = path.join(distDir, "experiment");
  await mkdir(distExperimentDir, { recursive: true });

  const allConfigFiles = (await readdir(experimentDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(experimentDir, entry.name));
  let configFiles = allConfigFiles;
  if (options.entryConfig) {
    const selectedConfig = path.resolve(options.entryConfig);
    const selected = JSON.parse(await readFile(selectedConfig, "utf8")) as { baseUrl?: string };
    if (!selected.baseUrl) throw new Error(`Config has no baseUrl: ${selectedConfig}`);
    const selectedRoot = path.resolve(path.dirname(selectedConfig), selected.baseUrl);
    configFiles = [];
    for (const configFile of allConfigFiles) {
      const config = JSON.parse(await readFile(configFile, "utf8")) as { baseUrl?: string };
      if (config.baseUrl && path.resolve(path.dirname(configFile), config.baseUrl) === selectedRoot) {
        configFiles.push(configFile);
      }
    }
    if (!configFiles.includes(selectedConfig)) configFiles.push(selectedConfig);
  }
  for (const configFile of configFiles) {
    await cp(configFile, path.join(distExperimentDir, path.basename(configFile)));
  }

  await cp(
    path.join(experimentDir, "layout-task", "assets", "icons"),
    path.join(distExperimentDir, "layout-task", "assets", "icons"),
    { recursive: true },
  );

  const formalRoots = new Set<string>();
  for (const configFile of configFiles) {
    const config = JSON.parse(await readFile(configFile, "utf8")) as { baseUrl?: string };
    if (!config.baseUrl) throw new Error(`Config has no baseUrl: ${configFile}`);
    const formalRoot = path.resolve(path.dirname(configFile), config.baseUrl);
    const relativeFormalRoot = path.relative(publicDir, formalRoot);
    if (!relativeFormalRoot || relativeFormalRoot.startsWith("..") || path.isAbsolute(relativeFormalRoot)) {
      throw new Error(`Config points outside public/: ${config.baseUrl}`);
    }
    formalRoots.add(formalRoot);
  }
  for (const formalRoot of formalRoots) {
    await cp(formalRoot, path.join(distDir, path.relative(publicDir, formalRoot)), { recursive: true });
  }
}

async function main(): Promise<void> {
  const distDir = process.argv[2];
  const entryConfig = process.argv[3];
  if (!distDir) {
    console.error("Usage: tsx tools/generator/copy-web-release-assets.ts <dist-dir> [entry-config]");
    process.exitCode = 1;
    return;
  }
  await copyWebReleaseAssets({ publicDir: path.resolve("public"), distDir, entryConfig });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
