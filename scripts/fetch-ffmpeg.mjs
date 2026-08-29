#!/usr/bin/env node
/**
 * Downloads the ffmpeg sidecar for release bundles (doc 06 §B3, doc 08 open
 * question 4): the binary is fetched at release time — never committed to
 * git (`src-tauri/binaries/` is ignored) — and wired into the bundle via
 * `TAURI_CONFIG='{"bundle":{"externalBin":["binaries/ffmpeg"]}}'` (see the
 * `bundle` CI job). At runtime the app prefers this sidecar and falls back
 * to `ffmpeg` on PATH, so local dev builds never need this script.
 *
 * Usage: node scripts/fetch-ffmpeg.mjs [target-triple]
 *
 * Sources (static builds with libvpx):
 * - Windows x64: https://www.gyan.dev/ffmpeg/builds (release-essentials)
 * - Linux x64:   https://johnvansickle.com/ffmpeg (static amd64)
 */
import { execFileSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const BINARIES_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "src-tauri", "binaries");

const TARGETS = {
	"x86_64-pc-windows-msvc": {
		url: "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip",
		archive: "ffmpeg.zip",
		// <archive>/ffmpeg-*-essentials_build/bin/ffmpeg.exe
		pick: (dir) => join(readdirSync(dir)[0], "bin", "ffmpeg.exe"),
		extract: (archive, dir) =>
			execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -Force '${archive}' '${dir}'`], {
				stdio: "inherit",
			}),
		exe: ".exe",
	},
	"x86_64-unknown-linux-gnu": {
		url: "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz",
		archive: "ffmpeg.tar.xz",
		// <archive>/ffmpeg-*-amd64-static/ffmpeg
		pick: (dir) => join(readdirSync(dir)[0], "ffmpeg"),
		extract: (archive, dir) => execFileSync("tar", ["-xJf", archive, "-C", dir], { stdio: "inherit" }),
		exe: "",
	},
};

const hostTriple =
	process.platform === "win32"
		? "x86_64-pc-windows-msvc"
		: process.platform === "linux" && process.arch === "x64"
			? "x86_64-unknown-linux-gnu"
			: null;

const triple = process.argv[2] ?? hostTriple;
const target = TARGETS[triple];
if (!target) {
	console.error(`unsupported or unknown target triple: ${triple ?? "(none detected)"}`);
	console.error(`supported: ${Object.keys(TARGETS).join(", ")}`);
	process.exit(1);
}

const dest = join(BINARIES_DIR, `ffmpeg-${triple}${target.exe}`);
if (existsSync(dest)) {
	console.log(`ffmpeg sidecar already present: ${dest}`);
	process.exit(0);
}

mkdirSync(BINARIES_DIR, { recursive: true });
const work = join(tmpdir(), `fetch-ffmpeg-${Date.now()}`);
mkdirSync(work, { recursive: true });

try {
	const archive = join(work, target.archive);
	console.log(`downloading ${target.url}`);
	const response = await fetch(target.url, { redirect: "follow" });
	if (!response.ok || !response.body) {
		throw new Error(`download failed: HTTP ${response.status}`);
	}
	await pipeline(response.body, createWriteStream(archive));

	console.log("extracting…");
	target.extract(archive, work);
	const binary = join(work, target.pick(work));
	if (!existsSync(binary)) {
		throw new Error(`ffmpeg binary not found in archive at ${binary}`);
	}
	renameSync(binary, dest);
	if (process.platform !== "win32") {
		execFileSync("chmod", ["755", dest]);
	}
	console.log(`ffmpeg sidecar ready: ${dest}`);
} finally {
	rmSync(work, { recursive: true, force: true });
}
