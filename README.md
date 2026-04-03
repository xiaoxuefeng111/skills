# Appium Flow Audit

Appium 自动化流程审核与脚本生成技能。

## 功能特性

- **双模式生成**：自动生成（步骤列表）+ 手动生成（交互式录制）
- **智能匹配**：根据描述自动匹配最佳定位器
- **定位器验证**：推荐前验证定位器有效性
- **Fallback 机制**：主定位器失败时使用坐标定位
- **PopupWindow 兼容**：智能检测和增强等待

## 安装

```bash
npx skills add your-username/your-repo@appium-flow-audit
```

## 使用

触发关键词：
- "录制脚本"
- "采集页面"
- "生成脚本"
- "流程审核"

## 前置条件

1. Appium Server 运行在 `127.0.0.1:4723`
2. 设备已连接并开启 USB 调试
3. 目标 App 已打开

## 目录结构

```
appium-flow-audit/
├── SKILL.md              # 技能定义
├── 使用指南.md           # 使用说明
├── scripts/
│   ├── element-matcher.js    # 智能匹配模块
│   ├── step-parser.js        # 步骤解析模块
│   ├── locator-validator.js  # 定位器验证模块
│   ├── dependency-check.js   # 依赖检查模块
│   ├── smart-wait.js         # 智能等待模块
│   ├── capture-page.js       # 页面采集
│   ├── record-flow.js        # 录制流程
│   └── generate-script.js    # 脚本生成
├── templates/
│   └── driver.template.js    # 驱动模块模板
└── docs/
    └── 2026-04-03-optimize-design.md
```

## 版本历史

### v2.1
- 新增自动生成模式
- 新增智能匹配模块
- 新增定位器验证
- 新增 PopupWindow 兼容
- 改进交互体验

## License

MIT