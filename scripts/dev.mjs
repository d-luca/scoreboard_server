#!/usr/bin/env node
/**
 * `tauri dev` wrapper that strips the Snap-packaged VS Code environment.
 *
 * The Snap wrapper of VS Code rewrites GTK/XDG variables (GTK_PATH,
 * GTK_EXE_PREFIX, GSETTINGS_SCHEMA_DIR, LD_LIBRARY_PATH, …) so the editor
 * finds its own bundled libraries. The integrated terminal inherits them,
 * and a WebKitGTK app launched from it then loads the Snap's core20
 * `libpthread.so.0` inside `WebKitNetworkProcess`, crashing with:
 *
 *   symbol lookup error: /snap/core20/.../libpthread.so.0:
 *   undefined symbol: __libc_pthread_init, version GLIBC_PRIVATE
 *
 * VS Code keeps the original values in `*_VSCODE_SNAP_ORIG`; restore those
 * (empty original = unset) and fall back to deleting the variable when the
 * app was launched from a Snap environment without the saved originals.
 * Outside a Snap environment this script is a no-op passthrough.
 */
import { spawn } from "node:child_process";

const SNAP_MANAGED_VARS = [
	"LD_LIBRARY_PATH",
	"GTK_EXE_PREFIX",
	"GTK_PATH",
	"GTK_IM_MODULE_FILE",
	"GTK_IM_MODULE",
	"GSETTINGS_SCHEMA_DIR",
	"GIO_MODULE_DIR",
	"GDK_BACKEND",
	"LOCPATH",
	"XDG_CONFIG_DIRS",
	"XDG_DATA_DIRS",
	"XDG_DATA_HOME",
];

const env = { ...process.env };

for (const name of SNAP_MANAGED_VARS) {
	const original = env[`${name}_VSCODE_SNAP_ORIG`];
	if (original !== undefined) {
		if (original === "") delete env[name];
		else env[name] = original;
		delete env[`${name}_VSCODE_SNAP_ORIG`];
	} else if (name === "LD_LIBRARY_PATH") {
		// Never propagate a library path into the WebKit subprocesses.
		delete env[name];
	}
}

const command = process.platform === "win32" ? "tauri.cmd" : "tauri";
const child = spawn(command, ["dev"], { stdio: "inherit", env });

child.on("error", (error) => {
	console.error(`failed to start \`${command} dev\`: ${error.message}`);
	process.exit(1);
});
child.on("exit", (code, signal) => {
	if (signal) process.kill(process.pid, signal);
	else process.exit(code ?? 1);
});
