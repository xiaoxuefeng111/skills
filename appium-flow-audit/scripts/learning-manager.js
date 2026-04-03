/**
 * 学习数据管理模块
 * 记录定位器使用历史，根据成功率动态调整推荐权重
 *
 * 用法:
 *   const LearningManager = require('./learning-manager');
 *   const learning = new LearningManager();
 *   learning.recordSuccess('卖出', { type: 'resource-id', value: 'btn_sell' }, 'com.example.app');
 *   const preferred = learning.getPreferredLocator('卖出', 'com.example.app');
 */

const fs = require('fs');
const path = require('path');

// 默认数据结构
const DEFAULT_DATA = {
  appPackage: '',
  lastUpdated: null,
  totalSessions: 0,
  elementKnowledge: {},
  userPreferences: {
    preferredLocatorTypes: ['resource-id', 'content-desc', 'hint', 'text', 'class']
  }
};

// 定位器类型权重（用于推荐权重计算）
const LOCATOR_TYPE_WEIGHTS = {
  'resource-id': 1.5,
  'content-desc': 1.3,
  'hint': 1.2,
  'text': 1.0,
  'class': 0.8
};

class LearningManager {
  constructor(options = {}) {
    this.rulesDir = options.rulesDir || path.join(process.cwd(), 'rules');
    this.cache = new Map(); // 内存缓存
    this.ensureRulesDir();
  }

  /**
   * 确保 rules 目录存在
   */
  ensureRulesDir() {
    if (!fs.existsSync(this.rulesDir)) {
      fs.mkdirSync(this.rulesDir, { recursive: true });
    }
  }

  /**
   * 获取数据文件路径
   * @param {string} appPackage - 应用包名
   * @returns {string} 数据文件路径
   */
  getDataFilePath(appPackage) {
    return path.join(this.rulesDir, `${appPackage}.json`);
  }

