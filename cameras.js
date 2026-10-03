// FRIGATE_HOST and CAMERAS are defined in config.js, which must load first.
// To create it, copy config.example.js to config.js.

// "mse"   = full-quality live video from go2rtc (port 1984). Recommended.
// "mjpeg" = lower-res MJPEG from Frigate's API (port 5000). Works everywhere, lighter on clients.
// You can also override per-visit: cameras.html?mode=mjpeg
const DEFAULT_MODE = "mse";

const mode = new URLSearchParams(location.search).get("mode") || DEFAULT_MODE;
const wall = document.getElementById("wall");

function sourceFor(cam) {
  if (mode === "mjpeg") {
    return { tag: "img", src: `http://${FRIGATE_HOST}:5000/api/${cam}?fps=5&h=720` };
  }
  return { tag: "iframe", src: `http://${FRIGATE_HOST}:1984/stream.html?src=${encodeURIComponent(cam)}&mode=mse` };
}

CAMERAS.forEach(cam => {
  const tile = document.createElement("div");
  tile.className = "tile";

  const { tag, src } = sourceFor(cam);
  const el = document.createElement(tag);
  el.src = src;
  if (tag === "iframe") el.allow = "autoplay";
  el.alt = cam;

  const label = document.createElement("div");
  label.className = "name";
  label.textContent = cam.replace(/_/g, " ");

  tile.append(el, label);

  // Click a camera to enlarge it, click again to return to the grid
  tile.addEventListener("click", () => {
    const single = wall.classList.toggle("single");
    document.querySelectorAll(".tile").forEach(t => t.classList.remove("active"));
    if (single) tile.classList.add("active");
  });

  wall.appendChild(tile);
});

// Press F for browser fullscreen, Escape to return to the grid
document.addEventListener("keydown", e => {
  if (e.key === "f" || e.key === "F") {
    document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
  }
  if (e.key === "Escape") wall.classList.remove("single");
});

// Reload every 6 hours to recover from any stalled streams on always-on displays
setTimeout(() => location.reload(), 6 * 60 * 60 * 1000);
