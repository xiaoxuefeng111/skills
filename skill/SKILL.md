# /tdx-publish Skill

> AAR 发布自动化 - 标准 SpectrAI Skill

## 功能描述

实现 QS_Android / TdxFlutter 单模块/批量构建发布自动化。AI 直接调用工具执行，无需外部脚本。

---

## ⚡ 前置检查流程（触发时自动执行）

### 1. 检测凭据 → 交互式输入

检查环境变量，缺失时询问用户：

```
凭据检测:
- TFS_GIT_TOKEN: TFS Git PAT Token（用于克隆 FlutterBuild 仓库）
- JENKINS_USER: Jenkins 用户名
- JENKINS_TOKEN: Jenkins API Token

缺失时执行:
1. 询问用户输入凭据值
2. 确认后保存到项目根目录 .env 文件
3. 后续触发自动加载，无需重复输入
```

**保存 .env 格式:**
```env
TFS_GIT_TOKEN=xxx
JENKINS_USER=admin
JENKINS_TOKEN=yyy
```

### 2. 检测 Git 工具

确认 `git` 命令可用，否则提示用户安装 Git。

---

## 触发方式

- **Slash 命令**: `/tdx-publish <template_file> <module> <branch> <commit>`
- **自然语言**: "发布 CCGR-native-beta.txt 中的 tdxCore，分支 master，commit abc123"
- **批量**: `/tdx-publish --input records.json`

---

## 参数说明

| 参数 | 必填 | 说明 |
|------|------|------|
| template_file | **是** | 模板文件名，如 `CCGR-native-beta.txt` |
| module | 是 | 模块名称，如 tdxCore、TdxFlutter |
| branch | 是 | Git 分支名 |
| commit | 是 | 构建使用的 commit hash（至少7位） |

**可选参数:**
- `--dry-run`: 模拟执行，不提交 Git，不触发 Jenkins
- `--skip-jenkins`: 仅更新模板并提交 Git

---

## 模板文件说明

FlutterBuild 仓库地址: `http://192.168.40.200:8080/tfs/OpenSDK/_git/FlutterBuild`

模板文件格式（每行一个模块配置）:
```
// 注释行
tdxCore,master,abc123def,old_commit_hash
tdxHQ,master,xyz789,old_commit_hash
```

---

## 执行流程（AI 直接调用工具）

```
前置检查
├─ 0a. 检测凭据 → 缺失时询问用户 → 保存到 .env
├─ 0b. 检测 Git 工具可用
└─ 0c. 加载凭据到环境变量
      ↓
1. 克隆 FlutterBuild 仓库
   - Bash: git clone http://192.168.40.200:8080/tfs/OpenSDK/_git/FlutterBuild
   - 认证: 使用 TFS_GIT_TOKEN
      ↓
2. 搜索模板文件
   - Glob: 在仓库中搜索匹配 template_file
   - 支持路径: QS_Android/*.txt, *.txt
      ↓
3. 读取模板内容
   - Read: 读取模板文件
      ↓
4. 解析模板
   - 找到 module 对应行
   - 格式: module,branch,commit,old_commit
      ↓
5. 更新模板
   - Edit: 替换该行的 commit 为新值
   - 格式: module,branch,new_commit,old_commit
      ↓
6. Git 提交
   - Bash: git add, git commit, git push
   - commit message: "更新 {module} 到 {new_commit}"
      ↓
7. 触发 Jenkins 构建
   - WebFetch 或 Bash curl: 调用 Jenkins API
   - POST /job/{jenkins_job}/build
   - 认证: JENKINS_USER + JENKINS_TOKEN
      ↓
8. 轮询构建状态
   - 循环调用 Jenkins API 查询状态
   - 间隔: 10秒，最长: 30分钟
   - 状态: SUCCESS / FAILURE / BUILDING
      ↓
9. 获取构建结果
   - 提取 APK 下载链接
      ↓
10. 记录审计日志
   - Write: 写入 logs/{date}.jsonl
      ↓
11. 返回结果给用户
```

---

## 工具调用详解

### Step 1: 克隆仓库

```bash
# 使用 Bash 工具
git clone https://{user}:{token}@192.168.40.200:8080/tfs/OpenSDK/_git/FlutterBuild /tmp/FlutterBuild
```

