# 预注册模型

## 研究问题

检验刺激中的关系线索是否预测家具**位置恢复误差**，以及 feature/非对称线索是否预测家具**旋转恢复误差**。

## 单位与数据

- 分析单位：`participant × presentation × furniture model`。
- 重复 presentation 保留，不合并为一个 scene。
- 教程行排除。
- 位置主要结果：`abs(x_error) + abs(y_error)`。
- 旋转主要结果：45° 步长的圆周误差。

## Confirmatory models

位置模型：

```text
position_error ~ z_relationVisibilityTotal + z_relationPerspectiveTotal
                 + furniture_model
                 + (1 | participant) + (1 | scene)
```

旋转模型：

```text
rotation_error_steps ~ z_featureCueVisibility
                       + z_asymmetricCueVisibilityAngleWeighted
                       + furniture_model
                       + (1 | participant) + (1 | scene)
```

变量集合在查看 outcome 之前固定，不按 pilot 的 p 值进行筛选。标准化均值和标准差只由刺激设计矩阵计算。

## Exploratory variables

以下变量保留在数据表和探索性结果中，但不进入确认模型：

- `targetFurnitureSilhouetteVisibility`
- `furnitureGroupSilhouetteVisibility`
- `PerspectiveRank`
- `volumeAxisRetention`
- `volumeAngularSeparation`
- 原始 `asymmetricCueVisibility`
- 其他未预先指定的设计字段

原因是设计矩阵中已经观察到明显共线性，例如 target silhouette 与 feature cue 的相关约为 `.904`，group silhouette 与 relation visibility 的相关约为 `.725`。把它们全部并入同一个模型会让系数解释不稳定。

## Power

使用 pilot mixed model 的固定效应估计与协方差矩阵进行 model-based asymptotic power simulation。候选被试数为 10、15、20、25、30、40、50、60；每个候选数生成 1,000 个多元正态固定效应抽样；信息量按候选 N 缩放。该方法明确标记为近似，不把大量 singular mixed-model 重拟合冒充精确 power。

单个变量的 power 定义为双侧 `p < .05` 的比例；confirmatory block 要求同一模型中的两个理论变量同时达到该阈值。位置和旋转分别报告，不能合并成一个准确率。
