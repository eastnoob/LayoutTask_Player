# LayoutTask Experiment Demo

Static smoke-test package for GitHub Pages.

Open locally:

```text
http://127.0.0.1:5173/experiment/
```

Open on GitHub Pages:

```text
https://eastnoob.github.io/LayoutTask_Player/experiment/
```

Flow:

```text
tutorial -> scene_001 -> scene_002 -> final CSV page
```

The demo uses `data_save.mode = "copy"` so it does not upload pilot data.

Production transport has two outputs. A task may send a compact `layouttask.backup.v1` JSON envelope after each completed trial. At the end of the experiment, the experiment-level exporter sends plain `session.csv`, `results.csv`, `raw_results.csv`, `events.csv`, and `debug.json` files. The demo remains copy-only until a real production endpoint is configured.
