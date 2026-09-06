# 文档索引

`docs/` 保持扁平目录。按使用、运维和开发选择入口；同一事实只在其所属专题详细维护。

## 使用

- [快速入门](getting-started.md)：首次启动、创建仓库与编辑。
- [设置操作](settings.md)：对象目录、保存与放弃、认证、令牌及迁移入口。
- [产品需求](product-requirements.md)：能力、用户可见承诺与不支持的范围。

## 运维

- [部署与恢复](deployment.md)：服务公开、数据位置、容器持久化、迁移及恢复。
- [API 与 CLI 集成](api-integration.md)：权限、外部调用、同步与错误处理。

## 开发

- [模块边界](architecture.md)：源码职责、公开入口、依赖和组合根。
- [内容一致性](content-consistency.md)：内容格式、可信边界、保存、合并和冲突。
- [服务运行](service-runtime.md)：协议、认证、账本、迁移事务与进程生命周期。
- [界面规范](ui-guidelines.md)：布局、交互、状态投影、尺度和共享组件。
- [CTN 分析流水线](ctn-analysis-pipeline.md)：编译、分析、失效和 multiline 语义。
- [工程原则](engineering-principles.md)：修改方式与工程组织。
- [测试指南](testing.md)：分层、夹具、针对性验证和完整验收。

## 历史证据

- [2026-09-06 结构重整记录](restructure-progress.md)
- [2026-09-06 UI 优化记录](ui-optimization-progress.md)
- [Dark Modern 样板与验证记录](ui-appearance-progress.md)

历史报告保留当时证据，不替代当前行为或架构规范。新增事实先写入对应专题，其他文档链接引用；
不复制 HTTP 路径或结构清单。精确操作由 [API registry](../contracts/api/registry.ts)
及其 OpenAPI 输出提供，CLI `./ctn openapi` 读取同一契约。
