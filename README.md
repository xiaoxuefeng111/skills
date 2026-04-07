# QS_Android AAR 发布自动化 Skill

> **版本**: v2.0（纯 Skill 模式）
> **更新日期**: 2026-04-07
> **类型**: SpectrAI 标准 Skill（prompt 类型）

---

## 一、简介

实现 **QS_Android / TdxFlutter 单模块/批量构建发布** 自动化。AI 直接调用工具执行，无需外部 Python 脚本。

**特点：**
- 标准 Skill 格式，通过 `npx skills add` 安装
- AI 直接调用 Git/Bash/WebFetch 等工具执行
- 前置检查自动执行，凭据缺失时交互询问
- 无外部依赖（只需 Git 工具）

---

## 二、安装方式

### 方式 1: 从 Git 仓库安装

```bash
npx skills add https://github.com/your-org/tdx-publish-skill --skill tdx-publish
```

### 方式 2: 在 SpectrAI 中导入

将 `skill/` 目录上传到你的 skills 仓库，然后在 SpectrAI 中安装。

---

## 三、触发方式

### Slash 命令

```
/tdx-publish CCGR-native-beta.txt tdxCore master abc123def
```

### 自然语言

```
"发布 CCGR-native-beta.txt 中的 tdxCore，分支 master，commit abc123"
"批量发布 /path/to/records.json"
```

---

## 四、参数说明

| 参数 | 必填 | 说明 |
|------|------|------|
| template_file | **是** | 模板文件名，如 `CCGR-native-beta.txt` |
| module | 是 | 模块名称，如 tdxCore、TdxFlutter |
| branch | 是 | Git 分支名 |
| commit | 是 | 构建使用的 commit hash（至少7位） |

**可选参数：**
- `--dry-run`: 模拟执行，不提交 Git，不触发 Jenkins
- `--skip-jenkins`: 仅更新模板并提交 Git

---

## 五、前置检查流程

Skill 触发时自动执行：

### 1. 凭据检测 → 交互式输入

| 凭据 | 说明 |
|------|------|
| `TFS_GIT_TOKEN` | TFS Git PAT Token |
| `JENKINS_USER` | Jenkins 用户名 |
| `JENKINS_TOKEN` | Jenkins API Token |

- **已配置** → 直接执行
- **缺失** → AI 询问用户输入，确认后保存到 `.env` 文件

### 2. Git 工具检测

确认 `git` 命令可用，否则提示安装。

---

## 六、执行流程

```
前置检查 → 克隆仓库 → 搜索模板 → 读取模板 → 更新模板
    → Git提交 → 触发Jenkins → 轮询状态 → 获取产物 → 记录日志
```

详细流程见 `skill/SKILL.md`。

---

## 七、项目结构（精简版）

```
tdx-publish-skill/
├── skill/
│   ├── SKILL.md           # Skill 定义（核心）
│   ├── skill-config.json  # SpectrAI 安装配置
│   └── README.md          # Skill 简介
├── configs/
│   ├── jenkins.yaml       # Jenkins URL 和 Job 映射
│   └── tfs.yaml           # TFS 仓库地址
├── .env.example           # 凭据配置示例
└── README.md              # 本文档
```

**说明：**
- `skill/` 是核心，包含 Skill 定义
- `configs/` 提供 Jenkins/TFS 配置
- 无 Python 脚本，AI 直接调用工具执行

---

## 八、配置文件

### configs/jenkins.yaml

```yaml
servers:
  qs_android:
    url: "http://jenkins.company.com:8080"
    jobs:
      CCGR: "QS_Android-CCGR-build"
      SJZQ: "TdxFlutter-SJZQ-build"
```

### configs/tfs.yaml

```yaml
flutter_build:
  url: "http://192.168.40.200:8080/tfs/OpenSDK/_git/FlutterBuild"
```

---

## 九、模板文件说明

FlutterBuild 仓库中的 txt 配置文件，格式：

```
// 注释行
tdxCore,master,abc123def,old_commit_hash
tdxHQ,master,xyz789,old_commit_hash
```

---

## 十、返回结果

### 成功

```json
{
  "success": true,
  "template_file": "CCGR-native-beta.txt",
  "module": "tdxCore",
  "commit": "a1b2c3d4",
  "jenkins": {
    "build_number": 145,
    "build_url": "...",
    "apk_url": "..."
  }
}
```

### 失败

```json
{
  "success": false,
  "error_code": "E-JEN-05",
  "error_message": "Jenkins 构建失败"
}
```

---

## 十一、常见问题

### Q1: 凭据如何获取？

| 凭据 | 获取方式 |
|------|----------|
| TFS_GIT_TOKEN | TFS → 用户设置 → Personal Access Tokens |
| JENKINS_USER | Jenkins 管理员分配 |
| JENKINS_TOKEN | Jenkins → 用户 → 配置 → API Token |

### Q2: Git 克隆失败？

- 检查 TFS_GIT_TOKEN 是否正确
- 检查网络连接
- 确认 Token 权限包含 Git 读写

### Q3: Jenkins 构建失败？

- 查看 Jenkins 构建日志
- 检查 Gradle 编译配置

---

## 十二、版本历史

| 版本 | 说明 |
|------|------|
| v1.0 | Python 脚本模式（已废弃） |
| v2.0 | 标准 Skill 模式（当前） |

---

> **维护者**: QS_Android 发布团队