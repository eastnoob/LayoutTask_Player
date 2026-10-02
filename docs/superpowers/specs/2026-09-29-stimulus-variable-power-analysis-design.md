# Stimulus Variable and Power Analysis Design

## Goal

建立一套可复现的离线分析流程，将 `run_12` 的刺激设计变量准确连接到每个被试、每个正式场景、每件家具的恢复结果，并分别估计位置误差和旋转误差所需的被试数量。

## Scope

本分析只处理正式 trial。教程、上传状态、置信度、时间和暂停元数据不进入主要正确性模型。

## Data contract

- 刺激设计源：`D:/PROJECTS/run_12/core/selected_23.csv`。
- 正式任务源：`public/layout-task-run12-core23-persistent/tasks/scene_*.json`。
- 回答源：VPS 下载的完整正式 `raw_results.csv`；若当前机器没有副本，分析脚本必须明确报告缺失，不得伪造结果。
- 通过 `scene_<combination_id>` 与 `combination_id` 连接任务和设计表。
- 通过结果对象 ID 的 `_m01_`、`_m03_`、`_m04_`、`_m05_` 连接家具模型。
- 通过设计表中的 `Mxx.point_id` 添加空间点。

## Predictors

主模型只使用预先定义且有变化的核心变量：

- `targetFurnitureSilhouetteVisibility`
- `furnitureGroupSilhouetteVisibility`
- `asymmetricCueVisibilityAngleWeighted`
- `featureCueVisibility`
- `relationVisibilityTotal`
- `PerspectiveRank`
- `volumeAxisRetention`
- `volumeAngularSeparation`

`audit.*` 和重复的 `design.*` 列不作为额外预测变量。原始 `asymmetricCueVisibility` 与 `relationPerspectiveTotal` 只进入探索性模型。常数列、完全共线列和缺失率过高列必须被标记并排除，而不是因为 p 值不显著才事后删除。

## Outcomes

- 位置：分别计算 x/y 步数误差，并以 `abs(dx_error) + abs(dy_error)` 作为主要位置误差；x、y 均为零时 `position_exact=1`。
- 旋转：以 45° 为一步，使用 8 步圆周距离计算 `rotation_error_steps`；为零时 `rotation_exact=1`。
- 位置和旋转不得合并为单一正确率。

## Statistical model

主分析使用 participant 和 scene 的随机截距，避免把家具判断误当成独立被试：

```text
position_error ~ predictors + furniture_model + (1|participant) + (1|scene)
rotation_error_steps ~ predictors + furniture_model + (1|participant) + (1|scene)
```

完全正确率为次要混合效应逻辑回归。重复呈现的场景保留为独立回答，但共享该场景的刺激变量。

## Power analysis

采用基于当前 pilot 方差和效应范围的参数模拟；被试是模拟增加的独立单位，23 个场景和家具模型结构保持不变。对每个候选 N 至少重复 1,000 次，分别计算位置误差、旋转误差、位置完全正确和旋转完全正确的 power，并报告达到 80% 与 90% power 的最小 N。当前约 6 个完整被试只用于 pilot 估计，不能作为稳定效应量的最终依据。

## Acceptance criteria

- 23/23 场景和设计组合成功对位。
- 长表每行只代表一个 participant × presentation × model 观察。
- 位置和旋转误差可独立复算。
- 主变量选择有先验来源、变化性和共线性检查记录。
- power 结果能由固定随机种子重新生成。
- 报告明确区分探索性结果、pilot 限制和正式样本量建议。
