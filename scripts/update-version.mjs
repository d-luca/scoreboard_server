#!/usr/bin/env node
/**
 * Update the app version across every file that carries it.
 *
 * Files touched (all kept in lockstep):
 *   - package.json                    `"version": "x.y.z"` (top level)
 *   - src-tauri/tauri.conf.json       `"version": "x.y.z"` (top level)
 *   - src-tauri/Cargo.toml            `version = "x.y.z"` under `[package]`
 *
 * Usage:
 *   pnpm version:app 1.2.3          set an explicit semver
 *   pnpm version:app patch          bump last segment (1.2.3 -> 1.2.4)
 *   pnpm version:app minor          bump middle segment (1.2.3 -> 1.3.0)
 *   pnpm version:app major          bump first segment (1.2.3 -> 2.0.0)
 *   pnpm version:app 1.2.3 --dry    preview the edits without writing files
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Each entry describes one file that carries the app version.
// `kind: "json"`  -> replace top-level `"version": "x.y.z"` with quotes kept.
// `kind: "toml"`  -> replace the first `version = "x.y.z"` line inside the
//                     `[package]` table only, leaving dependency versions
//                     (also `version = "..."`) untouched.
const FILES = [
	{ path: join(root, "package.json"), kind: "json" },
	{ path: join(root, "src-tauri", "tauri.conf.json"), kind: "json" },
	{ path: join(root, "src-tauri", "Cargo.toml"), kind: "toml" },
];

const JSON_VERSION_RE = /("version"\s*:\s*")\d+\.\d+\.\d+(")/;

const SEMVER_RE = /^\d+\.\d+\.\d+$/;

function fail(msg) {
	console.error(`update-version: ${msg}`);
	process.exit(1);
}

function readText(abs) {
	try {
		return readFileSync(abs, "utf8");
	} catch (err) {
		fail(`cannot read ${relative(root, abs) || abs}: ${err.message}`);
	}
}

function currentVersion() {
	const pkg = JSON.parse(readText(join(root, "package.json")));
	if (!SEMVER_RE.test(pkg.version)) {
		fail(`package.json version "${pkg.version}" is not x.y.z`);
	}
	return pkg.version;
}

function computeTarget(argv) {
	const [arg, ...rest] = argv;
	const dry = rest.includes("--dry") || rest.includes("--dry-run");

	if (!arg)
		fail(
			"missing version. Pass a semver (1.2.3) or a bump keyword (patch|minor|major). Optionally add --dry to preview.",
		);
	let target;
	if (arg === "patch" || arg === "minor" || arg === "major") {
		const [major, minor, patch] = currentVersion().split(".").map(Number);
		if (arg === "patch") target = `${major}.${minor}.${patch + 1}`;
		else if (arg === "minor") target = `${major}.${minor + 1}.0`;
		else target = `${major + 1}.0.0`;
	} else {
		target = arg;
		if (!SEMVER_RE.test(target)) fail(`"${arg}" is not a valid x.y.z semver`);
	}
	return { target, dry };
}

function rewriteCargoPackageVersion(text, version) {
	// Find `[package]` and the first `version = "..."` after it.
	const pkgStart = text.search(/^\[package\]\s*$/m);
	if (pkgStart === -1) fail("Cargo.toml: no [package] section found");

	const after = text.slice(pkgStart);
	const m = after.match(/^\s*version\s*=\s*"\d+\.\d+\.\d+"/m);
	if (!m) fail('Cargo.toml: no `version = "x.y.z"` line in [package]');

	const insertAt = pkgStart + m.index;
	const lineEnd = insertAt + m[0].length;
	return text.slice(0, insertAt) + `version = "${version}"` + text.slice(lineEnd);
}

function rewriteJsonVersion(text, rel, version) {
	const m = JSON_VERSION_RE.exec(text);
	if (!m) fail(`${rel}: top-level "version" field not found`);
	return text.slice(0, m.index) + m[1] + version + m[2] + text.slice(m.index + m[0].length);
}

const argv = process.argv.slice(2);
const { target, dry } = computeTarget(argv);
const from = currentVersion();

console.log(`update-version: ${from} -> ${target}${dry ? " (dry run)" : ""}`);

for (const file of FILES) {
	const rel = relative(root, file.path);
	const text = readText(file.path);

	let next;
	try {
		next =
			file.kind === "toml" ? rewriteCargoPackageVersion(text, target) : rewriteJsonVersion(text, rel, target);
	} catch (err) {
		fail(`${rel}: ${err.message}`);
	}

	if (next === text) {
		console.log(`  = ${rel} (already ${target})`);
		continue;
	}

	if (!dry) writeFileSync(file.path, next, "utf8");
	console.log(`  ${dry ? "~" : "✓"} ${rel}`);
}

if (dry) console.log("dry run: no files written");
else console.log("update-version: done. Commit the changes when ready.");
