# TPS Notifier

**Two-way notifications via Telegram for an always-on vault, ensuring you never miss important updates even when away from your desk.**

![Obsidian Plugin](https://img.shields.io/badge/dynamic/json-blue?label=Obsidian%20Plugin&query=version)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Build](https://img.shields.io/github/workflows/CI/TPS-Notifier)

## ✨ Features

### 📱 Push Notifications
- **Telegram Integration**: Send notifications directly to your Telegram device
- **Custom Server**: Configurable notification server endpoint
- **Topic-based Messaging**: Organize notifications by topics and categories
- **Reliable Delivery**: Retry logic for failed notifications

### 🎯 Smart Reminders
- **Frontmatter-based**: Define reminders using YAML frontmatter
- **Time Offsets**: Notify before, at, or after target times
- **Repeat Logic**: Configurable repeating until completion
- **Stop Conditions**: Smart cancellation when tasks are completed

### 🔗 Deep Linking
- **Obsidian Protocol**: Direct links back to specific notes
- **Cross-device Sync**: Works across all your synced devices
- **Fallback Handling**: Graceful degradation when files aren't found
- **URL Parameters**: Support for specific views and actions

### 📋 Smart Filtering
- **Path Exclusions**: Ignore specific folders (System/, Archive/, etc.)
- **Tag Filtering**: Exclude notes by tags (template, archive, etc.)
- **Status Filtering**: Skip completed or cancelled tasks
- **Global Settings**: Configure once, applies everywhere

## 🚀 Installation

### Via BRAT (Recommended for Testing)
1. Install the [BRAT plugin](https://github.com/TfTHacker/obsidian42-brat) in Obsidian
2. Go to Settings → Community Plugins → Add BRAT plugin
3. Add this repository URL: `https://github.com/ZachTish/TPS-Notifier`
4. Enable "TPS Notifier" in your installed plugins

### Via Release (Stable)
1. Download the latest [release](https://github.com/ZachTish/TPS-Notifier/releases)
2. Extract the contents to your vault's plugins folder
3. Restart Obsidian and enable the plugin

## 📖 Usage

### Basic Setup

1. **Configure Server**: Go to Settings → TPS Notifier
2. **Set Telegram Bot**: Add your bot token and chat ID
3. **Choose Role**: Select "Controller" or "Receiver" device role
4. **Test Connection**: Send a test notification

### Setting Up Reminders

#### Basic Frontmatter
```yaml
---
scheduled: 2024-01-20 14:00
due: 2024-01-20 16:00
status: in-progress
priority: high
---
```

#### Advanced Reminder Configuration
```yaml
---
# Notify 15 minutes before scheduled time
scheduled: 2024-01-20 14:00

# Repeat every 10 minutes until task is complete
due: 2024-01-20 16:00

# Custom notification content
title: "Team Meeting"
description: "Quarterly review with stakeholders"
---
```

### Reminder Types

#### Scheduled Reminders
- **Time-based**: Notify at specific times
- **Offset Support**: `-15m` (15 minutes before), `+30m` (30 minutes after)
- **Repeat Logic**: Configurable intervals until completion
- **Custom Messages**: Dynamic titles and descriptions

#### Due Date Reminders
- **Task Tracking**: Monitor due dates and deadlines
- **Overdue Alerts**: Continuous reminders for overdue items
- **Priority-based**: Different alert intervals by priority
- **Completion Detection**: Auto-stop when marked complete

### Device Roles

#### Controller Device
- **Sends Notifications**: Evaluates and dispatches reminders
- **Master Configuration**: Controls notification settings
- **Best for**: Main work computer or server

#### Receiver Device  
- **Receive Only**: Ideal for mobile or secondary devices
- **Reduced Load**: Doesn't process reminder logic
- **Best for**: Phone, tablet, or laptop on-the-go

## ⚙️ Settings

### Notification Configuration
- **Server URL**: Custom ntfy server endpoint
- **Topic**: Notification topic/channel
- **Device Role**: Controller vs Receiver mode
- **Timeout Settings**: Connection and retry timeouts

### Reminder Settings
- **Scheduled Reminders**: Enable/disable time-based alerts
- **Due Reminders**: Enable/disable deadline alerts
- **Default Offsets**: Global time offset settings
- **Repeat Intervals**: Default repeat frequencies

### Filtering Options
- **Excluded Paths**: Folders to completely ignore
- **Excluded Tags**: Tags to skip during processing
- **Excluded Statuses**: Status values that block notifications
- **Global Patterns**: Regex patterns for advanced filtering

## 🎯 Use Cases

### **Always-On Productivity**
- Stay updated on tasks while away from desk
- Receive meeting reminders on mobile device
- Never miss deadline notifications

### **Team Collaboration**
- Shared notification channels for team updates
- Cross-device synchronization of project status
- Mobile access to critical notifications

### **Personal Task Management**
- Personal reminder system for important dates
- Custom notification schedules for recurring tasks
- Integration with existing Obsidian workflows

## 🔧 Technical Details

### Notification Protocol
- **HTTP POST**: Standard webhook-based delivery
- **JSON Format**: Structured notification payload
- **Obsidian URLs**: Deep linking support (`obsidian://tps-notifier?file=path`)
- **Retry Logic**: Automatic retry with exponential backoff

### Reminder Engine
- **File Scanner**: Periodic markdown file analysis
- **Frontmatter Parser**: YAML frontmatter extraction
- **State Tracking**: Per-file alert state management
- **Scheduler**: Configurable evaluation intervals

### Performance Features
- **Debounced Updates**: Optimized file change handling
- **Memory Efficient**: Minimal footprint during operation
- **Background Processing**: Non-blocking reminder evaluation

## 📋 Commands

### Available Commands
- **List Overdue Items**: Show all currently overdue reminders
- **Send Test Notification**: Send a test notification to verify setup
- **Clear Alert State**: Reset all reminder tracking states
- **Force Refresh**: Immediate scan of all reminder files

## 🐛 Troubleshooting

### Common Issues

#### Notifications Not Sending
- Verify Telegram bot token and chat ID
- Check network connectivity to ntfy server
- Ensure controller role is enabled on primary device
- Test with "Send Test Notification" command

#### Duplicate Notifications
- Check alert state tracking (restart Obsidian if needed)
- Verify repeat intervals aren't too aggressive
- Ensure stop conditions are properly configured

#### Deep Links Not Working
- Confirm Obsidian protocol handler registration
- Check file paths in notification URLs
- Verify sync status across devices

### Debug Mode
Enable logging to troubleshoot:
- Reminder evaluation timing
- HTTP request failures
- File scanning results
- State management issues

## 📋 Changelog

### v1.0.0 (2024-01-17)
- ✅ Initial release
- ✅ Telegram notification integration
- ✅ Frontmatter-based reminders
- ✅ Device role configuration
- ✅ Obsidian protocol deep linking

## 🔧 Development

### Building from Source
```bash
# Clone the repository
git clone https://github.com/ZachTish/TPS-Notifier.git
cd TPS-Notifier

# Install dependencies
npm install

# Build the plugin
npm run build

# Watch for changes during development
npm run dev
```

### Contributing
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'feat: Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request against the `develop` branch

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guidelines](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## 🔗 Links

- **Repository**: https://github.com/ZachTish/TPS-Notifier
- **Issues**: https://github.com/ZachTish/TPS-Notifier/issues
- **Discussions**: https://github.com/ZachTish/TPS-Notifier/discussions
- **Releases**: https://github.com/ZachTish/TPS-Notifier/releases

---

**Made with ❤️ for the Obsidian community**