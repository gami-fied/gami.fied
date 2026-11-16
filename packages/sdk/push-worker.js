/*
 * The service worker that shows Gami.Fied notifications in a browser. Copy this file to your
 * site's root (for example /gami-push-worker.js) and pass its address to
 * `gami.me.enableWebPush({ serviceWorker: '/gami-push-worker.js' })`.
 *
 * A push arrives encrypted for this browser alone. It carries a title, a body and a little data:
 * `{ title, body, data: { type, ... } }`. Change what is shown here if you like.
 */
/* global self, clients */

self.addEventListener('push', (event) => {
  let message = { title: 'Notification', body: '', data: {} };
  try {
    message = { ...message, ...event.data.json() };
  } catch {
    // A push with no readable body still shows something, because browsers require it.
  }
  event.waitUntil(
    self.registration.showNotification(message.title, {
      body: message.body,
      data: message.data,
      // One notification per kind replaces the last, so a busy player is not buried.
      tag: (message.data && message.data.type) || 'gami',
    })
  );
});

// Clicking a notification brings the player back to your site.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((open) => {
      const existing = open.find((client) => 'focus' in client);
      return existing ? existing.focus() : clients.openWindow('/');
    })
  );
});
