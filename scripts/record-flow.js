/**
 * 交互式测试脚本录制器
 * 引导用户一步步操作，采集真实元素，生成准确的测试脚本
 *
 * v2.1 新增功能：
 * - 智能匹配：用户描述操作 → 自动匹配候选元素 → 快速确认
 * - 定位器验证：推荐前验证定位器有效性
 * - 依赖检查：自动检查环境依赖
 * - Fallback 坐标：主定位器失败时使用坐标定位
 * - PopupWindow 增强：智能等待 + 多次重试
 *
 * 用法: node record-flow.js <页面名称> [测试目录路径]
 * 示例: node record-flow.js sell
 *       node record-flow.js sell /path/to/appium-tests
 */
const { remote } = require('webdriverio');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const SmartWait = require('./smart-wait');
const ElementMatcher = require('./element-matcher');
const LocatorValidator = require('./locator-validator');
const DependencyChecker = require('./dependency-check');

// 从命令行获取页面名称和测试目录
const pageName = process.argv[2] || 'recorded';
const appiumTestsDir = process.argv[3] || process.env.APPIUM_TESTS_DIR || './appium-tests';

// 输出目录 - 输出到测试目录下
const OUTPUT_DIR = path.resolve(appiumTestsDir, 'recorded-flows');
const APPIUM_TESTS_DIR = path.resolve(appiumTestsDir);

