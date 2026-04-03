/**
 * LearningManager 单元测试
 * 测试学习数据管理模块的核心功能
 */

const path = require('path');
const fs = require('fs');
const assert = require('assert');

// 测试用的 rules 目录
const TEST_RULES_DIR = path.join(__dirname, 'test-rules');

// 清理测试目录
function cleanupTestDir() {
  if (fs.existsSync(TEST_RULES_DIR)) {
    const files = fs.readdirSync(TEST_RULES_DIR);
    files.forEach(file => {
      fs.unlinkSync(path.join(TEST_RULES_DIR, file));
    });
    fs.rmdirSync(TEST_RULES_DIR);
  }
}

// 创建测试目录
function setupTestDir() {
  if (!fs.existsSync(TEST_RULES_DIR)) {
    fs.mkdirSync(TEST_RULES_DIR, { recursive: true });
  }
}

// 测试结果收集
const testResults = {
  passed: [],
  failed: [],
  errors: []
};

function runTest(name, testFn) {
  try {
    testFn();
    testResults.passed.push(name);
    console.log(`✓ ${name}`);
  } catch (error) {
    testResults.failed.push({ name, error: error.message });
    console.log(`✗ ${name}: ${error.message}`);
  }
}

// 加载被测模块
const LearningManager = require(path.join(__dirname, '../scripts/learning-manager.js'));

console.log('\n========================================');
console.log('  LearningManager 单元测试');
console.log('========================================\n');

// ========== 测试 1: 构造函数和目录创建 ==========
cleanupTestDir();

runTest('1.1 构造函数 - 创建 rules 目录', () => {
  const learning = new LearningManager({ rulesDir: TEST_RULES_DIR });
  assert.ok(fs.existsSync(TEST_RULES_DIR), 'rules 目录应该被创建');
});

runTest('1.2 构造函数 - 使用默认目录', () => {
  const learning = new LearningManager();
  assert.ok(learning.rulesDir, '应有默认 rulesDir');
});

// ========== 测试 2: loadLearningData ==========
setupTestDir();

runTest('2.1 loadLearningData - 文件不存在返回默认数据', () => {
  const learning = new LearningManager({ rulesDir: TEST_RULES_DIR });
  const data = learning.loadLearningData('com.test.app');

  assert.strictEqual(data.appPackage, 'com.test.app', 'appPackage 应正确设置');
  assert.ok(data.elementKnowledge, '应有 elementKnowledge 结构');
  assert.ok(data.userPreferences, '应有 userPreferences 结构');
  assert.strictEqual(data.totalSessions, 0, '初始 totalSessions 应为 0');
});

runTest('2.2 loadLearningData - 文件存在时正确读取', () => {
  const learning = new LearningManager({ rulesDir: TEST_RULES_DIR });

  // 先写入测试数据
  const testData = {
    appPackage: 'com.test.existing',
    totalSessions: 5,
    elementKnowledge: {
      '卖出': {
        preferredLocator: 'resource-id',
        locators: {
          'resource-id': {
            value: 'btn_sell',
            xpath: '//*[@resource-id="btn_sell"]',
            usageCount: 10,
            successCount: 8,
            firstUsed: '2025-01-01T00:00:00Z',
            lastUsed: '2025-01-10T00:00:00Z'
          }
        }
      }
    }
  };

  fs.writeFileSync(
    path.join(TEST_RULES_DIR, 'com.test.existing.json'),
    JSON.stringify(testData, null, 2)
  );

  const data = learning.loadLearningData('com.test.existing');

  assert.strictEqual(data.totalSessions, 5, 'totalSessions 应正确读取');
  assert.ok(data.elementKnowledge['卖出'], '应有卖出元素知识');
  assert.strictEqual(data.elementKnowledge['卖出'].locators['resource-id'].usageCount, 10, 'usageCount 应正确');
});

runTest('2.3 loadLearningData - 缓存机制验证', () => {
  const learning = new LearningManager({ rulesDir: TEST_RULES_DIR });

  // 第一次加载
  const data1 = learning.loadLearningData('com.test.cache');

  // 第二次加载（应使用缓存）
  const data2 = learning.loadLearningData('com.test.cache');

  // 验证缓存生效（修改 data1 不影响 data2 的来源）
  assert.ok(learning.cache.has('com.test.cache'), '缓存应有记录');
});

