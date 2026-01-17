# TPS Notifier - Refactored Architecture

## Overview

The TPS Notifier plugin has been completely refactored to use a **rule-based architecture** that makes it much easier to configure different types of reminders and debug notification behavior.

## Key Improvements

### 1. **Rule-Based Configuration**

Instead of hardcoded reminder types, the plugin now uses configurable rules. Each rule defines:

- **ID**: Unique identifier for the rule
- **Name**: Display name
- **Type**: `upcoming`, `overdue`, `start`, or `timeblock-start`
- **Frontmatter Field**: Which field to check (e.g., `scheduled`, `due`, `timeLogLinks`)
- **Pre-alert Minutes**: For upcoming alerts (e.g., `[15, 5]` = alert 15 and 5 minutes before)
- **Window Minutes**: For start alerts (how close to start time to trigger)
- **Notification Templates**: Customizable title and body with variables

### 2. **Comprehensive Logging**

Every notification check is now logged to the console when logging is enabled:

```
[TPS Notifier] Running rules check - Mode: notify, Ignore History: false, Specific Files: all
[TPS Notifier] Checking 142 files against 6 enabled rules
[TPS Notifier] Check complete - Found 3 pending alerts
[TPS Notifier] Notification sent: Upcoming: Meeting Notes
```

Toggle logging with the command palette: **"Toggle Notification Logging"**

### 3. **Time Block Support**

The plugin now supports time blocks stored as list frontmatter fields (like the calendar plugin's `timeLogLinks`):

```yaml
timeLogLinks:
  - "2025-01-15 09:00 - 2025-01-15 10:00"
  - "2025-01-15 14:00 - 2025-01-15 15:00"
```

When a time block starts, you'll get a single notification. The plugin tracks which specific blocks have been notified to avoid duplicates.

## Default Rules

The plugin comes with 6 pre-configured rules:

1. **Upcoming (Scheduled)** - Alerts 15 and 5 minutes before `scheduled` time
2. **Upcoming (Due)** - Alerts 15 and 5 minutes before `due` time
3. **Overdue (Scheduled)** - Alerts when `scheduled` time has passed
4. **Overdue (Due)** - Alerts when `due` time has passed
5. **Start Alert (Scheduled)** - Alerts when `scheduled` event starts
6. **Time Block Start** - Alerts when a time block from `timeLogLinks` starts

## Adding New Reminder Types

To add a new reminder type:

1. Open the plugin settings
2. Each rule has its own configuration section
3. Modify the frontmatter field, alert timings, and notification templates
4. Enable/disable rules as needed

## Template Variables

Notification templates support these variables:

- `{filename}` - The note's basename
- `{time}` - The formatted time (HH:mm)
- `{minutes}` - Minutes until/since the event

Example:
```
Title: "Upcoming: {filename}"
Body: "The event '{filename}' starts at {time}, in {minutes} minutes."
```

## Migration

The plugin automatically migrates old settings to the new rule-based structure:

- Old `upcomingField` → Mapped to "Upcoming (Scheduled)" rule
- Old `overdueField` → Mapped to "Overdue (Due)" rule
- Old `enableUpcoming` → Enables/disables upcoming rules
- Old `enableOverdue` → Enables/disables overdue rules
- Old `enableStartAlert` → Enables/disables start rules

## State Tracking

The plugin maintains separate state for each rule and file:

```typescript
alertState: {
  "path/to/note.md": {
    "upcoming-scheduled": {
      preSent: [15, 5],           // Which pre-alerts have been sent
      overdueSent: 1736956800000, // Timestamp of overdue notification
      startSent: true,            // Whether start alert was sent
      timeblocksSent: [           // Which timeblocks have been notified
        "2025-01-15 09:00 - 2025-01-15 10:00"
      ]
    }
  }
}
```

This ensures:
- No duplicate notifications
- Proper tracking across multiple rules
- Automatic cleanup when dates change

## Commands

- **Send Current Note via Ntfy** - Send entire note content
- **Send Selection via Ntfy** - Send selected text
- **Send Custom Message to Phone** - Send arbitrary message
- **View All Pending Alerts** - See all pending notifications (modal)
- **Check All Notifications** - Manually trigger notification check
- **Toggle Notification Logging** - Enable/disable console logging

## Settings Structure

```typescript
interface TPSNotifierSettings {
  // Ntfy configuration
  ntfyServer: string;
  ntfyTopic: string;
  ntfyPriority: number;
  deviceRole: 'controller' | 'receiver';
  pollMinutes: number;
  
  // Rule-based reminders
  reminderRules: ReminderRule[];
  
  // State tracking
  alertState: Record<string, Record<string, RuleState>>;
  
  // Exclusions
  ignoredProperties: string[];
  ignoredTags: string[];
  ignoredPaths: string[];
  
  // Debugging
  enableLogging: boolean;
}
```

## Example: Custom Time Block Rule

To create a custom time block reminder for a different field:

1. Go to Settings → TPS Notifier → Reminder Rules
2. Find the "Time Block Start" rule
3. Change the "Frontmatter Field" to your custom field name
4. Adjust the "Window Minutes" if needed
5. Customize the notification templates

The plugin will automatically parse time blocks in the format:
```
YYYY-MM-DD HH:mm - YYYY-MM-DD HH:mm
```

## Debugging

With logging enabled, you can see:
- When checks are triggered (scheduled vs. metadata change)
- How many files are being checked
- Which rules are enabled
- How many alerts were found
- When notifications are sent

This makes it much easier to troubleshoot why a notification isn't firing or is firing too often.
