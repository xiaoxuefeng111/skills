---
name: tdx-publish
description: AAR 发布自动化 - 更新 FlutterBuild 仓库模板文件，触发 Jenkins 构建。支持单条与批量输入。触发词："发布AAR"、"编译模块"、"更新模板"。
---

# /tdx-publish Skill

> AAR 发布自动化 - 标准 SpectrAI Skill

## 功能描述

实现 QS_Android / TDX_Android / TdxFlutter 单模块/批量构建发布自动化。AI 直接调用工具执行，无需外部脚本。

**环境依赖：**
- Git（必需）
- Node.js + npm（TFS 打包必需，用于 axios-ntlm 库）
- TFS 凭据（TFS_USER / TFS_PASSWORD）

---

## ⚡ 前置检查流程（触发时必须首先执行）

**重要：执行任何发布操作前，必须先完成以下检查。凭据缺失或无效时必须交互式询问用户。**

### Step 0a: 检测并加载凭据

**执行顺序：**

1. **加载 .env 文件**（如果存在）
   ```bash
   if [ -f ~/.env ]; then set -a; source ~/.env; set +a; fi
   ```

2. **检测凭据是否已配置**
   ```bash
   # TFS Git 凭据（支持 PAT Token 或 账号密码）

   if [[ -n "${TFS_GIT_TOKEN:-}" ]]; then
     echo "TFS 认证方式: ✅ PAT Token"
   elif [[ -n "${TFS_USER:-}" && -n "${TFS_PASSWORD:-}" ]]; then
     echo "TFS 认证方式: ✅ 账号密码 (${TFS_USER})"
   else
     echo "TFS 认证方式: ❌ 未配置"
   fi
   ```

3. **如果凭据未配置 → 立即输出以下提示：**

   ```
   ═════════════════════════════════════════════════════════════════
   📋 检测到凭据缺失，请直接回复以下内容（复制粘贴填写）：
   ═════════════════════════════════════════════════════════════════

   TFS_USER=您的TFS用户名
   TFS_PASSWORD=您的TFS密码

   ═════════════════════════════════════════════════════════════════
   💡 说明：
   • TFS_USER/TFS_PASSWORD: TFS Git 登录账号密码
   • Jenkins 无需认证，使用 session cookie + CRUMB 方式触发构建
   ═════════════════════════════════════════════════════════════════
   ```

4. **用户回复后 → 解析并保存到 ~/.env 文件**
   ```bash
   cat > ~/.env << 'EOF'
   TFS_USER=用户输入的值
   TFS_PASSWORD=用户输入的值
   EOF

   set -a; source ~/.env; set +a
   echo "✅ 凭据已保存到 ~/.env"
   ```

### Step 0b: 验证凭据有效性（必须执行）

**⚠️ 重要：即使凭据存在，也必须验证有效性！**

**TFS Git 凭据验证：**
```bash
# 构建认证 URL
if [[ -n "${TFS_GIT_TOKEN:-}" ]]; then
  AUTH_URL="http://${TFS_GIT_TOKEN}@192.168.40.200:8080/tfs/OpenSDK/_git/FlutterBuild"
else
  AUTH_URL="http://${TFS_USER}:${TFS_PASSWORD}@192.168.40.200:8080/tfs/OpenSDK/_git/FlutterBuild"
fi

# 测试能否访问 FlutterBuild 仓库
RESULT=$(git ls-remote "${AUTH_URL}" HEAD 2>&1)

if echo "$RESULT" | grep -q "[0-9a-f]\{40\}"; then
  echo "✅ TFS Git 凭据有效"
else
  echo "❌ TFS Git 凭据无效，请重新输入"
  # 清除无效凭据，重新询问用户
fi
```

**Jenkins 连接验证（使用 session cookie + CRUMB）：**
```bash
# 获取 session cookie
curl -s -c /tmp/jenkins_session.txt -b /tmp/jenkins_session.txt \
  "http://192.168.30.28:8080/" -o /dev/null

# 用同一 session 获取 CRUMB
CRUMB=$(curl -s -c /tmp/jenkins_session.txt -b /tmp/jenkins_session.txt \
  "http://192.168.30.28:8080/crumbIssuer/api/json" | grep -o '"crumb":"[^"]*"' | cut -d'"' -f4)

# 测试触发构建
HTTP_CODE=$(curl -s -c /tmp/jenkins_session.txt -b /tmp/jenkins_session.txt \
  -X POST -H "Jenkins-Crumb: $CRUMB" \
  "http://192.168.30.28:8080/job/QS_Android/buildWithParameters?FILENAME=test&Module=tdxCore" \
  -w "%{http_code}" -o /dev/null)

if [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "200" ]; then
  echo "✅ Jenkins 可触发构建（无认证，使用 CRUMB）"
else
  echo "❌ Jenkins 触发失败（HTTP $HTTP_CODE），请检查网络"
fi
```

**验证失败时 → 清除无效凭据，重新执行 Step 0a 询问用户**

### Step 0c: 检测 Git 工具

```bash
git --version
```

### Step 0d: 检测 Node.js 环境（TFS 打包必需）

**⚠️ 如果命令包含 `--pack` 参数，必须检测 Node.js 环境！**

