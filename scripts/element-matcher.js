/**
 * 智能元素匹配模块
 * 根据用户描述智能匹配候选元素，按稳定性排序
 *
 * 用法:
 *   const ElementMatcher = require('./element-matcher');
 *   const matcher = new ElementMatcher(elements);
 *   const candidates = matcher.match('点击卖出');
 */

/**
 * 定位器稳定性评分
 */
const LOCATOR_STABILITY = {
  resourceId: { score: 10, name: 'resource-id', priority: 1 },
  contentDesc: { score: 7, name: 'content-desc', priority: 2 },
  hint: { score: 6, name: 'hint', priority: 3 },
  text: { score: 4, name: 'text', priority: 4 },
  class: { score: 2, name: 'class', priority: 5 }
};

/**
 * 操作动作关键词
 */
const ACTION_KEYWORDS = {
  click: ['点击', '按', '选择', 'click', 'tap', 'press', '触碰'],
  input: ['输入', '填写', '设置', 'input', 'enter', 'type', '填入'],
  wait: ['等待', 'wait'],
  verify: ['验证', '检查', '确认', 'verify', 'check', 'assert']
};

class ElementMatcher {
  constructor(elements) {
    this.elements = elements || { editText: [], button: [], textView: [], clickable: [], all: [] };
  }

  /**
   * 智能匹配入口
   * @param {string} description - 用户描述，如 "点击卖出"
   * @param {Object} options - 配置选项
   * @returns {Array} 匹配结果列表
   */
  match(description, options = {}) {
    const { maxCandidates = 3 } = options;

    // 1. 解析用户描述
    const parsed = this.parseDescription(description);
    console.log(`  解析结果: 动作=${parsed.action}, 目标="${parsed.target}"`);

    // 2. 搜索匹配元素
    const matchedElements = this.searchElements(parsed.target);

    if (matchedElements.length === 0) {
      return [];
    }

    // 3. 计算稳定性并排序
    const scored = matchedElements.map(elem => this.scoreElement(elem));

    // 4. 排序：稳定性高的在前
    scored.sort((a, b) => b.stabilityScore - a.stabilityScore);

    // 5. 返回 top N 候选
    return scored.slice(0, maxCandidates);
  }

  /**
   * 解析用户描述，提取动作和目标
   * @param {string} description - 用户描述
   * @returns {Object} { action, target }
   */
  parseDescription(description) {
    if (!description) {
      return { action: 'click', target: '' };
    }

    const desc = description.trim();
    let action = 'click';
    let target = desc;

    // 检测动作类型
    for (const [act, keywords] of Object.entries(ACTION_KEYWORDS)) {
      for (const kw of keywords) {
        if (desc.startsWith(kw)) {
          action = act;
          target = desc.substring(kw.length).trim();
          break;
        }
      }
    }

    // 清理目标文本
    target = target.replace(/^[的]?/, '').trim();

    return { action, target };
  }