// ========== 测试 3: recordSuccess ==========
setupTestDir();

runTest('3.1 recordSuccess - 新元素首次记录', () => {
  const learning = new LearningManager({ rulesDir: TEST_RULES_DIR });

  const result = learning.recordSuccess('买入', {
    type: 'resource-id',
    value: 'btn_buy',
    xpath: '//*[@resource-id="btn_buy"]'
  }, 'com.test.new');

  assert.strictEqual(result.elementName, '买入', '元素名应正确');
  assert.strictEqual(result.locatorType, 'resource-id', '定位器类型应正确');
  assert.strictEqual(result.usageCount, 1, '首次 usageCount 应为 1');
  assert.strictEqual(result.successCount, 1, '首次 successCount 应为 1');
  assert.strictEqual(result.successRate, 1, '首次成功率应为 1');

  // 验证数据已保存
  const data = learning.loadLearningData('com.test.new');
  assert.ok(data.elementKnowledge['买入'], '应有买入元素知识');
});

runTest('3.2 recordSuccess - 已有元素追加记录', () => {
  const learning = new LearningManager({ rulesDir: TEST_RULES_DIR });

  // 第一次记录
  learning.recordSuccess('确认', {
    type: 'text',
    value: '确认',
    xpath: '//*[@text="确认"]'
  }, 'com.test.append');

  // 第二次记录（相同元素，不同定位器）
  learning.recordSuccess('确认', {
    type: 'content-desc',
    value: '确认按钮',
    xpath: '//*[@content-desc="确认按钮"]'
  }, 'com.test.append');

  const data = learning.loadLearningData('com.test.append');

  assert.ok(data.elementKnowledge['确认'].locators['text'], '应有 text 定位器');
  assert.ok(data.elementKnowledge['确认'].locators['content-desc'], '应有 content-desc 定位器');
});

runTest('3.3 recordSuccess - 更新偏好定位器', () => {
  const learning = new LearningManager({ rulesDir: TEST_RULES_DIR });

  // 记录低成功率定位器
  learning.recordSuccess('删除', {
    type: 'text',
    value: '删除',
    xpath: '//*[@text="删除"]'
  }, 'com.test.pref');

  // 记录高成功率定位器（模拟多次成功）
  for (let i = 0; i < 5; i++) {
    learning.recordSuccess('删除', {
      type: 'resource-id',
      value: 'btn_delete',
      xpath: '//*[@resource-id="btn_delete"]'
    }, 'com.test.pref');
  }

  const data = learning.loadLearningData('com.test.pref');

  // resource-id 成功率更高，应成为偏好
  assert.strictEqual(data.elementKnowledge['删除'].preferredLocator, 'resource-id', '偏好定位器应更新');
});

// ========== 测试 4: recordFailure ==========
runTest('4.1 recordFailure - 增加使用次数但不增加成功次数', () => {
  const learning = new LearningManager({ rulesDir: TEST_RULES_DIR });

  // 先记录成功
  learning.recordSuccess('取消', {
    type: 'resource-id',
    value: 'btn_cancel',
    xpath: '//*[@resource-id="btn_cancel"]'
  }, 'com.test.fail');

  const data1 = learning.loadLearningData('com.test.fail');
  const beforeUsage = data1.elementKnowledge['取消'].locators['resource-id'].usageCount;
  const beforeSuccess = data1.elementKnowledge['取消'].locators['resource-id'].successCount;

  // 记录失败
  learning.recordFailure('取消', {
    type: 'resource-id',
    value: 'btn_cancel'
  }, 'com.test.fail');

  const data2 = learning.loadLearningData('com.test.fail');
  const afterUsage = data2.elementKnowledge['取消'].locators['resource-id'].usageCount;
  const afterSuccess = data2.elementKnowledge['取消'].locators['resource-id'].successCount;

  assert.strictEqual(afterUsage, beforeUsage + 1, '使用次数应增加');
  assert.strictEqual(afterSuccess, beforeSuccess, '成功次数不应增加');
});