```bash
# 检测 Node.js 和 npm
node --version
npm --version

# 如果未安装，提示用户
if ! command -v node &> /dev/null; then
  echo "❌ Node.js 未安装，TFS 打包功能需要 Node.js"
  echo "💡 安装方式："
  echo "  • Windows: 下载 https://nodejs.org/dist/latest/win-x64/node.exe"
  echo "  • 或使用 nvm: nvm install latest"
fi

# 检查 axios-ntlm 包
npm list axios-ntlm 2>/dev/null || npm install axios-ntlm --save-dev
```

### Step 0e: 如果有 `--pack` 参数，一次性获取所有配置

**⚠️ 重要：一次性确认所有打包配置（工程、分支、构建类型、构建定义ID）！**

如果命令包含 `--pack` 参数，首先安装依赖并获取构建定义列表：

```bash
# 检查并安装 axios-ntlm（TFS API 需要）
npm list axios-ntlm 2>/dev/null || npm install axios-ntlm --save-dev

# 创建临时脚本获取构建定义列表
cat > /tmp/tfs-definitions.js << 'SCRIPT_EOF'
const { NtlmClient } = require('axios-ntlm');
const TFS_URL = process.argv[2];
const COLLECTION = process.argv[3];
const PROJECT = process.argv[4];
const USERNAME = process.argv[5];
const PASSWORD = process.argv[6];

let domain = '', username = USERNAME;
if (USERNAME.includes('\\')) { [domain, username] = USERNAME.split('\\'); }

const ntlmClient = NtlmClient({ username, password: PASSWORD, domain, workstation: '' });

const urls = [
  `${TFS_URL}/tfs/${COLLECTION}/${PROJECT}/_apis/build/definitions?api-version=2.0`,
  `${TFS_URL}/tfs/DefaultCollection/${PROJECT}/_apis/build/definitions?api-version=2.0`,
];

async function getDefs() {
  for (const url of urls) {
    try {
      const res = await ntlmClient.get(url);
      if (res.data.value) {
        for (const d of res.data.value) console.log(`${d.id}|${d.name}`);
        return;
      }
    } catch (e) { console.log('尝试失败:', e.message); }
  }
}
getDefs();
SCRIPT_EOF

# 执行脚本获取各工程的构建定义
for repo in AppCCGR AppXNZQ_SDK AppHBZQ; do
  echo "=== ${repo} 构建定义 ==="
  node /tmp/tfs-definitions.js "http://192.168.40.200:8080" "OpenSDK" "$repo" "${TFS_USER}" "${TFS_PASSWORD}"
done
```

然后输出配置选择提示：

```
═════════════════════════════════════════════════════════════════
📦 检测到 --pack 参数，请一次性确认打包配置：
═════════════════════════════════════════════════════════════════

请回复以下信息：

工程=AppCCGR        # 必填：AppCCGR / AppXNZQ_SDK / AppHBZQ
分支=成长层新框架   # 必填：App 工程的分支名
类型=Appbeta        # 必填：Appbeta 或 AppRelease 或 两者都更新
定义ID=403          # 必填：TFS 构建定义 ID

═════════════════════════════════════════════════════════════════
📋 可选工程、分支及构建定义：
═════════════════════════════════════════════════════════════════

【AppCCGR】
  分支列表：安全认证、安全认证-无越狱检测、股转北交所、国密、注册制、成长层新框架
  构建定义：
    • 长城国瑞_Android_Beta (ID: 403) - 默认分支: master
    • 长城国瑞_Android_Release (ID: 404) - 默认分支: master
    • 长城国瑞_IOS_Beta (ID: 405)
    • 长城国瑞_IOS_Release (ID: 406)

【AppXNZQ_SDK】
  分支列表：4.0.0-7-L2、4.0.0-期权、4.1.0~4.6.0
  构建定义：
    • 西南SDK版本_Android_Beta (ID: 382)
    • 西南SDK版本_IOS_Beta (ID: 384)

【AppHBZQ】
  分支列表：master、Flutter、czy
  构建定义：
    • 华宝证券_IOS_Release (ID: 121)
    • 华宝证券_IOS_Beta (ID: 122)
    • 华宝证券_IOS_Beta_noclear (ID: 123)
    • 华宝证券_IOS_Release_noclear (ID: 124)
    • 华宝证券_Android_Beta (ID: 125)
    • 华宝证券_Android_Release (ID: 126)

═════════════════════════════════════════════════════════════════
💡 提示：
• 类型=Appbeta：仅更新 AppAndroid/Appbeta/app/build.gradle
• 类型=AppRelease：仅更新 AppAndroid/AppRelease/app/build.gradle
• 类型=两者都更新：同时更新两个目录
• ⚠️ TFS 构建需要 Node.js + axios-ntlm 库支持指定分支
• 回复 "不需要" 可跳过打包步骤
═════════════════════════════════════════════════════════════════
```

**用户回复后，保存配置供后续使用：**
- APP_REPO（工程名）
- APP_BRANCH（分支名）
- BUILD_TYPE（Appbeta/AppRelease/两者都更新）
- DEFINITION_ID（构建定义ID）

**⚠️ 注意：AAR 发布完成后，必须先更新 build.gradle 并提交，再触发 TFS 构建！**

---

## 凭据说明

| 凭据 | 说明 | 获取方式 |
|------|------|----------|
| `TFS_USER` | TFS Git 用户名 | TFS 登录账号 |
| `TFS_PASSWORD` | TFS Git 密码 | TFS 登录密码 |
| `TFS_GIT_TOKEN` | TFS Git PAT Token（可选，替代账号密码） | TFS → 用户设置 → Personal Access Tokens |

