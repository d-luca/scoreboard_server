# Tauri + React + Typescript

This template should help get you started developing with Tauri, React and Typescript in Vite.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Troubleshooting

### Blank window: "WebKit encountered an internal error" (Linux, Snap VS Code)

If `pnpm dev` opens a window that only shows *"WebKit encountered an internal error"*
and the backend console logs a `symbol lookup error` in
`/snap/core20/.../libpthread.so.0` from `WebKitNetworkProcess`, the window was
launched from a terminal inside the **Snap build of VS Code**. The Snap wrapper
injects its bundled GTK libraries (`GTK_PATH`, `GTK_EXE_PREFIX`,
`LD_LIBRARY_PATH`, …) into the terminal environment, and WebKit's helper
processes crash loading them.

`pnpm dev` runs [scripts/dev.mjs](scripts/dev.mjs), which restores the original
environment (VS Code keeps it in `*_VSCODE_SNAP_ORIG` variables) before starting
Tauri, so this should not happen from the integrated terminal. If you launch the
app some other way from a Snap terminal, use `pnpm dev:raw` only outside Snap
terminals, or run from a regular terminal emulator.