### Step 2-3: 搜索并读取模板

```javascript
// 使用 Glob 工具搜索
pattern: "**/*CCGR-native-beta.txt"

// 使用 Read 工具读取
file_path: /tmp/FlutterBuild/QS_Android/CCGR-native-beta.txt
```

### Step 4-5: 解析并更新模板

```javascript
// 解析格式: module,branch,commit,old_commit
// 使用 Edit 工具替换
old_string: "tdxCore,master,abc123,old123"
new_string: "tdxCore,master,new456,abc123"
```

### Step 6: Git 提交

```bash
# 使用 Bash 工具
cd /tmp/FlutterBuild
git add QS_Android/CCGR-native-beta.txt
git commit -m "更新 tdxCore 到 new456"
git push
```

### Step 7-9: Jenkins 操作

```bash
# 触发构建
curl -X POST -u ${JENKINS_USER}:${JENKINS_TOKEN} \
  http://jenkins.company.com:8080/job/QS_Android-CCGR/build

# 查询状态
curl -u ${JENKINS_USER}:${JENKINS_TOKEN} \
  http://jenkins.company.com:8080/job/QS_Android-CCGR/lastBuild/api/json

# 获取产物
curl -u ${JENKINS_USER}:${JENKINS_TOKEN} \
  http://jenkins.company.com:8080/job/QS_Android-CCGR/lastBuild/artifact/...
```

### Step 10: 审计日志

```javascript
// 使用 Write 工具
file_path: logs/2026-04-07.jsonl
content: {
  "timestamp": "2026-04-07T12:00:00Z",
  "template_file": "CCGR-native-beta.txt",
  "module": "tdxCore",
  "commit": "new456",
  "jenkins_build": 145,
  "status": "success"
}
```

---

## 返回结果格式

### 成功

```json
{
  "success": true,
  "template_file": "CCGR-native-beta.txt",
  "module": "tdxCore",
  "commit": "a1b2c3d4",
  "jenkins": {
    "build_number": 145,
    "build_url": "http://jenkins/job/xxx/145/",
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

## Jenkins Job 映射

模板文件名 → Jenkins Job 名称（从 configs/jenkins.yaml 读取）:

| 模板文件 | Jenkins Job |
|---------|-------------|
| CCGR-native-beta.txt | QS_Android-CCGR-build |
| SJZQ.txt | TdxFlutter-SJZQ-build |

---

## 错误处理

| 错误码 | 说明 | 处理方式 |
|--------|------|----------|
| E-AUTH-01 | 凭据缺失 | 询问用户输入 |
| E-GIT-01 | Git 未安装 | 提示安装 Git |
| E-GIT-03 | 克隆失败 | 检查网络和 Token |
| E-CFG-03 | 模板不存在 | 检查文件名 |
| E-JEN-01 | Jenkins 不可达 | 检查网络 |
| E-JEN-05 | 构建失败 | 查看日志 |

---

## 批量发布

用户传入 records.json:

```json
{
  "records": [
    {"template_file": "CCGR-native-beta.txt", "module": "tdxCore", "branch": "master", "commit": "abc123"},
    {"template_file": "CCGR-native-beta.txt", "module": "tdxTrade", "branch": "master", "commit": "def456"}
  ]
}
```

AI 逐条执行，汇总结果。

---

## 配置文件

项目包含 `configs/` 目录，提供以下配置：

| 文件 | 作用 |
|------|------|
| jenkins.yaml | Jenkins 服务器 URL 和 Job 映射 |
| tfs.yaml | TFS 仓库地址 |

---

## 安装方式

```bash
# 从 Git 仓库安装
npx skills add https://github.com/your-org/tdx-publish-skill --skill tdx-publish

# 或在 SpectrAI 中直接导入 skill 目录
```

---

## 触发关键词

| 关键词 | 功能 |
|--------|------|
| 发布 AAR、发布模块 | 单模块发布 |
| 批量发布、批量构建 | 批量发布 |
| 检查凭据 | 检测凭据配置 |

---

> **更新日期**: 2026-04-07
> **类型**: prompt（纯 Skill）