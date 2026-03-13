# Build Windows exe

构建 Windows exe 和 msi

## 步骤

```bash
# 清理旧版本（可选，但推荐）
cd D:/Py/sageread/packages/app/src-tauri && cargo clean --release

# 构建
cd D:/Py/sageread/packages/app && pnpm tauri build
```

> 注意：首次构建失败可能是超时导致，重新运行即可。底层的 cargo 编译和 tauri 打包都会成功，最后的签名错误可忽略。

## 输出

- exe: `packages/app/src-tauri/target/release/SageRead.exe` (18MB)
- msi: `packages/app/src-tauri/target/release/bundle/msi/`
- nsis: `packages/app/src-tauri/target/release/bundle/nsis/`
- zip: `packages/app/src-tauri/target/release/SageRead-portable.zip` (9MB)

## 打包为 zip

构建完成后，可将 portable exe 打包为 zip：

```bash
cd D:/Py/sageread/packages/app/src-tauri/target/release && powershell Compress-Archive -Path SageRead.exe -DestinationPath SageRead-portable.zip -Force
```

输出: `packages/app/src-tauri/target/release/SageRead-portable.zip`

## 构建最小化 portable exe

Rust 编译阶段耗时较长，可通过修改 `packages/app/src-tauri/Cargo.toml` 优化：

```toml
[profile.release]
# 优化级别：z 表示极度追求体积最小化
opt-level = "z"
# 使用 Thin LTO，平衡编译时间和性能
lto = "thin"
# 增加代码生成单元数，允许并行编译
codegen-units = 16
# 移除符号表，减小体积
strip = "symbols"
# panic 时直接终止，不生成 unwinding 代码
panic = "abort"
```

### 配置说明

| 配置 | 默认值 | 优化后 | 效果 |
|------|--------|--------|------|
| opt-level | 3 | "z" | 极度追求体积最小化 |
| lto | true | "thin" | Thin LTO 比 fat LTO 快很多 |
| codegen-units | 1 | 16 | 增加并行度，加快编译 |

注意：Thin LTO 相比 fat LTO 编译时间大幅减少，优化效果也很好。`opt-level = "z"` 会显著减小 exe 体积。