**Jenkins 无需认证**，使用 session cookie + CRUMB 方式触发构建。

**TFS 打包依赖**：
- Node.js + npm
- axios-ntlm 库（自动安装）

**保存位置：** `~/.env` 或项目目录 `.env`

---

## 触发方式

- **Slash 命令**: `/tdx-publish <template_file> <module> <branch> <commit> <version>`
- **自然语言**: "发布 CCGR-native-beta.txt 中的 tdxCore，分支 master，commit abc123，版本 6.9.5"
- **带打包**: `/tdx-publish <...参数...> --pack` 或 "发布 AAR 并打包到 AppCCGR 安全认证分支"
- **批量**: `/tdx-publish --input records.json`

---

## 执行模式

### 模式1：仅发布 AAR（默认）

```
/tdx-publish HBZQ-native-beta-2026.txt tdxCore master_2025 abc123 6.9.5
```

执行完成后返回 AAR 下载链接，流程结束。

### 模式2：AAR + 平台打包（`--pack` 参数）

```
/tdx-publish HBZQ-native-beta-2026.txt tdxCore master_2025 abc123 6.9.5 --pack
```

AAR 发布完成后，**自动询问打包配置**：

```
═════════════════════════════════════════════════════════════════
📦 AAR 已发布成功！是否需要提交到平台打包？
═════════════════════════════════════════════════════════════════

请选择打包工程和分支（回复格式）：

工程=AppCCGR
分支=安全认证

═════════════════════════════════════════════════════════════════
📋 可选打包工程：
═════════════════════════════════════════════════════════════════

【AppCCGR】分支列表：
  • 安全认证
  • 安全认证-无越狱检测
  • 股转北交所
  • 国密
  • 注册制
  • 成长层新框架

【AppXNZQ_SDK】分支列表：
  • 4.0.0-7-L2
  • 4.0.0-期权
  • 4.0.0-适老板
  • 4.1.0 / 4.2.0 / 4.3.0 / 4.4.0 / 4.5.0 / 4.6.0

【AppHBZQ】分支列表：
  • master
  • Flutter
  • czy

═════════════════════════════════════════════════════════════════
💡 提示：回复 "不需要" 可跳过打包步骤
═════════════════════════════════════════════════════════════════
```

---

## 参数说明

**格式：** `/tdx-publish [--pack] 模板文件 [模块 分支 commit 版本]...`

**参数解析规则：**
1. `--pack` 可选，放在开头，表示 AAR 发布后需要更新 App 工程
2. 第一个非 `--pack` 参数是**模板文件**
3. 之后每 **4 个参数** 为一组：`模块 分支 commit 版本`

**示例：**

```
# 单模块（仅发布 AAR）
/tdx-publish CCGR-native-beta.txt tdxCore master abc123 6.9.5

# 多模块（仅发布 AAR）
/tdx-publish CCGR-native-beta.txt \
   tdxtoolutil master eb00aa81... 2.18.0 \
   tdxjyframingmodule master_ccgr_jggz d63dff46... 2.18.0

# 多模块 + 打包（--pack 放开头）
/tdx-publish --pack CCGR-native-beta.txt \
   tdxtoolutil master eb00aa81... 2.18.0 \
   tdxjyframingmodule master_ccgr_jggz d63dff46... 2.18.0
```

**参数说明：**

| 参数 | 必填 | 说明 |
|------|------|------|
| --pack | 否 | 放在开头，表示需要更新 App 工程并打包 |
| 模板文件 | 是 | 模板文件名，如 `CCGR-native-beta.txt` |
| 模块 | 是 | 模块名称，如 `tdxCore`、`tdxtoolutil` |
| 分支 | 是 | Git 分支名 |
| commit | 是 | 构建使用的 commit hash（至少7位） |
| 版本 | **是** | 版本号，如 `6.9.5`，**必填！** |

**⚠️ 重要：**
- VERSION 参数必填，否则构建产物会发布到临时仓库
- 多组模块参数按顺序解析，每组 4 个参数
- 模板文件只需指定一次

**Jenkins Module 可选值：**
```
all, tdxtoolutil, tdxCore, tdxCoreSo, tdxframework,
tdxfragmentandactivityutil, tdxHQ, tdxhqdg, tdxhqgg,
tdxjyframingmodule, tdxoemhqmodule, tdxoemjymodule, tdxweex
```

**其他可选参数:**
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
├─ 0b. 验证凭据有效性
├─ 0c. 检测 Git 工具可用
├─ 0d. 检测 Node.js 环境（--pack 参数必需）
└─ 0e. 如果有 --pack 参数 → 立即询问打包配置并保存
      ↓
1. 克隆 FlutterBuild 仓库
   - Bash: git clone http://192.168.40.200:8080/tfs/OpenSDK/_git/FlutterBuild
   - 认证: 使用 TFS_USER:TFS_PASSWORD
      ↓
