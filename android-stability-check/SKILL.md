# android-stability-check — Android 稳定性巡检工具

> 自动执行代码同步、Monkey 压力测试、日志分析并生成稳定性报告。

## 核心功能
- **git 同步**: 进入工程目录执行 `git pull`。
- **Monkey 测试**: 使用 ADB 运行指定次数的随机压力测试。
- **异常扫描**: 统计日志中的 Crash 和 ANR。
- **报告同步**: 自动更新腾讯文档中的稳定性记录。
- **群组通知**: 通过企微发送测试摘要。

## 使用方式
### 基本用法 (使用默认配置)
```bash
/android-stability-check
```

### 指定项目和包名
```bash
/android-stability-check --path "C:/Path/To/Project" --pkg "com.your.app" --count 10000
```

## 参数列表
| 参数 | 描述 | 默认值 |
|------|------|--------|
| `--path` | Android 工程目录路径 | `C:/Users/HP/AndroidStudioProjects/MyApplication3` |
| `--pkg` | 目标 App 包名 | `com.example.tdx.myapplication` |
| `--count` | Monkey 事件总数 | `50000` |
| `--throttle` | 事件间隔 (ms) | `50` |
| `--doc` | 腾讯文档 ID | `GqZmJEdtMjvo` |

## 巡检逻辑
1. **Sync**: 进入 `--path` 目录执行 `git pull`。
2. **Monkey**: 调用 `scripts/monkey_runner.py` 执行测试，日志保存至 `.workbuddy/monkey_logs/`。
3. **Analyze**: 扫描日志中的 `CRASH`、`ANR`、`FATAL`、`IOException`。
4. **Report**: 调用腾讯文档 MCP 工具追加数据。
5. **Notify**: 调用企微消息工具发送 MD 格式摘要。

---
*创建于 2026-05-18 · Agent Created: true*
