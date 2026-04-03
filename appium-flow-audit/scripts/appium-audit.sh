#!/bin/bash
# Appium 自动化流程审核与脚本生成器
# 主执行脚本
#
# 用法:
#   ./appium-audit.sh audit <测试文件>           - 审核测试脚本
#   ./appium-audit.sh capture <页面名称>        - 采集页面元素
#   ./appium-audit.sh generate <页面名称> [描述] - 生成测试脚本
#   ./appium-audit.sh record <页面名称>         - 交互式录制（推荐）
#   ./appium-audit.sh full <页面名称> [描述]     - 完整流程: 采集+生成
#
# 环境变量:
#   APPIUM_TESTS_DIR - 测试目录路径 (默认: ./appium-tests)
#   ANDROID_HOME     - Android SDK 路径 (用于获取 ADB)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# 测试目录 - 优先使用环境变量，否则使用默认值
APPIUM_TESTS_DIR="${APPIUM_TESTS_DIR:-./appium-tests}"

# ADB 路径 - 从 ANDROID_HOME 环境变量获取
get_adb_path() {
    if [ -n "$ANDROID_HOME" ]; then
        echo "$ANDROID_HOME/platform-tools/adb"
    elif [ -n "$ANDROID_SDK_ROOT" ]; then
        echo "$ANDROID_SDK_ROOT/platform-tools/adb"
    else
        echo "adb"  # 回退到 PATH 中的 adb
    fi
}
ADB=$(get_adb_path)

# 显示帮助
show_help() {
    echo "=========================================="
    echo "  Appium 自动化流程审核与脚本生成器"
    echo "=========================================="
    echo ""
    echo "用法:"
    echo "  $0 <命令> [参数]"
    echo ""
    echo "命令:"
    echo "  audit <文件>        审核测试脚本流程和稳定性"
    echo "  capture <页面名>    采集当前页面的UI元素"
    echo "  generate <页面名> [描述]  生成Page Object测试脚本"
    echo "  record <页面名>     交互式录制，生成准确脚本 ⭐推荐"
    echo "  full <页面名> [描述]      完整流程: 采集+生成"
    echo ""
    echo "环境变量:"
    echo "  APPIUM_TESTS_DIR  测试目录路径 (默认: ./appium-tests)"
    echo "  ANDROID_HOME      Android SDK 路径"
    echo ""
    echo "示例:"
    echo "  $0 audit test-complete-buy.js"
    echo "  $0 capture login"
    echo "  $0 generate buy '输入股票代码并点击买入'"
    echo "  $0 record sell    # 交互式录制卖出流程"
    echo ""
    echo "指定测试目录:"
    echo "  APPIUM_TESTS_DIR=/path/to/appium-tests $0 capture login"
    echo ""
}

# 检查Appium服务
check_appium() {
    echo "[检查] Appium服务..."
    if ! curl -s http://127.0.0.1:4723/status > /dev/null 2>&1; then
        echo "❌ Appium服务未运行!"
        echo "   请先启动Appium: appium"
        return 1
    else
        echo "✅ Appium服务运行中"
        return 0
    fi
}

# 检查设备连接
check_device() {
    echo "[检查] 设备连接..."
    # 使用更兼容的方式检测设备
    local devices_output
    devices_output=$($ADB devices 2>/dev/null | grep -E "device$" || true)

    if [ -z "$devices_output" ]; then
        echo "❌ 未检测到已连接的设备!"
        echo "   请确保设备已连接并开启USB调试"
        return 1
    else
        echo "✅ 已连接设备:"
        echo "$devices_output"
        return 0
    fi
}

# 审核测试脚本
do_audit() {
    local test_file="$1"

    if [ -z "$test_file" ]; then
        echo "❌ 请指定测试文件"
        echo "   用法: $0 audit <测试文件>"
        exit 1
    fi

    echo ""
    echo "=========================================="
    echo "  流程审核分析"
    echo "=========================================="
    echo ""
    echo "测试文件: $test_file"
    echo "测试目录: $APPIUM_TESTS_DIR"
    echo ""

    cd "$APPIUM_TESTS_DIR"
    local script_path="$APPIUM_TESTS_DIR/scripts/analyze-flow.js"
    if [ -f "$script_path" ]; then
        node "$script_path" "$test_file" "$APPIUM_TESTS_DIR"
    else
        node "$SCRIPT_DIR/analyze-flow.js" "$test_file" "$APPIUM_TESTS_DIR"
    fi
}

# 采集页面元素
do_capture() {
    local page_name="$1"

    if [ -z "$page_name" ]; then
        echo "❌ 请指定页面名称"
        echo "   用法: $0 capture <页面名称>"
        exit 1
    fi

    echo ""
    echo "=========================================="
    echo "  页面元素采集"
    echo "=========================================="
    echo ""
    echo "页面名称: $page_name"
    echo "测试目录: $APPIUM_TESTS_DIR"
    echo ""

    # 检查环境
    check_appium || exit 1
    check_device || exit 1
    echo ""

    echo "请确保App已打开到目标页面，然后按回车继续..."
    read

    cd "$APPIUM_TESTS_DIR"
    local script_path="$APPIUM_TESTS_DIR/scripts/capture-page.js"
    if [ -f "$script_path" ]; then
        node "$script_path" "$page_name" "$APPIUM_TESTS_DIR"
    else
        node "$SCRIPT_DIR/capture-page.js" "$page_name" "$APPIUM_TESTS_DIR"
    fi
}