2. 搜索模板文件
   - Glob: 在仓库中搜索匹配 template_file
   - 支持路径: QS_Android/*.txt, TDX_Android/*.txt, *.txt
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
   - Bash curl: 调用 Jenkins API（session + CRUMB）
   - POST /job/QS_Android/buildWithParameters
   - 参数: FILENAME, Module, VERSION
      ↓
8. 轮询构建状态
   - 循环调用 Jenkins API 查询状态
   - 间隔: 10秒，最长: 30分钟
   - 状态: SUCCESS / FAILURE / BUILDING
      ↓
9. 获取构建结果
   - 提取 AAR 下载链接
      ↓
10. 如果有 --pack 参数（配置已在 Step 0e 收集）
    └─ 执行 Step P2-P4 更新 App 工程
      ↓
11. 返回结果给用户
```

---

## 工具调用详解

### Step 1: 克隆仓库

```bash
# 使用 Bash 工具
# 认证方式：PAT Token 或 账号密码
if [[ -n "${TFS_GIT_TOKEN:-}" ]]; then
  git clone "http://${TFS_GIT_TOKEN}@192.168.40.200:8080/tfs/OpenSDK/_git/FlutterBuild" /tmp/FlutterBuild
else
  git clone "http://${TFS_USER}:${TFS_PASSWORD}@192.168.40.200:8080/tfs/OpenSDK/_git/FlutterBuild" /tmp/FlutterBuild
fi

# ⚠️ 重要：配置 Git 编码，避免中文乱码
cd /tmp/FlutterBuild
git config core.quotepath false      # 显示中文文件名
git config i18n.logoutputencoding utf-8
git config i18n.commitencoding utf-8
git config gui.encoding utf-8
```

### Step 2-3: 搜索并读取模板

```javascript
// 使用 Glob 工具搜索
pattern: "**/*CCGR-native-beta.txt"

// 使用 Bash 工具读取文件（保持原始编码）
// ⚠️ 重要：不要用 Read 工具，它会改变文件编码！
cat /tmp/FlutterBuild/QS_Android/CCGR-native-beta.txt
```

### Step 4-5: 解析并更新模板

**⚠️ 重要：使用 sed 直接修改文件，保持原始编码不被破坏！**

```bash
# 方法1：使用 sed 直接替换（推荐）
# 格式: module,branch,old_commit,new_commit
# 示例：将 tdxtoolutil 的 commit 从 82fc09a... 改为 eb00aa81...

cd /tmp/FlutterBuild

# 先用 grep 确认要修改的行
grep "^tdxtoolutil," QS_Android/CCGR-native-beta.txt

# 使用 sed 替换该行的 commit
# 匹配格式：tdxtoolutil,分支名,旧commit,xxx
sed -i "s/^tdxtoolutil,\([^,]*\),[^,]*/tdxtoolutil,\1,${NEW_COMMIT}/" \
  QS_Android/CCGR-native-beta.txt

# 验证修改结果
grep "^tdxtoolutil," QS_Android/CCGR-native-beta.txt
```

**⚠️ 编码保护原则：**
1. **不要使用 Read 工具读取文件** - 它会改变编码
2. **使用 Bash + cat/sed 处理文件** - 保持原始字节
3. **只修改 ASCII 部分**（模块配置行），不动中文注释
4. **提交前用 git diff 确认** 只改了预期的行

### Step 6: Git 提交

```bash
# 使用 Bash 工具
cd /tmp/FlutterBuild

# ⚠️ 重要：确保编码正确（避免中文乱码）
export LANG=zh_CN.UTF-8
export LC_ALL=zh_CN.UTF-8

# 添加并提交
git add QS_Android/CCGR-native-beta.txt
git commit -m "更新 tdxCore 到 new456"

# 推送到远程
git push
```

**注意：Windows 环境 Git Bash 需要额外处理：**
```bash
# Windows Git Bash 编码设置
git config --global core.quotepath false
git config --global i18n.logoutputencoding utf-8
git config --global i18n.commitencoding utf-8

# 提交时使用 UTF-8 编码
GIT_AUTHOR_ENCODING=utf-8 GIT_COMMITTER_ENCODING=utf-8 git commit -m "更新 tdxCore"
```

### Step 7-8: Jenkins 操作（多模块构建监控）

**⚠️ 重要：多模块构建会触发多次，需要正确追踪每个构建编号！**

```bash
# Step 1: 获取 session cookie 和 CRUMB
curl -s -c /tmp/jenkins_session.txt -b /tmp/jenkins_session.txt \
  "http://192.168.30.28:8080/" -o /dev/null

CRUMB=$(curl -s -c /tmp/jenkins_session.txt -b /tmp/jenkins_session.txt \
  "http://192.168.30.28:8080/crumbIssuer/api/json" | grep -o '"crumb":"[^"]*"' | cut -d'"' -f4)

# Step 2: 记录触发前的最新构建号
LAST_BUILD_BEFORE=$(curl -s -b /tmp/jenkins_session.txt \
  "http://192.168.30.28:8080/job/QS_Android/api/json" | \
  grep -o '"lastBuild":{.*"number":[0-9]*' | grep -o '[0-9]*$')

echo "触发前最新构建: #$LAST_BUILD_BEFORE"

# Step 3: 触发多个模块构建
for Module in tdxtoolutil tdxjyframingmodule; do
  curl -s -c /tmp/jenkins_session.txt -b /tmp/jenkins_session.txt \
    -X POST \
    -H "Jenkins-Crumb: $CRUMB" \
    "http://192.168.30.28:8080/job/QS_Android/buildWithParameters?FILENAME=${FILENAME}&Module=${Module}&buildType=Android&VERSION=${VERSION}"
  echo "✅ ${Module} 构建已触发"
done

