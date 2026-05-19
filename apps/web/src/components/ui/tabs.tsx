'use client';

import * as React from 'react';

import * as TabsPrimitive from '@radix-ui/react-tabs';

import { cn } from '@/lib/utils';

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      'bg-container text-muted-foreground border-border inline-flex h-10 items-center justify-center rounded-full border p-1',
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'focus-visible:ring-ring data-[state=active]:bg-state-active data-[state=active]:text-state-active-foreground hover:text-foreground hover:bg-state-hover inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-normal whitespace-nowrap transition-all focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow-sm',
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

/**
 * アンダーラインスタイルのタブトリガー
 *
 * Slack/Linear風のアンダーラインタブデザイン。
 * アクティブ時のみ下線が表示される。
 */
const UnderlineTabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'text-muted-foreground data-[state=active]:text-foreground data-[state=active]:border-foreground hover:text-foreground hover:border-foreground/50 inline-flex items-center justify-center gap-2 rounded-none border-b-2 border-transparent p-0 text-sm font-normal whitespace-nowrap transition-all focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-transparent data-[state=active]:shadow-none',
      className,
    )}
    {...props}
  />
));
UnderlineTabsTrigger.displayName = 'UnderlineTabsTrigger';

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      'ring-offset-background focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsContent, TabsList, TabsTrigger, UnderlineTabsTrigger };
