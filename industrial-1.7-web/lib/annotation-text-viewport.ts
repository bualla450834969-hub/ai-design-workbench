export type AnnotationTextViewport = { width: number; height: number; left: number; top: number };
type ViewportBrowser = Pick<Window, "innerWidth" | "innerHeight" | "visualViewport">;

/** UI CSS zoom is deliberately excluded: the editor portal cancels it. These
 * are the visible browser pixels left above the software keyboard. */
export function annotationTextViewport(browser: ViewportBrowser): AnnotationTextViewport {
  const visual = browser.visualViewport;
  const positive = (value: number | undefined, fallback: number) => Number.isFinite(value) && value! > 0 ? value! : Math.max(1, fallback);
  return {
    width: positive(visual?.width, browser.innerWidth),
    height: positive(visual?.height, browser.innerHeight),
    left: Math.max(0, visual?.offsetLeft || 0),
    top: Math.max(0, visual?.offsetTop || 0),
  };
}

export function watchAnnotationTextViewport(browser: ViewportBrowser & Pick<Window, "addEventListener" | "removeEventListener">, update: (viewport: AnnotationTextViewport) => void) {
  const visual = browser.visualViewport;
  const refresh = () => update(annotationTextViewport(browser));
  browser.addEventListener("resize", refresh);
  visual?.addEventListener("resize", refresh);
  visual?.addEventListener("scroll", refresh);
  refresh();
  return () => {
    browser.removeEventListener("resize", refresh);
    visual?.removeEventListener("resize", refresh);
    visual?.removeEventListener("scroll", refresh);
  };
}