# Step 4: 等待构建启动并追踪编号
sleep 15

# 获取触发后的构建列表（匹配参数）
for i in $(seq 1 60); do
  # 查询最近构建，匹配 Module 参数
  for build_num in $(seq $((LAST_BUILD_BEFORE + 1)) $((LAST_BUILD_BEFORE + 10))); do
    BUILD_INFO=$(curl -s -b /tmp/jenkins_session.txt \
      "http://192.168.30.28:8080/job/QS_Android/${build_num}/api/json" 2>&1)

    if echo "$BUILD_INFO" | grep -q '"Module"'; then
      MODULE_NAME=$(echo "$BUILD_INFO" | grep -o '"Module":"[^"]*"' | cut -d'"' -f4)
      BUILD_RESULT=$(echo "$BUILD_INFO" | grep -o '"result":"[^"]*"' | cut -d'"' | head -1)
      BUILDING=$(echo "$BUILD_INFO" | grep -o '"building":[^,]*' | cut -d':' -f2)

      echo "构建 #${build_num} (${MODULE_NAME}): building=${BUILDING}, result=${BUILD_RESULT:-进行中}"
    fi
  done

  sleep 30
done
```

**多模块构建监控正确做法：**
1. 记录触发前的 `lastBuild` 编号
2. 触发所有模块构建
3. 扫描新创建的构建（编号 > lastBuild），匹配 Module 参数
4. 分别追踪每个构建的状态

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

| 模板文件 | Jenkins Job | 目录 |
|---------|-------------|------|
| CCGR-native-beta.txt | QS_Android-CCGR-build | QS_Android/ |
| TDX-native-beta.txt | TDX_Android-build | TDX_Android/ |
| SJZQ.txt | TdxFlutter-SJZQ-build | TdxFlutter/ |

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

## 平台打包流程（`--pack` 参数）

**触发条件：** 命令带有 `--pack` 参数时，AAR 发布成功后**立即询问**打包配置，一次完成全部流程。

### Step P1: AAR 发布成功后执行打包流程

**⚠️ 注意：打包配置已在 Step 0e 确认，直接使用保存的配置执行！**

使用 Step 0e 保存的配置：
- APP_REPO（工程名）
- APP_BRANCH（分支名）
- BUILD_TYPE（Appbeta/AppRelease/两者都更新）
- DEFINITION_ID（构建定义ID）
- 已发布的模块列表
- AAR 版本号

### Step P2: 解析用户回复并克隆工程

```bash
# 解析：APP_REPO, APP_BRANCH, BUILD_TYPE（Appbeta/AppRelease）

git clone --single-branch --branch "${APP_BRANCH}" \
  "http://${TFS_USER}:${TFS_PASSWORD}@192.168.40.200:8080/tfs/OpenSDK/_git/${APP_REPO}" \
  /tmp/${APP_REPO}

cd /tmp/${APP_REPO}
git config core.quotepath false
git config i18n.commitencoding utf-8
```

### Step P3: 更新 build.gradle 中的 AAR 版本

**build.gradle 路径：** `AppAndroid/${BUILD_TYPE}/app/build.gradle`

**依赖格式：**
```groovy
compile(group: 'tdx.android.aar', name: 'tdxCore_master_2025', version: '2.14-2508201123', ext: 'aar', changing: true)
```

**更新逻辑（使用 sed 保持编码）：**
```bash
# 遍历模块列表，匹配并更新版本号
for module in ${MODULES}; do
  # 匹配 name: 'module*' 的行，替换 version
  sed -i "s/\(name: '${module}[^']*', version: '\)[^']*'/\1${NEW_VERSION}'/g" \
    AppAndroid/${BUILD_TYPE}/app/build.gradle
done

# 验证修改
git diff AppAndroid/${BUILD_TYPE}/app/build.gradle
```

### Step P4: Git 提交推送

```bash
git add AppAndroid/${BUILD_TYPE}/app/build.gradle
git commit -m "更新 ${MODULES} AAR 版本到 ${VERSION}"
git push
```

### Step P5-P6: 触发 TFS 构建

**⚠️ 重要：必须先完成 Step P2-P4（更新 build.gradle 并提交），再触发 TFS 构建！**

**⚠️ 重要：TFS API 需要使用 Node.js + axios-ntlm 库才能正确传递 sourceBranch 参数！**

#### 方案：创建临时 Node.js 脚本触发构建

**Step P5-1: 检查并安装 axios-ntlm**

```bash
# 检查 axios-ntlm 是否已安装
npm list axios-ntlm 2>/dev/null || npm install axios-ntlm --save-dev
```

**Step P5-2: 创建 TFS 构建脚本**

使用 Write 工具创建临时脚本 `/tmp/tfs-build.js`：

```javascript
// 使用 Write 工具创建以下内容
const { NtlmClient } = require('axios-ntlm');

// 从命令行参数获取配置
const TFS_URL = process.argv[2];       // TFS服务器URL
const COLLECTION = process.argv[3];    // 集合名（OpenSDK）
const PROJECT = process.argv[4];       // 工程名
const USERNAME = process.argv[5];      // 用户名
const PASSWORD = process.argv[6];      // 密码
const DEFINITION_ID = parseInt(process.argv[7]); // 构建定义ID
const BRANCH = process.argv[8];        // 分支名

