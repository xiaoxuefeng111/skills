/**
 * 智能等待模块
 * 检测页面变化，判断是否稳定
 * 主要解决 PopupWindow + Weex 场景的时序问题
 *
 * v2.1 增强:
 * - 增加 PopupWindow 专用参数
 * - 更精细的稳定性检测
 * - 采集成功率检测
 *
 * 用法:
 *   const SmartWait = require('./smart-wait');
 *   const waiter = new SmartWait(driver);
 *   const result = await waiter.smartWait(beforeSource, { detectPopup: true });
 */
class SmartWait {
  constructor(driver) {
    this.driver = driver;
  }

  /**
   * PopupWindow 专用配置
   */
  static get POPUP_CONFIG() {
    return {
      timeout: 8000,           // 超时时间 8秒
      stableThreshold: 5,      // 连续稳定次数
      checkInterval: 800,      // 检查间隔
      elementThreshold: 10     // 元素数量突变阈值
    };
  }

  /**
   * 普通页面配置
   */
  static get NORMAL_CONFIG() {
    return {
      timeout: 3000,
      stableThreshold: 3,
      checkInterval: 500,
      elementThreshold: 5
    };
  }

  /**
   * 等待页面元素数量稳定
   * @param {number} beforeCount - 操作前的元素数量
   * @param {Object} options - 配置选项
   * @param {number} options.timeout - 超时时间(ms)，默认 5000
   * @param {number} options.stableThreshold - 连续稳定次数，默认 3
   * @param {number} options.checkInterval - 检查间隔(ms)，默认 200
   * @returns {Promise<{stable: boolean, afterCount: number, time: number}>}
   */
  async waitForElementCountStable(beforeCount, options = {}) {
    const {
      timeout = 5000,
      stableThreshold = 3,
      checkInterval = 200
    } = options;

    const startTime = Date.now();
    let lastCount = beforeCount;
    let stableCount = 0;

    while (Date.now() - startTime < timeout) {
      try {
        const source = await this.driver.getPageSource();
        const currentCount = this.countElements(source);

        if (currentCount === lastCount) {
          stableCount++;
          if (stableCount >= stableThreshold) {
            return {
              stable: true,
              afterCount: currentCount,
              time: Date.now() - startTime
            };
          }
        } else {
          stableCount = 0;
          lastCount = currentCount;
        }

        await this.driver.pause(checkInterval);
      } catch (error) {
        // 页面可能正在变化，继续等待
        console.log('  采集异常，继续等待...', error.message);
        await this.driver.pause(checkInterval);
      }
    }

    return {
      stable: false,
      afterCount: lastCount,
      time: Date.now() - startTime
    };
  }

  /**
   * 等待页面结构稳定（通用方法）
   * @param {string} beforeSource - 操作前的页面源码
   * @param {Object} options - 配置选项
   */
  async waitForPageStable(beforeSource, options = {}) {
    const beforeCount = this.countElements(beforeSource);
    return this.waitForElementCountStable(beforeCount, options);
  }

