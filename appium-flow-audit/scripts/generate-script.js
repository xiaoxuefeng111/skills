/**
 * 测试脚本生成器
 * 基于页面元素和操作描述生成 Page Object 模式的测试脚本
 *
 * 用法: node generate-script.js <页面名称> "<操作描述>" [测试目录路径]
 * 示例: node generate-script.js login "输入账号密码并点击登录"
 *       node generate-script.js login "输入账号密码并点击登录" /path/to/appium-tests
 */
const fs = require('fs');
const path = require('path');

// 从命令行获取参数
const pageName = process.argv[2];
const operationDesc = process.argv[3] || '';
const appiumTestsDir = process.argv[4] || process.env.APPIUM_TESTS_DIR || './appium-tests';

if (!pageName) {
  console.error('用法: node generate-script.js <页面名称> "<操作描述>" [测试目录路径]');
  console.error('示例: node generate-script.js login "输入账号密码并点击登录"');
  process.exit(1);
}

// 测试目录
const APPIUM_TESTS_DIR = path.resolve(appiumTestsDir);
const PAGES_DIR = path.join(APPIUM_TESTS_DIR, 'pages');
const TESTS_DIR = path.join(APPIUM_TESTS_DIR, 'tests');
const CAPTURED_DIR = path.join(APPIUM_TESTS_DIR, 'captured-elements');