// 解析域名（如果用户名格式为 domain\username）
let domain = '';
let username = USERNAME;
if (USERNAME.includes('\\')) {
  const parts = USERNAME.split('\\');
  domain = parts[0];
  username = parts[1];
}

// 创建 NTLM 客户端
const ntlmClient = NtlmClient({
  username,
  password: PASSWORD,
  domain,
  workstation: ''
});

// 构建请求体（关键：sourceBranch 参数）
const buildRequest = {
  definition: {
    id: DEFINITION_ID
  },
  sourceBranch: BRANCH.startsWith('refs/heads/') ? BRANCH : `refs/heads/${BRANCH}`
};

// 尝试多种 API 版本和 URL 格式
const urls = [
  `${TFS_URL}/tfs/${COLLECTION}/${PROJECT}/_apis/build/builds?api-version=2.0`,
  `${TFS_URL}/tfs/${COLLECTION}/${PROJECT}/_apis/build/builds?api-version=4.1`,
  `${TFS_URL}/tfs/${COLLECTION}/${PROJECT}/_apis/build/builds?api-version=5.0`,
  `${TFS_URL}/tfs/DefaultCollection/${PROJECT}/_apis/build/builds?api-version=2.0`,
];

async function triggerBuild() {
  console.log(`触发构建: ${PROJECT}, 分支: ${BRANCH}, 定义ID: ${DEFINITION_ID}`);
  console.log(`请求体: ${JSON.stringify(buildRequest)}`);

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    console.log(`尝试 URL ${i + 1}: ${url}`);
    try {
      const response = await ntlmClient.post(url, buildRequest);
      console.log(`✅ 成功!`);
      console.log(`构建ID: ${response.data.id}`);
      console.log(`构建号: ${response.data.buildNumber}`);
      console.log(`状态: ${response.data.status}`);
      console.log(`分支: ${response.data.sourceBranch}`);
      console.log(`---SUCCESS---`);
      return;
    } catch (e) {
      console.log(`失败: ${e.response?.status || e.message}`);
    }
  }
  console.log(`❌ 所有 URL 都失败`);
  console.log(`---FAILED---`);
}

triggerBuild().catch(e => console.error(e));
```

**Step P5-3: 执行脚本触发构建**

```bash
# 使用 Bash 工具执行脚本
node /tmp/tfs-build.js \
  "http://192.168.40.200:8080" \
  "OpenSDK" \
  "${APP_REPO}" \
  "${TFS_USER}" \
  "${TFS_PASSWORD}" \
  "${DEFINITION_ID}" \
  "${APP_BRANCH}"
```

**Step P5-4: 解析输出判断结果**

脚本输出包含：
- `---SUCCESS---` 表示成功触发
- `构建ID: xxx` 用于后续状态查询
- `构建号: xxx` 用于日志追踪
- `分支: refs/heads/xxx` 确认实际构建分支
- `---FAILED---` 表示触发失败

**如果触发成功，继续监控构建状态：**

**Step P6-1: 创建状态查询脚本**

```javascript
// 使用 Write 工具创建 /tmp/tfs-status.js
const { NtlmClient } = require('axios-ntlm');

const TFS_URL = process.argv[2];
const COLLECTION = process.argv[3];
const PROJECT = process.argv[4];
const USERNAME = process.argv[5];
const PASSWORD = process.argv[6];
const BUILD_ID = process.argv[7];

let domain = '';
let username = USERNAME;
if (USERNAME.includes('\\')) {
  const parts = USERNAME.split('\\');
  domain = parts[0];
  username = parts[1];
}

const ntlmClient = NtlmClient({ username, password: PASSWORD, domain, workstation: '' });

const urls = [
  `${TFS_URL}/tfs/${COLLECTION}/${PROJECT}/_apis/build/builds/${BUILD_ID}?api-version=5.0`,
  `${TFS_URL}/tfs/DefaultCollection/${PROJECT}/_apis/build/builds/${BUILD_ID}?api-version=5.0`,
];

async function getStatus() {
  for (const url of urls) {
    try {
      const response = await ntlmClient.get(url);
      const data = response.data;
      console.log(`状态: ${data.status}`);
      console.log(`结果: ${data.result || '进行中'}`);
      console.log(`构建号: ${data.buildNumber}`);
      console.log(`分支: ${data.sourceBranch}`);
      if (data.status === 'completed') {
        console.log(`---COMPLETED---`);
      } else {
        console.log(`---IN_PROGRESS---`);
      }
      return;
    } catch (e) {
      console.log(`尝试失败: ${e.message}`);
    }
  }
  console.log(`---FAILED---`);
}

getStatus().catch(e => console.error(e));
```

**Step P6-2: 执行状态查询**

```bash
# 使用 Bash 工具执行脚本
node /tmp/tfs-status.js \
  "http://192.168.40.200:8080" \
  "OpenSDK" \
  "${APP_REPO}" \
  "${TFS_USER}" \
  "${TFS_PASSWORD}" \
  "${BUILD_ID}"

# 等待构建完成（循环查询）
for i in $(seq 1 60); do
  OUTPUT=$(node /tmp/tfs-status.js \
    "http://192.168.40.200:8080" "OpenSDK" "${APP_REPO}" \
    "${TFS_USER}" "${TFS_PASSWORD}" "${BUILD_ID}" 2>&1)

  echo "$OUTPUT"

  if echo "$OUTPUT" | grep -q "COMPLETED"; then
    RESULT=$(echo "$OUTPUT" | grep "结果:" | cut -d':' -f2 | tr -d ' ')
    echo "构建完成: $RESULT"
    break
  fi
  sleep 30