  /**
   * 搜索匹配的元素
   * @param {string} keyword - 搜索关键词
   * @returns {Array} 匹配的元素列表
   */
  searchElements(keyword) {
    if (!keyword) {
      // 无关键词，返回所有可点击元素
      return this.elements.clickable.filter(e => e.text || e.contentDesc);
    }

    const results = [];
    const keywordLower = keyword.toLowerCase();

    // 搜索所有元素
    this.elements.all.forEach(elem => {
      const text = (elem.text || '').toLowerCase();
      const contentDesc = (elem.contentDesc || '').toLowerCase();
      const hint = (elem.hint || '').toLowerCase();
      const resourceId = (elem.resourceId || '').toLowerCase();

      // 匹配条件：text/content-desc/hint/resource-id 包含关键词
      if (text.includes(keywordLower) ||
          contentDesc.includes(keywordLower) ||
          hint.includes(keywordLower) ||
          resourceId.includes(keywordLower)) {
        results.push(elem);
      }
    });

    // 去重
    const seen = new Set();
    return results.filter(elem => {
      const key = elem.resourceId || elem.contentDesc || elem.text || elem.bounds;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * 计算元素的稳定性评分
   * @param {Object} elem - 元素属性
   * @returns {Object} 含评分和定位器的结果
   */
  scoreElement(elem) {
    let locator = null;
    let stabilityScore = 0;
    let stabilityLevel = 'low';

    // 按优先级选择最佳定位器
    if (elem.resourceId) {
      locator = {
        type: 'resource-id',
        value: elem.resourceId,
        xpath: `//*[@resource-id="${elem.resourceId}"]`
      };
      stabilityScore = LOCATOR_STABILITY.resourceId.score;
      stabilityLevel = 'high';
    } else if (elem.contentDesc) {
      locator = {
        type: 'content-desc',
        value: elem.contentDesc,
        xpath: `//*[@content-desc="${elem.contentDesc}"]`
      };
      stabilityScore = LOCATOR_STABILITY.contentDesc.score;
      stabilityLevel = 'medium';
    } else if (elem.hint) {
      locator = {
        type: 'hint',
        value: elem.hint,
        xpath: `//*[@hint="${elem.hint}"]`
      };
      stabilityScore = LOCATOR_STABILITY.hint.score;
      stabilityLevel = 'medium';
    } else if (elem.text) {
      locator = {
        type: 'text',
        value: elem.text,
        xpath: `//*[@text="${elem.text}"]`
      };
      stabilityScore = LOCATOR_STABILITY.text.score;
      stabilityLevel = 'low';
    } else {
      locator = {
        type: 'class',
        value: elem.class,
        xpath: `//*[@class="${elem.class}"]`
      };
      stabilityScore = LOCATOR_STABILITY.class.score;
      stabilityLevel = 'low';
    }

    // 解析位置
    const position = this.parsePosition(elem.bounds);

    // 生成标签
    const label = elem.text || elem.contentDesc || elem.hint || '未命名元素';

    // 判断元素类型
    const elemType = this.getElementType(elem);

    return {
      element: elem,
      label,
      locator,
      stabilityScore,
      stabilityLevel,
      position,
      type: elemType,
      bounds: elem.bounds
    };
  }

  /**
   * 解析元素位置描述
   * @param {string} bounds - bounds 属性，如 "[540,960][720,1020]"
   * @returns {string} 位置描述
   */
  parsePosition(bounds) {
    if (!bounds) return '位置未知';

    // 解析 bounds: [x1,y1][x2,y2]
    const match = bounds.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
    if (!match) return '位置未知';

    const x1 = parseInt(match[1]);
    const y1 = parseInt(match[2]);
    const x2 = parseInt(match[3]);
    const y2 = parseInt(match[4]);

    // 计算中心点
    const centerX = (x1 + x2) / 2;
    const centerY = (y1 + y2) / 2;

    // 位置判断（基于常见分辨率 1080x1920）
    let position = '';

    // Y 轴位置
    if (centerY > 1700) {
      position = '屏幕底部';
    } else if (centerY > 1200) {
      position = '屏幕中下部';
    } else if (centerY > 700) {
      position = '屏幕中部';
    } else if (centerY > 300) {
      position = '屏幕中上部';
    } else {
      position = '屏幕顶部';
    }

    // X 轴位置补充
    if (centerX < 200) {
      position += '左侧';
    } else if (centerX > 880) {
      position += '右侧';
    }

    return position;
  }

  /**
   * 获取元素类型
   * @param {Object} elem - 元素属性
   * @returns {string} 元素类型
   */
  getElementType(elem) {
    if (elem.class) {
      if (elem.class.includes('EditText')) return 'input';
      if (elem.class.includes('Button')) return 'button';
      if (elem.class.includes('TextView')) return 'text';
      if (elem.class.includes('CheckBox')) return 'checkbox';
      if (elem.class.includes('ImageView')) return 'image';
    }

    if (elem.clickable === 'true') return 'clickable';
    if (elem.focusable === 'true') return 'focusable';

    return 'element';
  }

  /**
   * 格式化输出候选列表
   * @param {Array} candidates - 候选列表
   * @param {Object} options - 选项
   * @returns {string} 格式化的字符串
   */
  formatCandidates(candidates, options = {}) {
    const { showValidated = true } = options;

    if (candidates.length === 0) {
      return '未找到匹配元素';
    }

    let output = '\n智能匹配结果：\n';

    candidates.forEach((c, i) => {
      const num = i + 1;
      const validated = c.validated ? '✓已验证' : (c.validated === false ? '✗验证失败' : '');
      const stars = c.stabilityLevel === 'high' ? '⭐⭐⭐' :
                    c.stabilityLevel === 'medium' ? '⭐⭐' : '⭐';

      output += `\n  [${num}] ${c.label}`;
      if (showValidated && validated) {
        output += ` ${validated}`;
      }
      output += `\n      定位器: ${c.locator.xpath}`;
      output += `\n      稳定性: ${stars} ${c.stabilityLevel === 'high' ? '高' : c.stabilityLevel === 'medium' ? '中' : '低'}`;
      output += `\n      位置: ${c.position}`;
    });

    output += '\n\n  [m] 更多匹配结果';
    output += '\n  [c] 手动输入定位器';
    output += '\n  [s] 使用坐标定位';

    return output;
  }

  /**
   * 从 bounds 提取坐标（用于 fallback）
   * @param {string} bounds - bounds 属性
   * @returns {Object} { x, y } 中心坐标
   */
  extractCoordinates(bounds) {
    if (!bounds) return null;

    const match = bounds.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
    if (!match) return null;

    const x1 = parseInt(match[1]);
    const y1 = parseInt(match[2]);
    const x2 = parseInt(match[3]);
    const y2 = parseInt(match[4]);

    return {
      x: Math.round((x1 + x2) / 2),
      y: Math.round((y1 + y2) / 2)
    };
  }
}

module.exports = ElementMatcher;