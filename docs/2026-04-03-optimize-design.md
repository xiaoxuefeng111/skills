# Appium Flow Audit 技能优化设计

**版本**: v2.1
**日期**: 2026-04-03
**目标**: 好用 + 准确 + 轻量

---

## 一、优化目标

### 核心目标

| 优先级 | 目标 | 说明 |
|--------|------|------|
| P0 | 好用 | 快速生成脚本，减少用户操作步骤 |
| P0 | 准确 | 定位器稳定可靠，有验证有兜底 |
| P1 | 轻量 | 不引入额外依赖，模块化但不过度 |

### 解决的核心痛点

1. **选择范围大** → 智能匹配，减少候选数量
2. **定位器无验证** → 推荐前先验证有效性
3. **PopupWindow 采集失败** → 增强等待 + fallback 坐标
4. **生成的脚本无法运行** → 提供 driver.js 模板

---

## 二、核心交互原则

### ⚠️ 所有交互必须支持手动输入

**原则：智能匹配只是推荐，用户始终可以自定义输入。**

| 要求 | 说明 |
|------|------|
| 每个交互都有输入框 | 不能只给预设选项，必须有 "Other" 或输入框 |
| 智能匹配作为推荐 | 推荐选项展示在前面，但不是唯一选择 |
| 不单独设"手动输入"按钮 | 手动输入是每个交互的默认能力，不需要额外按钮 |
| 用户输入优先 | 用户自定义输入的内容，优先于智能推荐 |

**交互模板示例：**

```
┌─────────────────────────────────────────────────────┐
│  请选择目标元素，或输入自定义描述：                     │
│                                                     │
│  [智能推荐]                                          │
│  [1] 卖出 ⭐⭐⭐ 高稳定性                              │
│  [2] 买入 ⭐⭐ 中稳定性                               │
│  [3] 撤单 ⭐⭐ 中稳定性                               │
│                                                     │
│  Other: [用户可在此输入自定义描述]                    │
│  提示：如"点击持仓列表第一行的平安银行"                 │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**AskUserQuestion 调用规范：**

```javascript
// 正确的调用方式
AskUserQuestion({
  questions: [{
    question: "请选择目标元素，或输入自定义描述（如：点击持仓列表第一行）",
    options: [
      { label: "卖出", description: "稳定性: ⭐⭐⭐ 高" },
      { label: "买入", description: "稳定性: ⭐⭐ 中" },
      { label: "撤单", description: "稳定性: ⭐⭐ 中" }
    ]
    // 注意：不需要单独添加"手动输入"选项
    // AskUserQuestion 工具本身会自动提供 "Other" 输入入口
  }]
});
```

**错误示例（不要这样设计）：**

```
❌ 错误：把手动输入做成一个单独按钮选项
[1] 卖出
[2] 买入
[3] 撤单
[4] 手动输入  ← 这是错误设计

✅ 正确：每个交互都自带输入能力
[1] 卖出
[2] 买入
[3] 撤单
Other: [输入框] ← 这是正确设计
```

---

## 三、整体流程设计

### 优化后流程

```
1. 用户打开目标页面
2. 用户描述下一步操作（如"点击卖出"）
3. 智能匹配：
   - 搜索包含关键词的元素
   - 按 stability 排序
   - 自动验证定位器有效性
   - 显示位置信息区分相同元素
4. 用户快速确认推荐（只看 1-3 个候选）
5. 用户在手机上执行操作
6. 采集验证（含 PopupWindow 兼容）：
   - 原生采集成功 → 继续
   - 采集失败 → 坐标 fallback
7. 循环 2-6 直到完成
8. 生成可运行的脚本（含 fallback 定位器）
```

---

## 三、生成模式设计

### 两种生成模式

技能触发后，首先让用户选择模式：

| 模式 | 适用场景 | 特点 |
|------|----------|------|
| **自动生成** | 步骤明确，快速生成 | 用户提供步骤列表，一键完成 |
| **手动生成** | 需精确控制，交互确认 | 现有逻辑，逐步确认 |

### 模式选择交互

```
请选择脚本生成模式：

  [1] 自动生成 (Recommended) - 提供步骤列表，一键生成脚本
  [2] 手动生成 - 交互式录制，逐步确认每个操作

