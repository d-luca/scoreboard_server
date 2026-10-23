import type { LayoutDiagnostic } from "../../bindings/LayoutDiagnostic";
import { resolveLayoutBindings, type BoundLayoutNode, type LayoutRenderInputs } from "./bindings";
import type { ResolvedLayoutScene } from "./resolveLayout";
import { placeLayoutText, type LayoutText } from "./text";

export type LayoutPaintNode = BoundLayoutNode & Readonly<{ textLayout: LayoutText | null }>;
export type LayoutRenderFrame = Readonly<{
	scene: ResolvedLayoutScene;
	nodes: readonly LayoutPaintNode[];
	diagnostics: readonly LayoutDiagnostic[];
}>;

/** Geometry is retained; only current strings, colours and cached text measurements are bound. */
export function createLayoutFrame(scene: ResolvedLayoutScene, inputs: LayoutRenderInputs): LayoutRenderFrame {
	const diagnostics = [...scene.diagnostics];
	const paths = new Map<string, string>();
	function indexPaths(source: ResolvedLayoutScene["nodes"][number]["source"], path: string): void {
		paths.set(source.id, path);
		if (source.kind === "root" || source.kind === "container") {
			source.children.forEach((child, index) => indexPaths(child, `${path}/children/${index}`));
		}
	}
	indexPaths(scene.nodes[0].source, "/root");
	const nodes = resolveLayoutBindings(scene, inputs).map((node): LayoutPaintNode => {
		const { source, contentBounds } = node.geometry;
		const textLayout =
			(source.kind === "value" || source.kind === "text") && node.text !== null
				? placeLayoutText(node.text, source.textStyle, contentBounds, source.kind === "text")
				: null;
		if (textLayout?.overflow) {
			diagnostics.push({
				severity: "info",
				code: "text-overflow",
				nodeId: source.id,
				property: `${paths.get(source.id)}/${source.kind === "text" ? "text" : "textStyle"}`,
				message: "Text extends beyond its content box; only the rendering root clips it.",
			});
		}
		return { ...node, textLayout };
	});
	return { scene, nodes, diagnostics };
}
