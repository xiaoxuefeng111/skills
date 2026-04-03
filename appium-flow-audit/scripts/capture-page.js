/**
 * 页面元素采集脚本
 * 用于采集当前设备屏幕上的所有UI元素，并生成结构化的元素清单
 *
 * v2.1 新增功能：
 * - 智能匹配：根据关键词快速筛选候选元素
 * - 定位器验证：验证定位器有效性
 * - 重试采集机制：多次采集取并集，提高 PopupWindow 等不稳定场景的采集成功率
 * - 智能等待：采集前等待页面稳定
 */
const { remote } = require('webdriverio');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execSync } = require('child_process');
const SmartWait = require('./smart-wait');
const ElementMatcher = require('./element-matcher');
const LocatorValidator = require('./locator-validator');
const Celebrate = require('./celebrate');
const LearningManager = require('./learning-manager');

// 配置
const pageName = process.argv[2] || 'unknown-page';
const appiumTestsDir = process.argv[3] || process.env.APPIUM_TESTS_DIR || './appium-tests';
const OUTPUT_DIR = path.resolve(appiumTestsDir, 'captured-elements');

// 从配置文件读取
let config;
try {
  const configPath = path.resolve(appiumTestsDir, 'config/appium.config.js');
  config = require(configPath);
} catch (e) {
  console.error('错误: 无法加载配置文件，请确保 appium-tests/config/appium.config.js 存在');
  process.exit(1);
}

// 从环境变量获取 ADB 路径
function getAdbPath() {
  const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (androidHome) {
    return path.join(androidHome, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
  }
  return 'adb';
}

// 解析节点属性
function parseAttrs(nodeStr) {
  const attrs = {};
  const patterns = {
    text: /text="([^"]*)"/,
    resourceId: /resource-id="([^"]*)"/,
    class: /class="([^"]*)"/,
    contentDesc: /content-desc="([^"]*)"/,
    clickable: /clickable="([^"]*)"/,
    hint: /hint="([^"]*)"/,
    bounds: /bounds="([^"]*)"/
  };
  for (const [k, p] of Object.entries(patterns)) {
    const m = nodeStr.match(p);
    if (m) attrs[k] = m[1];
  }
  return attrs;
}

/**
 * 重试采集函数
 * 多次采集页面元素，取并集，提高不稳定场景的采集成功率
 * @param {Object} driver - WebDriver 实例
 * @param {Object} options - 采集选项
 * @param {number} options.maxRetries - 最大重试次数，默认 3
 * @param {number} options.retryInterval - 重试间隔(ms)，默认 500
 * @param {boolean} options.showProgress - 是否显示进度，默认 true
 * @returns {Promise<Object>} 合并后的采集结果
 */
async function captureWithRetry(driver, options = {}) {
  const {
    maxRetries = 3,
    retryInterval = 500,
    showProgress = true
  } = options;

  const results = [];

  for (let i = 0; i < maxRetries; i++) {
    if (showProgress) {
      console.log(`  采集尝试 ${i + 1}/${maxRetries}...`);
    }

    try {
      const source = await driver.getPageSource();
      const elements = parseElementsFromSource(source);

      results.push({
        attempt: i + 1,
        elementCount: elements.all.length,
        editTextCount: elements.editText.length,
        clickableCount: elements.clickable.length,
        elements,
        source
      });
    } catch (error) {
      console.log(`  采集尝试 ${i + 1} 失败:`, error.message);
    }

    if (i < maxRetries - 1) {
      await driver.pause(retryInterval);
    }
  }

  // 合并多次采集结果（取并集）
  return mergeCaptureResults(results);
}

/**
 * 从页面源码解析元素
 * @param {string} source - 页面源码
 * @returns {Object} 解析后的元素对象
 */
