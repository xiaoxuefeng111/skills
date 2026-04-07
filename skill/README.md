# tdx-publish Skill

> AAR 发布自动化 - SpectrAI 标准 Skill

## 简介

实现 QS_Android / TdxFlutter 模块发布自动化。AI 直接调用工具执行，无需外部脚本。

## 安装

```bash
npx skills add https://github.com/your-org/tdx-publish-skill --skill tdx-publish
```

## 使用

```
/tdx-publish CCGR-native-beta.txt tdxCore master abc123def
```

或自然语言：

```
"发布 CCGR-native-beta.txt 的 tdxCore，master 分支，commit abc123"
```

## 文件清单

| 文件 | 说明 |
|------|------|
| `SKILL.md` | Skill 定义（完整流程、参数、错误处理） |
| `skill-config.json` | SpectrAI 安装配置 |
| `README.md` | 本说明文件 |

## 详细文档

见 [SKILL.md](./SKILL.md)

---

> 更新日期: 2026-04-07
> 类型: prompt（标准 Skill）