# 刺激变量分析

这是离线分析工具，不参与实验运行。它把 `selected_23.csv` 的刺激变量、正式 `raw_results.csv` 和 `scoring-reference.json` 按 `scene_<combination_id>` 连接起来，分别计算位置误差与旋转误差。

```powershell
npm exec --yes tsx -- tools/stimulus-variable-power-analysis.ts `
  --raw raw_results.csv `
  --design D:\PROJECTS\run_12\core\selected_23.csv `
  --scoring public\layout-task-run12-core23-persistent\scoring\scoring-reference.json `
  --out analysis\reports\stimulus-variable-power-analysis
```

输出包含逐家具观测表、变量审计、模型摘要、被试数量模拟和 Markdown 报告。模拟是以被试为聚类单位的 bootstrap 精度稳定性检查，不是自动排除被试的规则，也不替代预注册的正式模型。