Other: [可输入自定义描述]
```

### 自动生成流程

**用户输入示例**：

```
1. 启动应用 com.tdx.AndroidtdxOem 入口activity是com.tdx.Android.TdxAndroidActivity
2. 切换到交易 Tab
3. 点击卖出按钮
4. 输入账号 010000035265
5. 输入密码 123321
6. 点击最下面的交易登录，背景是红色的
7. 界面上会有输入股票4个字，点击一下
8. 输入股票代码 508033
9. 输入卖出数量 100
10. 点击卖出按钮
11. 点击确认卖出按钮
12. 点击我知道了
13. 完成
```

**执行流程**：

```
用户输入步骤列表
       ↓
解析步骤（提取动作 + 目标 + 参数）
       ↓
┌─────────────────────────────────────┐
│ 循环执行每个步骤：                     │
│   1. 采集当前页面元素                  │
│   2. 智能匹配目标元素                  │
│   3. 执行操作（点击/输入）              │
│   4. 记录定位器和坐标                  │
│   5. 等待页面稳定                      │
└─────────────────────────────────────┘
       ↓
生成完整脚本（含 fallback）
```

**自动匹配策略**：

| 操作类型 | 匹配方式 | 参数提取 |
|----------|----------|----------|
| 启动应用 | 启动 Activity | 包名、Activity |
| 点击 xxx | 匹配 text/content-desc | - |
| 输入 xxx N | 匹配输入框 + 输入值 | 输入值 N |
| 切换到 xxx Tab | 匹配 Tab 文本 | - |
| 完成 | 结束录制 | - |

---

## 四、模块设计

### 3.1 智能匹配模块 (element-matcher.js)

**职责**: 用户描述 → 匹配候选元素 → 排序 → 输出推荐

**匹配规则**:

| 步骤 | 处理方式 |
|------|----------|
| 关键词提取 | 从描述中提取动作 + 目标（"点击" + "卖出"） |
| 元素搜索 | 搜索 text/content-desc/hint 包含关键词的元素 |
| 稳定性排序 | resource-id(10分) > content-desc(7分) > text(4分) |
| 位置描述 | 解析 bounds，转换为位置描述 |

**位置描述规则**:
- y > 900 → "屏幕底部"
- y < 200 → "屏幕顶部"
- x < 200 → "屏幕左侧"
- x > 700 → "屏幕右侧"
- 其他 → "屏幕中部"

**输出格式**:
```
智能匹配结果：

  [1] 卖出按钮 ✓已验证
      定位器: //*[@resource-id="btn_sell"]
      稳定性: ⭐⭐⭐ 高
      位置: 屏幕右下角

  [2] 卖出 ✓已验证
      定位器: //*[@content-desc="卖出"]
      稳定性: ⭐⭐ 中
      位置: 屏幕底部

  [m] 更多匹配结果
  [c] 手动输入定位器
  [s] 截图标记坐标
```

### 3.2 定位器验证模块 (locator-validator.js)

**职责**: 验证定位器能否实际找到元素

**验证参数**:
- 超时时间: 2000ms
- 验证方式: waitForExist
- 并行验证 top 3 候选

**验证结果**:
- ✓ 已验证 → 优先推荐
- ✗ 验证失败 → 仍展示，标注风险

### 3.3 依赖检查模块 (dependency-check.js)

**检查流程**:

```
Step 1: 检查 Node.js/npm
  - 不存在 → 提示下载安装

Step 2: 检查 webdriverio 模块
  - 不存在 → 引导 npm install

Step 3: 检查 Appium Server
  - 未运行 → 提示安装/启动命令