done
```

**获取构建定义列表（验证配置）：**

**创建定义列表查询脚本：**

```javascript
// 使用 Write 工具创建 /tmp/tfs-definitions.js
const { NtlmClient } = require('axios-ntlm');

const TFS_URL = process.argv[2];
const COLLECTION = process.argv[3];
const PROJECT = process.argv[4];
const USERNAME = process.argv[5];
const PASSWORD = process.argv[6];

let domain = '';
let username = USERNAME;
if (USERNAME.includes('\\')) {
  const parts = USERNAME.split('\\');
  domain = parts[0];
  username = parts[1];
}

const ntlmClient = NtlmClient({ username, password: PASSWORD, domain, workstation: '' });

const urls = [
  `${TFS_URL}/tfs/${COLLECTION}/${PROJECT}/_apis/build/definitions?api-version=2.0`,
  `${TFS_URL}/tfs/${COLLECTION}/${PROJECT}/_apis/build/definitions?api-version=4.1`,
  `${TFS_URL}/tfs/DefaultCollection/${PROJECT}/_apis/build/definitions?api-version=2.0`,
];

async function getDefinitions() {
  for (const url of urls) {
    try {
      const response = await ntlmClient.get(url);
      if (response.data.value) {
        console.log(`=== ${PROJECT} 构建定义 ===`);
        for (const def of response.data.value) {
          console.log(`ID: ${def.id}, 名称: ${def.name}`);
        }
        console.log(`---SUCCESS---`);
        return;
      }
    } catch (e) {
      console.log(`尝试失败: ${e.message}`);
    }
  }
  console.log(`---FAILED---`);
}

getDefinitions().catch(e => console.error(e));
```

```bash
# 执行脚本获取构建定义列表
node /tmp/tfs-definitions.js \
  "http://192.168.40.200:8080" \
  "OpenSDK" \
  "${APP_REPO}" \
  "${TFS_USER}" \
  "${TFS_PASSWORD}"
```

**已知的构建定义默认分支：**

| 定义ID | 名称 | 默认分支 |
|--------|------|----------|
| 403 | 长城国瑞_Android_Beta | refs/heads/master |
| 404 | 长城国瑞_Android_Release | refs/heads/master |

**⚠️ 关键点：**
1. **必须使用 axios-ntlm 库**，curl 不支持 NTLM + sourceBranch 组合
2. sourceBranch 格式：`refs/heads/分支名` 或直接传分支名
3. 尝试多种 API 版本（2.0, 4.1, 5.0）
4. 集合名称优先使用 `OpenSDK`，备选 `DefaultCollection`

### Step P7: 获取 APK 下载链接

**使用 Node.js 获取构建产物：**

```javascript
// tfs-artifacts.js - 获取构建产物
const { NtlmClient } = require('axios-ntlm');

const TFS_URL = process.argv[2];
const COLLECTION = process.argv[3];
const PROJECT = process.argv[4];
const USERNAME = process.argv[5];
const PASSWORD = process.argv[6];
const BUILD_ID = process.argv[7];

let domain = '';
let username = USERNAME;
if (USERNAME.includes('\\')) {
  const parts = USERNAME.split('\\');
  domain = parts[0];
  username = parts[1];
}

const ntlmClient = NtlmClient({ username, password: PASSWORD, domain, workstation: '' });

const urls = [
  `${TFS_URL}/tfs/${COLLECTION}/${PROJECT}/_apis/build/builds/${BUILD_ID}/artifacts?api-version=5.0`,
  `${TFS_URL}/tfs/DefaultCollection/${PROJECT}/_apis/build/builds/${BUILD_ID}/artifacts?api-version=5.0`,
];

async function getArtifacts() {
  for (const url of urls) {
    try {
      const response = await ntlmClient.get(url);
      if (response.data.value && response.data.value.length > 0) {
        const artifact = response.data.value[0];
        console.log(`产物名称: ${artifact.name}`);
        console.log(`下载链接: ${artifact.resource.downloadUrl}`);
        console.log(`---SUCCESS---`);
        return;
      }
    } catch (e) {
      console.log(`尝试失败: ${e.message}`);
    }
  }
  console.log(`---FAILED---`);
}

getArtifacts().catch(e => console.error(e));
```

```bash
# 执行脚本获取 APK 下载链接
node /tmp/tfs-artifacts.js \
  "http://192.168.40.200:8080" \
  "OpenSDK" \
  "${APP_REPO}" \
  "${TFS_USER}" \
  "${TFS_PASSWORD}" \
  "${BUILD_ID}"
```

### Step P8: 返回结果

```
═════════════════════════════════════════════════════════════════
✅ 打包完成！

📌 构建信息：
   • 工程：${APP_REPO}
   • 分支：${APP_BRANCH}
   • 类型：${BUILD_TYPE}
   • 构建号：#${BUILD_NUMBER}
   • 状态：${RESULT}

📦 APK 下载：
   ${APK_URL}