// 从环境变量获取 ADB 路径
function getAdbPath() {
  const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (androidHome) {
    return path.join(androidHome, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
  }
  return 'adb'; // 回退到 PATH 中的 adb
}

// 配置 - 从配置文件读取
let config;
try {
  const configPath = path.resolve(APPIUM_TESTS_DIR, 'config/appium.config.js');
  config = require(configPath);
} catch (e) {
  console.error('错误: 无法加载配置文件，请确保 appium-tests/config/appium.config.js 存在');
  console.error(`尝试路径: ${path.resolve(APPIUM_TESTS_DIR, 'config/appium.config.js')}`);
  process.exit(1);
}

const CONFIG = {
  appPackage: config.android['appium:appPackage'],
  appActivity: config.android['appium:appActivity'],
  appiumHost: config.server?.hostname || 'localhost',
  appiumPort: config.server?.port || 4723,
  adbPath: getAdbPath()
};

// 创建 readline 接口
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// 提问函数
function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

/**
 * 页面快照结构
 */
class PageSnapshot {
  constructor(stepIndex, driver) {
    this.stepIndex = stepIndex;
    this.driver = driver;
    this.timestamp = Date.now();
    this.source = null;
    this.screenshot = null;
    this.elements = {
      editText: [],
      button: [],
      textView: [],
      clickable: [],
      all: []
    };
    this.userAction = ''; // 用户描述的操作
    this.targetElement = null; // 用户操作的目标元素
  }

  /**
   * 解析 XML 节点属性
   */
  parseNodeAttributes(nodeString) {
    const result = {};
    const patterns = {
      text: /text="([^"]*)"/,
      resourceId: /resource-id="([^"]*)"/,
      class: /class="([^"]*)"/,
      contentDesc: /content-desc="([^"]*)"/,
      clickable: /clickable="([^"]*)"/,
      enabled: /enabled="([^"]*)"/,
      focusable: /focusable="([^"]*)"/,
      bounds: /bounds="([^"]*)"/,
      hint: /hint="([^"]*)"/,
      checked: /checked="([^"]*)"/
    };

    for (const [key, pattern] of Object.entries(patterns)) {
      const match = nodeString.match(pattern);
      if (match) {
        result[key] = match[1];
      }
    }
    return result;
  }

  /**
   * 采集页面数据（支持重试）
   * @param {Object} options - 采集选项
   * @param {number} options.maxRetries - 最大重试次数
   */
  async capture(options = {}) {
    const { maxRetries = 3 } = options;

    console.log('  采集页面源码...');
    this.source = await this.driver.getPageSource();

    console.log('  采集截图...');
    this.screenshot = await this.driver.takeScreenshot();

    // 重试采集元素
    console.log('  解析页面元素（重试模式）...');
    const allElements = [];

    for (let i = 0; i < maxRetries; i++) {
      if (maxRetries > 1) {
        console.log(`    尝试 ${i + 1}/${maxRetries}...`);
      }

      const source = i === 0 ? this.source : await this.driver.getPageSource();
      const elements = this.parseElements(source);
      allElements.push(elements);

      if (i < maxRetries - 1) {
        await this.driver.pause(300);
      }
    }

    // 合并多次采集结果
    this.elements = this.mergeElements(allElements);
    console.log(`  发现 ${this.elements.all.length} 个元素`);
    return this;
  }

  /**
   * 解析页面元素
   */
  parseElements(source) {
    const elements = {
      editText: [],
      button: [],
      textView: [],
      clickable: [],
      all: []
    };

    const nodePattern = /<node[^>]*>/g;
    const matches = source.match(nodePattern) || [];

    matches.forEach((nodeString) => {
      const attrs = this.parseNodeAttributes(nodeString);
      elements.all.push(attrs);

      if (attrs.class === 'android.widget.EditText') {
        elements.editText.push(attrs);
      } else if (attrs.class === 'android.widget.Button') {
        elements.button.push(attrs);
      } else if (attrs.class === 'android.widget.TextView') {
        elements.textView.push(attrs);
      }

      if (attrs.clickable === 'true') {
        elements.clickable.push(attrs);
      }
    });

    return elements;
  }

  /**
   * 合并多次采集的元素（去重）
   */
  mergeElements(allElements) {
    const merged = {
      editText: [],
      button: [],
      textView: [],
      clickable: [],
      all: []
    };

    const seen = new Set();

    allElements.forEach(elements => {
      elements.all.forEach(elem => {
        const key = elem.resourceId || elem.contentDesc || elem.text || elem.bounds;
        if (!seen.has(key)) {
          seen.add(key);
          merged.all.push(elem);

          if (elem.class === 'android.widget.EditText') merged.editText.push(elem);
          else if (elem.class === 'android.widget.Button') merged.button.push(elem);
          else if (elem.class === 'android.widget.TextView') merged.textView.push(elem);
          if (elem.clickable === 'true') merged.clickable.push(elem);
        }
      });
    });

    return merged;
  }

  /**
   * 获取元素的推荐定位器
   */
  getRecommendedLocator(attrs) {
    if (attrs.resourceId) {
      return {
        type: 'resource-id',
        value: attrs.resourceId,
        xpath: `//*[@resource-id="${attrs.resourceId}"]`,
        stability: 'high'
      };
    }
    if (attrs.contentDesc) {
      return {
        type: 'content-desc',
        value: attrs.contentDesc,
        xpath: `//*[@content-desc="${attrs.contentDesc}"]`,
        stability: 'medium'
      };
    }
    if (attrs.hint) {
      return {
        type: 'hint',
        value: attrs.hint,
        xpath: `//*[@hint="${attrs.hint}"]`,
        stability: 'medium'
      };
    }
    if (attrs.text) {
      return {
        type: 'text',
        value: attrs.text,
        xpath: `//*[@text="${attrs.text}"]`,
        stability: 'low'
      };
    }
    return {
      type: 'class',
      value: attrs.class,
      xpath: `//*[@class="${attrs.class}"]`,
      stability: 'low'
    };
  }

  /**
   * 打印元素摘要
   */
  printSummary() {
    console.log('\n  === 元素摘要 ===');
    console.log(`  输入框: ${this.elements.editText.length} 个`);
    this.elements.editText.slice(0, 3).forEach(e => {
      const locator = this.getRecommendedLocator(e);
      console.log(`    - ${e.hint || e.text || '(无提示)'} [${locator.type}]`);
    });

    console.log(`  可点击元素: ${this.elements.clickable.length} 个`);
    this.elements.clickable.slice(0, 5).forEach(e => {
      if (e.text || e.contentDesc) {
        console.log(`    - ${e.text || e.contentDesc}`);
      }
    });
  }
}

/**
 * 录制会话
 */
class RecordingSession {
  constructor() {
    this.snapshots = [];
    this.pageName = pageName;
    this.driver = null;
    this.stepIndex = 0;
  }