Step 4: 检查设备连接
  - 无设备 → 提示连接步骤

Step 5: 检查/创建内部文件
  - driver.js → 自动复制
  - appium.config.js → 提示配置
```

### 3.4 PopupWindow 兼容 (smart-wait.js 改进)

**检测条件**:
- 元素数量突变 > 10
- 采集成功率 < 50%

**增强参数**:
- 超时: 8秒 (普通 3秒)
- 重试: 5次 (普通 3次)
- 间隔: 800ms (普通 500ms)

**Fallback 策略**:
- 采集失败 → 记录坐标作为 fallback
- 生成的脚本包含双重定位策略

### 3.5 驱动模块模板 (driver.template.js)

**内容**:
- createDriver(): 创建 Appium 连接
- waitForElement(): 等待元素出现
- takeScreenshot(): 截图
- quitDriver(): 关闭连接

**首次使用时自动复制到用户测试目录。**

---

## 四、脚本生成改进

### 4.1 操作方法含 Fallback

```javascript
async clickSell() {
  const primaryLocator = '//*[@resource-id="btn_sell"]';
  const fallbackCoords = { x: 720, y: 960 };

  try {
    const element = await driverFactory.waitForElement(primaryLocator, 5000);
    await element.click();
  } catch (e) {
    console.log('主定位器失败，使用坐标 fallback');
    await driverFactory.driver.touchAction({
      action: 'tap',
      x: fallbackCoords.x,
      y: fallbackCoords.y
    });
  }
}
```

### 4.2 添加断言逻辑

```javascript
async verifySellResult() {
  const successLocator = '//*[contains(@text, "成功")]';
  try {
    const element = await driverFactory.waitForElement(successLocator, 3000);
    return await element.isDisplayed();
  } catch (e) {
    return false;
  }
}
```

---

## 五、文件结构

```
skill/appium-flow-audit/
├── SKILL.md                      # 更新执行流程
├── 使用指南.md                   # 更新安装步骤
├── scripts/
│   ├── record-flow.js          # 核心：智能匹配 + 录制流程
│   ├── capture-page.js         # 采集 + 智能匹配
│   ├── generate-script.js      # 生成带 fallback 的脚本
│   ├── analyze-flow.js         # 流程审核
│   ├── smart-wait.js           # 智能等待 + PopupWindow 检测
│   ├── element-matcher.js      # 智能匹配模块
│   ├── locator-validator.js    # 定位器验证模块
│   └── dependency-check.js     # 依赖检查
└── templates/
    └── driver.template.js      # 驱动模块模板
```

---

## 六、改动清单

| 序号 | 文件 | 改动类型 | 内容 |
|------|------|----------|------|
| 1 | element-matcher.js | 新增 | 智能匹配模块 |
| 2 | locator-validator.js | 新增 | 定位器验证模块 |
| 3 | dependency-check.js | 新增 | 依赖检查模块 |
| 4 | driver.template.js | 新增 | 驱动模块模板 |
| 5 | smart-wait.js | 改进 | 增强 PopupWindow 检测参数 |
| 6 | capture-page.js | 改进 | 集成智能匹配输出 |
| 7 | record-flow.js | 重构 | 新录制流程 + 依赖检查 + 智能匹配 |
| 8 | generate-script.js | 改进 | 生成带 fallback 的脚本 |
| 9 | SKILL.md | 更新 | 执行流程定义 |
| 10 | 使用指南.md | 更新 | 简化安装步骤 |

---

## 七、约束条件

### 外部依赖（用户环境必须提供）

- Node.js + npm
- Appium Server 运行中
- Android 设备已连接
- 目标 App 已打开
- webdriverio 模块

### 内部依赖（技能提供）

- driver.template.js
- 所有 scripts 模块

### 不引入的依赖

- 不引入 OCR 库
- 不引入 TypeScript
- 不引入额外 npm 包
- 只依赖 webdriverio