import { notFound } from "next/navigation";
import { SceneStage } from "@/fixtures/scenes";

/**
 * Renders one scene, alone, for the screenshot script to photograph.
 *
 * Not reachable in a deployed build. This is a developer surface — it exists so
 * `scripts/shoot-scenes.mjs` has a stable URL per scene — and shipping it would
 * put a page of invented resume data on the public site for no one's benefit.
 * The fixtures themselves are still bundled either way; only the route is shut.
 *
 * Deliberately no `generateStaticParams`/`dynamicParams`: declaring the scenes
 * as static params makes Next treat this as a prerendered route and read
 * `.next/prerender-manifest.json`, which does not exist under `next dev`, so
 * every request 500s in the only mode this page is ever served in. An unknown
 * id is handled by the stage instead, which can say which scenes exist.
 */
export default async function ShowcasePage({
  params,
}: {
  params: Promise<{ scene: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { scene } = await params;
  return <SceneStage id={scene} />;
}
