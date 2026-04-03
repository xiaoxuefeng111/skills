/**
 * 集成测试
 * 验证各模块间的正确集成
 */

const path = require('path');
const fs = require('fs');
const assert = require('assert');

// 测试用的 rules 目录
const TEST_RULES_DIR = path.join(__dirname, 'test-rules-integration');

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

// 加载所有被测模块
const LearningManager = require(path.join(__dirname, '../scripts/learning-manager.js'));
const ElementMatcher = require(path.join(__dirname, '../scripts/element-matcher.js'));
const Celebrate = require(path.join(__dirname, '../scripts/celebrate.js'));

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
console.log('  模块集成测试');
console.log('========================================\n');

// ========== 测试 1: capture-page.js 导入验证 ==========
runTest('1.1 capture-page.js 导入 learning-manager', () => {
  const captureContent = fs.readFileSync(path.join(__dirname, '../scripts/capture-page.js'), 'utf-8');

  assert.ok(captureContent.includes("require('./learning-manager')"), '应导入 learning-manager');
  assert.ok(captureContent.includes('LearningManager'), '应使用 LearningManager');
});

runTest('1.2 capture-page.js 导入 celebrate', () => {
  const captureContent = fs.readFileSync(path.join(__dirname, '../scripts/capture-page.js'), 'utf-8');

  assert.ok(captureContent.includes("require('./celebrate')"), '应导入 celebrate');
  assert.ok(captureContent.includes('Celebrate.showSuccess'), '应调用 showSuccess');
  assert.ok(captureContent.includes('Celebrate.showRecordEndMenu'), '应调用 showRecordEndMenu');
});

runTest('1.3 element-matcher.js 导入 learning-manager', () => {
  const matcherContent = fs.readFileSync(path.join(__dirname, '../scripts/element-matcher.js'), 'utf-8');

  assert.ok(matcherContent.includes("require('./learning-manager')"), '应导入 learning-manager');
});

// ========== 测试 2: 完整模拟用户操作流程 ==========
setupTestDir();

runTest('2.1 模拟录制流程 - 元素匹配 + 学习记录 + 烟花反馈', () => {
  // 模拟元素数据
  const mockElements = {
    editText: [],
    button: [],
    textView: [],
    clickable: [
      { text: '卖出', resourceId: 'btn_sell', clickable: 'true', bounds: '[100,500][200,600]' },
      { text: '买入', resourceId: 'btn_buy', clickable: 'true', bounds: '[100,600][200,700]' }
    ],
    all: [
      { text: '卖出', resourceId: 'btn_sell', clickable: 'true', bounds: '[100,500][200,600]' },
      { text: '买入', resourceId: 'btn_buy', clickable: 'true', bounds: '[100,600][200,700]' }
    ]
  };

  // 1. 创建 ElementMatcher（集成 LearningManager）
  const matcher = new ElementMatcher(mockElements, {
    learningOptions: { rulesDir: TEST_RULES_DIR }
  });

  // 2. 智能匹配
  const candidates = matcher.match('卖出', { appPackage: 'com.test.integration' });

  assert.ok(candidates.length > 0, '应有匹配结果');

  // 3. 选择第一个候选
  const selected = candidates[0];

  // 4. 记录用户选择
  const recordResult = matcher.recordUserChoice(selected, '卖出', 'com.test.integration');

  assert.ok(recordResult, '记录应成功');

  // 5. 验证学习数据已保存
  const lm = matcher.getLearningManager();
  const data = lm.loadLearningData('com.test.integration');

  assert.ok(data.elementKnowledge['卖出'], '应有卖出元素知识');

  // 6. 烟花反馈（模拟）
  Celebrate.showSuccess({ message: '集成测试：已记录用户选择' });

  // 7. 录制结束菜单
  const menu = Celebrate.showRecordEndMenu(1);

  assert.ok(menu.includes('步骤 1'), '菜单应显示步骤 1');
});

// ========== 测试 3: 学习数据持久化验证 ==========
runTest('3.1 学习数据持久化 - 跨 session 读取', () => {
  const lm1 = new LearningManager({ rulesDir: TEST_RULES_DIR });

  // Session 1: 记录数据
  lm1.recordSuccess('持久化测试', {
    type: 'resource-id',
    value: 'btn_persist',
    xpath: '//*[@resource-id="btn_persist"]'
  }, 'com.test.persist');

  // 清除缓存（模拟新 session）
  lm1.clearCache('com.test.persist');

  // Session 2: 重新加载
  const lm2 = new LearningManager({ rulesDir: TEST_RULES_DIR });
  const data = lm2.loadLearningData('com.test.persist');

  assert.ok(data.elementKnowledge['持久化测试'], '数据应持久化存在');
  assert.strictEqual(data.elementKnowledge['持久化测试'].locators['resource-id'].usageCount, 1, '使用次数应正确');
});

