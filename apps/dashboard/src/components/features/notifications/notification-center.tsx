'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useDashboard } from '../context/dashboard-context';
import { useNotifications } from '@/hooks/use-notifications';
import { NotificationItem } from './notification-item';
import { Bell, CheckCheck, Loader2, RefreshCw } from 'lucide-react';

export function NotificationCenter() {
  const { selectedProject, session } = useDashboard();
  const userId = session?.user?.id || null;
  const projectId = selectedProject?.id || null;

  const [isOpen, setIsOpen] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    notifications,
    unreadCount,
    loading,
    error,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
  } = useNotifications(projectId, userId);

  // Close popover when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch notifications when popover opens or filter changes
  useEffect(() => {
    if (isOpen && projectId && userId) {
      fetchNotifications(1, unreadOnly);
    }
  }, [isOpen, projectId, userId, unreadOnly, fetchNotifications]);

  const handleToggle = () => {
    setIsOpen((prev) => !prev);
  };

  return (
    <div className="relative inline-block" ref={containerRef}>
      {/* Bell Trigger Button */}
      <button
        onClick={handleToggle}
        className={`relative p-2 rounded-none transition border ${
          isOpen
            ? 'bg-zinc-900 border-zinc-700 text-white'
            : 'bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-900'
        }`}
        aria-label="Open notifications center"
        title="Notifications"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-none bg-orange-500 text-white font-mono text-[10px] font-bold flex items-center justify-center shadow-sm">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Popover Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-zinc-950 border border-zinc-800 rounded-none shadow-2xl shadow-black z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Top Panel Header */}
          <div className="p-3 bg-zinc-900/80 border-b border-zinc-800 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-orange-400" />
              <h3 className="text-xs font-bold text-zinc-100 uppercase tracking-wider font-mono">
                Notifications
              </h3>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-none bg-orange-500/20 border border-orange-500/40 text-orange-400 font-mono text-[10px] font-bold">
                  {unreadCount} unread
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-[11px] font-mono text-zinc-400 hover:text-orange-400 transition flex items-center gap-1"
                  title="Mark all as read"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  Read All
                </button>
              )}
              <button
                onClick={() => fetchNotifications(1, unreadOnly)}
                className="p-1 rounded-none text-zinc-400 hover:text-zinc-200 transition"
                title="Refresh notifications"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex border-b border-zinc-800 bg-zinc-900/40 text-xs font-mono">
            <button
              onClick={() => setUnreadOnly(false)}
              className={`flex-1 py-1.5 text-center font-semibold transition border-b-2 ${
                !unreadOnly
                  ? 'border-orange-500 text-orange-400 bg-zinc-900/60'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setUnreadOnly(true)}
              className={`flex-1 py-1.5 text-center font-semibold transition border-b-2 ${
                unreadOnly
                  ? 'border-orange-500 text-orange-400 bg-zinc-900/60'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Unread Only
            </button>
          </div>

          {/* Notifications Scrollable List Container */}
          <div className="max-h-80 overflow-y-auto divide-y divide-zinc-800/60">
            {loading && notifications.length === 0 ? (
              <div className="py-8 text-center text-xs text-zinc-400 flex flex-col items-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-orange-400" />
                <span>Loading notifications...</span>
              </div>
            ) : error === 'End user not found in project' || error?.includes('not found') ? (
              <div className="p-6 text-center text-xs text-zinc-400 space-y-2">
                <Bell className="w-8 h-8 mx-auto text-zinc-600 mb-2" />
                <p className="font-semibold text-zinc-200 font-mono">No End-User Notifications</p>
                <p className="text-zinc-500 font-sans leading-relaxed">
                  In-app notifications are delivered to project end-users when XP is awarded,
                  achievements unlock, levels increase, or challenges complete.
                </p>
                <p className="text-[11px] text-orange-400/80 font-mono pt-1">
                  Tip: Inspect user notifications under the Users roster menu.
                </p>
              </div>
            ) : error ? (
              <div className="p-4 text-center text-xs text-rose-400 font-mono">{error}</div>
            ) : notifications.length === 0 ? (
              <div className="py-8 text-center text-xs text-zinc-500 font-mono">
                {unreadOnly ? 'No unread notifications.' : 'No notifications found.'}
              </div>
            ) : (
              notifications.map((notif) => (
                <NotificationItem key={notif.id} notification={notif} onMarkRead={markAsRead} />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
