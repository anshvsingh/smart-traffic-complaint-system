import { useEffect, useRef } from "react";

// Soft animated gradient behind hero content.
// The drift animation pauses while the aura is scrolled out of view,
// so it costs nothing on the GPU when you can't see it.
function Aura() {
  const ref = useRef(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(([entry]) => {
      element.classList.toggle("is-paused", !entry.isIntersecting);
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="aura" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}

export default Aura;
