const install = document.getElementById("install");
let promptEvent;
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  promptEvent = event;
  install.hidden = false;
});
install.addEventListener("click", async () => {
  const prompt = promptEvent;
  promptEvent = null;
  install.hidden = true;
  await prompt?.prompt().catch(() => {});
});
if (window.isSecureContext && "serviceWorker" in navigator)
  navigator.serviceWorker.register("/service-worker.js").catch(() => {});
