# 文档索引

先从总览了解项目，再按问题进入契约、操作或验证说明。

## 总览

- [产品需求](product-requirements.md)：定位、能力、用户可见承诺和当前范围。
- [模块边界](architecture.md)：领域关系、源码层次、职责、依赖与组合根。

## 专题契约

- [内容一致性](content-consistency.md)：内容格式、可信边界、保存、合并与冲突恢复。
- [服务运行](service-runtime.md)：持久状态、HTTP、认证、账本、迁移事务与进程生命周期。
- [界面规范](ui-guidelines.md)：组件分工、目录、导航、页面状态、布局与反馈。
- [CTN 分析流水线](ctn-analysis-pipeline.md)：编译与分析、身份、缓存失效及源码呈现语义。

## 使用与运维

- [快速入门](getting-started.md)：启动、创建仓库和首次编辑。
- [设置操作](settings.md)：配置对象、保存与放弃、认证、本机 API 和模型服务设置。
- [部署与恢复](deployment.md)：启动目录、运行包、数据位置、迁移限制和恢复步骤。
- [API 与 CLI 集成](api-integration.md)：外部内容读取、名称定位、版本化提交和结果核对。

## 验证

- [测试指南](testing.md)：验证边界、夹具、针对性检查、完整验收和性能比较。

## 精确接口与历史资料

精确 API 操作由 [registry](../contracts/api/registry.ts)及其 OpenAPI 输出提供；
`./ctn --server <本机服务地址> openapi` 读取同一契约。
模块登记见[模块注册表](../tests/architecture/moduleRegistry.ts)，命令和依赖版本见
[package.json](../package.json)。

这些文档随源码维护，独立检出不依赖外层资料。项目外层的 co-docs 保存计划、执行和交接记录，
reports 保存用户报告与证据；历史结论限定于原日期和基线，不代表当前实现已通过验收，也不进入运行包。
