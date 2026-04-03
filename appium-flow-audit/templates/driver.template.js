/**
 * Appium 驱动模块
 * 提供基础的 Appium 连接和操作能力
 *
 * 用法:
 *   const driverFactory = require('./pages/driver');
 *   await driverFactory.createDriver();
 *   const element = await driverFactory.waitForElement('//*[@text="确定"]', 5000);
 *   await element.click();
 *   await driverFactory.quitDriver();
 */

const { remote } = require('webdriverio');
const fs = require('fs');
const path = require('path');

// 尝试加载配置
let config = {};
try {
  config = require('../config/appium.config');
} catch (e) {
  console.log('警告: 未找到配置文件 config/appium.config.js');
}

// 驱动实例
let driver = null;

/**
 * 创建 Appium 驱动
 * @param {Object} options - 可选的覆盖配置
 * @returns {Promise<Object>} driver 实例
 */
async function createDriver(options = {}) {
  if (driver) {
    return driver;
  }

  const defaultCapabilities = {
    platformName: 'Android',
    'appium:automationName': 'UiAutomator2',
    'appium:deviceName': 'Android',
    'appium:appPackage': config.android?.['appium:appPackage'] || '',
    'appium:appActivity': config.android?.['appium:appActivity'] || '',
    'appium:noReset': true,
    'appium:newCommandTimeout': 300,
    'appium:uiautomator2ServerLaunchTimeout': 60000
  };

  driver = await remote({
    hostname: config.server?.hostname || 'localhost',
    port: config.server?.port || 4723,
    capabilities: {
      ...defaultCapabilities,
      ...options.capabilities
    }
  });

  console.log('✓ Appium 驱动已创建');
  return driver;
}

/**
 * 获取当前 driver 实例
 * @returns {Object|null}
 */
function getDriver() {
  return driver;
}

/**
 * 等待元素出现
 * @param {string} locator - XPath 定位器
 * @param {number} timeout - 超时时间（毫秒）
 * @returns {Promise<Object>} 元素对象
 */
async function waitForElement(locator, timeout = 5000) {
  if (!driver) {
    throw new Error('驱动未初始化，请先调用 createDriver()');
  }

  const element = await driver.$(locator);
  await element.waitForExist({ timeout });
  return element;
}

/**
 * 等待元素可见
 * @param {string} locator - XPath 定位器
 * @param {number} timeout - 超时时间（毫秒）
 * @returns {Promise<Object>} 元素对象
 */
async function waitForDisplayed(locator, timeout = 5000) {
  if (!driver) {
    throw new Error('驱动未初始化，请先调用 createDriver()');
  }

  const element = await driver.$(locator);
  await element.waitForDisplayed({ timeout });
  return element;
}

/**
 * 点击元素
 * @param {string} locator - XPath 定位器
 * @param {number} timeout - 超时时间
 */
async function clickElement(locator, timeout = 5000) {
  const element = await waitForElement(locator, timeout);
  await element.click();
}

/**
 * 输入文本
 * @param {string} locator - XPath 定位器
 * @param {string} value - 要输入的值
 * @param {number} timeout - 超时时间
 */
async function inputText(locator, value, timeout = 5000) {
  const element = await waitForElement(locator, timeout);
  await element.clearValue();
  await element.setValue(value);
}

/**
 * 获取元素文本
 * @param {string} locator - XPath 定位器
 * @param {number} timeout - 超时时间
 * @returns {Promise<string>} 元素文本
 */
async function getElementText(locator, timeout = 5000) {
  const element = await waitForElement(locator, timeout);
  return await element.getText();
}

/**
 * 检查元素是否存在
 * @param {string} locator - XPath 定位器
 * @param {number} timeout - 超时时间
 * @returns {Promise<boolean>}
 */
async function elementExists(locator, timeout = 2000) {
  try {
    const element = await driver.$(locator);
    await element.waitForExist({ timeout });
    return true;
  } catch {
    return false;
  }
}

/**
 * 坐标点击（fallback 用）
 * @param {number} x - X 坐标
 * @param {number} y - Y 坐标
 */
async function tapCoordinate(x, y) {
  if (!driver) {
    throw new Error('驱动未初始化，请先调用 createDriver()');
  }

  await driver.touchAction({
    action: 'tap',
    x,
    y
  });
}

/**
 * 滑动屏幕
 * @param {number} startX - 起始 X
 * @param {number} startY - 起始 Y
 * @param {number} endX - 结束 X
 * @param {number} endY - 结束 Y
 * @param {number} duration - 持续时间（毫秒）
 */
