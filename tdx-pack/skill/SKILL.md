---
name: tdx-pack
description: APK 打包自动化 - 更新 build.gradle 版本号，触发 TFS 构建。触发词："打包APK"、"编译APK"、"构建APK"。
---

# /tdx-pack Skill

> APK 打包自动化 - 无需发布 AAR，直接打包

## 功能描述

更新 App 工程 build.gradle 中的 AAR 版本号，触发 TFS 构建。

**与 `/tdx-publish --pack` 的区别：**
- `/tdx-publish --pack`：先发布 AAR → 更新版本号 → 打包
- `/tdx-pack`：直接更新版本号 → 打包（AAR 已发布的情况下使用）

---

## 🚀 快速开始

### 触发方式

```
/tdx-pack
```

### 执行流程

1. **检测环境**（Git、Node.js、TFS 凭据）
2. **询问打包配置**：
   ```
   工程=AppCCGR        # AppCCGR / AppXNZQ_SDK / AppHBZQ
   分支=成长层新框架   # App 工程分支
   类型=Appbeta        # Appbeta / AppRelease / 两者都更新
   定义ID=403          # TFS 构建定义 ID
   ```
3. **询问模块版本**：
   ```
   模块=tdxtoolutil 版本=2.18.0-2604071655
   模块=tdxjyframingmodule 版本=2.18.0-2604071656
   ```
4. **克隆工程** → **更新 build.gradle** → **Git 提交** → **触发 TFS 构建**
5. **监控构建状态** → **弹框提示**

---

## ⚡ 前置检查流程

### Step 0a: 检测并加载凭据

```bash
if [ -f ~/.env ]; then set -a; source ~/.env; set +a; fi

if [[ -n "${TFS_USER:-}" && -n "${TFS_PASSWORD:-}" ]]; then
  echo "✅ TFS 凭据已配置 (${TFS_USER})"
else
  echo "❌ TFS 凭据未配置"
  echo "请回复：TFS_USER=用户名 TFS_PASSWORD=密码"
fi
```

### Step 0b: 检测 Node.js 环境

```bash
node --version || echo "❌ 请安装 Node.js"
npm list axios-ntlm 2>/dev/null || npm install axios-ntlm --save-dev
```

### Step 0c: 获取构建定义列表

```bash
# 获取构建定义
for repo in AppCCGR AppXNZQ_SDK AppHBZQ; do
  echo "=== ${repo} ==="
  node /tmp/tfs-definitions.js "http://192.168.40.200:8080" "OpenSDK" "$repo" "${TFS_USER}" "${TFS_PASSWORD}"
done
```

---

## 📦 打包配置

### Step 1: 输出配置提示

```
═════════════════════════════════════════════════════════════════
📦 APK 打包配置
═════════════════════════════════════════════════════════════════

请回复以下信息：

工程=AppCCGR        # 必填：AppCCGR / AppXNZQ_SDK / AppHBZQ
分支=成长层新框架   # 必填：App 工程的分支名
类型=Appbeta        # 必填：Appbeta 或 AppRelease 或 两者都更新
定义ID=403          # 必填：TFS 构建定义 ID

💡 定义ID获取方式：
   打开 TFS 构建页面，URL 如：
   http://192.168.40.200:8080/tfs/OpenSDK/AppCCGR/_build?definitionId=403
   其中 definitionId=403 就是构建定义ID

═════════════════════════════════════════════════════════════════
📋 可选工程、分支及构建定义：
═════════════════════════════════════════════════════════════════

【AppCCGR】
  分支列表：安全认证、安全认证-无越狱检测、股转北交所、国密、注册制、成长层新框架
  构建定义：
    • 长城国瑞_Android_Beta (ID: 403)
    • 长城国瑞_Android_Release (ID: 404)
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
    • 华宝证券_Android_Beta (ID: 125)
    • 华宝证券_Android_Release (ID: 126)

═════════════════════════════════════════════════════════════════
```

### Step 2: 输入模块版本

用户回复打包配置后，询问要更新的模块版本：

```
═════════════════════════════════════════════════════════════════
📦 请输入要更新的 AAR 模块和版本号
═════════════════════════════════════════════════════════════════

格式：模块=xxx 版本=xxx

示例：
模块=tdxtoolutil 版本=2.18.0-2604071655
模块=tdxjyframingmodule 版本=2.18.0-2604071656

多个模块请分行输入，输入 "完成" 结束

═════════════════════════════════════════════════════════════════
```

---

## 🔧 执行步骤

### Step 3: 克隆 App 工程

```bash
source ~/.env

git clone --single-branch --branch "${APP_BRANCH}" \
  "http://${TFS_USER}:${TFS_PASSWORD}@192.168.40.200:8080/tfs/OpenSDK/_git/${APP_REPO}" \
  /tmp/${APP_REPO}

cd /tmp/${APP_REPO}
git config core.quotepath false
git config i18n.commitencoding utf-8
```

### Step 4: 更新 build.gradle

