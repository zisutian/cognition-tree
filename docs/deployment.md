# 部署与恢复

本文件拥有启动、数据位置、容器持久化和恢复步骤。日常配置入口见
[设置操作](settings.md)，迁移事务保证见[服务运行](service-runtime.md)。

## 源码仓库与两个启动入口

`repo-dev` 是唯一完整 Git 仓库，保留全部源码、测试、文档、锁文件和提交钩子。
`repo` 是由确定提交生成的运行目录，不是第二个 Git 工作区。发布标签对应完整源码，
测试和开发工具只从运行包中排除。正式数据与构建产物不提交 Git。

在两个目录中分别运行 `./start.sh`，均不接受模式参数：

| 目录 | 启动内容 | 初始地址 | 本机要求 |
|---|---|---|---|
| `repo` | 已编译的可用版 | `http://127.0.0.1:3001` | Bash、Node.js >=22.18.0 |
| `repo-dev` | 源码与 Vite 开发环境 | `http://127.0.0.1:3002` | Bash、Node.js >=22.18.0、pnpm 11.1.3、Git |

开发入口首次安装锁定依赖、接入原有钩子，并通过 bootstrap 公共接口建立当前目录内的
独立测试数据。已有配置不会被重置；指向其他数据根、使用日常端口或开放 LAN 时拒绝启动。
可用版入口直接启动包内 Node 程序，不安装依赖、不构建、不修改 Git 配置。

两个入口共用一份进程监督实现。Node 独占 HTTP 监听，网页与 API 同源。脚本不管理
Ollama、Docker 或相邻服务。仅设置和数据迁移产生的退出状态 75 会重启；其他退出
状态原样传播。Ctrl+C 停止接收连接并结束 SSE，普通请求最多等待 5 秒，HTTP 关闭后
释放 Agent、Provider、Vite 和仓库资源。

## 构建、更新与安装恢复

更新仅在显式执行维护操作时进行。日常开发和提交不改变可用目录。
从干净源码仓库执行，输出目录必须不存在：

    pnpm release:package ../runtime-candidate
    pnpm release:verify ../runtime-candidate
    pnpm release:smoke ../runtime-candidate

打包从当前确定提交导出临时源码，按锁文件安装并重新构建。包内包含前后端、编译后的
CLI、Agent 子进程、生产依赖、入口与说明；不包含源码测试、开发工具或正式数据。
`release.json` 记录完整提交、构建时间、Node 与平台架构、锁文件摘要和文件校验清单。
包仅面向其记录的平台架构；必须在目标环境完成启动验证。链接不得越出运行目录。

安装前保存页面内容、停止服务并等待退出。未完成数据迁移时先完成对账。执行：

    pnpm release:install ../runtime-candidate ../repo ../runtime-backups

安装拒绝仍在监听的服务、未知文件、已有维护锁、目录重叠和校验失败。旧运行包、固定
控制区及外置数据根先完整备份；安装只替换运行文件，保留数据位置和内容。
首次接入只接受空目录或仅含 `.cognition-tree` 的目录；旧源码应先完整迁至开发仓库并留存备份。

安装期间的兄弟目录 `.repo.release-lock` 阻止启动。安装记录先于替换写入；异常或进程
终止保留备份和维护锁。按错误中给出的备份路径重新对账：

    pnpm release:recover ../runtime-backups/具体安装备份

未完成的替换恢复旧运行文件，重复对账安全。该操作不倒退内容数据，也不重置 bootstrap；
无法确认锁所有权或备份完整性时保留现场。安装成功后，在 `repo` 运行 `./start.sh`，
确认网页、健康接口及正式内容读取正常，再恢复日常编辑。

若新服务启动验证失败，停止服务并保留失败现场，由维护者将备份运行包及对应控制区、
数据根一起恢复。恢复前核对目录身份；不能仅切换旧程序后继续使用已经迁移过的数据。
恢复日常编辑后产生的新内容必须单独保护，不能直接用旧快照覆盖。
旧运行包包含依赖和构建，恢复不依赖网络或重新构建。备份可能包含凭据，保持私有权限。

成功验证后，源码仓库创建 `usable/<时间>-<提交短号>` 本地附注标签，记录运行包提交和
验收信息；不移动已有标签，不自动推送。运行目录中的生成文件不手工维护。

## 配置初值与生效方式

首次启动的服务初值是：

    dataRoot           <项目根>/.cognition-tree
    listenMode         loopback
    port               3001
    publicOrigin       null
    repositoryHostRoot null
    maxAuditEntries    1000
    owner credential   未创建

监听地址、端口、数据根和宿主机显示路径修改后受控重启生效。审计容量通常立即生效；
缩小时立即裁剪最旧记录。若配置已经持久化但账本裁剪失败，服务返回已提交配置，保留旧
`effectiveConfiguration.maxAuditEntries`，以 `runtimeApplyErrorMessage` 和“部分生效”
显式提示并要求重启，不把已提交的 CAS 误报为整体失败。局域网模式固定绑定
`0.0.0.0`，必须先创建 owner credential，并填写无凭据、query、fragment 的 HTTPS
origin。TLS 证书仍由外部反向代理管理。

