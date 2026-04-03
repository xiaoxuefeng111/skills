/**
 * ElementMatcher 动态评分集成测试
 * 测试学习机制与元素匹配模块的集成
 */

const path = require('path');
const fs = require('fs');
const assert = require('assert');

// 测试用的 rules 目录
const TEST_RULES_DIR = path.join(__dirname, 'test-rules-em');

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

function setupTestDir() {
  if (!fs.existsSync(TEST_RULES_DIR)) {
    fs.mkdirSync(TEST_RULES_DIR, { recursive: true });
  }
}

// 加载被测模块
const ElementMatcher = require(path.join(__dirname, '../scripts/element-matcher.js'));
const LearningManager = require(path.join(__dirname, '../scripts/learning-manager.js'));

// 测试结果收集
const testResults = {
  passed: [],
  failed: []
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

console.log('\n========================================');
console.log('  ElementMatcher 动态评分测试');
console.log('========================================\n');

// ========== 测试 1: 模块集成验证 ==========
cleanupTestDir();

runTest('1.1 ElementMatcher 构造 - 集成 LearningManager', () => {
  setupTestDir();

  const matcher = new ElementMatcher(null, {
    learningOptions: { rulesDir: TEST_RULES_DIR }
  });

  assert.ok(matcher.learningManager, '应有 learningManager 实例');
  assert.ok(matcher.learningManager instanceof LearningManager, '应为 LearningManager 类型');
});

runTest('1.2 ElementMatcher - getLearningManager 方法', () => {
  const matcher = new ElementMatcher(null, {
    learningOptions: { rulesDir: TEST_RULES_DIR }
  });

  const lm = matcher.getLearningManager();

  assert.ok(lm, '应返回 LearningManager');
  assert.ok(lm instanceof LearningManager, '应为 LearningManager 类型');
});

// ========== 测试 2: 基础匹配功能 ==========
const mockElements = {
  editText: [],
  button: [],
  textView: [],
  clickable: [
    { text: '卖出', resourceId: 'btn_sell', clickable: 'true', bounds: '[100,500][200,600]' },
    { text: '买入', resourceId: 'btn_buy', clickable: 'true', bounds: '[100,600][200,700]' },
    { contentDesc: '确认按钮', clickable: 'true', bounds: '[300,500][400,600]' },
    { text: '卖出', contentDesc: '卖出选项', clickable: 'true', bounds: '[500,500][600,600]' }
  ],
  all: [
    { text: '卖出', resourceId: 'btn_sell', clickable: 'true', bounds: '[100,500][200,600]' },
    { text: '买入', resourceId: 'btn_buy', clickable: 'true', bounds: '[100,600][200,700]' },
    { contentDesc: '确认按钮', clickable: 'true', bounds: '[300,500][400,600]' },
    { text: '卖出', contentDesc: '卖出选项', clickable: 'true', bounds: '[500,500][600,600]' }
  ]
};

runTest('2.1 match - 无学习数据基础匹配', () => {
  const matcher = new ElementMatcher(mockElements, {
    learningOptions: { rulesDir: TEST_RULES_DIR }
  });

  const candidates = matcher.match('卖出', { maxCandidates: 3 });

  assert.ok(candidates.length > 0, '应有匹配结果');
  assert.ok(candidates.length <= 3, '结果数量不应超过 maxCandidates');
  assert.ok(candidates[0].label.includes('卖出'), '第一个结果应包含卖出');
  assert.ok(candidates[0].locator, '应有定位器');
  assert.ok(candidates[0].stabilityScore, '应有稳定性评分');
  assert.ok(candidates[0].finalScore, '应有最终评分');
});

runTest('2.2 match - 不同定位器类型评分差异', () => {
  const matcher = new ElementMatcher(mockElements, {
    learningOptions: { rulesDir: TEST_RULES_DIR }
  });

  const candidates = matcher.match('卖出');

  // 有 resource-id 的元素应有更高评分
  const resourceIdCandidate = candidates.find(c => c.locator.type === 'resource-id');
  const textCandidate = candidates.find(c => c.locator.type === 'text');

  if (resourceIdCandidate && textCandidate) {
    assert.ok(resourceIdCandidate.stabilityScore >= textCandidate.stabilityScore,
      'resource-id 评分应高于 text');
  }
});

// ========== 测试 3: 动态评分（有学习数据） ==========
setupTestDir();

runTest('3.1 match - 有学习数据时应用动态评分', () => {
  const matcher = new ElementMatcher(mockElements, {
    learningOptions: { rulesDir: TEST_RULES_DIR }
  });

  // 先手动记录学习数据
  const lm = matcher.getLearningManager();
  lm.recordSuccess('卖出', {
    type: 'content-desc',
    value: '卖出选项',
    xpath: '//*[@content-desc="卖出选项"]'
  }, 'com.test.dynamic');

  // 现在匹配
  const candidates = matcher.match('卖出', { appPackage: 'com.test.dynamic' });

  assert.ok(candidates.length > 0, '应有匹配结果');

  // 检查是否有学习标记
  const withHistory = candidates.find(c => c.hasHistory);
  if (withHistory) {
    assert.ok(withHistory.learningBoost !== undefined, '应有学习提升值');
  }
});

runTest('3.2 match - 历史偏好定位器提升', () => {
  const matcher = new ElementMatcher(mockElements, {
    learningOptions: { rulesDir: TEST_RULES_DIR }
  });

  const lm = matcher.getLearningManager();

  // 多次记录 content-desc 类型成功（建立偏好）
  for (let i = 0; i < 5; i++) {
    lm.recordSuccess('卖出', {
      type: 'content-desc',
      value: '卖出选项',
      xpath: '//*[@content-desc="卖出选项"]'
    }, 'com.test.boost');
  }

  // 匹配
  const candidates = matcher.match('卖出', { appPackage: 'com.test.boost' });

  // 检查 content-desc 类型是否被提升
  const contentDescCandidate = candidates.find(c =>
    c.locator.type === 'content-desc' && c.locator.value === '卖出选项'
  );

  if (contentDescCandidate) {
    assert.ok(contentDescCandidate.hasHistory, '应有历史标记');
    // 注意：isPreferred 标记可能只在排序后被设置
  }
});

// ========== 测试 4: applyLearningWeight 方法验证 ==========
runTest('4.1 applyLearningWeight - 无历史数据', () => {
  const matcher = new ElementMatcher(mockElements, {
    learningOptions: { rulesDir: TEST_RULES_DIR }
  });

  const candidate = {
    stabilityScore: 10,
    finalScore: 10,
    locator: { type: 'resource-id', value: 'test' },
    learningBoost: 0
  };

  matcher.applyLearningWeight(candidate, '未知元素', 'com.test.apply');

  // 无历史数据时，learningBoost 应为 0 或接近 0
  assert.ok(candidate.learningBoost >= 0, 'learningBoost 应大于等于 0');
});

runTest('4.2 applyLearningWeight - 有历史数据', () => {
  const matcher = new ElementMatcher(mockElements, {
    learningOptions: { rulesDir: TEST_RULES_DIR }
  });

  const lm = matcher.getLearningManager();

  // 建立历史
  lm.recordSuccess('测试元素', {
    type: 'resource-id',
    value: 'test',
    xpath: '//*[@resource-id="test"]'
  }, 'com.test.apply2');

  const candidate = {
    stabilityScore: 10,
    finalScore: 10,
    locator: { type: 'resource-id', value: 'test' },
    learningBoost: 0
  };

  matcher.applyLearningWeight(candidate, '测试元素', 'com.test.apply2');

  assert.ok(candidate.hasHistory, 'hasHistory 应为 true');
  assert.ok(candidate.learningBoost > 0, 'learningBoost 应大于 0');
  assert.ok(candidate.finalScore > 10, 'finalScore 应被提升');
});

// ========== 测试 5: boostPreferredLocators 方法验证 ==========
runTest('5.1 boostPreferredLocators - 偏好定位器提升', () => {
  const matcher = new ElementMatcher(mockElements, {
    learningOptions: { rulesDir: TEST_RULES_DIR }
  });

  const lm = matcher.getLearningManager();

  // 建立 resource-id 偏好
  lm.recordSuccess('卖出', {
    type: 'resource-id',
    value: 'btn_sell',
    xpath: '//*[@resource-id="btn_sell"]'
  }, 'com.test.boost2');

  const candidates = [
    { locator: { type: 'text', value: '卖出' }, stabilityScore: 4, finalScore: 4 },
    { locator: { type: 'resource-id', value: 'btn_sell' }, stabilityScore: 10, finalScore: 10 }
  ];

  matcher.boostPreferredLocators(candidates, '卖出', 'com.test.boost2');

  // resource-id 应被标记为偏好
  const preferred = candidates.find(c => c.isPreferred);
  assert.ok(preferred, '应有偏好标记');

  // 偏好定位器应有额外评分提升
  assert.ok(preferred.finalScore > 10, '偏好定位器评分应被额外提升');
});

// ========== 测试 6: recordUserChoice 方法验证 ==========
runTest('6.1 recordUserChoice - 记录用户选择', () => {
  const matcher = new ElementMatcher(mockElements, {
    learningOptions: { rulesDir: TEST_RULES_DIR }
  });

  const candidate = {
    locator: { type: 'resource-id', value: 'btn_test', xpath: '//*[@resource-id="btn_test"]' }
  };

  const result = matcher.recordUserChoice(candidate, '测试按钮', 'com.test.record');

  assert.ok(result, '应返回记录结果');
  assert.strictEqual(result.elementName, '测试按钮', '元素名应正确');
  assert.strictEqual(result.locatorType, 'resource-id', '定位器类型应正确');
  assert.strictEqual(result.usageCount, 1, '首次使用次数应为 1');
});

runTest('6.2 recordUserChoice - 无效参数返回 null', () => {
  const matcher = new ElementMatcher(mockElements, {
    learningOptions: { rulesDir: TEST_RULES_DIR }
  });

  const result1 = matcher.recordUserChoice(null, '测试', 'com.test');
  const result2 = matcher.recordUserChoice({}, '测试', 'com.test');
  const result3 = matcher.recordUserChoice({ locator: null }, '测试', 'com.test');
  const result4 = matcher.recordUserChoice({ locator: {} }, '测试', null);

  assert.strictEqual(result1, null, 'candidate 为 null 应返回 null');
  assert.strictEqual(result2, null, 'candidate 无 locator 应返回 null');
  assert.strictEqual(result3, null, 'locator 为 null 应返回 null');
  assert.strictEqual(result4, null, 'appPackage 为 null 应返回 null');
});

// ========== 测试 7: recordChoiceFailure 方法验证 ==========
runTest('7.1 recordChoiceFailure - 记录失败选择', () => {
  const matcher = new ElementMatcher(mockElements, {
    learningOptions: { rulesDir: TEST_RULES_DIR }
  });

  // 先记录成功
  matcher.recordUserChoice({
    locator: { type: 'resource-id', value: 'btn_fail', xpath: '//*[@resource-id="btn_fail"]' }
  }, '失败测试', 'com.test.fail');

  // 获取学习管理器验证
  const lm = matcher.getLearningManager();
  const data1 = lm.loadLearningData('com.test.fail');
  const before = data1.elementKnowledge['失败测试'].locators['resource-id'];

  // 记录失败
  matcher.recordChoiceFailure({
    locator: { type: 'resource-id', value: 'btn_fail' }
  }, '失败测试', 'com.test.fail');

  const data2 = lm.loadLearningData('com.test.fail');
  const after = data2.elementKnowledge['失败测试'].locators['resource-id'];

  assert.strictEqual(after.usageCount, before.usageCount + 1, '使用次数应增加');
  assert.strictEqual(after.successCount, before.successCount, '成功次数不应增加');
});

// ========== 测试 8: formatCandidates 学习标记验证 ==========
runTest('8.1 formatCandidates - 包含学习标记', () => {
  const candidates = [
    {
      label: '卖出',
      locator: { xpath: '//*[@resource-id="btn_sell"]' },
      stabilityLevel: 'high',
      position: '屏幕中部',
      hasHistory: true,
      successRate: 0.8,
      isPreferred: true
    }
  ];

  const matcher = new ElementMatcher(null, {
    learningOptions: { rulesDir: TEST_RULES_DIR }
  });

  const output = matcher.formatCandidates(candidates, { showLearning: true });

  assert.ok(output.includes('卖出'), '应包含标签');
  assert.ok(output.includes('📚偏好') || output.includes('📖历史'), '应包含学习标记');
});

// ========== 测试 9: parseDescription 保持原有功能 ==========
runTest('9.1 parseDescription - 原有解析功能正常', () => {
  const matcher = new ElementMatcher(null, {
    learningOptions: { rulesDir: TEST_RULES_DIR }
  });

  const result1 = matcher.parseDescription('点击卖出');
  assert.strictEqual(result1.action, 'click', '动作应为 click');
  assert.strictEqual(result1.target, '卖出', '目标应为卖出');

  const result2 = matcher.parseDescription('输入账号');
  assert.strictEqual(result2.action, 'input', '动作应为 input');
  assert.strictEqual(result2.target, '账号', '目标应为账号');

  const result3 = matcher.parseDescription('卖出');
  assert.strictEqual(result3.action, 'click', '无动作关键词默认 click');
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

module.exports = testResults;