  /**
   * 启动录制
   */
  async start() {
    console.log('\n========================================');
    console.log('  交互式测试脚本录制器');
    console.log('========================================\n');
    console.log(`页面名称: ${this.pageName}\n`);

    // 连接设备
    console.log('[启动] 连接设备...');
    this.driver = await remote({
      hostname: CONFIG.appiumHost,
      port: CONFIG.appiumPort,
      capabilities: {
        platformName: 'Android',
        'appium:automationName': 'UiAutomator2',
        'appium:deviceName': 'Android',
        'appium:appPackage': CONFIG.appPackage,
        'appium:appActivity': CONFIG.appActivity,
        'appium:noReset': true,
      }
    });

    await this.driver.pause(2000);
    console.log('✓ 设备连接成功\n');

    // 采集初始状态
    await this.captureStep('初始状态');

    // 开始交互式录制
    await this.recordingLoop();
  }

  /**
   * 采集当前步骤（含智能等待）
   */
  async captureStep(actionDescription, previousSource = null) {
    this.stepIndex++;
    console.log(`\n[步骤 ${this.stepIndex}] 采集页面...`);

    // 智能等待页面稳定
    if (previousSource) {
      console.log('  等待页面稳定...');
      const smartWait = new SmartWait(this.driver);
      const waitResult = await smartWait.smartWait(previousSource, { detectPopup: true });
      if (waitResult.isPopup) {
        console.log('  检测到 PopupWindow，已延长等待时间');
      }
    }

    const snapshot = new PageSnapshot(this.stepIndex, this.driver);
    snapshot.userAction = actionDescription;
    snapshot.previousSource = previousSource;
    await snapshot.capture({ maxRetries: 3 });

    // 用户确认采集结果
    const confirmed = await this.confirmCaptureResult(snapshot);

    if (confirmed.action === 'retry') {
      // 重新采集
      console.log('  重新采集...');
      return this.captureStep(actionDescription, previousSource);
    } else if (confirmed.action === 'skip') {
      // 跳过此步骤
      return null;
    }

    snapshot.printSummary();
    this.snapshots.push(snapshot);
    return snapshot;
  }

  /**
   * 用户确认采集结果
   */
  async confirmCaptureResult(snapshot) {
    console.log('\n  ═══════════════════════════════════');
    console.log('  采集结果');
    console.log('  ═══════════════════════════════════\n');

    // 显示输入框
    if (snapshot.elements.editText.length > 0) {
      console.log('  [输入框]');
      snapshot.elements.editText.slice(0, 5).forEach((e, i) => {
        const label = e.hint || e.text || `输入框${i + 1}`;
        console.log(`    ${i + 1}. ${label}`);
      });
    }

    // 显示可点击元素
    const clickables = snapshot.elements.clickable.filter(e => e.text || e.contentDesc);
    if (clickables.length > 0) {
      console.log('\n  [可点击元素]');
      clickables.slice(0, 8).forEach((e, i) => {
        console.log(`    ${i + 1}. ${e.text || e.contentDesc}`);
      });
    }

    console.log(`\n  共发现 ${snapshot.elements.all.length} 个元素`);

    console.log('\n  ───────────────────────────────────');
    console.log('  是否看到你刚才操作的元素？');
    console.log('  ───────────────────────────────────');
    console.log('  [y] 是，选择元素继续');
    console.log('  [r] 否，重新采集');
    console.log('  [m] 手动输入定位器');
    console.log('  [s] 跳过此步骤');
    console.log('  ───────────────────────────────────');

    const choice = await question('  请选择: ');

    switch (choice.toLowerCase()) {
      case 'y':
        return { confirmed: true, action: 'select' };
      case 'r':
        return { confirmed: false, action: 'retry' };
      case 'm':
        const customLocator = await question('  请输入 XPath 定位器: ');
        snapshot.customLocator = customLocator;
        return { confirmed: true, action: 'manual', locator: customLocator };
      case 's':
        return { confirmed: true, action: 'skip' };
      default:
        console.log('  无效选择，默认为确认');
        return { confirmed: true, action: 'select' };
    }
  }

