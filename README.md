# Skills 技能仓库

SpectrAI / Claude Code 技能集合。

## 技能列表

### appium-flow-audit

Appium 自动化流程审核与脚本生成技能。

**功能：**
- 双模式生成：自动生成 + 手动生成
- 智能匹配定位器
- 定位器验证
- Fallback 坐标定位
- PopupWindow 兼容

**安装：**
```bash
npx skills add https://github.com/xiaoxuefeng111/skills --skill appium-flow-audit
```

**使用：**
- `录制脚本`
- `采集页面`
- `生成脚本`
- `流程审核`

---

### tdx-publish

AAR 发布自动化技能。更新 FlutterBuild 仓库模板，触发 Jenkins 构建。

**功能：**
- 更新 FlutterBuild 仓库模板文件
- 触发 Jenkins 构建
- 提取 APK 下载链接
- 前置检查自动执行，凭据缺失时交互询问

**安装：**
```bash
npx skills add https://github.com/xiaoxuefeng111/skills --skill tdx-publish
```

**使用：**
```
/tdx-publish CCGR-native-beta.txt tdxCore master abc123def
```

或自然语言：
```
"发布 CCGR-native-beta.txt 的 tdxCore，master 分支，commit abc123"
```

**凭据：**
| 凭据 | 说明 |
|------|------|
| `TFS_GIT_TOKEN` | TFS Git PAT Token |
| `JENKINS_USER` | Jenkins 用户名 |
| `JENKINS_TOKEN` | Jenkins API Token |

详细文档见 [skill/SKILL.md](./skill/SKILL.md)

---

## 添加新技能

1. 在根目录创建技能文件夹
2. 添加 `SKILL.md` 文件
3. 更新本 README.md 的技能列表

## 许可证

MIT