runTest('4.2 recordFailure - 无记录时静默处理', () => {
  const learning = new LearningManager({ rulesDir: TEST_RULES_DIR });

  // 对不存在元素记录失败（应静默处理）
  learning.recordFailure('未知元素', {
    type: 'text',
    value: 'unknown'
  }, 'com.test.norecord');

  const data = learning.loadLearningData('com.test.norecord');
  assert.ok(!data.elementKnowledge['未知元素'], '不应创建未知元素记录');
});

// ========== 测试 5: getPreferredLocator ==========
runTest('5.1 getPreferredLocator - 获取偏好定位器', () => {
  const learning = new LearningManager({ rulesDir: TEST_RULES_DIR });

  // 创建测试数据
  learning.recordSuccess('提交', {
    type: 'resource-id',
    value: 'btn_submit',
    xpath: '//*[@resource-id="btn_submit"]'
  }, 'com.test.preferred');

  const preferred = learning.getPreferredLocator('提交', 'com.test.preferred');

  assert.ok(preferred, '应返回偏好定位器');
  assert.strictEqual(preferred.type, 'resource-id', '类型应正确');
  assert.strictEqual(preferred.value, 'btn_submit', '值应正确');
  assert.strictEqual(preferred.successRate, 1, '成功率应正确');
});

runTest('5.2 getPreferredLocator - 无历史时返回 null', () => {
  const learning = new LearningManager({ rulesDir: TEST_RULES_DIR });

  const preferred = learning.getPreferredLocator('不存在', 'com.test.nopref');

  assert.strictEqual(preferred, null, '无历史时应返回 null');
});

// ========== 测试 6: calculateRecommendWeight ==========
runTest('6.1 calculateRecommendWeight - 无历史数据时返回基础权重', () => {
  const learning = new LearningManager({ rulesDir: TEST_RULES_DIR });

  // resource-id 类型基础权重 1.5
  const weight = learning.calculateRecommendWeight('新元素', {
    type: 'resource-id',
    value: 'new_btn'
  }, 'com.test.weight');

  // 无历史数据，成功率=0，使用次数=0
  // weight = 1.5 * (min(0, 0.7) + min(log10(1)/10, 0.3)) = 1.5 * 0 = 0
  assert.strictEqual(weight, 0, '无历史数据权重应为 0');
});

runTest('6.2 calculateRecommendWeight - 有历史数据时返回更高权重', () => {
  const learning = new LearningManager({ rulesDir: TEST_RULES_DIR });

  // 先记录成功（增加历史）
  learning.recordSuccess('有历史', {
    type: 'resource-id',
    value: 'btn_history',
    xpath: '//*[@resource-id="btn_history"]'
  }, 'com.test.weight2');

  const weight = learning.calculateRecommendWeight('有历史', {
    type: 'resource-id',
    value: 'btn_history'
  }, 'com.test.weight2');

  // 有历史数据，成功率=1，使用次数=1
  // weight = 1.5 * (min(1, 0.7) + min(log10(2)/10, 0.3))
  //        = 1.5 * (0.7 + 0.03) = 1.5 * 0.73 ≈ 1.095
  assert.ok(weight > 0, '有历史数据权重应大于 0');
});

// ========== 测试 7: getLearningStats ==========
runTest('7.1 getLearningStats - 综合统计', () => {
  const learning = new LearningManager({ rulesDir: TEST_RULES_DIR });

  // 创建多个元素记录
  learning.recordSuccess('元素A', { type: 'resource-id', value: 'a', xpath: '//*[@resource-id="a"]' }, 'com.test.stats');
  learning.recordSuccess('元素B', { type: 'text', value: 'b', xpath: '//*[@text="b"]' }, 'com.test.stats');
  learning.recordSuccess('元素A', { type: 'resource-id', value: 'a', xpath: '//*[@resource-id="a"]' }, 'com.test.stats');

  const stats = learning.getLearningStats('com.test.stats');

  assert.strictEqual(stats.totalElements, 2, '应有 2 个元素');
  assert.ok(stats.totalLocators >= 2, '定位器数量应正确');
  assert.ok(stats.totalUsage >= 3, '总使用次数应正确');
  assert.ok(stats.totalSuccess >= 3, '总成功次数应正确');
  assert.ok(stats.overallSuccessRate > 0, '成功率应大于 0');
});