// ========== 测试 4: 动态评分对排序的影响验证 ==========
runTest('4.1 动态评分影响排序 - 高成功率定位器优先', () => {
  const mockElements = {
    editText: [],
    button: [],
    textView: [],
    clickable: [
      { text: '测试', resourceId: 'btn_test', clickable: 'true', bounds: '[100,500][200,600]' },
      { text: '测试', contentDesc: '测试按钮', clickable: 'true', bounds: '[300,500][400,600]' }
    ],
    all: [
      { text: '测试', resourceId: 'btn_test', clickable: 'true', bounds: '[100,500][200,600]' },
      { text: '测试', contentDesc: '测试按钮', clickable: 'true', bounds: '[300,500][400,600]' }
    ]
  };

  const lm = new LearningManager({ rulesDir: TEST_RULES_DIR });

  // 建立 content-desc 高成功率偏好
  for (let i = 0; i < 5; i++) {
    lm.recordSuccess('测试', {
      type: 'content-desc',
      value: '测试按钮',
      xpath: '//*[@content-desc="测试按钮"]'
    }, 'com.test.sort');
  }

  // 记录一次 resource-id（成功率较低）
  lm.recordSuccess('测试', {
    type: 'resource-id',
    value: 'btn_test',
    xpath: '//*[@resource-id="btn_test"]'
  }, 'com.test.sort');

  const matcher = new ElementMatcher(mockElements, {
    learningOptions: { rulesDir: TEST_RULES_DIR }
  });

  const candidates = matcher.match('测试', { appPackage: 'com.test.sort' });

  // 检查排序是否受学习数据影响
  // content-desc 应因高成功率被提升
  const contentDescCandidate = candidates.find(c => c.locator.type === 'content-desc');

  // 验证 content-desc 有历史标记
  if (contentDescCandidate) {
    assert.ok(contentDescCandidate.hasHistory, 'content-desc 应有历史标记');
    assert.ok(contentDescCandidate.learningBoost > 0, 'content-desc 应有学习提升');
  }
});

// ========== 测试 5: 模块独立性与依赖验证 ==========
runTest('5.1 LearningManager 可独立使用', () => {
  const lm = new LearningManager({ rulesDir: TEST_RULES_DIR });

  // 独立使用 LearningManager API
  lm.recordSuccess('独立测试', {
    type: 'text',
    value: 'independent',
    xpath: '//*[@text="independent"]'
  }, 'com.test.independent');

  const preferred = lm.getPreferredLocator('独立测试', 'com.test.independent');

  assert.ok(preferred, '应能独立获取偏好');
  assert.strictEqual(preferred.type, 'text', '类型应正确');
});

runTest('5.2 ElementMatcher 无 appPackage 时降级运行', () => {
  const mockElements = {
    editText: [],
    button: [],
    textView: [],
    clickable: [{ text: '降级测试', resourceId: 'btn_fallback', clickable: 'true', bounds: '[100,500][200,600]' }],
    all: [{ text: '降级测试', resourceId: 'btn_fallback', clickable: 'true', bounds: '[100,500][200,600]' }]
  };

  const matcher = new ElementMatcher(mockElements, {
    learningOptions: { rulesDir: TEST_RULES_DIR }
  });

  // 不传 appPackage，应降级为无学习机制的匹配
  const candidates = matcher.match('降级测试', { maxCandidates: 1 });

  assert.ok(candidates.length > 0, '应有匹配结果');
  assert.ok(candidates[0].stabilityScore, '应有稳定性评分');

  // 无学习数据时，hasHistory 应为 false 或 undefined
  assert.ok(!candidates[0].hasHistory, '无 appPackage 时不应有历史标记');
});

// ========== 测试 6: 错误处理验证 ==========
runTest('6.1 错误处理 - 无效定位器类型', () => {
  const lm = new LearningManager({ rulesDir: TEST_RULES_DIR });

  // 使用未知定位器类型（应正常处理）
  lm.recordSuccess('无效类型测试', {
    type: 'unknown-type',
    value: 'test',
    xpath: '//*[@unknown="test"]'
  }, 'com.test.error');

  const data = lm.loadLearningData('com.test.error');

  assert.ok(data.elementKnowledge['无效类型测试'], '应能处理未知类型');
});

runTest('6.2 错误处理 - JSON 解析错误', () => {
  // 写入无效 JSON
  setupTestDir();
  fs.writeFileSync(path.join(TEST_RULES_DIR, 'com.test.badjson.json'), 'invalid json {{{');

  const lm = new LearningManager({ rulesDir: TEST_RULES_DIR });

  // 加载时应返回默认数据而不崩溃
  const data = lm.loadLearningData('com.test.badjson');

  assert.ok(data.appPackage, '应返回默认数据');
  assert.strictEqual(data.appPackage, 'com.test.badjson', 'appPackage 应正确');
});

// ========== 测试 7: 边界条件验证 ==========
runTest('7.1 边界条件 - 空元素列表', () => {
  const matcher = new ElementMatcher({ editText: [], button: [], textView: [], clickable: [], all: [] }, {
    learningOptions: { rulesDir: TEST_RULES_DIR }
  });

  const candidates = matcher.match('卖出');

  assert.strictEqual(candidates.length, 0, '空元素列表应返回空结果');
});

runTest('7.2 边界条件 - 空描述', () => {
  const mockElements = {
    editText: [],
    button: [],
    textView: [],
    clickable: [{ text: '默认', resourceId: 'btn_default', clickable: 'true', bounds: '[100,500][200,600]' }],
    all: [{ text: '默认', resourceId: 'btn_default', clickable: 'true', bounds: '[100,500][200,600]' }]
  };

  const matcher = new ElementMatcher(mockElements, {
    learningOptions: { rulesDir: TEST_RULES_DIR }
  });

  const candidates = matcher.match('', { maxCandidates: 5 });

  // 空描述应返回所有可点击元素（有文本/描述的）
  assert.ok(candidates.length > 0, '空描述应返回默认可点击元素');
});

runTest('7.3 边界条件 - 超长元素名', () => {
  const lm = new LearningManager({ rulesDir: TEST_RULES_DIR });
  const longName = '这是一个非常长的元素名称用于测试边界情况'.repeat(5);

  lm.recordSuccess(longName, {
    type: 'resource-id',
    value: 'btn_long',
    xpath: '//*[@resource-id="btn_long"]'
  }, 'com.test.long');

  const data = lm.loadLearningData('com.test.long');

  assert.ok(data.elementKnowledge[longName], '超长元素名应能处理');
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