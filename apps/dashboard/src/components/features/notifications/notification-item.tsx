'use client';

import React from 'react';
import { NotificationRecord } from '@/hooks/use-notifications';
import { formatRelativeTime } from '@/hooks/use-relative-time';
import { Zap, Trophy, Target, Swords, Check } from 'lucide-react';

interface NotificationItemProps {
  notification: NotificationRecord;
  onMarkRead: (id: string) => void;
}

export function NotificationItem({ notification, onMarkRead }: NotificationItemProps) {
  const relativeTime = formatRelativeTime(notification.createdAt);
  const isUnread = !notification.readAt;

  const renderIcon = () => {
    switch (notification.type) {
      case 'xp_awarded':
        return <Zap className="w-4 h-4 text-amber-400" />;
      case 'achievement_unlocked':
        return <Trophy className="w-4 h-4 text-yellow-400" />;
      case 'level_up':
        return <Target className="w-4 h-4 text-emerald-400" />;
      case 'challenge_completed':
        return <Swords className="w-4 h-4 text-cyan-400" />;
      default:
        return <Zap className="w-4 h-4 text-orange-400" />;
    }
  };

  return (
    <div
      className={`relative p-3 border-b border-zinc-800/80 transition-colors flex items-start gap-3 rounded-none ${
        isUnread
          ? 'bg-zinc-900/90 hover:bg-zinc-900'
          : 'bg-zinc-950/40 hover:bg-zinc-900/40 opacity-80'
      }`}
    >
      {/* Unread Indicator Bar */}
      {isUnread && (
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-orange-500 rounded-none" />
      )}

      {/* Icon Badge */}
      <div className="w-8 h-8 rounded-none bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0 mt-0.5">
        {renderIcon()}
      </div>

      {/* Text Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <h4
            className={`text-xs font-semibold truncate ${
              isUnread ? 'text-zinc-100' : 'text-zinc-400'
            }`}
          >
            {notification.title}
          </h4>
          <span className="text-[10px] font-mono text-zinc-500 shrink-0">{relativeTime}</span>
        </div>
        <p className="text-xs text-zinc-300 mt-0.5 leading-relaxed break-words">
          {notification.message}
        </p>
      </div>

      {/* Mark Read Action Button */}
      {isUnread && (
        <button
          onClick={() => onMarkRead(notification.id)}
          className="p-1 rounded-none text-zinc-500 hover:text-orange-400 hover:bg-zinc-800 transition shrink-0 self-center"
          title="Mark as Read"
          aria-label="Mark notification as read"
        >
          <Check className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