// 确保目录存在
[PAGES_DIR, TESTS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

/**
 * 操作类型定义
 */
const OPERATION_PATTERNS = {
  input: {
    keywords: ['输入', '填写', '设置', 'input', 'enter', 'type'],
    template: (name, locator, fallbackCoords = null) => `
  /**
   * 输入${name}
   */
  async input${capitalize(name)}(value) {
    console.log('输入${name}:', value);
    const element = await driverFactory.waitForElement('${locator}', 5000);
    await element.clearValue();
    await element.setValue(value);
    await driverFactory.driver.pause(300);
  }`
  },
  click: {
    keywords: ['点击', '按', '选择', 'click', 'tap', 'press'],
    template: (name, locator, fallbackCoords = null) => {
      const fallbackCode = fallbackCoords ? `
    } catch (e) {
      // Fallback: 坐标点击
      console.log('主定位器失败，使用坐标 fallback');
      await driverFactory.tapCoordinate(${fallbackCoords.x}, ${fallbackCoords.y});` : `
    } catch (e) {
      console.log('点击${name}失败:', e.message);`;
      return `
  /**
   * 点击${name}
   */
  async click${capitalize(name)}() {
    console.log('点击${name}...');
    try {
      const element = await driverFactory.waitForElement('${locator}', 5000);
      await element.click();
      await driverFactory.driver.pause(500);${fallbackCode}
    }
  }`;
    }
  },
  wait: {
    keywords: ['等待', 'wait'],
    template: (name, locator) => `
  /**
   * 等待${name}出现
   */
  async wait${capitalize(name)}(timeout = 5000) {
    console.log('等待${name}出现...');
    await driverFactory.waitForElement('${locator}', timeout);
  }`
  },
  verify: {
    keywords: ['验证', '检查', '确认', 'verify', 'check', 'assert'],
    template: (name, locator) => `
  /**
   * 验证${name}显示
   */
  async verify${capitalize(name)}() {
    console.log('验证${name}显示...');
    try {
      const element = await driverFactory.driver.$('${locator}');
      const displayed = await element.isDisplayed();
      return displayed;
    } catch (e) {
      return false;
    }
  }`
  }
};

/**
 * 辅助函数：首字母大写
 */
function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * 辅助函数：转换为驼峰命名
 */
function toCamelCase(str) {
  if (!str) return '';
  return str.replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
            .replace(/[^a-zA-Z0-9]/g, '');
}

/**
 * 解析操作描述
 */
function parseOperations(description) {
  const operations = [];

  // 中文操作解析
  const chinesePattern = /(?:输入|填写|设置)(\S+)|(?:点击|按|选择)(\S+)|(?:等待)(\S+)|(?:验证|检查)(\S+)/g;
  let match;

  while ((match = chinesePattern.exec(description)) !== null) {
    const elementName = match[1] || match[2] || match[3] || match[4];
    let operationType = 'click';

    if (match[1]) operationType = 'input';
    else if (match[2]) operationType = 'click';
    else if (match[3]) operationType = 'wait';
    else if (match[4]) operationType = 'verify';

    operations.push({
      type: operationType,
      elementName: elementName.replace(/[，。、]/g, '')
    });
  }

  // 如果没有匹配到，尝试更宽松的解析
  if (operations.length === 0 && description) {
    const words = description.split(/[，,\s]+/);
    let currentType = 'click';

    words.forEach(word => {
      for (const [type, config] of Object.entries(OPERATION_PATTERNS)) {
        if (config.keywords.some(kw => word.includes(kw))) {
          currentType = type;
          return;
        }
      }

      // 如果不是操作关键词，可能是元素名
      if (word.length > 1 && !OPERATION_PATTERNS.click.keywords.includes(word)) {
        operations.push({
          type: currentType,
          elementName: word
        });
      }
    });
  }

  return operations;
}

/**
 * 从采集的元素文件加载元素
 */
function loadCapturedElements(pageName) {
  const capturedFile = path.join(CAPTURED_DIR, `${pageName}.page.js`);

  if (fs.existsSync(capturedFile)) {
    console.log(`发现已采集的元素文件: ${capturedFile}`);
    return fs.readFileSync(capturedFile, 'utf-8');
  }

  return null;
}

/**
 * 生成 Page Object 代码
 */
function generatePageObject(pageName, operations) {
  const className = capitalize(pageName) + 'Page';
  const fileName = `${pageName.toLowerCase()}.page.js`;

  let code = `/**
 * ${className} - Page Object
 * 自动生成时间: ${new Date().toLocaleString()}
 *
 * 操作描述: ${operationDesc || '(未提供)'}
 */
const driverFactory = require('./driver');

class ${className} {
  // ============ 元素定位器 ============

  // TODO: 根据实际页面修改定位器
`;

  // 根据操作生成定位器
  operations.forEach((op, i) => {
    const varName = toCamelCase(op.elementName) || `element${i + 1}`;
    code += `  get ${varName}Locator() { return '//*[@text="${op.elementName}"]'; }\n`;
  });

  code += '\n  // ============ 操作方法 ============\n';

  // 生成操作方法
  operations.forEach((op, i) => {
    const varName = toCamelCase(op.elementName) || `element${i + 1}`;
    const config = OPERATION_PATTERNS[op.type];

    if (config) {
      code += config.template(op.elementName, `this.${varName}Locator`);
    }
  });

  code += '\n  // ============ 组合流程 ============\n';

  // 生成组合流程方法
  code += `
  /**
   * 完整操作流程
   */
  async performFlow(params = {}) {
    console.log('\\n=== 开始执行 ${className} 流程 ===\\n');
`;

  operations.forEach((op, i) => {
    const varName = toCamelCase(op.elementName) || `element${i + 1}`;
    const methodName = capitalize(varName);

    if (op.type === 'input') {
      code += `    await this.input${methodName}(params.${varName} || '');\n`;
    } else if (op.type === 'click') {
      code += `    await this.click${methodName}();\n`;
    } else if (op.type === 'wait') {
      code += `    await this.wait${methodName}();\n`;
    } else if (op.type === 'verify') {
      code += `    const is${methodName}Visible = await this.verify${methodName}();\n`;
    }
  });

  code += `
    console.log('\\n=== ${className} 流程完成 ===\\n');
  }
}

module.exports = new ${className}();
`;

  return { code, fileName, className };
}

/**
 * 生成测试用例代码
 */
function generateTestScript(pageName, operations, pageObjectCode) {
  const className = capitalize(pageName) + 'Page';
  const testFileName = `${pageName.toLowerCase()}.test.js`;

  let code = `/**
 * ${pageName} 测试用例
 * 自动生成时间: ${new Date().toLocaleString()}
 */
const driverFactory = require('./pages/driver');
const ${pageName}Page = require('./pages/${pageName.toLowerCase()}.page');
const config = require('./config/appium.config');

describe('${pageName}功能测试', function() {
  this.timeout(120000);

  before(async function() {
    console.log('初始化测试环境...');
    // 如需要重新启动App，取消下面注释
    // await driverFactory.createDriver();
  });

  after(async function() {
    console.log('清理测试环境...');
    await driverFactory.quitDriver();
  });

  it('执行${pageName}操作流程', async function() {
    console.log('\\n=== 测试开始 ===\\n');
`;

  // 根据操作生成测试步骤
  operations.forEach((op, i) => {
    const varName = toCamelCase(op.elementName) || `element${i + 1}`;

    if (op.type === 'input') {
      code += `
    // 步骤${i + 1}: 输入${op.elementName}
    await ${pageName}Page.input${capitalize(varName)}('测试值');
`;
    } else if (op.type === 'click') {
      code += `
    // 步骤${i + 1}: 点击${op.elementName}
    await ${pageName}Page.click${capitalize(varName)}();
`;
    }
  });

  code += `
    // 截图
    await driverFactory.takeScreenshot(\`\${pageName}_result_\${Date.now()}.png\`);

    console.log('\\n=== 测试完成 ===\\n');
  });
});
`;

  return { code, fileName: testFileName };
}

/**
 * 生成简单测试脚本 (非Mocha格式)
 */
function generateSimpleScript(pageName, operations) {
  const className = capitalize(pageName) + 'Page';
  const pageNameLower = pageName.toLowerCase();

  let code = `/**
 * ${pageName} 测试脚本
 * 自动生成时间: ${new Date().toLocaleString()}
 *
 * 运行方式: node test-${pageNameLower}.js
 */
const driverFactory = require('./pages/driver');
const ${pageName}Page = require('./pages/${pageNameLower}.page');
const config = require('./config/appium.config');

async function test${capitalize(pageName)}() {
  console.log('=== ${pageName}测试脚本 ===\\n');

  try {
    // 1. 连接设备
    console.log('[1] 连接设备并启动App...');
    await driverFactory.createDriver();
    await driverFactory.driver.pause(2000);
`;

  // 添加操作步骤
  operations.forEach((op, i) => {
    const varName = toCamelCase(op.elementName) || `element${i + 1}`;
    const stepNum = i + 2;

    if (op.type === 'input') {
      code += `
    // ${stepNum}. 输入${op.elementName}
    console.log('[${stepNum}] 输入${op.elementName}...');
    await ${pageName}Page.input${capitalize(varName)}('测试值');
`;
    } else if (op.type === 'click') {
      code += `
    // ${stepNum}. 点击${op.elementName}
    console.log('[${stepNum}] 点击${op.elementName}...');
    await ${pageName}Page.click${capitalize(varName)}();
`;
    }
  });

  const lastStepNum = operations.length + 2;

  code += `
    // ${lastStepNum}. 截图
    console.log('[${lastStepNum}] 截图...');
    await driverFactory.takeScreenshot(\`${pageNameLower}_result_\${Date.now()}.png\`);

    console.log('\\n=== 测试完成 ===');

  } catch (error) {
    console.error('测试失败:', error.message);
    await driverFactory.takeScreenshot(\`error_\${Date.now()}.png\`);
  } finally {
    await driverFactory.quitDriver();
  }
}

test${capitalize(pageName)}();
`;

  return code;
}

/**
 * 主函数
 */
async function generateScript() {
  console.log('=== 测试脚本生成器 ===\n');
  console.log(`页面名称: ${pageName}`);
  console.log(`操作描述: ${operationDesc || '(未提供)'}\n`);

  // 解析操作
  console.log('[1/3] 解析操作描述...');
  const operations = parseOperations(operationDesc);

  if (operations.length === 0) {
    console.log('未解析到具体操作，生成基础模板...');
    // 添加默认操作
    operations.push(
      { type: 'input', elementName: '输入框1' },
      { type: 'click', elementName: '按钮1' }
    );
  }

  console.log(`解析到 ${operations.length} 个操作:`);
  operations.forEach((op, i) => {
    console.log(`  ${i + 1}. ${op.type}: ${op.elementName}`);
  });

  // Page Object 路径
  const pageObjectPath = path.join(PAGES_DIR, `${pageName.toLowerCase()}.page.js`);

  // 检查是否已有 Page Object
  console.log('\n[2/3] 检查 Page Object...');
  if (fs.existsSync(pageObjectPath)) {
    console.log(`使用已存在的 Page Object: ${pageObjectPath}`);
    console.log('提示: 如需更新元素定位器，请先运行 capture 命令重新采集');
  } else {
    console.log('生成新的 Page Object...');
    const { code: pageObjectCode, fileName: pageObjectFileName } = generatePageObject(pageName, operations);
    fs.writeFileSync(pageObjectPath, pageObjectCode);
    console.log(`Page Object 已保存: ${pageObjectPath}`);
  }

  // 生成测试脚本
  console.log('\n[3/3] 生成测试脚本...');
  const testScript = generateSimpleScript(pageName, operations);
  const testScriptPath = path.join(APPIUM_TESTS_DIR, `test-${pageName.toLowerCase()}.js`);
  fs.writeFileSync(testScriptPath, testScript);
  console.log(`测试脚本已保存: ${testScriptPath}`);

  // 输出使用说明
  console.log('\n=== 生成完成 ===\n');
  console.log('生成的文件:');
  console.log(`  1. Page Object: ${pageObjectPath}`);
  console.log(`  2. 测试脚本: ${testScriptPath}`);
  console.log('\n下一步:');
  console.log(`  1. 检查 ${pageName.toLowerCase()}.page.js 中的元素定位器`);
  console.log(`  2. 运行测试: node test-${pageName.toLowerCase()}.js`);
}

generateScript();