  /**
   * 智能匹配目标元素（v2.1 新增）
   * 根据用户描述智能匹配候选元素
   */
  async smartMatchElement(snapshot, actionDescription) {
    console.log('\n  === 智能匹配 ===');

    // 创建匹配器
    const matcher = new ElementMatcher(snapshot.elements);

    // 智能匹配
    const candidates = matcher.match(actionDescription, { maxCandidates: 3 });

    if (candidates.length === 0) {
      console.log('  未找到匹配元素，请手动选择');
      return this.selectTargetElement(snapshot);
    }

    // 验证定位器
    const validator = new LocatorValidator(this.driver);
    const validatedCandidates = await validator.validateBatch(candidates);

    // 格式化输出
    console.log(matcher.formatCandidates(validatedCandidates));

    const choice = await question('  请选择: ');

    // 处理选择
    if (choice === 'm') {
      // 显示更多匹配结果
      return this.showMoreMatches(snapshot, actionDescription);
    } else if (choice === 'c') {
      // 手动输入定位器
      const customXpath = await question('  请输入 XPath 定位器: ');
      return {
        element: null,
        locator: { type: 'custom', xpath: customXpath, stability: 'custom' }
      };
    } else if (choice === 's') {
      // 使用坐标定位
      return this.selectByCoordinate(snapshot);
    }

    // 选择候选
    const idx = parseInt(choice) - 1;
    if (idx >= 0 && idx < validatedCandidates.length) {
      const selected = validatedCandidates[idx];
      const coords = matcher.extractCoordinates(selected.bounds);

      return {
        element: selected.element,
        locator: selected.locator,
        type: selected.type,
        fallbackCoords: coords,
        validated: selected.validated
      };
    }

    // 无效选择，回退到手动选择
    return this.selectTargetElement(snapshot);
  }

  /**
   * 显示更多匹配结果
   */
  async showMoreMatches(snapshot, actionDescription) {
    const matcher = new ElementMatcher(snapshot.elements);
    const allCandidates = matcher.match(actionDescription, { maxCandidates: 10 });

    console.log('\n  [更多匹配结果]');
    allCandidates.forEach((c, i) => {
      const stars = c.stabilityLevel === 'high' ? '⭐⭐⭐' :
                    c.stabilityLevel === 'medium' ? '⭐⭐' : '⭐';
      console.log(`    ${i + 1}. ${c.label} (${stars})`);
      console.log(`       定位器: ${c.locator.xpath}`);
    });

    const choice = await question('  请选择: ');
    const idx = parseInt(choice) - 1;

    if (idx >= 0 && idx < allCandidates.length) {
      const selected = allCandidates[idx];
      return {
        element: selected.element,
        locator: selected.locator,
        type: selected.type,
        fallbackCoords: matcher.extractCoordinates(selected.bounds)
      };
    }

    return null;
  }

  /**
   * 坐标定位选择（fallback）
   */
  async selectByCoordinate(snapshot) {
    console.log('\n  === 坐标定位 ===');
    console.log('  请在手机上确认目标位置');

    // 获取当前位置
    const choice = await question('  请输入坐标 (格式: x,y，如 540,960): ');

    const match = choice.match(/(\d+)\s*,\s*(\d+)/);
    if (match) {
      const x = parseInt(match[1]);
      const y = parseInt(match[2]);

      return {
        element: null,
        locator: {
          type: 'coordinate',
          xpath: `coordinate(${x},${y})`,
          stability: 'low'
        },
        fallbackCoords: { x, y },
        type: 'click'
      };
    }

    console.log('  坐标格式错误');
    return null;
  }

