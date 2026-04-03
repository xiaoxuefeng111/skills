/**
 * 定位器验证模块
 * 验证定位器能否实际找到元素
 *
 * 用法:
 *   const LocatorValidator = require('./locator-validator');
 *   const validator = new LocatorValidator(driver);
 *   const result = await validator.validate('//*[@resource-id="btn_sell"]');
 */

class LocatorValidator {
  constructor(driver) {
    this.driver = driver;
  }

  /**
   * 验证单个定位器
   * @param {string} locator - XPath 定位器
   * @param {Object} options - 验证选项
   * @returns {Promise<Object>} 验证结果
   */
  async validate(locator, options = {}) {
    const { timeout = 2000 } = options;

    try {
      const element = await this.driver.$(locator);
      await element.waitForExist({ timeout });

      return {
        locator,
        valid: true,
        error: null
      };
    } catch (error) {
      return {
        locator,
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * 批量验证定位器（并行）
   * @param {Array} candidates - 候选列表，每项包含 locator 属性
   * @param {Object} options - 验证选项
   * @returns {Promise<Array>} 带验证结果的候选列表
   */
  async validateBatch(candidates, options = {}) {
    const { maxConcurrent = 3 } = options;

    if (!candidates || candidates.length === 0) {
      return [];
    }

    // 只验证前 N 个候选
    const toValidate = candidates.slice(0, maxConcurrent);

    // 并行验证
    const validations = toValidate.map(async (candidate) => {
      if (!candidate.locator || !candidate.locator.xpath) {
        return { ...candidate, validated: false, validationError: '无有效定位器' };
      }

      const result = await this.validate(candidate.locator.xpath, options);
      return {
        ...candidate,
        validated: result.valid,
        validationError: result.error
      };
    });

    const validatedResults = await Promise.all(validations);

    // 对于不在验证范围内的候选，标记为未验证
    const remaining = candidates.slice(maxConcurrent).map(c => ({
      ...c,
      validated: undefined
    }));

    return [...validatedResults, ...remaining];
  }

  /**
   * 验证并排序（有效的排前面）
   * @param {Array} candidates - 候选列表
   * @param {Object} options - 验证选项
   * @returns {Promise<Array>} 排序后的候选列表
   */
  async validateAndSort(candidates, options = {}) {
    const validated = await this.validateBatch(candidates, options);

    // 排序：有效 > 未验证 > 无效
    return validated.sort((a, b) => {
      // 有效的排最前
      if (a.validated === true && b.validated !== true) return -1;
      if (a.validated !== true && b.validated === true) return 1;

      // 稳定性评分作为次级排序
      return (b.stabilityScore || 0) - (a.stabilityScore || 0);
    });
  }

  /**
   * 快速检查定位器是否存在
   * @param {string} locator - XPath 定位器
   * @param {number} timeout - 超时时间
   * @returns {Promise<boolean>} 是否存在
   */
  async exists(locator, timeout = 1000) {
    try {
      const element = await this.driver.$(locator);
      await element.waitForExist({ timeout });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取元素信息（用于验证后展示）
   * @param {string} locator - XPath 定位器
   * @returns {Promise<Object|null>} 元素信息
   */
  async getElementInfo(locator) {
    try {
      const element = await this.driver.$(locator);
      await element.waitForExist({ timeout: 2000 });

      const [text, isDisplayed, isEnabled] = await Promise.all([
        element.getText().catch(() => ''),
        element.isDisplayed().catch(() => false),
        element.isEnabled().catch(() => false)
      ]);

      return {
        locator,
        text,
        isDisplayed,
        isEnabled,
        exists: true
      };
    } catch {
      return {
        locator,
        exists: false
      };
    }
  }
}

module.exports = LocatorValidator;