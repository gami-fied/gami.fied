# Notifications API Guide (`gami.notifications`)

Manage in-app notifications generated for end users.

---

## 1. List User Notifications (`gami.notifications.list`)

```typescript
const notifs = await gami.notifications.list({
  projectId: 'prj_123',
  userId: 'usr_101',
  unreadOnly: false,
  page: 1,
  limit: 20,
});

console.log(`Unread Count: ${notifs.unreadCount}`);
notifs.notifications.forEach((n) => {
  console.log(`[${n.type}] ${n.title}: ${n.message}`);
});
```

---

## 2. Get Unread Count (`gami.notifications.getUnreadCount`)

```typescript
const { unreadCount } = await gami.notifications.getUnreadCount({
  projectId: 'prj_123',
  userId: 'usr_101',
});

console.log(`Unread Notifications: ${unreadCount}`);
```

---

## 3. Mark Single Notification Read (`gami.notifications.markAsRead`)

```typescript
await gami.notifications.markAsRead({
  projectId: 'prj_123',
  userId: 'usr_101',
  notificationId: 'ntf_99182',
});
```

---

## 4. Mark All Read (`gami.notifications.markAllAsRead`)

```typescript
const res = await gami.notifications.markAllAsRead({
  projectId: 'prj_123',
  userId: 'usr_101',
});

console.log(`Marked ${res.count} notifications as read.`);
```
