/**
 * Page Object 模板
 * 用于生成新的页面对象类
 */

class {{ClassName}} {
  // ============ 元素定位器 ============

  // TODO: 添加元素定位器
  // 示例:
  // get submitButton() { return '//*[@text="提交"]'; }
  // get usernameInput() { return '//*[@resource-id="com.example:id/username"]'; }

  // ============ 操作方法 ============

  // TODO: 添加操作方法
  // 示例:
  // async inputUsername(value) {
  //   const input = await driverFactory.waitForElement(this.usernameInput, 5000);
  //   await input.clearValue();
  //   await input.setValue(value);
  // }

  // ============ 组合流程 ============

  /**
   * 执行完整流程
   */
  async performFlow(params = {}) {
    console.log('\n=== 开始执行 {{ClassName}} 流程 ===\n');

    // TODO: 添加流程步骤

    console.log('\n=== {{ClassName}} 流程完成 ===\n');
  }
}

module.exports = new {{ClassName}}();