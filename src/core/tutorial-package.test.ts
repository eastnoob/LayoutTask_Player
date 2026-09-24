import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  mapTrialObjectYToRoomPoints,
  rebuildTrialObjectsFromSceneState,
} from '../../protocol/adaptor/assemble-stimuli-csv';
import { verifyTutorialPackage } from './tutorial-package-lock';

type JsonRecord = Record<string, any>;

const projectRoot = resolve(process.cwd());
const tutorialRoot = resolve(projectRoot, 'public/layout-task-tutorial');
const formalManifestPath = resolve(projectRoot, 'public/layout-task-run12-core23-preview/manifest.json');

function readJson(path: string): JsonRecord {
  return JSON.parse(readFileSync(path, 'utf8')) as JsonRecord;
}

describe('tutorial package', () => {
  it('is a fixed, self-contained task outside the formal run', () => {
    const manifest = readJson(resolve(tutorialRoot, 'manifest.json'));
    const generationReport = readJson(resolve(tutorialRoot, 'generation-report.json'));
    const formalManifest = readJson(formalManifestPath);
    const taskId = manifest.tasks[0].task_id as string;
    const formalTaskIds = new Set((formalManifest.tasks as Array<JsonRecord>).map((task) => task.task_id));

    expect(manifest.tasks).toHaveLength(1);
    expect(formalTaskIds.has(taskId)).toBe(false);
    expect(generationReport.source_generation_root).toBe('E:/260917');
    expect(generationReport.selected_combination_id).toBe(taskId.replace(/^scene_/, ''));

    const task = readJson(resolve(tutorialRoot, manifest.tasks[0].file));
    const objects = readJson(resolve(tutorialRoot, manifest.asset_library)).objects as JsonRecord;
    const backgrounds = readJson(resolve(tutorialRoot, manifest.background_library)).backgrounds as JsonRecord;
    const behaviors = readJson(resolve(tutorialRoot, manifest.behavior_library));

    expect(task.task_id).toBe(taskId);
    expect(task.flow?.mode).toBe('preview_then_reconstruct');
    expect(task.flow?.config?.preview_duration_sec).toBe(10);
    expect(task.display_image?.enabled).toBe(true);
    expect(task.stage).toMatchObject({ display_flip_y: true, background_flip_y: true });
    expect(task.collision).toMatchObject({ enabled: true, mode: 'discrete' });

    const expectedPlacement = JSON.parse(JSON.stringify(task));
    const sceneState = JSON.parse(task.metadata.scene_state_json);
    rebuildTrialObjectsFromSceneState(expectedPlacement, sceneState);
    mapTrialObjectYToRoomPoints(expectedPlacement, sceneState);
    expect(task.objects.map((object: JsonRecord) => object.y)).toEqual(
      expectedPlacement.objects.map((object: JsonRecord) => object.y),
    );
    for (const object of Object.values(objects)) {
      expect(existsSync(resolve(tutorialRoot, object.src))).toBe(true);
    }
    for (const background of Object.values(backgrounds)) {
      expect(existsSync(resolve(tutorialRoot, background.src))).toBe(true);
    }
    expect(existsSync(resolve(tutorialRoot, task.display_image.src))).toBe(true);

    for (const object of task.objects as Array<JsonRecord>) {
      expect(object.collision).toMatchObject({ enabled: true, shape: 'asset_outline' });
      if (object.behavior?.template) {
        expect(behaviors.behaviors[object.behavior.template]).toBeDefined();
      }
      if (object.collision?.source) {
        expect(existsSync(resolve(tutorialRoot, object.collision.source.src))).toBe(true);
      }
    }
  });

  it('passes the fixed package lock and keeps every board asset inside the package', () => {
    const boardPaths = [
      'assets/tutorial-reference/tutorial/whole/svg/armchairAndTeatable.svg',
      'assets/tutorial-reference/tutorial/variable/svg/armchairAndTeatable.svg',
      'assets/tutorial-reference/tutorial/whole/armchairAndTeatable.gif',
      'assets/tutorial-reference/tutorial/variable/armchairAndTeatable.gif',
      'assets/tutorial-reference/tutorial/whole/svg/diningTable.svg',
      'assets/tutorial-reference/tutorial/variable/svg/dining tablle_VARIABLE.svg',
      'assets/tutorial-reference/tutorial/whole/diningTable.gif',
      'assets/tutorial-reference/tutorial/variable/dining tablle_VARIABLE.gif',
      'assets/tutorial-reference/tutorial/whole/svg/shortBookShelf.svg',
      'assets/tutorial-reference/tutorial/variable/svg/shortBookShelf.svg',
      'assets/tutorial-reference/tutorial/whole/shortBookShelf.gif',
      'assets/tutorial-reference/tutorial/variable/shortBookShelf.gif',
      'assets/tutorial-reference/tutorial/whole/svg/sofaAndTeatable_FIXED.svg',
      'assets/tutorial-reference/tutorial/variable/svg/sofaAndTeatable_VARIABLE.svg',
      'assets/tutorial-reference/tutorial/whole/sofaAndTeatable_FIXED.gif',
      'assets/tutorial-reference/tutorial/variable/sofaAndTeatable_VARIABLE.gif',
    ];

    expect(
      verifyTutorialPackage(tutorialRoot, resolve(projectRoot, 'public/layout-task-run12-core23-preview'), {
        referenceBoardPaths: boardPaths,
      }),
    ).toMatchObject({
      packageVersion: 'tutorial-edc634ac7856-v1',
      taskId: 'scene_edc634ac7856',
      qid: 'Q_scene_edc634ac7856',
      fileCount: expect.any(Number),
    });
  });
});