  /**
   * 等待页面变化（检测新元素出现）
   * @param {number} beforeCount - 操作前的元素数量
   * @param {Object} options - 配置选项
   */
  async waitForPageChange(beforeCount, options = {}) {
    const {
      timeout = 5000,
      checkInterval = 200,
      minChangeCount = 5 // 最小变化元素数量
    } = options;

    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const source = await this.driver.getPageSource();
        const currentCount = this.countElements(source);

        // 元素数量变化超过阈值，认为页面已变化
        if (Math.abs(currentCount - beforeCount) >= minChangeCount) {
          return {
            changed: true,
            beforeCount,
            afterCount: currentCount,
            time: Date.now() - startTime
          };
        }

        await this.driver.pause(checkInterval);
      } catch (error) {
        await this.driver.pause(checkInterval);
      }
    }

    return {
      changed: false,
      beforeCount,
      afterCount: beforeCount,
      time: Date.now() - startTime
    };
  }

  /**
   * 检测是否为 PopupWindow 场景
   * PopupWindow 通常会增加一个 FrameLayout 层，元素数量明显增加
   */
  async detectPopupWindow(beforeSource) {
    const beforeCount = this.countElements(beforeSource);
    const currentSource = await this.driver.getPageSource();
    const currentCount = this.countElements(currentSource);

    const countDiff = currentCount - beforeCount;

    return {
      isPopup: countDiff > 10, // 经验值，PopupWindow 通常增加较多元素
      elementCountDiff: countDiff,
      beforeCount,
      currentCount
    };
  }

  /**
   * 统计页面元素数量
   * @param {string} source - 页面源码
   * @returns {number} 元素数量
   */
  countElements(source) {
    if (!source) return 0;
    // 匹配 <node> 标签和 android.xxx 控件标签
    const matches = source.match(/<(node|android\.[^>\s]+)[^>]*>/g) || [];
    return matches.length;
  }

  /**
   * 综合等待策略
   * 根据场景自动选择合适的等待方式
   * @param {string} beforeSource - 操作前的页面源码
   * @param {Object} options - 配置选项
   */
  async smartWait(beforeSource, options = {}) {
    const {
      detectPopup = true,
      customConfig = null
    } = options;

    console.log('  开始智能等待...');

    // 1. 先检测是否有 PopupWindow 弹出
    let isPopup = false;
    let popupInfo = null;
    if (detectPopup) {
      const popupResult = await this.detectPopupWindow(beforeSource);
      isPopup = popupResult.isPopup;
      popupInfo = popupResult;
      if (isPopup) {
        console.log('  检测到 PopupWindow，延长等待时间...');
        console.log(`  元素数量变化: ${popupResult.beforeCount} → ${popupResult.currentCount}`);
      }
    }

    // 2. 根据场景选择配置
    const config = customConfig || (isPopup ? SmartWait.POPUP_CONFIG : SmartWait.NORMAL_CONFIG);

    // 3. 等待页面稳定
    const beforeCount = this.countElements(beforeSource);
    const result = await this.waitForElementCountStable(beforeCount, {
      timeout: config.timeout,
      stableThreshold: config.stableThreshold,
      checkInterval: config.checkInterval
    });

    if (result.stable) {
      console.log(`  页面已稳定，耗时 ${result.time}ms，元素数量 ${result.afterCount}`);
    } else {
      console.log(`  等待超时，当前元素数量 ${result.afterCount}`);
    }

    return {
      ...result,
      isPopup,
      popupInfo,
      config: {
        timeout: config.timeout,
        stableThreshold: config.stableThreshold
      }
    };
  }

  /**
   * 检测采集成功率（用于判断是否需要增强采集）
   * @param {Array} captureResults - 多次采集的结果
   * @returns {Object} 成功率分析
   */
  analyzeCaptureSuccessRate(captureResults) {
    if (!captureResults || captureResults.length === 0) {
      return { successRate: 0, needEnhance: true };
    }

    const successCount = captureResults.filter(r => r && r.elementCount > 0).length;
    const successRate = successCount / captureResults.length;

    return {
      successRate,
      successCount,
      totalAttempts: captureResults.length,
      needEnhance: successRate < 0.5  // 成功率低于 50% 需要增强
    };
  }

  /**
   * 增强等待（用于 PopupWindow 场景）
   * @param {string} beforeSource - 操作前的页面源码
   */
  async enhancedWait(beforeSource) {
    console.log('  进入增强等待模式...');

    const config = SmartWait.POPUP_CONFIG;
    const beforeCount = this.countElements(beforeSource);

    // 多轮等待
    for (let round = 0; round < 3; round++) {
      console.log(`  增强等待轮次 ${round + 1}/3...`);

      const result = await this.waitForElementCountStable(beforeCount, {
        timeout: config.timeout,
        stableThreshold: config.stableThreshold,
        checkInterval: config.checkInterval
      });

      if (result.stable && result.afterCount > 0) {
        console.log(`  增强等待成功，元素数量 ${result.afterCount}`);
        return { ...result, success: true };
      }

      // 等待一段时间再重试
      if (round < 2) {
        await this.driver.pause(1000);
      }
    }

    console.log('  增强等待仍未稳定');
    return { stable: false, success: false };
  }
}

module.exports = SmartWait;