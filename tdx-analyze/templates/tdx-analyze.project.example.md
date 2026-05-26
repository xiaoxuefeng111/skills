# TDX Analyze Project Profile

> 使用方法：把本文件复制到目标工程根目录，并重命名为 `tdx-analyze.project.md`。
> 将下面的占位符替换成真实值；没有的信息可以删掉整行，不需要强行全部填写。

## Project Identity
- project_name: <your-project-name>
- project_family: TDX Android
- repo_aliases:
  - <main-repo-name>

## Root Hints
- root_markers:
  - settings.gradle
  - gradlew
  - build.gradle
  - app
  - docs/knowledge-base
  - docs/skill-workflows
- wrapper_dirs:
  - <optional-wrapper-dir>
- main_build_files:
  - settings.gradle
  - build.gradle

## Knowledge Paths
- knowledge_base_dir: docs/knowledge-base
- workflow_dir: docs/skill-workflows

## Ignore Dirs
- .git
- .gradle
- .worktrees
- build
- out
- dist
- node_modules
- tmp

## Module Aliases
- <alias-module-name> -> <real-module-name>

## Entry Hints
- startup:
  - Application
  - MainActivity
  - AndroidManifest.xml
- routing:
  - intent-filter
  - scheme
  - bridge
  - startActivity

## OEM Notes
- has_oem_variants: no
- notes:
  - <optional-oem-or-product-line-note>

## Known Hot Issues
- <optional-known-hot-issue>
