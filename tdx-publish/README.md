# tdx-publish Skill

> AAR 发布自动化 - SpectrAI 标准 Skill

## 简介

实现 QS_Android / TdxFlutter 模块发布自动化。AI 直接调用工具执行，无需外部脚本。

**v2.0 改进：**
- ✅ 多模块并行触发 + queueId 监控
- ✅ 使用频率学习机制
- ✅ 支持直接粘贴模板内容格式

## 安装

```bash
npx skills add https://github.com/your-org/tdx-publish-skill --skill tdx-publish
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

| 参数 | 必填 | 说明 |
|------|------|------|
| template_file | 是 | 模板文件名，如 `HBZQ-native-beta-2026.txt` |
| module | 是 | 模块名称（tdxCore/tdxHQ/tdxframework等） |
| branch | 是 | Git 分支名 |
| commit | 是 | 构建使用的 commit hash |
| version | **是** | 版本号，如 `6.9.5`，**必填！** |

**⚠️ VERSION 必填，否则产物会发布到临时仓库！**

## 使用

### 单模块

```
/tdx-publish HBZQ-native-beta-2026.txt tdxCore master_2025 6af7a8a6 6.9.5
```

### 批量（直接粘贴模板内容）

```
XNZQ-native-beta.txt
tdxframework XNZQL2 99655b57ddfad71da8c35cf16ca0ee08a7922445 4.5
tdxHQ master-xnzq 5df3c336068dc43be81bdb1c50e791eaf8a90035 4.5
tdxhqgg XNZQL2 9acc73b5d769524dfe4cd160acd29b5e55a8a1bb 4.5
```

参数顺序：`模板文件 模块 分支 commit 版本号`

## 多模块监控改进

**问题解决：** 三个以上依赖模块时 Jenkins 监控异常

**改进方案：**
1. 触发时获取 `queueId`（从响应头 Location）
2. 维护 `BUILD_TRACKER` 数组追踪多个构建
3. 从 `/queue/item/{queueId}/api/json` 获取真实 buildNumber
4. 统一轮询所有构建状态

## 使用频率学习

每次构建成功后，自动记录使用频率：
- 模板文件使用次数
- 模块使用次数
- 高频组合示例

下次触发时，AI 按频率推荐高频示例。

## 文件清单

| 文件 | 说明 |
|------|------|
| `SKILL.md` | Skill 定义（完整流程、参数、错误处理） |
| `skill-config.json` | SpectrAI 安装配置 |
| `README.md` | 本说明文件 |
| `configs/jenkins.yaml` | Jenkins 配置 |
| `configs/tfs.yaml` | TFS 配置 |
| `logs/usage-stats.json` | 使用频率统计（自动生成） |

## 详细文档

见 [SKILL.md](./SKILL.md)

---

> 更新日期: 2026-04-14
> 版本: v2.1
> 最近修复:
> - queueId → buildNumber：直接从 executable.number 提取（不依赖 url）
> - Maven 地址：从 consoleText 解析（AAR 发布到 Artifactory，不是 Jenkins artifacts）