  /**
   * 加载学习数据
   * @param {string} appPackage - 应用包名
   * @returns {Object} 学习数据
   */
  loadLearningData(appPackage) {
    // 检查缓存
    if (this.cache.has(appPackage)) {
      return this.cache.get(appPackage);
    }

    const filePath = this.getDataFilePath(appPackage);

    // 文件不存在则返回默认数据
    if (!fs.existsSync(filePath)) {
      const defaultData = {
        ...DEFAULT_DATA,
        appPackage,
        lastUpdated: new Date().toISOString()
      };
      this.cache.set(appPackage, defaultData);
      return defaultData;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content);
      this.cache.set(appPackage, data);
      return data;
    } catch (error) {
      console.error(`加载学习数据失败: ${error.message}`);
      // 返回默认数据
      const defaultData = {
        ...DEFAULT_DATA,
        appPackage,
        lastUpdated: new Date().toISOString()
      };
      this.cache.set(appPackage, defaultData);
      return defaultData;
    }
  }

  /**
   * 保存学习数据
   * @param {string} appPackage - 应用包名
   * @param {Object} data - 学习数据
   */
  saveLearningData(appPackage, data) {
    const filePath = this.getDataFilePath(appPackage);

    // 更新时间戳
    data.lastUpdated = new Date().toISOString();

    // 写入文件
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
      // 更新缓存
      this.cache.set(appPackage, data);
      console.log(`学习数据已保存: ${filePath}`);
    } catch (error) {
      console.error(`保存学习数据失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 记录成功选择
   * @param {string} elementName - 元素名称（用户描述）
   * @param {Object} locator - 定位器信息 { type, value, xpath }
   * @param {string} appPackage - 应用包名
   */
  recordSuccess(elementName, locator, appPackage) {
    const data = this.loadLearningData(appPackage);

    // 确保 elementKnowledge 存在
    if (!data.elementKnowledge) {
      data.elementKnowledge = {};
    }

    // 获取或创建元素知识条目
    if (!data.elementKnowledge[elementName]) {
      data.elementKnowledge[elementName] = {
        preferredLocator: locator.type,
        locators: {}
      };
    }

    const elemKnowledge = data.elementKnowledge[elementName];

    // 确保 locators 存在
    if (!elemKnowledge.locators) {
      elemKnowledge.locators = {};
    }

    // 更新定位器统计
    const locatorKey = locator.type;
    if (!elemKnowledge.locators[locatorKey]) {
      elemKnowledge.locators[locatorKey] = {
        value: locator.value,
        xpath: locator.xpath,
        usageCount: 0,
        successCount: 0,
        firstUsed: new Date().toISOString(),
        lastUsed: null
      };
    }

    const locatorStats = elemKnowledge.locators[locatorKey];
    locatorStats.usageCount += 1;
    locatorStats.successCount += 1;
    locatorStats.lastUsed = new Date().toISOString();

    // 更新偏好定位器（成功率最高的，成功率相同时选使用次数多的）
    const currentPreferred = elemKnowledge.preferredLocator;
    const currentSuccessRate = this.getSuccessRate({ type: currentPreferred }, appPackage, elementName);
    const newSuccessRate = locatorStats.successCount / locatorStats.usageCount;

    // 获取当前偏好定位器的使用次数
    const currentPreferredKey = currentPreferred;
    const currentUsage = (currentPreferred && elemKnowledge.locators[currentPreferredKey])
      ? elemKnowledge.locators[currentPreferredKey].usageCount
      : 0;

    // 偏好更新条件：成功率更高，或成功率相同但使用次数更多
    if (newSuccessRate > currentSuccessRate ||
        (newSuccessRate === currentSuccessRate && locatorStats.usageCount > currentUsage) ||
        !currentPreferred) {
      elemKnowledge.preferredLocator = locator.type;
    }

    // 更新会话计数
    data.totalSessions += 1;

    // 保存数据
    this.saveLearningData(appPackage, data);

    return {
      elementName,
      locatorType: locator.type,
      usageCount: locatorStats.usageCount,
      successCount: locatorStats.successCount,
      successRate: newSuccessRate
    };
  }

  /**
   * 记录失败选择（可选）
   * @param {string} elementName - 元素名称
   * @param {Object} locator - 定位器信息
   * @param {string} appPackage - 应用包名
   */
  recordFailure(elementName, locator, appPackage) {
    const data = this.loadLearningData(appPackage);

    if (!data.elementKnowledge || !data.elementKnowledge[elementName]) {
      return; // 无记录，跳过
    }

    const elemKnowledge = data.elementKnowledge[elementName];
    const locatorKey = locator.type;

    if (!elemKnowledge.locators || !elemKnowledge.locators[locatorKey]) {
      return; // 无记录，跳过
    }

    // 只增加使用次数，不增加成功次数
    const locatorStats = elemKnowledge.locators[locatorKey];
    locatorStats.usageCount += 1;
    locatorStats.lastUsed = new Date().toISOString();

    this.saveLearningData(appPackage, data);
  }

  /**
   * 获取偏好定位器
   * @param {string} elementName - 元素名称
   * @param {string} appPackage - 应用包名
   * @returns {Object|null} 偏好定位器信息 { type, value, xpath, successRate }
   */
  getPreferredLocator(elementName, appPackage) {
    const data = this.loadLearningData(appPackage);

    if (!data.elementKnowledge || !data.elementKnowledge[elementName]) {
      return null;
    }

    const elemKnowledge = data.elementKnowledge[elementName];
    const preferredType = elemKnowledge.preferredLocator;

    if (!preferredType || !elemKnowledge.locators || !elemKnowledge.locators[preferredType]) {
      return null;
    }

    const locatorStats = elemKnowledge.locators[preferredType];
    const successRate = locatorStats.successCount / locatorStats.usageCount;

    return {
      type: preferredType,
      value: locatorStats.value,
      xpath: locatorStats.xpath,
      usageCount: locatorStats.usageCount,
      successCount: locatorStats.successCount,
      successRate
    };
  }

  /**
   * 获取定位器成功率
   * @param {Object} locator - 定位器信息 { type }
   * @param {string} appPackage - 应用包名
   * @param {string} elementName - 元素名称（可选）
   * @returns {number} 成功率 (0-1)
   */
  getSuccessRate(locator, appPackage, elementName = null) {
    const data = this.loadLearningData(appPackage);

    // 如果指定了元素名称，获取特定元素的成功率
    if (elementName && data.elementKnowledge && data.elementKnowledge[elementName]) {
      const elemKnowledge = data.elementKnowledge[elementName];
      const locatorKey = locator.type;

      if (elemKnowledge.locators && elemKnowledge.locators[locatorKey]) {
        const stats = elemKnowledge.locators[locatorKey];
        if (stats.usageCount > 0) {
          return stats.successCount / stats.usageCount;
        }
      }
      return 0;
    }

    // 否则计算全局成功率（按定位器类型）
    let totalUsage = 0;
    let totalSuccess = 0;

    if (data.elementKnowledge) {
      for (const elemName in data.elementKnowledge) {
        const elemKnowledge = data.elementKnowledge[elemName];
        if (elemKnowledge.locators && elemKnowledge.locators[locator.type]) {
          const stats = elemKnowledge.locators[locator.type];
          totalUsage += stats.usageCount || 0;
          totalSuccess += stats.successCount || 0;
        }
      }
    }

    return totalUsage > 0 ? totalSuccess / totalUsage : 0;
  }

  /**
   * 计算推荐权重（动态评分）
   * @param {string} elementName - 元素名称
   * @param {Object} locator - 定位器信息 { type, value }
   * @param {string} appPackage - 应用包名
   * @returns {number} 推荐权重评分
   */
  calculateRecommendWeight(elementName, locator, appPackage) {
    // 获取成功率
    const successRate = this.getSuccessRate(locator, appPackage, elementName);

    // 获取定位器类型基础权重
    const typeWeight = LOCATOR_TYPE_WEIGHTS[locator.type] || 1.0;

    // 获取使用次数权重（ logarithmic，避免过度偏向高频使用）
    const data = this.loadLearningData(appPackage);
    let usageCount = 0;

    if (data.elementKnowledge && data.elementKnowledge[elementName]) {
      const elemKnowledge = data.elementKnowledge[elementName];
      if (elemKnowledge.locators && elemKnowledge.locators[locator.type]) {
        usageCount = elemKnowledge.locators[locator.type].usageCount || 0;
      }
    }

    // 使用次数权重：log(usageCount + 1) / 10，最大贡献 0.3
    const usageWeight = Math.min(Math.log10(usageCount + 1) / 10, 0.3);

    // 综合权重 = 基础权重 * (成功率 + 使用次数权重)
    // 成功率权重最大贡献 0.7
    const finalWeight = typeWeight * (Math.min(successRate, 0.7) + usageWeight);

    return finalWeight;
  }

  /**
   * 获取所有元素的偏好定位器列表
   * @param {string} appPackage - 应用包名
   * @returns {Object} 元素偏好映射 { elementName: preferredLocator }
   */
  getAllPreferredLocators(appPackage) {
    const data = this.loadLearningData(appPackage);
    const result = {};

    if (data.elementKnowledge) {
      for (const elementName in data.elementKnowledge) {
        const preferred = this.getPreferredLocator(elementName, appPackage);
        if (preferred) {
          result[elementName] = preferred;
        }
      }
    }

    return result;
  }

  /**
   * 获取学习统计摘要
   * @param {string} appPackage - 应用包名
   * @returns {Object} 统计摘要
   */
  getLearningStats(appPackage) {
    const data = this.loadLearningData(appPackage);

    let totalElements = 0;
    let totalLocators = 0;
    let totalUsage = 0;
    let totalSuccess = 0;

    if (data.elementKnowledge) {
      totalElements = Object.keys(data.elementKnowledge).length;

      for (const elemName in data.elementKnowledge) {
        const elemKnowledge = data.elementKnowledge[elemName];
        if (elemKnowledge.locators) {
          totalLocators += Object.keys(elemKnowledge.locators).length;

          for (const locType in elemKnowledge.locators) {
            const stats = elemKnowledge.locators[locType];
            totalUsage += stats.usageCount || 0;
            totalSuccess += stats.successCount || 0;
          }
        }
      }
    }

    return {
      appPackage,
      totalSessions: data.totalSessions || 0,
      totalElements,
      totalLocators,
      totalUsage,
      totalSuccess,
      overallSuccessRate: totalUsage > 0 ? totalSuccess / totalUsage : 0,
      lastUpdated: data.lastUpdated
    };
  }

  /**
   * 清除缓存
   * @param {string} appPackage - 应用包名（可选，不传则清除全部）
   */
  clearCache(appPackage = null) {
    if (appPackage) {
      this.cache.delete(appPackage);
    } else {
      this.cache.clear();
    }
  }

  /**
   * 重置学习数据（删除文件）
   * @param {string} appPackage - 应用包名
   */
  resetLearningData(appPackage) {
    const filePath = this.getDataFilePath(appPackage);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    this.cache.delete(appPackage);
    console.log(`学习数据已重置: ${appPackage}`);
  }

  /**
   * 导出学习数据（用于备份或迁移）
   * @param {string} appPackage - 应用包名
   * @returns {string} JSON 字符串
   */
  exportLearningData(appPackage) {
    const data = this.loadLearningData(appPackage);
    return JSON.stringify(data, null, 2);
  }

  /**
   * 导入学习数据（用于恢复或迁移）
   * @param {string} appPackage - 应用包名
   * @param {string|Object} jsonData - JSON 数据
   */
  importLearningData(appPackage, jsonData) {
    let data;

    if (typeof jsonData === 'string') {
      data = JSON.parse(jsonData);
    } else {
      data = jsonData;
    }

    // 校验数据结构
    if (!data.appPackage) {
      data.appPackage = appPackage;
    }

    // 合合默认结构
    data = {
      ...DEFAULT_DATA,
      ...data,
      appPackage
    };

    this.saveLearningData(appPackage, data);
    console.log(`学习数据已导入: ${appPackage}`);
  }
}

module.exports = LearningManager;