# 生成测试脚本
do_generate() {
    local page_name="$1"
    local operation_desc="$2"

    if [ -z "$page_name" ]; then
        echo "❌ 请指定页面名称"
        echo "   用法: $0 generate <页面名称> [操作描述]"
        exit 1
    fi

    echo ""
    echo "=========================================="
    echo "  测试脚本生成"
    echo "=========================================="
    echo ""
    echo "页面名称: $page_name"
    echo "操作描述: ${operation_desc:-'(未提供)'}"
    echo "测试目录: $APPIUM_TESTS_DIR"
    echo ""

    cd "$APPIUM_TESTS_DIR"
    local script_path="$APPIUM_TESTS_DIR/scripts/generate-script.js"
    if [ -f "$script_path" ]; then
        node "$script_path" "$page_name" "$operation_desc" "$APPIUM_TESTS_DIR"
    else
        node "$SCRIPT_DIR/generate-script.js" "$page_name" "$operation_desc" "$APPIUM_TESTS_DIR"
    fi
}

# 完整流程: 采集+生成
do_full() {
    local page_name="$1"
    local operation_desc="$2"

    if [ -z "$page_name" ]; then
        echo "❌ 请指定页面名称"
        echo "   用法: $0 full <页面名称> [操作描述]"
        exit 1
    fi

    echo ""
    echo "=========================================="
    echo "  完整流程: 采集 + 生成"
    echo "=========================================="
    echo ""
    echo "页面名称: $page_name"
    echo "操作描述: ${operation_desc:-'(未提供)'}"
    echo "测试目录: $APPIUM_TESTS_DIR"
    echo ""

    # 检查环境
    check_appium || exit 1
    check_device || exit 1
    echo ""

    echo "请确保App已打开到目标页面，然后按回车继续..."
    read

    cd "$APPIUM_TESTS_DIR"
    local capture_script="$APPIUM_TESTS_DIR/scripts/capture-page.js"
    local generate_script="$APPIUM_TESTS_DIR/scripts/generate-script.js"

    # Step 1: 采集
    echo ""
    echo "=== 步骤 1/2: 页面元素采集 ==="
    if [ -f "$capture_script" ]; then
        node "$capture_script" "$page_name" "$APPIUM_TESTS_DIR"
    else
        node "$SCRIPT_DIR/capture-page.js" "$page_name" "$APPIUM_TESTS_DIR"
    fi

    # Step 2: 生成
    echo ""
    echo "=== 步骤 2/2: 测试脚本生成 ==="
    if [ -f "$generate_script" ]; then
        node "$generate_script" "$page_name" "$operation_desc" "$APPIUM_TESTS_DIR"
    else
        node "$SCRIPT_DIR/generate-script.js" "$page_name" "$operation_desc" "$APPIUM_TESTS_DIR"
    fi

    echo ""
    echo "=========================================="
    echo "  完整流程执行完成"
    echo "=========================================="
}

# 交互式录制
do_record() {
    local page_name="$1"

    if [ -z "$page_name" ]; then
        echo "❌ 请指定页面名称"
        echo "   用法: $0 record <页面名称>"
        exit 1
    fi

    echo ""
    echo "=========================================="
    echo "  交互式脚本录制"
    echo "=========================================="
    echo ""
    echo "页面名称: $page_name"
    echo "测试目录: $APPIUM_TESTS_DIR"
    echo ""
    echo "⭐ 录制模式说明:"
    echo "   1. 连接设备后，请在手机上操作"
    echo "   2. 每完成一步操作，描述操作内容"
    echo "   3. 选择操作的目标元素"
    echo "   4. 完成后自动生成脚本"
    echo ""

    # 检查环境
    check_appium || exit 1
    check_device || exit 1
    echo ""

    cd "$APPIUM_TESTS_DIR"
    local record_script="$APPIUM_TESTS_DIR/scripts/record-flow.js"
    if [ -f "$record_script" ]; then
        node "$record_script" "$page_name" "$APPIUM_TESTS_DIR"
    else
        node "$SCRIPT_DIR/record-flow.js" "$page_name" "$APPIUM_TESTS_DIR"
    fi
}

# 主入口
case "$1" in
    audit)
        do_audit "$2"
        ;;
    capture)
        do_capture "$2"
        ;;
    generate)
        do_generate "$2" "$3"
        ;;
    record)
        do_record "$2"
        ;;
    full)
        do_full "$2" "$3"
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        if [ -z "$1" ]; then
            show_help
        else
            echo "❌ 未知命令: $1"
            echo ""
            show_help
            exit 1
        fi
        ;;
esac