═════════════════════════════════════════════════════════════════
```

---

## TFS Build API 参考

| 操作 | API | 方法 | 认证 |
|------|-----|------|------|
| 获取构建定义 | `/_apis/build/definitions` | GET | NTLM |
| 触发构建 | `/_apis/build/builds` | POST | NTLM |
| 查询状态 | `/_apis/build/builds/{id}` | GET | NTLM |
| 获取产物 | `/_apis/build/builds/{id}/artifacts` | GET | NTLM |

**⚠️ 重要：必须使用 Node.js + axios-ntlm 库，curl 不支持 sourceBranch 参数！**

**触发构建请求体：**
```json
{
  "definition": { "id": 123 },
  "sourceBranch": "refs/heads/分支名"
}
```

**构建状态值：** `inProgress` → `completed`
**构建结果值：** `succeeded` / `failed` / `canceled`

---

## 已知工程构建定义映射

| 工程 | 构建定义 | ID | 平台 |
|------|----------|-----|------|
| AppCCGR | 长城国瑞_Android_Beta | 403 | Android |
| AppCCGR | 长城国瑞_Android_Release | 404 | Android |
| AppCCGR | 长城国瑞_IOS_Beta | 405 | iOS |
| AppCCGR | 长城国瑞_IOS_Release | 406 | iOS |
| AppXNZQ_SDK | 西南SDK版本_Android_Beta | 382 | Android |
| AppXNZQ_SDK | 西南SDK版本_IOS_Beta | 384 | iOS |
| AppHBZQ | 华宝证券_IOS_Release | 121 | iOS |
| AppHBZQ | 华宝证券_IOS_Beta | 122 | iOS |
| AppHBZQ | 华宝证券_IOS_Beta_noclear | 123 | iOS |
| AppHBZQ | 华宝证券_IOS_Release_noclear | 124 | iOS |
| AppHBZQ | 华宝证券_Android_Beta | 125 | Android |
| AppHBZQ | 华宝证券_Android_Release | 126 | Android |

**⚠️ 如果工程不在映射表中，使用 Node.js 获取：**
```bash
# 创建临时脚本获取构建定义列表
node /tmp/tfs-definitions.js \
  "http://192.168.40.200:8080" \
  "OpenSDK" \
  "${APP_REPO}" \
  "${TFS_USER}" \
  "${TFS_PASSWORD}"
```

---

## 完整执行流程图

```
/tdx-publish HBZQ.txt tdxCore master 6af7a8a6 6.9.5 --pack
                    │
                    ▼
┌─────────────────────────────────────────┐
│  Step 0: 前置检查                        │
│  • 检测凭据（TFS_USER/PASSWORD）         │
│  • 验证 Git / Jenkins 连接               │
│  • 检测 Node.js 环境（--pack 必需）      │
│  • 如果有 --pack → 一次性确认打包配置：   │
│    工程、分支、Appbeta/AppRelease、定义ID │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│  Step 1-6: AAR 发布                      │
│  • 克隆 FlutterBuild                     │
│  • 更新模板文件 commit                   │
│  • Git 提交推送                          │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│  Step 7-8: Jenkins 构建（多模块）         │
│  • 记录触发前的 lastBuild 编号           │
│  • 触发所有模块构建                      │
│  • 扫描新构建，匹配 Module 参数          │
│  • 分别追踪每个构建状态                  │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│  Step 9: 获取构建结果                    │
│  • 从 Jenkins 日志提取 AAR 版本号        │
│  • 返回 AAR 下载链接                     │
└─────────────────────────────────────────┘
                    │
                    ▼
        ┌───────────┴───────────┐
        │   有 --pack 参数？     │
        └───────────┬───────────┘
              是 │
                 ▼
┌─────────────────────────────────────────┐
│  Step P2-P4: 更新 App 工程（重要！）      │
│  ⚠️ 必须先更新 build.gradle 再触发构建   │
│  • 克隆 App 工程（指定分支）             │
│  • 更新 build.gradle 中的 AAR 版本       │
│  • Git 提交推送                          │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│  Step P5-P6: 触发 TFS 构建               │
│  • 使用 Node.js + axios-ntlm 库          │
│  • 创建临时脚本触发构建（支持指定分支）  │
│  • 轮询构建状态等待完成                  │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│  ✅ 完成！                               │
│  • AAR 已发布到 Maven 仓库               │
│  • build.gradle 已更新并提交             │
│  • TFS 构建已触发（或提供手动链接）       │
└─────────────────────────────────────────┘
```

**⚠️ 关键流程顺序（--pack 模式）：**
1. AAR 发布（Step 1-9）
2. **更新 build.gradle 并提交**（Step P2-P4）← 必须先完成！
3. 触发 TFS 构建（Step P5-P6）← 最后执行！

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
> **最近修复**:
> - 修复多模块 Jenkins 构建监控逻辑（记录触发前 lastBuild，扫描新构建匹配参数）
> - 修正 `--pack` 模式流程顺序（先更新 build.gradle 再触发 TFS 构建）
> - Step 0e 增加一次性确认：工程、分支、Appbeta/AppRelease、构建定义ID
> - **TFS 构建触发改用 Node.js + axios-ntlm**（解决 curl 无法传递 sourceBranch 的问题）
> - 添加 Step 0d 检测 Node.js 环境（TFS 打包必需）
> - 添加 tfs-build.js、tfs-status.js、tfs-definitions.js、tfs-artifacts.js 脚本模板
> - 更新构建定义映射表（AppCCGR、AppXNZQ_SDK、AppHBZQ）
> - **支持 TDX_Android 目录模板文件**（与 QS_Android 流程相同）