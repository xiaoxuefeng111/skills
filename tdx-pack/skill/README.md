# tdx-pack Skill

> APK 打包自动化 - 无需发布 AAR，直接打包

## 功能

- ✅ 更新 build.gradle 中的 AAR 版本号
- ✅ 触发 TFS 构建打包 APK
- ✅ 构建监控 + 系统弹框提示
- ✅ 支持 AppCCGR / AppXNZQ_SDK / AppHBZQ

## 与 `/tdx-publish --pack` 的区别

| 技能 | 功能 | 适用场景 |
|------|------|----------|
| `/tdx-publish --pack` | 发布 AAR → 更新版本号 → 打包 | 需要发布新 AAR |
| `/tdx-pack` | 更新版本号 → 打包 | AAR 已发布，只需打包 |

## 快速开始

```
/tdx-pack
```

然后输入配置：
```
工程=AppCCGR
分支=成长层新框架
类型=Appbeta
定义ID=403
模块=tdxtoolutil 版本=2.18.0-2604071655
模块=tdxjyframingmodule 版本=2.18.0-2604071656
```

## 参数说明

| 参数 | 必填 | 说明 |
|------|------|------|
| 工程 | ✅ | AppCCGR / AppXNZQ_SDK / AppHBZQ |
| 分支 | ✅ | App 工程的分支名 |
| 类型 | ✅ | Appbeta / AppRelease / 两者都更新 |
| 定义ID | ✅ | TFS 构建定义 ID |
| 模块 | ✅ | AAR 模块名 |
| 版本 | ✅ | AAR 版本号 |

## 构建定义 ID 获取

打开 TFS 构建页面，URL 格式：
```
http://192.168.40.200:8080/tfs/OpenSDK/AppCCGR/_build?definitionId=403
```
其中 `definitionId=403` 就是构建定义 ID。

## 文件清单

| 文件 | 说明 |
|------|------|
| `SKILL.md` | 完整技能定义 |
| `README.md` | 本说明文件 |

## 环境要求

- Git
- Node.js + npm
- TFS 凭据（首次使用会提示输入）

## 详细文档

见 [SKILL.md](./SKILL.md)

---

> 更新日期: 2026-04-08