浏览器不读取独立 JSON 配置，也不保存 owner token。官方客户端只调用相对
`/api/v4`，请求携带同源 Cookie。仅 CI、E2E、测试进程变量，以及 Codex 私有 MCP
子进程的短期 capability 属于非用户运行参数；它们不会出现在设置或公开 API 中。

## 数据、控制区与迁移

固定启动控制区：

    <项目根>/.cognition-tree/bootstrap-v1/configuration.json

目录权限为 0700，文件权限为 0600。它由应用原子写入，不应手工编辑。控制区始终
固定在项目根，不参与数据迁移。损坏时服务只在 `127.0.0.1:3001` 启动恢复页面，
不加载内容、Agent 或凭据。普通 bootstrap 损坏恢复与迁移对账是两条入口：只有不存在
未结束迁移时才进入控制配置重置流程；迁移记录未结束或无法读取时，只提供对账诊断，
不会重置配置指针。

当前数据根布局：

    <dataRoot>/
      repositories/
        <repository-id>/
        .built-ins/journal/
        .built-ins/todo/
      server/
        access-v1/automation-tokens.json
        access-v1/trusted-client-tokens.json
        agent-auth-v1/providers/<provider-id>/
        agent-config-v1/configuration.json
        operations-v1/operations.json

普通仓库只能位于服务端本地文件系统或容器持久卷。远程浏览器访问服务不等于远程
仓库存储。

“设置 → 服务 → 数据迁移”发起数据根迁移时，客户端先同步已加载的 Workspace、Journal、Todo。
若存在 resident Agent session、正在进行的 Codex 设备码登录、未决 proposal、其他
迁移或配置 CAS 冲突，服务拒绝启动迁移。目标必须是不存在的绝对路径，不能与源或
控制区重叠，也不能经过符号链接。

迁移只复制以下权威分区：

    repositories/
    server/access-v1/
    server/agent-auth-v1/
    server/agent-config-v1/
    server/operations-v1/

服务保留并完整校验权限与访问/修改时间，不遍历符号链接，并以流式 SHA-256 校验文件
内容；目标文件和目录同步落盘后才允许切换。旧
`api-v1`、`agent-v1`、`agent-v2`、WebDAV 目录、旧 profile 文件和其他备份不读取、
不复制。新账本启用时会精确删除旧 `api-v1/audit.json` 和
`agent-v2/operations.json`；其他 legacy token、配置、凭据和内容原样保留。
验证成功后执行一次 bootstrap CAS。提交结果不确定时自动对账，并保持源、目标和维护
状态。只有确认原 revision 未提交才恢复源服务；确认目标 revision 且目标完整才继续重启。
无法证明时，在本机恢复页查看原因，修复权限、磁盘或锁问题后点击“重新对账”。不要删除
两份数据、手改指针或使用 bootstrap 重置来绕过迁移校验。

固定控制区的 `data-root-migration-v1.json` 保存当前迁移，覆盖准备、复制、校验、提交
指针、对账、等待重启、完成、失败和需要人工恢复。设置页面展示源与目标位置、阶段和
恢复原因；刷新会重新查询。进程启动先读取未结束记录，再开放内容服务；完成记录不会
阻止后续正常修改。成功保留源，失败保留已分配目标；目标已占用时直接拒绝，绝不递归
删除用户已有目录。

容器必须同时持久化项目 `.cognition-tree/bootstrap-v1` 和当前数据根。如果二者在
同一挂载卷内，持久化整个项目 `.cognition-tree` 即可；如果在不同卷中，两者都必须
独立挂载。迁移需要目标磁盘容纳完整权威数据的第二份副本。

## Agent 配置存储升级

服务当前使用 agent-config 内部 format 5；该数字是磁盘迁移标识，不是用户可选配置，
也不应手工修改。首次读取旧格式时会原子迁移：format 1/2
的 context 估算值乘以四后保存为“会话历史预算（字符）”，例如 16384 迁移为 65536、
32768 迁移为 131072；format 1–3 的 chat Profile 补入 `model-default` 推理强度；
format 1–4 的内联 API Key 先写入 `agent-auth-v1`，再切换配置引用。受影响的 chat
Profile version 增加并清除旧符合性。Provider/Profile ID 与浏览器默认 Profile ID
保留；format 1 的 Provider 不继承私网许可。非安全整数、损坏状态或任一步原子写入
失败都会 fail closed，不留下部分启用状态。该过程不读取环境变量或旧 profile 文件；
当前 API 也不接受旧字段、null secret 或兼容清除语义。

## 生产产物

生产构建输出：

    .artifacts/build/client
    .artifacts/build/server

运行 `pnpm server:start` 时，Node 从同一 origin 提供 API 与客户端静态资源。不存在
可替换的客户端启动配置文件。`pnpm clean` 只清除 `.artifacts`，不会触碰
`.cognition-tree`。
