// Service worker for Web Push notifications.
// Keep this file small + self-contained — it runs outside the React app.

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = { title: "Dixon Doggy Day Care", body: "" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    if (event.data) payload.body = event.data.text();
  }
  const { title, body, url, tag } = payload;
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icon.png",
      badge: "/icon.png",
      tag: tag || undefined,
      data: { url: url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(
      (clientList) => {
        for (const client of clientList) {
          if ("focus" in client && client.url.endsWith(target)) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(target);
      },
    ),
  );
});