  /**
   * 让用户选择目标元素（保留原方法作为备用）
   */
  async selectTargetElement(snapshot) {
    console.log('\n  === 选择操作目标 ===');
    console.log('  可操作元素列表:');

    // 显示输入框
    if (snapshot.elements.editText.length > 0) {
      console.log('\n  [输入框]');
      snapshot.elements.editText.forEach((e, i) => {
        const label = e.hint || e.text || `输入框${i + 1}`;
        console.log(`    ${i + 1}. ${label}`);
      });
    }

    // 显示可点击元素（有文本或描述的）
    const clickables = snapshot.elements.clickable.filter(e => e.text || e.contentDesc);
    if (clickables.length > 0) {
      console.log('\n  [可点击元素]');
      clickables.slice(0, 10).forEach((e, i) => {
        const label = e.text || e.contentDesc;
        const index = snapshot.elements.editText.length + i + 1;
        console.log(`    ${index}. ${label}`);
      });
    }

    console.log('\n  0. 跳过选择（无目标元素）');
    console.log('  m. 更多可点击元素');
    console.log('  c. 自定义输入定位器');

    const choice = await question('\n  请选择操作目标 (输入编号): ');

    if (choice === '0') {
      return null;
    }

    if (choice === 'm') {
      // 显示更多元素
      console.log('\n  [所有可点击元素]');
      snapshot.elements.clickable.forEach((e, i) => {
        const label = e.text || e.contentDesc || e.class;
        console.log(`    ${i + 1}. ${label}`);
      });

      const moreChoice = await question('  请选择: ');
      const idx = parseInt(moreChoice) - 1;
      if (idx >= 0 && idx < snapshot.elements.clickable.length) {
        return {
          element: snapshot.elements.clickable[idx],
          locator: snapshot.getRecommendedLocator(snapshot.elements.clickable[idx])
        };
      }
      return null;
    }

    if (choice === 'c') {
      const customXpath = await question('  请输入 XPath 定位器: ');
      return {
        element: null,
        locator: { type: 'custom', xpath: customXpath, stability: 'custom' }
      };
    }

    // 解析选择
    const idx = parseInt(choice) - 1;
    const editTextCount = snapshot.elements.editText.length;

    if (idx >= 0 && idx < editTextCount) {
      // 选择的是输入框
      return {
        element: snapshot.elements.editText[idx],
        locator: snapshot.getRecommendedLocator(snapshot.elements.editText[idx]),
        type: 'input'
      };
    } else if (idx >= editTextCount && idx < editTextCount + clickables.length) {
      // 选择的是可点击元素
      const clickIdx = idx - editTextCount;
      return {
        element: clickables[clickIdx],
        locator: snapshot.getRecommendedLocator(clickables[clickIdx]),
        type: 'click'
      };
    }

    return null;
  }

  /**
   * 录制循环
   */
  async recordingLoop() {
    console.log('\n========================================');
    console.log('  开始录制操作步骤');
    console.log('========================================');
    console.log('\n提示: 在手机上操作后，按回车采集下一步');

    let previousSource = this.snapshots.length > 0 ? this.snapshots[this.snapshots.length - 1].source : null;

    while (true) {
      console.log('\n----------------------------------------');
      const action = await question(`[步骤 ${this.stepIndex + 1}] 请描述下一步操作 (输入 'done' 完成, 'quit' 退出): `);

      if (action.toLowerCase() === 'done' || action.toLowerCase() === '完成') {
        console.log('\n完成录制...');
        break;
      }

      if (action.toLowerCase() === 'quit' || action.toLowerCase() === '退出') {
        console.log('\n退出录制...');
        rl.close();
        await this.driver.deleteSession();
        return;
      }

      if (action.toLowerCase() === 'undo' || action.toLowerCase() === '撤销') {
        if (this.snapshots.length > 1) {
          this.snapshots.pop();
          this.stepIndex--;
          previousSource = this.snapshots[this.snapshots.length - 1].source;
          console.log('已撤销上一步');
          continue;
        }
      }

      // 等待用户操作
      await question('  请在手机上完成操作，完成后按回车继续...');

      // 采集新状态（传入之前的页面源码用于智能等待）
      const snapshot = await this.captureStep(action, previousSource);

      // 用户可能选择跳过
      if (!snapshot) {
        continue;
      }

      // 更新 previousSource
      previousSource = snapshot.source;

      // 智能匹配目标元素（v2.1 新增）
      const target = await this.smartMatchElement(snapshot, action);
      if (target) {
        snapshot.targetElement = target;
        console.log(`  ✓ 已记录目标元素: ${target.locator.xpath}`);
        if (target.fallbackCoords) {
          console.log(`  ✓ Fallback 坐标: (${target.fallbackCoords.x}, ${target.fallbackCoords.y})`);
        }
      }

      // 如果是输入操作，询问输入值
      if (target && target.type === 'input') {
        const inputValue = await question('  请输入要填入的值 (留空则使用参数): ');
        if (inputValue) {
          target.value = inputValue;
        } else {
          target.isParam = true;
        }
      }
    }

    // 生成脚本
    await this.generateScript();

    // 清理
    rl.close();
    await this.driver.deleteSession();
  }

