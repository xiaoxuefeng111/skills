# tdx-publish Skill

> AAR 发布 + APK 打包自动化技能

## 功能

- ✅ AAR 发布到 Artifactory Maven 仓库
- ✅ APK 打包到指定 App 工程
- ✅ 支持 QS_Android / TDX_Android / TdxFlutter 模板
- ✅ 多模块批量发布
- ✅ TFS 构建监控 + 系统弹框提示

## 快速开始

### 仅发布 AAR

```
/tdx-publish CCGR-native-beta.txt tdxCore master abc123 2.18.0
```

### AAR + APK 打包

```
/tdx-publish --pack CCGR-native-beta.txt tdxCore master abc123 2.18.0
```

打包时需确认：
```
工程=AppCCGR
分支=成长层新框架
类型=Appbeta
定义ID=403
```

### 多模块发布

```
/tdx-publish --pack CCGR-native-beta.txt \
   tdxtoolutil master eb00aa81 2.18.0 \
   tdxjyframingmodule master_ccgr d63dff46 2.18.0
```

## 参数说明

| 参数 | 必填 | 说明 |
|------|------|------|
| `--pack` | 否 | AAR 发布后自动打包 APK |
| 模板文件 | ✅ | FlutterBuild 仓库中的 txt 文件 |
| 模块 | ✅ | tdxCore, tdxtoolutil 等 |
| 分支 | ✅ | Git 分支名 |
| commit | ✅ | Commit hash（至少7位） |
| 版本 | ✅ | AAR 版本号 |

## 文件清单

| 文件 | 说明 |
|------|------|
| `SKILL.md` | 完整技能定义 |
| `skill-config.json` | SpectrAI 安装配置 |
| `tfs-poll.js` | TFS 构建监控脚本（弹框提示） |
| `README.md` | 本说明文件 |

## 环境要求

- Git
- Node.js + npm（`--pack` 打包必需）
- TFS 凭据（首次使用会提示输入）

## 详细文档

见 [SKILL.md](./SKILL.md)

---

> 更新日期: 2026-04-08