async function swipe(startX, startY, endX, endY, duration = 500) {
  if (!driver) {
    throw new Error('驱动未初始化，请先调用 createDriver()');
  }

  await driver.touchAction([
    { action: 'press', x: startX, y: startY },
    { action: 'wait', ms: duration },
    { action: 'moveTo', x: endX, y: endY },
    'release'
  ]);
}

/**
 * 向上滑动（翻页）
 * @param {number} distance - 滑动距离比例 (0-1)
 */
async function swipeUp(distance = 0.5) {
  const { width, height } = await driver.getWindowSize();
  const startX = Math.floor(width / 2);
  const startY = Math.floor(height * 0.7);
  const endY = Math.floor(height * (0.7 - distance));

  await swipe(startX, startY, startX, endY);
}

/**
 * 向下滑动
 * @param {number} distance - 滑动距离比例 (0-1)
 */
async function swipeDown(distance = 0.5) {
  const { width, height } = await driver.getWindowSize();
  const startX = Math.floor(width / 2);
  const startY = Math.floor(height * 0.3);
  const endY = Math.floor(height * (0.3 + distance));

  await swipe(startX, startY, startX, endY);
}

/**
 * 截图
 * @param {string} filename - 保存的文件名
 * @returns {Promise<string>} 截图保存路径
 */
async function takeScreenshot(filename) {
  if (!driver) {
    throw new Error('驱动未初始化，请先调用 createDriver()');
  }

  const screenshot = await driver.takeScreenshot();

  // 确保目录存在
  const screenshotsDir = path.join(process.cwd(), 'screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const filepath = path.join(screenshotsDir, filename);
  fs.writeFileSync(filepath, screenshot, 'base64');

  return filepath;
}

/**
 * 获取页面源码
 * @returns {Promise<string>} XML 源码
 */
async function getPageSource() {
  if (!driver) {
    throw new Error('驱动未初始化，请先调用 createDriver()');
  }

  return await driver.getPageSource();
}

/**
 * 暂停执行
 * @param {number} ms - 暂停时间（毫秒）
 */
async function pause(ms) {
  if (!driver) {
    throw new Error('驱动未初始化，请先调用 createDriver()');
  }

  await driver.pause(ms);
}

/**
 * 关闭驱动
 */
async function quitDriver() {
  if (driver) {
    try {
      await driver.deleteSession();
      console.log('✓ Appium 驱动已关闭');
    } catch (e) {
      console.log('关闭驱动时出错:', e.message);
    } finally {
      driver = null;
    }
  }
}

/**
 * 带 fallback 的点击
 * @param {string} locator - 主定位器
 * @param {Object} fallbackCoords - fallback 坐标 { x, y }
 * @param {number} timeout - 超时时间
 */
async function clickWithFallback(locator, fallbackCoords, timeout = 5000) {
  try {
    const element = await waitForElement(locator, timeout);
    await element.click();
    console.log(`✓ 点击成功: ${locator}`);
  } catch (e) {
    if (fallbackCoords) {
      console.log(`⚠ 主定位器失败，使用坐标 fallback: (${fallbackCoords.x}, ${fallbackCoords.y})`);
      await tapCoordinate(fallbackCoords.x, fallbackCoords.y);
    } else {
      throw e;
    }
  }
}

/**
 * 带验证的输入
 * @param {string} locator - 定位器
 * @param {string} value - 输入值
 * @param {number} timeout - 超时时间
 * @returns {Promise<boolean>} 是否成功
 */
async function inputWithVerify(locator, value, timeout = 5000) {
  try {
    const element = await waitForElement(locator, timeout);
    await element.clearValue();
    await element.setValue(value);

    // 验证输入结果
    await pause(300);
    const actualValue = await element.getValue();

    if (actualValue === value) {
      console.log(`✓ 输入成功: ${value}`);
      return true;
    } else {
      console.log(`⚠ 输入值不匹配: 期望 "${value}", 实际 "${actualValue}"`);
      return false;
    }
  } catch (e) {
    console.log(`✗ 输入失败: ${e.message}`);
    return false;
  }
}

module.exports = {
  driver,
  createDriver,
  getDriver,
  waitForElement,
  waitForDisplayed,
  clickElement,
  inputText,
  getElementText,
  elementExists,
  tapCoordinate,
  swipe,
  swipeUp,
  swipeDown,
  takeScreenshot,
  getPageSource,
  pause,
  quitDriver,
  clickWithFallback,
  inputWithVerify
};