  /**
   * 生成测试脚本
   */
  async generateScript() {
    console.log('\n========================================');
    console.log('  生成测试脚本');
    console.log('========================================\n');

    // 创建输出目录
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // 保存录制数据
    const recordData = {
      pageName: this.pageName,
      timestamp: Date.now(),
      steps: this.snapshots.map(s => ({
        stepIndex: s.stepIndex,
        action: s.userAction,
        targetElement: s.targetElement ? {
          locator: s.targetElement.locator,
          value: s.targetElement.value,
          isParam: s.targetElement.isParam
        } : null,
        elementsCount: s.elements.all.length
      }))
    };

    const recordFile = path.join(OUTPUT_DIR, `${this.pageName}_record.json`);
    fs.writeFileSync(recordFile, JSON.stringify(recordData, null, 2));
    console.log(`录制数据已保存: ${recordFile}`);

    // 生成 Page Object
    const pageObjectCode = this.generatePageObject();
    const pageObjectFile = path.join(APPIUM_TESTS_DIR, 'pages', `${this.pageName}.page.js`);
    fs.writeFileSync(pageObjectFile, pageObjectCode);
    console.log(`Page Object 已保存: ${pageObjectFile}`);

    // 生成测试脚本
    const testCode = this.generateTestScript();
    const testFile = path.join(APPIUM_TESTS_DIR, `test-${this.pageName}.js`);
    fs.writeFileSync(testFile, testCode);
    console.log(`测试脚本已保存: ${testFile}`);

    // 保存截图
    const screenshotsDir = path.join(APPIUM_TESTS_DIR, 'screenshots');
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }

    this.snapshots.forEach((s, i) => {
      const screenshotFile = path.join(screenshotsDir, `${this.pageName}_step${i + 1}.png`);
      fs.writeFileSync(screenshotFile, s.screenshot, 'base64');
    });
    console.log(`截图已保存: ${screenshotsDir}`);