**build.gradle 路径：** `AppAndroid/${BUILD_TYPE}/app/build.gradle`

**依赖格式：**
```groovy
compile(group: 'tdx.android.aar', name: 'tdxCore_master_2025', version: '2.14-2508201123', ext: 'aar', changing: true)
```

**更新逻辑：**
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

### Step 5: Git 提交推送

```bash
git add AppAndroid/${BUILD_TYPE}/app/build.gradle
git commit -m "更新 ${MODULES} AAR 版本"
git push
```

### Step 6: 触发 TFS 构建

**使用 Node.js + axios-ntlm 触发构建：**

```bash
# 创建构建脚本
cat > /tmp/tfs-build.js << 'EOF'
const { NtlmClient } = require('axios-ntlm');

const TFS_URL = process.argv[2];
const COLLECTION = process.argv[3];
const PROJECT = process.argv[4];
const USERNAME = process.argv[5];
const PASSWORD = process.argv[6];
const DEFINITION_ID = parseInt(process.argv[7]);
const BRANCH = process.argv[8];

let domain = '', username = USERNAME;
if (USERNAME.includes('\\')) { [domain, username] = USERNAME.split('\\'); }

const ntlmClient = NtlmClient({ username, password: PASSWORD, domain, workstation: '' });

const buildRequest = {
  definition: { id: DEFINITION_ID },
  sourceBranch: BRANCH.startsWith('refs/heads/') ? BRANCH : `refs/heads/${BRANCH}`
};

const urls = [
  `${TFS_URL}/tfs/${COLLECTION}/${PROJECT}/_apis/build/builds?api-version=2.0`,
  `${TFS_URL}/tfs/DefaultCollection/${PROJECT}/_apis/build/builds?api-version=2.0`,
];

async function triggerBuild() {
  console.log(`触发构建: ${PROJECT}, 分支: ${BRANCH}, 定义ID: ${DEFINITION_ID}`);
  for (const url of urls) {
    try {
      const res = await ntlmClient.post(url, buildRequest);
      console.log(`✅ 成功!`);
      console.log(`构建ID: ${res.data.id}`);
      console.log(`构建号: ${res.data.buildNumber}`);
      console.log(`分支: ${res.data.sourceBranch}`);
      console.log(`---SUCCESS---`);
      return;
    } catch (e) {
      console.log(`失败: ${e.response?.status || e.message}`);
    }
  }
  console.log(`---FAILED---`);
}

triggerBuild().catch(e => console.error(e));
EOF

# 执行构建
source ~/.env
node /tmp/tfs-build.js \
  "http://192.168.40.200:8080" \
  "OpenSDK" \
  "${APP_REPO}" \
  "${TFS_USER}" \
  "${TFS_PASSWORD}" \
  "${DEFINITION_ID}" \
  "${APP_BRANCH}"
```

### Step 7: 监控构建状态（带弹框）

**使用 tfs-poll.js 监控：**

```bash
# 使用技能目录中的监控脚本
cd ~/.agents/skills/tdx-publish
node tfs-poll.js \
  "http://192.168.40.200:8080" \
  "OpenSDK" \
  "${APP_REPO}" \
  "${TFS_USER}" \
  "${TFS_PASSWORD}" \
  "${BUILD_ID}" \
  30000
```

**监控脚本功能：**
- 每 30 秒轮询构建状态
- 构建完成后系统弹框提示
- 成功/失败播放不同提示音

---

## 📋 执行流程图

```
/tdx-pack
    │
    ▼
┌─────────────────────────────────────────┐
│  Step 0: 前置检查                        │
│  • 检测凭据（TFS_USER/PASSWORD）         │
│  • 检测 Node.js 环境                     │
│  • 获取构建定义列表                      │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│  Step 1-2: 收集配置                      │
│  • 打包配置（工程、分支、类型、定义ID）  │
│  • 模块版本（模块名=版本号）             │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│  Step 3-5: 更新工程                      │
│  • 克隆 App 工程（指定分支）             │
│  • 更新 build.gradle 中的 AAR 版本       │
│  • Git 提交推送                          │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│  Step 6-7: 触发并监控构建                │
│  • Node.js + axios-ntlm 触发构建         │
│  • 轮询构建状态                          │
│  • 完成后弹框提示                        │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│  ✅ 完成！                               │
│  • build.gradle 已更新并提交             │
│  • TFS 构建已完成                        │
│  • APK 下载链接已返回                    │
└─────────────────────────────────────────┘
```

---

## 🔗 相关技能

| 技能 | 功能 |
|------|------|
| `/tdx-publish` | 发布 AAR（可选 --pack 打包） |
| `/tdx-pack` | 仅打包（AAR 已发布的情况下使用） |

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
| AppHBZQ | 华宝证券_Android_Beta | 125 | Android |
| AppHBZQ | 华宝证券_Android_Release | 126 | Android |

---

> **更新日期**: 2026-04-08
> **类型**: prompt（纯 Skill）