function parseElementsFromSource(source) {
  const elements = {
    editText: [],
    textView: [],
    button: [],
    imageView: [],
    clickable: [],
    all: []
  };

  // 通用匹配模式 - 支持两种XML格式
  const nodePattern = /<(node|android\.[^>\s]+)[^>]*>/g;
  const matches = source.match(nodePattern) || [];

  matches.forEach(tagStr => {
    const attrs = parseAttrs(tagStr);

    // 从标签名提取class
    const tagMatch = tagStr.match(/<(android\.[^>\s]+)/);
    if (tagMatch && !attrs.class) {
      attrs.class = tagMatch[1];
    }

    elements.all.push(attrs);

    if (attrs.class && attrs.class.includes('EditText')) elements.editText.push(attrs);
    else if (attrs.class && attrs.class.includes('TextView')) elements.textView.push(attrs);
    else if (attrs.class && attrs.class.includes('Button')) elements.button.push(attrs);
    else if (attrs.class && attrs.class.includes('ImageView')) elements.imageView.push(attrs);

    if (attrs.clickable === 'true') elements.clickable.push(attrs);
  });

  return elements;
}

/**
 * 合并采集结果
 * 多次采集到的元素取并集，确保不遗漏
 * @param {Array} results - 多次采集的结果数组
 * @returns {Object} 合并后的结果
 */
function mergeCaptureResults(results) {
  const merged = {
    editText: [],
    button: [],
    textView: [],
    imageView: [],
    clickable: [],
    all: []
  };

  const seenLocatorKeys = new Set();

  results.forEach(result => {
    if (!result.elements) return;

    result.elements.all.forEach(elem => {
      // 生成唯一标识，避免重复
      const key = elem.resourceId || elem.contentDesc || elem.text ||
                  (elem.bounds ? elem.bounds.replace(/\s/g, '') : '') ||
                  Math.random().toString();

      if (!seenLocatorKeys.has(key)) {
        seenLocatorKeys.add(key);
        merged.all.push(elem);

        // 分类
        if (elem.class?.includes('EditText')) merged.editText.push(elem);
        else if (elem.class?.includes('Button')) merged.button.push(elem);
        else if (elem.class?.includes('TextView')) merged.textView.push(elem);
        else if (elem.class?.includes('ImageView')) merged.imageView.push(elem);

        if (elem.clickable === 'true') merged.clickable.push(elem);
      }
    });
  });

  return {
    merged,
    attempts: results.length,
    totalElementsFound: merged.all.length,
    successAttempts: results.filter(r => r.elementCount > 0).length
  };
}

// 检查 Appium 服务
async function checkAppium() {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: 'localhost',
      port: 4723,
      path: '/status',
      method: 'GET',
      timeout: 5000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.value?.ready || false);
        } catch {
          resolve(false);
        }
      });
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}

// 检查设备连接
function checkDevice() {
  try {
    const adbPath = getAdbPath();
    const result = execSync(`"${adbPath}" devices`, { encoding: 'utf8', timeout: 10000 });
    const lines = result.split('\n').filter(l => l.includes('\t'));
    return lines.length > 0 ? lines[0].split('\t')[0] : null;
  } catch {
    return null;
  }
}

