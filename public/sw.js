self.addEventListener('push', function(event) {
  if (event.data) {
    try {
      const data = event.data.json();
      const options = {
        body: data.body,
        icon: '/logologin.svg',
        badge: '/logologin.svg',
        vibrate: [100, 50, 100],
        data: {
          url: data.url || '/staff-portal'
        }
      };
      event.waitUntil(
        self.registration.showNotification(data.title, options)
      );
    } catch (e) {
      // Fallback if data is not JSON
      const text = event.data.text();
      const options = {
        body: text,
        icon: '/logologin.svg',
        badge: '/logologin.svg',
        vibrate: [100, 50, 100],
        data: {
          url: '/staff-portal'
        }
      };
      event.waitUntil(
        self.registration.showNotification('OddsOff Notification', options)
      );
    }
  }
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      const targetUrl = event.notification.data.url;
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
