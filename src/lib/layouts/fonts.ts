import anton from "../../assets/Anton-Regular.ttf?url";
import poppins400 from "../../assets/Poppins-Regular.ttf?url";
import poppins500 from "../../assets/Poppins-Medium.ttf?url";
import poppins600 from "../../assets/Poppins-SemiBold.ttf?url";
import poppins700 from "../../assets/Poppins-Bold.ttf?url";
import poppins800 from "../../assets/Poppins-ExtraBold.ttf?url";
import poppins900 from "../../assets/Poppins-Black.ttf?url";
import type { LayoutFont } from "../../bindings/LayoutFont";
import type { LayoutTextStyle } from "../../bindings/LayoutTextStyle";
import type { ResolvedLayoutScene } from "./resolveLayout";

const sources: Record<LayoutFont["family"], Partial<Record<number, string>>> = {
	anton: { 400: anton },
	poppins: {
		400: poppins400,
		500: poppins500,
		600: poppins600,
		700: poppins700,
		800: poppins800,
		900: poppins900,
	},
};

const faces = new Map<string, FontFace>();
const loading = new Map<string, Promise<void>>();

export function layoutFontFamily(font: LayoutFont): string {
	return font.family === "anton" ? "ScoreboardLayoutAnton" : "ScoreboardLayoutPoppins";
}

export function layoutFontCss(style: LayoutTextStyle): string {
	return `${style.font.weight} ${style.fontSize}px "${layoutFontFamily(style.font)}"`;
}

function fontKey(font: LayoutFont): string {
	return `${font.family}/${font.weight}`;
}

function loadFont(font: LayoutFont): Promise<void> {
	const key = fontKey(font);
	const pending = loading.get(key);
	if (pending) return pending;
	const url = sources[font.family][font.weight];
	if (!url) return Promise.reject(new Error(`Unsupported layout font: ${key}.`));

	const promise = Promise.resolve().then(async () => {
		try {
			const face = new FontFace(layoutFontFamily(font), `url("${url}")`, {
				weight: String(font.weight),
				style: "normal",
			});
			await face.load();
			document.fonts.add(face);
			faces.set(key, face);
		} catch (error) {
			loading.delete(key);
			throw new Error(`Could not load bundled layout font ${key}: ${String(error)}`);
		}
	});
	loading.set(key, promise);
	return promise;
}

/** Await before exposing a custom scene. A rejected font load must remain visible to the caller. */
export async function loadLayoutFonts(scene: ResolvedLayoutScene): Promise<void> {
	await Promise.all(
		scene.nodes.flatMap(({ source }) =>
			source.kind === "value" || source.kind === "text" ? [loadFont(source.textStyle.font)] : [],
		),
	);
}

export function assertLayoutFontLoaded(font: LayoutFont): void {
	const face = faces.get(fontKey(font));
	if (!face || face.status !== "loaded" || !document.fonts.has(face)) {
		throw new Error(`Bundled layout font ${fontKey(font)} is not loaded. Await loadLayoutFonts first.`);
	}
}
