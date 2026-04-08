# tdx-publish Skill

> AAR 发布与 APK 打包自动化 - Claude Code Skill

## 简介

实现 QS_Android / TDX_Android / TdxFlutter 模块发布自动化，支持 AAR 发布和 APK 打包两种模式。

## 快速开始

### 触发方式

| 模式 | 命令示例 |
|------|----------|
| 仅发布 AAR | `/tdx-publish CCGR-native-beta.txt tdxCore master abc123 6.9.5` |
| AAR + 打包 | `/tdx-publish --pack CCGR-native-beta.txt tdxCore master abc123 6.9.5` |
| 仅打包 APK | `/tdx-publish --only-pack` |
| 批量发布 | `/tdx-publish --input records.json` |

### 执行模式

| 模式 | 参数 | 说明 |
|------|------|------|
| 模式1 | 默认 | 仅发布 AAR |
| 模式2 | `--pack` | AAR 发布 + 平台打包 |
| 模式3 | 默认+多模块 | 多模块仅发布 AAR |
| 模式4 | `--pack`+多模块 | 多模块发布 + 打包 |
| 模式5 | `--only-pack` | 仅打包 APK（AAR 已发布） |

## 安装

```bash
npx skills add https://github.com/xiaoxuefeng111/skills --skill tdx-publish
```

## 凭据配置

首次使用时，技能会自动检测凭据，缺失时会提示输入。

**所需凭据：**

| 凭据 | 说明 | 示例 |
|------|------|------|
| `TFS_USER` | TFS Git 用户名 | `tdxxiaoxuefeng` |
| `TFS_PASSWORD` | TFS Git 密码 | `123456` |

**Jenkins 无需认证**，使用 session cookie + CRUMB 方式触发构建。

**输入示例（按提示回复）：**

```
TFS_USER=tdxxiaoxuefeng
TFS_PASSWORD=123456
```

凭据会保存到 `~/.env` 文件，下次自动加载。

## 参数说明

### AAR 发布模式

| 参数 | 必填 | 说明 |
|------|------|------|
| template_file | 是 | 模板文件名，如 `CCGR-native-beta.txt` |
| module | 是 | 模块名称（tdxCore/tdxHQ/tdxframework等） |
| branch | 是 | Git 分支名 |
| commit | 是 | 构建使用的 commit hash（至少7位） |
| version | **是** | 版本号，如 `6.9.5` |

### 仅打包模式（`--only-pack`）

```
工程=AppCCGR        # AppCCGR / AppXNZQ_SDK / AppHBZQ
分支=成长层新框架   # App 工程分支
类型=Appbeta        # Appbeta / AppRelease / 两者都更新
定义ID=403          # TFS 构建定义 ID

模块版本（每行一个）：
tdxCore=2.18.0-2504081234
tdxtoolutil=2.18.0-2504081235
```

## 使用示例

### 模式1：仅发布 AAR

```
/tdx-publish CCGR-native-beta.txt tdxtoolutil master eb00aa81 2.18.0
```

### 模式2：AAR + 平台打包

```
/tdx-publish --pack CCGR-native-beta.txt tdxtoolutil master eb00aa81 2.18.0
```

### 模式5：仅打包 APK

```
/tdx-publish --only-pack
```

按提示输入：
```
工程=AppCCGR
分支=成长层新框架
类型=Appbeta
定义ID=403

tdxCore=2.18.0-2504081234
tdxtoolutil=2.18.0-2504081235
```

## 流程说明

```
┌─────────────────────────────────────────────────────────────┐
│                     tdx-publish 技能                         │
├─────────────────────────────────────────────────────────────┤
│  阶段1: AAR 发布（模式1-4）                                   │
│  ├── 1. 克隆 FlutterBuild 仓库                               │
│  ├── 2. 更新模板文件中的 commit                              │
│  ├── 3. Git 提交推送                                         │
│  ├── 4. 触发 Jenkins 构建                                    │
│  └── 5. 轮询构建状态，返回 AAR 下载链接                       │
├─────────────────────────────────────────────────────────────┤
│  阶段2: 平台打包（--pack 或 --only-pack）                    │
│  ├── 1. 克隆 App 工程，更新 build.gradle AAR 版本            │
│  ├── 2. Git 提交推送                                         │
│  ├── 3. 触发 TFS 构建（支持指定分支）                         │
│  ├── 4. 监控构建状态（系统弹框提示）                          │
│  └── 5. 返回 APK 下载链接                                    │
└─────────────────────────────────────────────────────────────┘
```

## 支持的模板目录

- `QS_Android/*.txt`
- `TDX_Android/*.txt`
- `TdxFlutter/*.txt`

## 可选打包工程

| 工程 | 常用分支 | 构建定义 ID |
|------|---------|-------------|
| AppCCGR | 安全认证、成长层新框架、国密 | 403 (Beta), 404 (Release) |
| AppXNZQ_SDK | 4.0.0-7-L2、4.0.0-期权 | 382 (Beta), 384 (Release) |
| AppHBZQ | master、Flutter、czy | 125 (Beta), 126 (Release) |

## 环境依赖

- Git（必需）
- Node.js + npm（打包模式必需）

## 文件清单

| 文件 | 说明 |
|------|------|
| `SKILL.md` | Skill 定义（完整流程、参数、错误处理） |
| `skill-config.json` | SpectrAI 安装配置 |
| `README.md` | 本说明文件 |

## 详细文档

见 [SKILL.md](./SKILL.md)

---

> 更新日期: 2026-04-08
> 类型: Claude Code Skill
> 最近更新：
> - 新增 `--only-pack` 模式（仅打包 APK）
> - 支持多模块不同版本号
> - 支持 TDX_Android 目录模板
> - TFS 构建监控带系统弹框提示