// ========== 测试 8: 数据存储格式验证 ==========
runTest('8.1 数据存储格式 - JSON 文件正确性', () => {
  const learning = new LearningManager({ rulesDir: TEST_RULES_DIR });

  learning.recordSuccess('格式验证', {
    type: 'content-desc',
    value: 'format_test',
    xpath: '//*[@content-desc="format_test"]'
  }, 'com.test.format');

  const filePath = path.join(TEST_RULES_DIR, 'com.test.format.json');

  assert.ok(fs.existsSync(filePath), '数据文件应存在');

  // 读取并验证 JSON 格式
  const content = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(content);

  assert.ok(data.lastUpdated, '应有 lastUpdated 时间戳');
  assert.ok(data.appPackage, '应有 appPackage');
  assert.ok(data.elementKnowledge, '应有 elementKnowledge');
  assert.ok(data.userPreferences, '应有 userPreferences');
});

// ========== 测试 9: 导入导出功能 ==========
runTest('9.1 exportLearningData - 导出 JSON', () => {
  const learning = new LearningManager({ rulesDir: TEST_RULES_DIR });

  learning.recordSuccess('导出测试', {
    type: 'resource-id',
    value: 'export_btn',
    xpath: '//*[@resource-id="export_btn"]'
  }, 'com.test.export');

  const exported = learning.exportLearningData('com.test.export');

  assert.ok(typeof exported === 'string', '导出应为字符串');

  const parsed = JSON.parse(exported);
  assert.ok(parsed.elementKnowledge, '导出数据应有效');
});

runTest('9.2 importLearningData - 导入 JSON', () => {
  const learning = new LearningManager({ rulesDir: TEST_RULES_DIR });

  const importData = {
    totalSessions: 100,
    elementKnowledge: {
      '导入元素': {
        preferredLocator: 'text',
        locators: {
          'text': {
            value: 'imported',
            xpath: '//*[@text="imported"]',
            usageCount: 50,
            successCount: 45,
            firstUsed: '2025-01-01T00:00:00Z',
            lastUsed: '2025-01-15T00:00:00Z'
          }
        }
      }
    }
  };

  learning.importLearningData('com.test.import', importData);

  const data = learning.loadLearningData('com.test.import');

  assert.strictEqual(data.totalSessions, 100, '导入的 totalSessions 应正确');
  assert.ok(data.elementKnowledge['导入元素'], '导入的元素应存在');
});

// ========== 测试 10: 清除缓存和重置 ==========
runTest('10.1 clearCache - 清除单个缓存', () => {
  const learning = new LearningManager({ rulesDir: TEST_RULES_DIR });

  learning.loadLearningData('com.test.clear1');
  learning.loadLearningData('com.test.clear2');

  assert.ok(learning.cache.has('com.test.clear1'), '缓存应有记录');
  assert.ok(learning.cache.has('com.test.clear2'), '缓存应有记录');

  learning.clearCache('com.test.clear1');

  assert.ok(!learning.cache.has('com.test.clear1'), '单个缓存应被清除');
  assert.ok(learning.cache.has('com.test.clear2'), '其他缓存应保留');
});

runTest('10.2 resetLearningData - 删除数据文件', () => {
  const learning = new LearningManager({ rulesDir: TEST_RULES_DIR });

  learning.recordSuccess('重置测试', {
    type: 'resource-id',
    value: 'reset_btn',
    xpath: '//*[@resource-id="reset_btn"]'
  }, 'com.test.reset');

  const filePath = path.join(TEST_RULES_DIR, 'com.test.reset.json');
  assert.ok(fs.existsSync(filePath), '数据文件应存在');

  learning.resetLearningData('com.test.reset');

  assert.ok(!fs.existsSync(filePath), '数据文件应被删除');
});

// 清理
cleanupTestDir();

// 输出测试报告
console.log('\n========================================');
console.log('  测试报告');
console.log('========================================\n');
console.log(`总计: ${testResults.passed.length + testResults.failed.length} 个测试`);
console.log(`通过: ${testResults.passed.length}`);
console.log(`失败: ${testResults.failed.length}\n`);

if (testResults.failed.length > 0) {
  console.log('失败的测试:');
  testResults.failed.forEach(f => {
    console.log(`  - ${f.name}: ${f.error}`);
  });
}

console.log('\n');

// 导出结果供集成测试使用
module.exports = testResults;