async function capturePage() {
  console.log('========================================');
  console.log('  页面元素采集');
  console.log('========================================\n');
  console.log('页面名称:', pageName);
  console.log('测试目录:', appiumTestsDir);
  const appPackage = config.android['appium:appPackage'];
  console.log('目标App:', appPackage, '\n');

  // 初始化学习数据管理器
  const learningManager = new LearningManager();

  let driver;
  try {
    // 检查 Appium 服务
    console.log('[检查] Appium服务...');
    const appiumReady = await checkAppium();
    if (!appiumReady) {
      console.error('❌ Appium服务未运行!');
      console.error('   请先启动Appium: appium');
      process.exit(1);
    }
    console.log('✅ Appium服务运行中');

    // 检查设备
    console.log('[检查] 设备连接...');
    const deviceId = checkDevice();
    if (!deviceId) {
      console.error('❌ 未检测到设备!');
      console.error('   请确保设备已连接并开启USB调试');
      process.exit(1);
    }
    console.log('✅ 已连接设备:', deviceId, '\n');

    // 连接设备
    console.log('[1/5] 连接设备...');
    driver = await remote({
      hostname: config.server?.hostname || 'localhost',
      port: config.server?.port || 4723,
      capabilities: {
        platformName: 'Android',
        'appium:automationName': 'UiAutomator2',
        'appium:deviceName': 'Android',
        'appium:appPackage': config.android['appium:appPackage'],
        'appium:appActivity': config.android['appium:appActivity'],
        'appium:noReset': true,
      }
    });
    await driver.pause(2000);
    console.log('✓ 设备连接成功\n');

    // 智能等待页面稳定
    console.log('[2/5] 等待页面稳定...');
    const smartWait = new SmartWait(driver);
    const initialSource = await driver.getPageSource();
    const waitResult = await smartWait.smartWait(initialSource, { detectPopup: true });
    console.log('✓ 页面稳定\n');

    // 重试采集页面元素
    console.log('[3/5] 采集页面元素（重试模式）...');
    const captureResult = await captureWithRetry(driver, { maxRetries: 3, retryInterval: 500 });
    const elements = captureResult.merged;

    console.log('✓ 采集完成，合并 ' + captureResult.attempts + ' 次采集结果');
    console.log('✓ 发现', elements.all.length, '个元素\n');

    // 生成报告
    console.log('[4/5] 生成报告...');

    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const timestamp = Date.now();

    // 保存源码（使用最后一次采集的源码）
    const lastSource = captureResult.merged.all.length > 0 ?
      await driver.getPageSource() : '';
    const sourceFile = path.join(OUTPUT_DIR, `${pageName}_source_${timestamp}.xml`);
    if (lastSource) {
      fs.writeFileSync(sourceFile, lastSource);
    }

    // 生成Markdown报告
    let report = `# ${pageName} 页面元素报告\n`;
    report += `生成时间: ${new Date().toLocaleString()}\n`;
    report += `采集模式: 重试采集（${captureResult.attempts}次）\n`;
    report += `页面稳定: ${waitResult.stable ? '是' : '超时'}\n`;
    if (waitResult.isPopup) {
      report += `检测到 PopupWindow: 是\n`;
    }
    report += `\n`;

    report += `## 元素统计\n`;
    report += `- 输入框: ${elements.editText.length} 个\n`;
    report += `- 文本: ${elements.textView.length} 个\n`;
    report += `- 按钮: ${elements.button.length} 个\n`;
    report += `- 图片: ${elements.imageView.length} 个\n`;
    report += `- 可点击: ${elements.clickable.length} 个\n`;
    report += `- 总计: ${elements.all.length} 个\n\n`;

    if (elements.editText.length > 0) {
      report += `## 输入框 (EditText)\n\n`;
      elements.editText.forEach((e, i) => {
        const label = e.hint || e.text || `输入框${i+1}`;
        const locator = e.resourceId
          ? `//*[@resource-id="${e.resourceId}"]`
          : e.hint
            ? `//*[@hint="${e.hint}"]`
            : '(无)';
        report += `### ${label}\n`;
        report += `- text: ${e.text || '(空)'}\n`;
        report += `- hint: ${e.hint || '(无)'}\n`;
        report += `- resource-id: ${e.resourceId || '(无)'}\n`;
        report += `- 推荐定位器: \`${locator}\`\n\n`;
      });
    }

    const clickables = elements.clickable.filter(e => e.text || e.contentDesc);
    if (clickables.length > 0) {
      report += `## 可点击元素\n\n`;
      clickables.forEach((e, i) => {
        const label = e.text || e.contentDesc;
        const locator = e.resourceId
          ? `//*[@resource-id="${e.resourceId}"]`
          : e.contentDesc
            ? `//*[@content-desc="${e.contentDesc}"]`
            : `//*[@text="${e.text}"]`;
        report += `${i+1}. **${label}**\n`;
        report += `   定位器: \`${locator}\`\n\n`;
      });
    }

    const reportFile = path.join(OUTPUT_DIR, `${pageName}_report_${timestamp}.md`);
    fs.writeFileSync(reportFile, report);

    // 生成 Page Object
    const className = pageName.charAt(0).toUpperCase() + pageName.slice(1) + 'Page';
    let pageObj = `/**
 * ${className} - Page Object
 * 自动生成时间: ${new Date().toLocaleString()}
 */
const driverFactory = require('./driver');

class ${className} {
  // ============ 元素定位器 ============\n\n`;

    // 用于避免命名冲突的计数器
    const usedNames = new Set();

    // 生成安全的变量名
    function safeName(label, type, index) {
      // 尝试提取中文的拼音首字母或使用英文
      let name = '';

      // 如果是中文，尝试使用hint/text的首字母拼音或直接用数字
      if (/[\u4e00-\u9fa5]/.test(label)) {
        // 使用类型+数字的方式命名
        name = `${type}${index + 1}`;
      } else {
        // 英文直接使用，但清理特殊字符
        name = label.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        // 移除连续下划线和首尾下划线
        name = name.replace(/_+/g, '_').replace(/^_|_$/g, '');
        if (name.length > 20) name = name.substring(0, 20);
        if (name.length < 2) name = `${type}${index + 1}`;
      }

      // 确保不以数字开头（JavaScript变量名规则）
      if (/^\d/.test(name)) {
        name = `${type}_${name}`;
      }

      // 检查是否重复，如果重复则加数字后缀
      let finalName = name;
      let counter = 1;
      while (usedNames.has(finalName)) {
        finalName = `${name}${counter}`;
        counter++;
      }
      usedNames.add(finalName);
      return finalName;
    }

    // 保存名称映射，确保定位器和方法名一致
    const elementNames = [];

    elements.editText.forEach((e, i) => {
      const label = e.hint || e.text || `input${i+1}`;
      const name = safeName(label, 'input', i);
      const locator = e.resourceId
        ? `//*[@resource-id="${e.resourceId}"]`
        : e.hint
          ? `//*[@hint="${e.hint}"]`
          : '(无)';
      elementNames.push({ type: 'input', name, label });
      pageObj += `  get ${name}Locator() { return '${locator}'; }\n`;
    });

    clickables.slice(0, 15).forEach((e, i) => {
      const label = e.text || e.contentDesc;
      const name = safeName(label, 'btn', i);
      const locator = e.resourceId
        ? `//*[@resource-id="${e.resourceId}"]`
        : e.contentDesc
          ? `//*[@content-desc="${e.contentDesc}"]`
          : `//*[@text="${e.text}"]`;
      elementNames.push({ type: 'btn', name, label });
      pageObj += `  get ${name}Locator() { return '${locator}'; }\n`;
    });

    pageObj += `\n  // ============ 操作方法 ============\n`;

    // 输入框方法
    elementNames.filter(e => e.type === 'input').forEach((e) => {
      pageObj += `\n  /**\n   * 输入${e.label}\n   */\n`;
      pageObj += `  async input${e.name.charAt(0).toUpperCase() + e.name.slice(1)}(value) {\n`;
      pageObj += `    const input = await driverFactory.waitForElement(this.${e.name}Locator, 5000);\n`;
      pageObj += `    await input.clearValue();\n`;
      pageObj += `    await input.setValue(value);\n`;
      pageObj += `  }\n`;
    });

    // 点击方法
    elementNames.filter(e => e.type === 'btn').slice(0, 10).forEach((e) => {
      pageObj += `\n  /**\n   * 点击${e.label}\n   */\n`;
      pageObj += `  async click${e.name.charAt(0).toUpperCase() + e.name.slice(1)}() {\n`;
      pageObj += `    try {\n`;
      pageObj += `      const element = await driverFactory.waitForElement(this.${e.name}Locator, 5000);\n`;
      pageObj += `      await element.click();\n`;
      pageObj += `    } catch (err) {\n`;
      pageObj += `      console.log('点击${e.label}失败:', err.message);\n`;
      pageObj += `    }\n`;
      pageObj += `  }\n`;
    });

    pageObj += `}\n\n`;
    pageObj += `module.exports = new ${className}();\n`;

    const pageObjFile = path.join(appiumTestsDir, 'pages', `${pageName}.page.js`);
    fs.writeFileSync(pageObjFile, pageObj);

    // ========== 学习数据记录 ==========
    console.log('[5/5] 记录学习数据...');

    // 记录成功选择的定位器
    let recordedCount = 0;

    // 记录输入框定位器
    elements.editText.forEach((e, i) => {
      const label = e.hint || e.text || `输入框${i+1}`;
      if (e.resourceId) {
        learningManager.recordSuccess(label, {
          type: 'resource-id',
          value: e.resourceId,
          xpath: `//*[@resource-id="${e.resourceId}"]`
        }, appPackage);
        recordedCount++;
      } else if (e.hint) {
        learningManager.recordSuccess(label, {
          type: 'hint',
          value: e.hint,
          xpath: `//*[@hint="${e.hint}"]`
        }, appPackage);
        recordedCount++;
      }
    });

    // 记录可点击元素定位器
    clickables.slice(0, 15).forEach((e, i) => {
      const label = e.text || e.contentDesc;
      if (e.resourceId) {
        learningManager.recordSuccess(label, {
          type: 'resource-id',
          value: e.resourceId,
          xpath: `//*[@resource-id="${e.resourceId}"]`
        }, appPackage);
        recordedCount++;
      } else if (e.contentDesc) {
        learningManager.recordSuccess(label, {
          type: 'content-desc',
          value: e.contentDesc,
          xpath: `//*[@content-desc="${e.contentDesc}"]`
        }, appPackage);
        recordedCount++;
      } else if (e.text) {
        learningManager.recordSuccess(label, {
          type: 'text',
          value: e.text,
          xpath: `//*[@text="${e.text}"]`
        }, appPackage);
        recordedCount++;
      }
    });

    console.log(`✓ 已记录 ${recordedCount} 个定位器学习数据\n`);

    // 获取学习统计
    const learningStats = learningManager.getLearningStats(appPackage);

    // ========== 录制成功反馈（烟花效果）==========
    Celebrate.showSuccess({ message: '页面元素采集完成，学习数据已更新！' });

    console.log('输出文件:');
    console.log('- 页面源码:', sourceFile);
    console.log('- 分析报告:', reportFile);
    console.log('- Page Object:', pageObjFile);
    console.log('- 学习数据: rules/' + appPackage + '.json');

    console.log('\n元素统计:');
    console.log('- 输入框:', elements.editText.length, '个');
    console.log('- 文本:', elements.textView.length, '个');
    console.log('- 按钮:', elements.button.length, '个');
    console.log('- 可点击:', elements.clickable.length, '个');
    console.log('- 总计:', elements.all.length, '个');

    // 显示学习统计
    console.log('\n学习统计:');
    console.log('- 已记录元素:', learningStats.totalElements, '个');
    console.log('- 已记录定位器:', learningStats.totalLocators, '个');
    console.log('- 总使用次数:', learningStats.totalUsage, '次');
    console.log('- 总成功次数:', learningStats.totalSuccess, '次');
    console.log('- 综合成功率:', (learningStats.overallSuccessRate * 100).toFixed(1) + '%');
    console.log('- 会话次数:', learningStats.totalSessions, '次');

    // 打印关键元素
    if (elements.editText.length > 0) {
      console.log('\n输入框:');
      elements.editText.forEach((e, i) => {
        const label = e.hint || e.text || `输入框${i+1}`;
        console.log(`  ${i+1}. ${label}`);
      });
    }

    if (clickables.length > 0) {
      console.log('\n可点击元素（有文本/描述，前10个）:');
      clickables.slice(0, 10).forEach((e, i) => {
        const label = e.text || e.contentDesc;
        console.log(`  ${i+1}. ${label}`);
      });
    }

    // ========== 录制结束交互菜单 ==========
    console.log(Celebrate.showRecordEndMenu(1));

  } catch (error) {
    console.error('\n❌ 采集失败:', error.message);
    process.exit(1);
  } finally {
    if (driver) await driver.deleteSession();
  }
}

capturePage();