    console.log('\n✓ 脚本生成完成!');
  }

  /**
   * 生成 Page Object 代码
   */
  generatePageObject() {
    const className = this.pageName.charAt(0).toUpperCase() + this.pageName.slice(1) + 'Page';

    let code = `/**
 * ${className} - Page Object
 * 自动生成时间: ${new Date().toLocaleString()}
 *
 * 录制步骤: ${this.snapshots.length} 步
 */
const driverFactory = require('./driver');

class ${className} {
  // ============ 元素定位器 ============
`;

    // 生成定位器
    const usedLocators = new Set();
    this.snapshots.forEach((s, i) => {
      if (s.targetElement && s.targetElement.locator) {
        const locator = s.targetElement.locator;
        const locatorKey = locator.xpath;

        if (!usedLocators.has(locatorKey)) {
          usedLocators.add(locatorKey);

          // 生成定位器名称
          let name = `element${i + 1}`;
          if (s.targetElement.element) {
            const elem = s.targetElement.element;
            name = (elem.text || elem.contentDesc || elem.hint || `element${i + 1}`)
              .replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')
              .toLowerCase();
            if (name.length > 20) name = name.substring(0, 20);
          }

          code += `  get ${name}Locator() { return '${locator.xpath}'; }\n`;
        }
      }
    });

    code += '\n  // ============ 操作方法 ============\n';

    // 生成操作方法
    this.snapshots.forEach((s, i) => {
      if (!s.targetElement) return;

      const target = s.targetElement;
      const action = s.userAction;
      const methodName = `step${i + 1}${action.replace(/[^a-zA-Z0-9]/g, '_')}`;

      if (target.type === 'input') {
        code += `
  /**
   * ${action}
   */
  async ${methodName}(value) {
    console.log('${action}...');
    const element = await driverFactory.waitForElement('${target.locator.xpath}', 5000);
    await element.clearValue();
    await element.setValue(value);
    await driverFactory.driver.pause(300);
  }
`;
      } else {
        // 检查是否有 fallback 坐标
        const fallbackCode = target.fallbackCoords
          ? `    } catch (e) {
      console.log('主定位器失败，使用坐标 fallback');
      await driverFactory.tapCoordinate(${target.fallbackCoords.x}, ${target.fallbackCoords.y});
    }`
          : `    } catch (e) {
      console.log('${action}失败:', e.message);
    }`;

        code += `
  /**
   * ${action}
   */
  async ${methodName}() {
    console.log('${action}...');
    try {
      const element = await driverFactory.waitForElement('${target.locator.xpath}', 5000);
      await element.click();
      await driverFactory.driver.pause(500);
${fallbackCode}
  }
`;
      }
    });

    // 生成组合流程方法
    code += '\n  // ============ 组合流程 ============\n';
    code += `
  /**
   * 完整操作流程
   */
  async executeFlow(params = {}) {
    console.log('\\n=== 开始执行 ${className} 流程 ===\\n');
`;

    this.snapshots.forEach((s, i) => {
      if (!s.targetElement) return;

      const methodName = `step${i + 1}${s.userAction.replace(/[^a-zA-Z0-9]/g, '_')}`;

      if (s.targetElement.type === 'input') {
        const paramValue = s.targetElement.value
          ? `'${s.targetElement.value}'`
          : `params.param${i + 1} || ''`;
        code += `    await this.${methodName}(${paramValue});\n`;
      } else {
        code += `    await this.${methodName}();\n`;
      }
    });

    code += `    console.log('\\n=== ${className} 流程完成 ===\\n');
  }
}

module.exports = new ${className}();
`;

    return code;
  }

  /**
   * 生成测试脚本代码
   */
  generateTestScript() {
    let code = `/**
 * ${this.pageName} 测试脚本
 * 自动生成时间: ${new Date().toLocaleString()}
 *
 * 运行方式: node test-${this.pageName}.js
 */
const driverFactory = require('./pages/driver');
const ${this.pageName}Page = require('./pages/${this.pageName}.page');
const config = require('./config/appium.config');

async function test${this.pageName.charAt(0).toUpperCase() + this.pageName.slice(1)}() {
  console.log('=== ${this.pageName}测试脚本 ===\\n');

  try {
    // 1. 连接设备
    console.log('[1] 连接设备并启动App...');
    await driverFactory.createDriver();
    await driverFactory.driver.pause(2000);
`;

    // 生成测试步骤
    this.snapshots.forEach((s, i) => {
      const stepNum = i + 2;
      code += `
    // ${stepNum}. ${s.userAction}
    console.log('[${stepNum}] ${s.userAction}...');
`;

      if (s.targetElement) {
        if (s.targetElement.type === 'input') {
          const value = s.targetElement.value || '测试值';
          code += `    await ${this.pageName}Page.step${i + 1}${s.userAction.replace(/[^a-zA-Z0-9]/g, '_')}('${value}');\n`;
        } else {
          code += `    await ${this.pageName}Page.step${i + 1}${s.userAction.replace(/[^a-zA-Z0-9]/g, '_')}();\n`;
        }
      }

      code += `    await driverFactory.driver.pause(500);\n`;
    });

    // 结束部分
    const lastStep = this.snapshots.length + 2;
    code += `
    // ${lastStep}. 截图
    console.log('[${lastStep}] 截图...');
    await driverFactory.takeScreenshot(\`${this.pageName}_result_\${Date.now()}.png\`);

    console.log('\\n=== 测试完成 ===');

  } catch (error) {
    console.error('测试失败:', error.message);
    await driverFactory.takeScreenshot(\`error_\${Date.now()}.png\`);
  } finally {
    await driverFactory.quitDriver();
  }
}

test${this.pageName.charAt(0).toUpperCase() + this.pageName.slice(1)}();
`;

    return code;
  }
}

/**
 * 主函数
 */
async function main() {
  const session = new RecordingSession();

  try {
    await session.start();
  } catch (error) {
    console.error('录制失败:', error.message);
    if (session.driver) {
      await session.driver.deleteSession();
    }
    rl.close();
    process.exit(1);
  }
}

main();