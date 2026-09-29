#!/usr/bin/env node
/**
 * Tauri CLI wrapper for the release job (tauri-action `tauriScript`).
 *
 * After `build` on Linux it removes the bundled `libwayland-*` from the
 * AppImage. linuxdeploy copies them from the build host (Ubuntu 22.04,
 * wayland 1.20), but the Mesa EGL driver always comes from the user's system,
 * and recent Mesa needs newer libwayland symbols (`wl_fixes_interface`,
 * `wl_display_dispatch_queue_timeout`, …). With the old copy EGL fails to
 * load, WebKitWebProcess renders nothing and the app hangs on a blank splash.
 * libwayland is ABI-stable and installed wherever GTK is, so the system copy
 * is the right one.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const isWindows = process.platform === "win32";

// `shell` on Windows: pnpm is a .cmd shim (see scripts/dev.mjs).
const result = spawnSync("pnpm", ["tauri", ...args], { stdio: "inherit", shell: isWindows });
if (result.status !== 0) process.exit(result.status ?? 1);

if (process.platform === "linux" && args[0] === "build") {
	const bundleDir = "src-tauri/target/release/bundle/appimage";
	const appImages = readdirSync(bundleDir).filter((name) => name.endsWith(".AppImage"));
	if (appImages.length === 0) throw new Error(`no AppImage found in ${bundleDir}`);
	for (const name of appImages) stripBundledWayland(join(process.cwd(), bundleDir, name));
}

function stripBundledWayland(appImage) {
	const offset = Number(execFileSync(appImage, ["--appimage-offset"], { encoding: "utf8" }).trim());
	const work = mkdtempSync(join(tmpdir(), "appimage-"));
	try {
		execFileSync(appImage, ["--appimage-extract"], { cwd: work, stdio: "ignore" });
		const appDir = join(work, "squashfs-root");
		const libDir = join(appDir, "usr/lib");
		const removed = readdirSync(libDir).filter((name) => name.startsWith("libwayland-"));
		if (removed.length === 0) {
			throw new Error(`no bundled libwayland in ${appImage}; if Tauri now excludes it, drop this step`);
		}
		for (const name of removed) rmSync(join(libDir, name));
		console.log(`Removed from ${appImage}: ${removed.join(", ")}`);

		const squashfs = join(work, "fs.squashfs");
		execFileSync(
			"mksquashfs",
			[appDir, squashfs, "-all-root", "-noappend", "-no-progress", "-comp", "zstd", "-b", "131072"],
			{ stdio: "inherit" },
		);
		// Reuse the original AppImage runtime (everything before the squashfs).
		const runtime = readFileSync(appImage).subarray(0, offset);
		writeFileSync(appImage, Buffer.concat([runtime, readFileSync(squashfs)]));
	} finally {
		rmSync(work, { recursive: true, force: true });
	}
}
