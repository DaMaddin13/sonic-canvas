(() => {
  const fileInput = document.getElementById("fileInput");
  const pickBtn = document.getElementById("pickBtn");
  const form = document.getElementById("uploadForm");
  const canvas = document.getElementById("art");
  const placeholder = document.getElementById("placeholder");
  const busy = document.getElementById("busy");
  const busyText = document.getElementById("busyText");
  const meta = document.getElementById("meta");
  const about = document.getElementById("about");
  let lastFile = null;

  function setBusy(on, text) {
    busy.hidden = !on;
    if (text) busyText.textContent = text;
  }

  function formatDuration(sec) {
    if (!Number.isFinite(sec)) return "—";
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  function energyWord(v) {
    if (v < 0.18) return "leise";
    if (v < 0.4) return "moderat";
    if (v < 0.7) return "kräftig";
    return "dicht";
  }

  function showFeatures(feat) {
    document.getElementById("sig").textContent = feat.hashHex.slice(0, 12);
    document.getElementById("moodLabel").textContent = feat.mood.label;
    document.getElementById("energyLabel").textContent = energyWord(feat.energy);
    const formEl = document.getElementById("formLabel");
    if (formEl) formEl.textContent = feat.formLabel || "—";
    document.getElementById("durLabel").textContent = formatDuration(feat.duration);
    meta.hidden = false;
  }

  async function renderFromFeatures(feat) {
    setBusy(true, "Gemälde setzen…");
    await new Promise((r) => requestAnimationFrame(r));
    SonicPaint.paint(canvas, feat);
    canvas.classList.add("ready");
    placeholder.hidden = true;
    showFeatures(feat);
    setBusy(false);
  }

  async function handleFile(file) {
    if (!file) return;
    lastFile = file;
    if (file.size > 25 * 1024 * 1024) {
      alert("Datei ist größer als 25 MB. Für Stufe 1 bitte etwas Kleineres wählen.");
      return;
    }
    setBusy(true, "Datei lesen…");
    canvas.classList.remove("ready");
    try {
      const buf = await file.arrayBuffer();
      const feat = await SonicAnalyze.analyzeArrayBuffer(buf, (t) => {
        busyText.textContent = t;
      });
      await renderFromFeatures(feat);
    } catch (err) {
      console.error(err);
      setBusy(false);
      alert("Diese Datei konnte nicht gelesen werden. Bitte MP3, WAV, OGG oder M4A versuchen.");
    }
  }

  pickBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", (e) => handleFile(e.target.files[0]));

  ["dragenter", "dragover"].forEach((ev) => {
    form.addEventListener(ev, (e) => {
      e.preventDefault();
      form.classList.add("drag");
    });
  });
  ["dragleave", "drop"].forEach((ev) => {
    form.addEventListener(ev, (e) => {
      e.preventDefault();
      form.classList.remove("drag");
    });
  });
  form.addEventListener("drop", (e) => {
    const f = e.dataTransfer.files[0];
    handleFile(f);
  });

  document.querySelectorAll("[data-demo]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      setBusy(true, "Stimmung anlegen…");
      canvas.classList.remove("ready");
      try {
        const feat = await SonicAnalyze.analyzeDemo(btn.dataset.demo, (t) => {
          busyText.textContent = t;
        });
        await renderFromFeatures(feat);
      } catch (err) {
        console.error(err);
        setBusy(false);
      }
    });
  });

  document.getElementById("downloadBtn").addEventListener("click", () => {
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `sonic-canvas-${document.getElementById("sig").textContent}.png`;
    a.click();
  });

  document.getElementById("againBtn").addEventListener("click", () => {
    if (lastFile) handleFile(lastFile);
    else document.querySelector("[data-demo]").click();
  });

  document.getElementById("aboutBtn").addEventListener("click", () => about.showModal());
  document.getElementById("closeAbout").addEventListener("click", () => about.close());
})();
