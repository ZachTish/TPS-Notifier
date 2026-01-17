import { App, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, moment, debounce, getAllTags, WorkspaceLeaf } from 'obsidian';
import * as logger from "./logger";
import { NotificationView, NOTIFICATION_VIEW_TYPE } from './notification-view';
import { SnoozeModal } from './snooze-modal';
import { TPSNotifierSettings, PropertyReminder, OverdueItem } from './types';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

// Types moved to types.ts

const DEFAULT_REMINDERS: PropertyReminder[] = [
    {
        id: 'scheduled-15m',
        property: 'scheduled',
        enabled: true,
        mode: 'timeblock',
        offsetMinutes: -15,
        repeatUntilComplete: false,
        repeatIntervalMinutes: 5,
        maxRepeats: -1,
        stopConditions: ['status: complete', 'status: wont-do'],
        title: 'Upcoming: {filename}',
        body: 'Starts at {time} ({remaining})',
        ignorePaths: ['System/'],
        ignoreTags: ['archive', 'template'],
        ignoreStatuses: ['complete', 'wont-do'],
    },
    {
        id: 'due-15m',
        property: 'due',
        enabled: true,
        mode: 'task',
        offsetMinutes: -15,
        repeatUntilComplete: true,
        repeatIntervalMinutes: 10,
        maxRepeats: -1,
        stopConditions: ['status: complete', 'status: wont-do'],
        title: 'Due Soon: {filename}',
        body: 'Due at {time} ({remaining})',
        ignorePaths: ['System/'],
        ignoreTags: ['archive', 'template'],
        ignoreStatuses: ['complete', 'wont-do'],
    },
];

const DEFAULT_SETTINGS: TPSNotifierSettings = {
    ntfyServer: 'https://ntfy.sh',
    ntfyTopic: '',
    ntfyPriority: 3,
    deviceRole: 'receiver',
    pollMinutes: 0.5,
    reminders: DEFAULT_REMINDERS,
    alertState: {},
    ignorePaths: ['System/'],
    ignoreTags: ['archive', 'template'],
    ignoreStatuses: ['complete', 'wont-do'],
    enableLogging: false,
    snoozeProperty: 'reminderSnooze' // [NEW] Configurable snooze property
};

const LOCAL_STORAGE_ROLE_KEY = 'tps-notifier-device-role';

// ============================================================================
// MAIN PLUGIN CLASS
// ============================================================================

export default class TPSNotifier extends Plugin {
    settings: TPSNotifierSettings;
    intervalHandle: any = null;

    async onload() {
        await this.loadSettings();

        logger.setLoggingEnabled(this.settings.enableLogging);
        this.addSettingTab(new TPSNotifierSettingTab(this.app, this));

        this.registerView(
            NOTIFICATION_VIEW_TYPE,
            (leaf) => new NotificationView(leaf, this)
        );

        this.addRibbonIcon('bell', 'TPS Notifications', () => {
            this.activateView();
        });

        // Commands
        this.addCommand({
            id: 'list-overdue-items',
            name: 'List Overdue Items',
            callback: () => this.listOverdueItems()
        });

        this.addCommand({
            id: 'send-notifications',
            name: 'Send Notifications',
            callback: async () => {
                if (this.settings.deviceRole !== 'controller') {
                    new Notice('Device role must be "controller" to send notifications');
                    return;
                }
                const url = this.getNtfyUrl();
                if (!url) {
                    new Notice('Configure ntfy server and topic first in settings');
                    return;
                }
                new Notice('Sending notifications...');
                const count = await this.runReminders({ ignoreHistory: true });
                new Notice(`Sent ${count} notification(s)`);
            }
        });

        // Context Menu
        this.registerEvent(
            this.app.workspace.on('file-menu', (menu, file) => {
                if (file instanceof TFile && file.extension === 'md') {
                    menu.addItem((item) => {
                        item
                            .setTitle('Snooze Reminder...')
                            .setIcon('clock')
                            .onClick(() => {
                                new SnoozeModal(this.app, async (minutes) => {
                                    await this.snoozeFile(file, minutes);
                                    new Notice(`Snoozed for ${minutes} minutes`);
                                }).open();
                            });
                    });
                }
            })
        );

        // Start the check loop
        this.app.workspace.onLayoutReady(() => {
            this.startLoop();
        });

        // Re-check on file changes
        this.registerEvent(
            this.app.metadataCache.on('changed', debounce(() => {
                if (this.settings.deviceRole === 'controller') {
                    this.runReminders({ ignoreHistory: false });
                }
            }, 2000, true))
        );

        // Register custom protocol handler for smart callbacks
        this.registerObsidianProtocolHandler("tps-notifier", async (params) => {
            const vaultName = params.vault;
            const filePath = params.file;
            const action = params.action;

            if (!filePath) return;

            // Normalize path (decode URI component handled by obsidian protocol usually, but let's be safe)
            const decodedPath = decodeURIComponent(filePath);

            // 1. Try to find the file immediately
            const file = this.app.vault.getAbstractFileByPath(decodedPath);
            if (file && file instanceof TFile) {
                const leaf = this.app.workspace.getLeaf(false);
                if (leaf) {
                    leaf.openFile(file);
                }
                return;
            }

            // 2. If missing, wait 3 seconds (debounce for sync)
            new Notice(`File not found: ${decodedPath}. Waiting for sync...`);
            await new Promise(resolve => setTimeout(resolve, 3000));

            // 3. Try again
            const fileRetry = this.app.vault.getAbstractFileByPath(decodedPath);
            if (fileRetry && fileRetry instanceof TFile) {
                const leaf = this.app.workspace.getLeaf(false);
                if (leaf) {
                    leaf.openFile(fileRetry);
                }
                new Notice("File found and opened.");
                return;
            }

            // 4. Fallback: Trigger "List Overdue Items" to show the user what's pending
            new Notice("File still missing. Showing overdue items.");
            this.listOverdueItems();
        });
    }

    onunload() {
        this.stopLoop();
    }

    async loadSettings() {
        const data = await this.loadData();
        this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
        logger.setLoggingEnabled(this.settings.enableLogging);

        // [New] Check local storage for device-specific role override
        const localRole = window.localStorage.getItem(LOCAL_STORAGE_ROLE_KEY);
        if (localRole === 'controller' || localRole === 'receiver') {
            this.settings.deviceRole = localRole;
            this.log(`Device role overridden by local storage: ${localRole}`);
        }

        // Ensure reminders array exists
        if (!this.settings.reminders) {
            this.settings.reminders = DEFAULT_REMINDERS;
        }

        // Migrate legacy global ignore rules into per-reminder settings (if missing).
        const legacyIgnorePaths = Array.isArray(this.settings.ignorePaths) ? this.settings.ignorePaths : [];
        const legacyIgnoreTags = Array.isArray(this.settings.ignoreTags) ? this.settings.ignoreTags : [];
        const legacyIgnoreStatuses = Array.isArray(this.settings.ignoreStatuses) ? this.settings.ignoreStatuses : [];

        for (const reminder of this.settings.reminders) {
            if (!Array.isArray(reminder.ignorePaths)) reminder.ignorePaths = [...legacyIgnorePaths];
            if (!Array.isArray(reminder.ignoreTags)) reminder.ignoreTags = [...legacyIgnoreTags];
            if (!Array.isArray(reminder.ignoreStatuses)) reminder.ignoreStatuses = [...legacyIgnoreStatuses];
        }
    }

    async saveSettings() {
        logger.setLoggingEnabled(this.settings.enableLogging);
        await this.saveData(this.settings);
    }

    log(message: string, ...args: any[]) {
        logger.log(`[TPS Notifier] ${message}`, ...args);
    }

    // ========================================================================
    // NOTIFICATION SENDING
    // ========================================================================

    buildObsidianLink(file?: TFile): string {
        if (!file) return '';
        const vaultName = encodeURIComponent(this.app.vault.getName());
        const filePath = encodeURIComponent(file.path);
        // Use custom protocol to handle missing files/sync delay
        return `obsidian://tps-notifier?vault=${vaultName}&file=${filePath}`;
    }

    getNtfyUrl(): string | null {
        const base = (this.settings.ntfyServer || '').replace(/\/+$/, '');
        const topic = (this.settings.ntfyTopic || '').trim();
        if (!base || !topic) return null;
        return `${base}/${topic}`;
    }

    async sendMessage(text: string, file?: TFile, title?: string) {
        if (this.settings.deviceRole !== 'controller') {
            this.log('Skipping send - device is receiver');
            return;
        }

        const url = this.getNtfyUrl();
        if (!url) {
            new Notice('Configure ntfy server and topic first.');
            return;
        }

        const clickLink = this.buildObsidianLink(file);
        const headers: Record<string, string> = {
            'Content-Type': 'text/plain; charset=utf-8',
            'Title': title || 'TPS Notifier',
            'Priority': String(this.settings.ntfyPriority || 3),
            'Markdown': 'yes',
        };

        if (clickLink) {
            headers['Click'] = clickLink;
        }

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers,
                body: text || '(empty message)',
            });

            if (response.ok) {
                this.log(`Notification sent: ${title}`);
            } else {
                const err = await response.text();
                logger.error('[TPS Notifier] Ntfy error:', err);
            }
        } catch (error) {
            logger.error('[TPS Notifier] Failed to send notification:', error);
        }
    }

    // ========================================================================
    // REMINDER LOOP
    // ========================================================================

    startLoop() {
        this.stopLoop();
        if (this.settings.deviceRole !== 'controller') return;

        this.log('Starting reminder check loop...');

        // Run immediately
        this.runReminders({ ignoreHistory: false });

        // Set up interval
        const ms = Math.max(30000, this.settings.pollMinutes * 60 * 1000);
        this.intervalHandle = setInterval(() => {
            this.runReminders({ ignoreHistory: false });
        }, ms);

        this.log(`Check interval: ${ms}ms`);
    }

    stopLoop() {
        if (this.intervalHandle) {
            clearInterval(this.intervalHandle);
            this.intervalHandle = null;
        }
    }

    // ========================================================================
    // CORE REMINDER LOGIC
    // ========================================================================

    parseDate(input: any): number | null {
        if (!input) return null;
        let raw = Array.isArray(input) ? input[0] : input;
        if (!raw) return null;
        raw = String(raw).replace(/[\[\]]/g, '');

        // Handle property ranges (e.g. "10:00 AM - 11:30 AM", "10:00-12:00", or "2025-12-25 08:00 - 10:00")
        // We extract the START time for the notification trigger.
        // Support " - ", " – " (en dash), and simple "-" if surrounded by digits
        if (typeof raw === 'string') {
            // Normalized split for standard ranges
            let split = raw.split(/\s+[-–]\s+/);
            if (split.length > 1) {
                raw = split[0].trim();
            } else {
                // Try compact split if looks like time range (HH:MM-HH:MM)
                const compactMatch = raw.match(/^(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);
                if (compactMatch) {
                    raw = compactMatch[1];
                }
            }

            // Extract date from strings that contain text before the date
            // Pattern: "some text YYYY-MM-DD HH:MM" or "some text YYYY-MM-DD"
            const dateTimeMatch = raw.match(/(\d{4}-\d{2}-\d{2})(?:\s+(\d{1,2}:\d{2}(?:\s*[AP]M?)?))?/i);
            if (dateTimeMatch) {
                raw = dateTimeMatch[0]; // Use just the matched date/time portion
            }
        }

        // Use strict parsing with common formats to avoid moment fallback warnings
        const formats = [
            'YYYY-MM-DD HH:mm',
            'YYYY-MM-DD H:mm',
            'YYYY-MM-DD HH:mm A',
            'YYYY-MM-DD h:mm A',
            'YYYY-MM-DDTHH:mm:ss',
            'YYYY-MM-DDTHH:mm',
            'YYYY-MM-DD',
            moment.ISO_8601
        ];

        const m = moment(raw, formats, true);
        if (m.isValid()) return m.valueOf();

        // Fallback to non-strict parsing, but only if it looks like it might be a date
        if (/\d{4}[-\/]\d{1,2}[-\/]\d{1,2}/.test(raw) || /\d{1,2}:\d{2}/.test(raw)) {
            const fallback = moment(raw);
            return fallback.isValid() ? fallback.valueOf() : null;
        }

        return null;
    }

    parseDuration(input: any): number {
        if (typeof input === 'number') return input; // Assume minutes
        if (!input) return 0;

        const str = String(input).trim().toLowerCase();

        // Handle "1h 30m", "90m", "1.5h"
        // Simple regex for explicit units
        const hoursMatch = str.match(/(\d+(?:\.\d+)?)h/);
        const minsMatch = str.match(/(\d+(?:\.\d+)?)m/);

        let minutes = 0;
        if (hoursMatch) minutes += parseFloat(hoursMatch[1]) * 60;
        if (minsMatch) minutes += parseFloat(minsMatch[1]);

        if (minutes > 0) return minutes;

        // Fallback: if just a number string "90", assume minutes
        const num = parseFloat(str);
        if (!isNaN(num)) return num;

        return 0;
    }

    formatTemplate(template: string, vars: Record<string, any>): string {
        let result = template;
        for (const key in vars) {
            result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), String(vars[key] ?? ''));
        }
        return result;
    }

    checkStopCondition(fm: any, condition: string): boolean {
        const parts = condition.split(':');
        if (parts.length < 2) return false;

        const key = parts[0].trim();
        const expectedValue = parts.slice(1).join(':').trim().toLowerCase();
        const actualValue = fm[key];

        if (actualValue === undefined || actualValue === null) return false;
        return String(actualValue).toLowerCase() === expectedValue;
    }

    private shouldIgnoreForReminder(file: TFile, cache: any, fm: any, reminder: PropertyReminder): boolean {
        const ignorePaths =
            Array.isArray(reminder.ignorePaths) ? reminder.ignorePaths : (Array.isArray(this.settings.ignorePaths) ? this.settings.ignorePaths : []);
        const ignoreTags =
            Array.isArray(reminder.ignoreTags) ? reminder.ignoreTags : (Array.isArray(this.settings.ignoreTags) ? this.settings.ignoreTags : []);
        const ignoreStatuses =
            Array.isArray(reminder.ignoreStatuses) ? reminder.ignoreStatuses : (Array.isArray(this.settings.ignoreStatuses) ? this.settings.ignoreStatuses : []);

        if (ignorePaths.some(p => p && file.path.startsWith(p))) {
            return true;
        }

        const rawStatus = fm?.status;
        const statuses = new Set<string>();
        const addStatus = (s: unknown) => {
            const t = String(s ?? '').trim().toLowerCase();
            if (t) statuses.add(t);
        };
        if (Array.isArray(rawStatus)) {
            for (const s of rawStatus) addStatus(s);
        } else if (rawStatus !== undefined && rawStatus !== null) {
            addStatus(rawStatus);
        }
        if (ignoreStatuses.some(s => statuses.has(String(s).toLowerCase()))) {
            return true;
        }

        const tags = (cache ? getAllTags(cache) : []) || [];
        const hasIgnoredTag = tags.some(tag => {
            const pureTag = tag.replace('#', '').toLowerCase();
            return ignoreTags.some(ignored => {
                const cleanIgnored = String(ignored).toLowerCase().replace('#', '').trim();
                if (!cleanIgnored) return false;
                return pureTag === cleanIgnored || pureTag.startsWith(cleanIgnored + '/');
            });
        });
        if (hasIgnoredTag) {
            return true;
        }

        return false;
    }

    async activateView() {
        const { workspace } = this.app;

        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(NOTIFICATION_VIEW_TYPE);

        if (leaves.length > 0) {
            // A leaf with our view already exists, use that
            leaf = leaves[0];
        } else {
            // Our view could not be found in the workspace, create a new leaf
            // in the right sidebar for default behavior
            const rightLeaf = workspace.getRightLeaf(false);
            if (rightLeaf) {
                leaf = rightLeaf;
                await leaf.setViewState({ type: NOTIFICATION_VIEW_TYPE, active: true });
            }
        }

        // "Reveal" the leaf in case it is in a collapsed sidebar
        if (leaf) {
            workspace.revealLeaf(leaf);
        }
    }

    async getOverdueItems(): Promise<OverdueItem[]> {
        const now = Date.now();
        const overdueItems: OverdueItem[] = [];

        const files = this.app.vault.getMarkdownFiles();

        for (const file of files) {
            const cache = this.app.metadataCache.getFileCache(file);
            const fm = cache?.frontmatter || {};

            // Check each reminder
            for (const reminder of this.settings.reminders) {
                if (!reminder.enabled) continue;
                if (this.shouldIgnoreForReminder(file, cache, fm, reminder)) continue;

                // [Fix] Check Required Statuses (Inclusion Logic)
                if (reminder.requiredStatuses && reminder.requiredStatuses.length > 0) {
                    const rawStatus = fm.status;
                    const normalize = (s: any) => String(s ?? '').trim().toLowerCase();
                    const currentStatuses = Array.isArray(rawStatus)
                        ? rawStatus.map(normalize)
                        : [normalize(rawStatus)];

                    const required = reminder.requiredStatuses.map(normalize).filter(s => s);

                    // Allow if ANY current status matches ANY required status
                    const hasRequired = currentStatuses.some(s => required.includes(s));
                    if (!hasRequired) continue;
                }

                // [NEW] Check Snooze
                const snoozeVal = fm[this.settings.snoozeProperty || 'reminderSnooze'];
                if (snoozeVal) {
                    const snoozeTime = this.parseDate(snoozeVal);
                    if (snoozeTime && now < snoozeTime) {
                        continue;
                    }
                }

                // [NEW] Check Dismissed
                if (this.settings.alertState[file.path]?.[reminder.id]?.dismissed) {
                    continue;
                }

                const propertyValue = fm[reminder.property];
                let propertyTime = this.parseDate(propertyValue);
                if (!propertyTime) continue;

                // Check if any stop condition is met
                const stopped = reminder.stopConditions.some(cond => this.checkStopCondition(fm, cond));
                if (stopped) continue;

                // [NEW] All-Day Base Time Logic
                const isAllDaySafe = fm['allDay'] === true || String(fm['allDay']).toLowerCase() === 'true';

                if (isAllDaySafe && reminder.allDayBaseTime) {
                    const match = reminder.allDayBaseTime.match(/^(\d{1,2}):(\d{2})$/);
                    if (match) {
                        const [_, h, m] = match;
                        propertyTime = moment(propertyTime).set({
                            hour: parseInt(h, 10),
                            minute: parseInt(m, 10),
                            second: 0,
                            millisecond: 0
                        }).valueOf();
                    }
                }

                // Calculate trigger time
                let offsetMs = reminder.offsetMinutes * 60 * 1000;
                if (reminder.useSmartOffset && reminder.smartOffsetProperty) {
                    const offsetVal = fm[reminder.smartOffsetProperty];
                    const durationMins = this.parseDuration(offsetVal);
                    const smartMs = durationMins * 60 * 1000;
                    if (reminder.smartOffsetOperator === 'add') {
                        offsetMs = smartMs;
                    } else {
                        offsetMs = -smartMs;
                    }
                }

                const triggerTime = propertyTime + offsetMs;

                // Is it past trigger time? It's overdue
                if (now >= triggerTime) {
                    const diffMs = now - propertyTime;
                    const diffMins = Math.floor(diffMs / 60000);
                    let diff = '';
                    if (diffMins < 0) {
                        diff = `in ${Math.abs(diffMins)} min`;
                    } else if (diffMins < 60) {
                        diff = `${diffMins} min ago`;
                    } else {
                        diff = `${Math.floor(diffMins / 60)}h ${diffMins % 60}m ago`;
                    }
                    overdueItems.push({
                        file,
                        reminder,
                        propertyTime,
                        diff,
                        id: reminder.id
                    });
                }
            }

        }

        // Sort by time (most overdue first)
        overdueItems.sort((a, b) => a.propertyTime - b.propertyTime);

        // Deduplicate per file + property (collapse multiple rules matching the same event)
        const seenKeys = new Set<string>();
        const deduplicatedItems: OverdueItem[] = [];
        for (const item of overdueItems) {
            const key = `${item.file.path}::${item.reminder.property}`;
            if (!seenKeys.has(key)) {
                seenKeys.add(key);
                deduplicatedItems.push(item);
            }
        }

        return deduplicatedItems;
    }

    async listOverdueItems() {
        const overdueItems = await this.getOverdueItems();

        if (overdueItems.length === 0) {
            new Notice('No overdue items found');
            return;
        }

        // Create modal
        const modal = new Modal(this.app);
        modal.titleEl.setText(`Overdue Items (${overdueItems.length})`);

        const container = modal.contentEl.createDiv();
        container.style.maxHeight = '400px';
        container.style.overflowY = 'auto';

        for (const item of overdueItems) {
            const row = container.createDiv({ cls: 'tps-overdue-item' });
            row.style.padding = '8px';
            row.style.borderBottom = '1px solid var(--background-modifier-border)';
            row.style.cursor = 'pointer';

            const title = row.createEl('div', { text: item.file.basename });
            title.style.fontWeight = '600';

            const details = row.createEl('div', {
                text: `${item.reminder.property}: ${item.diff}`
            });
            details.style.fontSize = '0.85em';
            details.style.color = 'var(--text-muted)';

            const actions = row.createDiv({ cls: 'tps-overdue-actions' });
            actions.style.display = 'flex';
            actions.style.gap = '10px';
            actions.style.marginTop = '4px';

            const openBtn = actions.createEl('button', { text: 'Open Note' });
            openBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                modal.close();
                this.app.workspace.openLinkText(item.file.path, '');
            });

            const dismissBtn = actions.createEl('button', { text: 'Delete' });
            dismissBtn.style.color = 'var(--text-error)';
            dismissBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.dismissNotification(item.file, item.id);
                row.remove();
                new Notice(`Dismissed reminder for ${item.file.basename}`);
            });
        }

        modal.open();
    }

    async dismissNotification(file: TFile, reminderId: string) {
        if (!this.settings.alertState[file.path]) this.settings.alertState[file.path] = {};
        if (!this.settings.alertState[file.path][reminderId]) {
            this.settings.alertState[file.path][reminderId] = { triggered: true, repeatCount: 0 };
        }
        this.settings.alertState[file.path][reminderId].dismissed = true;
        await this.saveSettings();
    }

    async snoozeFile(file: TFile, minutes: number) {
        let snoozeTimeStr = '';
        if (minutes > 0) {
            snoozeTimeStr = moment().add(minutes, 'minutes').format('YYYY-MM-DD HH:mm');
        }

        await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
            const snoozeKey = this.settings.snoozeProperty || 'reminderSnooze';
            frontmatter[snoozeKey] = snoozeTimeStr;
        });

        // Also clear dismissal if any, so it triggers again later?
        // Actually, logic says if snooze is valid and in future, we skip.
        // If snooze expires (now > snoozeTime), we proceed. 
        // But if it was already dismissed, it remains dismissed unless we reset it.
        // Snoozing generally implies "remind me again later", so we should UNDISMISS it.

        // Reset state for this file/all reminders? Logic is per reminder.
        // But snooze is PER FILE (frontmatter).
        // So we should probably reset 'dismissed' for ALL reminders on this file?
        // Or just trust that snooze overrides everything until it expires?
        // My logic in runReminders:
        // 1. check snooze. if active, continue (skip).
        // 2. check dismissed. if dismissed, continue.
        // So if I snooze, I must ALSO undismiss.

        for (const rId in this.settings.alertState[file.path] || {}) {
            if (this.settings.alertState[file.path][rId]) {
                this.settings.alertState[file.path][rId].dismissed = false;
                // Also maybe reset triggered so it sends a fresh notification?
                this.settings.alertState[file.path][rId].triggered = false;
                this.settings.alertState[file.path][rId].repeatCount = 0;
            }
        }
        await this.saveSettings();
    }

    openFile(file: TFile) {
        const leaf = this.app.workspace.getLeaf(false);
        if (leaf) {
            leaf.openFile(file);
        }
    }

    async runReminders(opts: { ignoreHistory?: boolean } = {}): Promise<number> {
        const { ignoreHistory = false } = opts;
        const now = Date.now();
        let notificationCount = 0;

        if (this.settings.deviceRole !== 'controller') {
            return 0;
        }

        this.log('Running reminder check...');

        const files = this.app.vault.getMarkdownFiles();
        const alertState = this.settings.alertState;
        let stateChanged = false;

        for (const file of files) {
            const cache = this.app.metadataCache.getFileCache(file);
            const fm = cache?.frontmatter || {};

            // Initialize state for this file
            if (!alertState[file.path]) {
                alertState[file.path] = {};
            }

            // Process each enabled reminder
            for (const reminder of this.settings.reminders) {
                if (!reminder.enabled) continue;
                if (this.shouldIgnoreForReminder(file, cache, fm, reminder)) continue;

                // Get the property value
                const propValue = fm[reminder.property];
                let propTime = this.parseDate(propValue);
                if (!propTime) continue;

                // [New] Check Required Statuses (Inclusion Logic)
                if (reminder.requiredStatuses && reminder.requiredStatuses.length > 0) {
                    const rawStatus = fm.status;
                    const normalize = (s: any) => String(s ?? '').trim().toLowerCase();
                    const currentStatuses = Array.isArray(rawStatus)
                        ? rawStatus.map(normalize)
                        : [normalize(rawStatus)];

                    const required = reminder.requiredStatuses.map(normalize).filter(s => s);

                    // Allow if ANY current status matches ANY required status
                    // If current status is empty/undefined, it won't match unless required includes "" (rare)
                    const hasRequired = currentStatuses.some(s => required.includes(s));
                    if (!hasRequired) continue;
                }

                // Calculate trigger time
                let offsetMs = reminder.offsetMinutes * 60 * 1000;

                // [NEW] All-Day Base Time Logic
                const isAllDaySafe = fm['allDay'] === true || String(fm['allDay']).toLowerCase() === 'true';

                if (isAllDaySafe && reminder.allDayBaseTime) {
                    const match = reminder.allDayBaseTime.match(/^(\d{1,2}):(\d{2})$/);
                    if (match) {
                        const [_, h, m] = match;
                        // Set specific time on the property date
                        propTime = moment(propTime).set({
                            hour: parseInt(h, 10),
                            minute: parseInt(m, 10),
                            second: 0,
                            millisecond: 0
                        }).valueOf();
                    }
                }

                // [New] Smart Offset Logic
                if (reminder.useSmartOffset && reminder.smartOffsetProperty) {
                    const offsetVal = fm[reminder.smartOffsetProperty];
                    const durationMins = this.parseDuration(offsetVal);
                    // If parsing failed (0), effectively 0 offset or fallback? 
                    // Let's assume 0 is valid or it means "no offset".

                    const smartMs = durationMins * 60 * 1000;
                    if (reminder.smartOffsetOperator === 'add') {
                        offsetMs = smartMs;
                    } else {
                        offsetMs = -smartMs; // Default to subtract (e.g. Due - Estimate)
                    }
                }

                const triggerTime = propTime + offsetMs;

                // Initialize state for this reminder
                if (!alertState[file.path][reminder.id]) {
                    alertState[file.path][reminder.id] = {
                        triggered: false,
                        repeatCount: 0,
                        lastSent: undefined,
                        dismissed: false
                    };
                }

                const state = alertState[file.path][reminder.id];

                // [NEW] Check Dismissed
                if (state.dismissed) continue;

                // [NEW] Check Snooze
                // User can define configurable snooze frontmatter key with a valid date/time
                const snoozeVal = fm[this.settings.snoozeProperty || 'reminderSnooze'];
                if (snoozeVal) {
                    const snoozeTime = this.parseDate(snoozeVal);
                    // If valid snooze time and we are BEFORE it, skip
                    if (snoozeTime && now < snoozeTime) {
                        continue;
                    }
                }

                // [NEW] All-Day Filter
                if (reminder.allDayFilter && reminder.allDayFilter !== 'any') {
                    // isAllDaySafe is already calculated above
                    if (reminder.allDayFilter === 'true' && !isAllDaySafe) continue;
                    if (reminder.allDayFilter === 'false' && isAllDaySafe) continue;
                }

                // Check stop conditions
                const shouldStop = reminder.stopConditions.some(cond =>
                    this.checkStopCondition(fm, cond)
                );

                if (shouldStop) {
                    // Reset state when stop condition is met
                    if (state.triggered) {
                        state.triggered = false;
                        state.repeatCount = 0;
                        state.lastSent = undefined;
                        stateChanged = true;
                    }
                    continue;
                }

                // Check if we should trigger
                const pastTriggerTime = now >= triggerTime;

                if (!pastTriggerTime) {
                    // [Fix] If the event was moved to the future (rescheduled), reset the trigger state
                    if (state.triggered) {
                        state.triggered = false;
                        state.repeatCount = 0;
                        stateChanged = true;
                    }
                    continue; // Not time yet
                }

                // Check if we should send a notification
                let shouldNotify = false;

                if (!state.triggered || ignoreHistory) {
                    // First trigger
                    shouldNotify = true;
                    state.triggered = true;
                    state.repeatCount = 0;
                    stateChanged = true;
                } else if (reminder.repeatUntilComplete && (!reminder.mode || reminder.mode === 'task') && state.triggered) {
                    // Check for repeat
                    const repeatMs = reminder.repeatIntervalMinutes * 60 * 1000;
                    const timeSinceLastSent = state.lastSent ? (now - state.lastSent) : Infinity;

                    if (timeSinceLastSent >= repeatMs) {
                        // Check max repeats
                        if (reminder.maxRepeats === -1 || state.repeatCount < reminder.maxRepeats) {
                            shouldNotify = true;
                            state.repeatCount++;
                            stateChanged = true;
                        }
                    }
                }

                if (shouldNotify) {
                    // Build notification
                    const remaining = this.formatRemaining(propTime - now);
                    const timeStr = moment(propTime).format('h:mm A');

                    let displayName = file.basename;
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(displayName)) {
                        displayName = displayName.replace(/ \d{4}-\d{2}-\d{2}$/, '');
                    }

                    const title = this.formatTemplate(reminder.title, {
                        filename: displayName,
                        time: timeStr,
                        remaining: remaining
                    });

                    const body = this.formatTemplate(reminder.body, {
                        filename: displayName,
                        time: timeStr,
                        remaining: remaining
                    });

                    await this.sendMessage(body, file, title);
                    notificationCount++;

                    state.lastSent = now;
                    stateChanged = true;
                }
            }

        }

        if (stateChanged) {
            await this.saveSettings();
        }

        return notificationCount;
    }

    formatRemaining(ms: number): string {
        const absMs = Math.abs(ms);
        const minutes = Math.round(absMs / 60000);

        if (minutes < 60) {
            const label = minutes === 1 ? 'minute' : 'minutes';
            return ms >= 0 ? `in ${minutes} ${label}` : `${minutes} ${label} ago`;
        }

        const hours = Math.round(minutes / 60);
        const label = hours === 1 ? 'hour' : 'hours';
        return ms >= 0 ? `in ${hours} ${label}` : `${hours} ${label} ago`;
    }
}

// ============================================================================
// SETTINGS TAB
// ============================================================================

class TPSNotifierSettingTab extends PluginSettingTab {
    plugin: TPSNotifier;

    constructor(app: App, plugin: TPSNotifier) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'TPS Notifier Settings' });

        const createSection = (title: string, open = false) => {
            const details = containerEl.createEl('details', { cls: 'tps-notifier-settings-group' });
            details.style.border = '1px solid var(--background-modifier-border)';
            details.style.borderRadius = '6px';
            details.style.padding = '10px';
            details.style.marginBottom = '10px';
            if (open) details.setAttr('open', '');

            const summary = details.createEl('summary', { text: title });
            summary.style.fontWeight = 'bold';
            summary.style.cursor = 'pointer';
            summary.style.marginBottom = '10px';

            return details.createDiv({ cls: 'tps-notifier-settings-group-content' });
        };

        // --- Connection Settings ---
        const connection = createSection('Connection', true);

        new Setting(connection)
            .setName('ntfy Server')
            .setDesc('The ntfy server URL (e.g., https://ntfy.sh)')
            .addText(text => text
                .setPlaceholder('https://ntfy.sh')
                .setValue(this.plugin.settings.ntfyServer)
                .onChange(async (value) => {
                    this.plugin.settings.ntfyServer = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(connection)
            .setName('ntfy Topic')
            .setDesc('Your unique topic name')
            .addText(text => text
                .setPlaceholder('my-reminders')
                .setValue(this.plugin.settings.ntfyTopic)
                .onChange(async (value) => {
                    this.plugin.settings.ntfyTopic = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(connection)
            .setName('Priority')
            .setDesc('Notification priority (1-5)')
            .addSlider(slider => slider
                .setLimits(1, 5, 1)
                .setValue(this.plugin.settings.ntfyPriority)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.ntfyPriority = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(connection)
            .setName('Device Role')
            .setDesc('Controller sends notifications, Receiver only receives. (Saved locally for this device)')
            .addDropdown(dropdown => dropdown
                .addOption('controller', 'Controller (sends notifications)')
                .addOption('receiver', 'Receiver (no sending)')
                .setValue(this.plugin.settings.deviceRole)
                .onChange(async (value: 'controller' | 'receiver') => {
                    this.plugin.settings.deviceRole = value;
                    window.localStorage.setItem(LOCAL_STORAGE_ROLE_KEY, value);
                    await this.plugin.saveSettings();
                    this.plugin.startLoop();
                }));

        new Setting(connection)
            .setName('Check Interval (minutes)')
            .setDesc('How often to check for reminders (set to 0.5 for 30 seconds)')
            .addText(text => text
                .setValue(String(this.plugin.settings.pollMinutes))
                .onChange(async (value) => {
                    const num = parseFloat(value);
                    if (!isNaN(num) && num > 0) {
                        this.plugin.settings.pollMinutes = num;
                        await this.plugin.saveSettings();
                        this.plugin.startLoop();
                    }
                }));

        new Setting(connection)
            .setName('Snooze Property')
            .setDesc('Frontmatter property name for snooze time (e.g., reminderSnooze, snooze)')
            .addText(text => text
                .setPlaceholder('reminderSnooze')
                .setValue(this.plugin.settings.snoozeProperty || 'reminderSnooze')
                .onChange(async (value) => {
                    this.plugin.settings.snoozeProperty = value.trim() || 'reminderSnooze';
                    await this.plugin.saveSettings();
                }));

        // --- Reminders ---
        const reminders = createSection('Reminders', true);

        for (const reminder of this.plugin.settings.reminders) {
            const reminderDetails = reminders.createEl('details', { cls: 'reminder-settings' });
            reminderDetails.style.border = '1px solid var(--background-modifier-border)';
            reminderDetails.style.padding = '10px';
            reminderDetails.style.marginBottom = '10px';
            reminderDetails.style.borderRadius = '5px';
            // Start open for new reminders logic could go here, but defaulting closed is cleaner for many items

            const summary = reminderDetails.createEl('summary');
            summary.style.fontWeight = '600';
            summary.style.cursor = 'pointer';
            summary.style.outline = 'none';
            summary.style.display = 'flex';
            summary.style.justifyContent = 'space-between';
            summary.style.alignItems = 'center';

            summary.createSpan({ text: `${reminder.id} (${reminder.enabled ? 'On' : 'Off'})` });

            // Helper text in summary
            const summaryMeta = summary.createSpan({ text: `Prop: ${reminder.property}` });
            summaryMeta.style.fontWeight = 'normal';
            summaryMeta.style.color = 'var(--text-muted)';
            summaryMeta.style.fontSize = '0.85em';
            summaryMeta.style.marginLeft = 'auto';
            summaryMeta.style.marginRight = '8px';

            const reminderDiv = reminderDetails.createDiv({ cls: 'reminder-settings-content' });
            reminderDiv.style.marginTop = '10px';
            reminderDiv.style.paddingTop = '10px';
            reminderDiv.style.borderTop = '1px solid var(--background-modifier-border)';

            new Setting(reminderDiv)
                .setName(reminder.id)
                .setDesc(`Property: ${reminder.property}`)
                .addToggle(toggle => toggle
                    .setValue(reminder.enabled)
                    .onChange(async (value) => {
                        reminder.enabled = value;
                        await this.plugin.saveSettings();
                    }))
                .addButton(btn => btn
                    .setIcon('copy')
                    .setTooltip('Duplicate Reminder')
                    .onClick(async () => {
                        const newReminder = structuredClone(reminder); // or .clone() / simple object copy
                        // Ensure unique ID
                        let suffix = 1;
                        let newId = `${reminder.id}-copy`;
                        while (this.plugin.settings.reminders.some(r => r.id === newId)) {
                            newId = `${reminder.id}-copy-${suffix++}`;
                        }
                        newReminder.id = newId;

                        this.plugin.settings.reminders.push(newReminder);
                        await this.plugin.saveSettings();
                        this.display();
                    }))
                .addButton(btn => btn
                    .setIcon('trash')
                    .setTooltip('Delete Reminder')
                    .onClick(async () => {
                        if (!confirm(`Are you sure you want to delete reminder "${reminder.id}"?`)) return;
                        this.plugin.settings.reminders = this.plugin.settings.reminders.filter(r => r !== reminder);
                        await this.plugin.saveSettings();
                        this.display();
                    }));

            // --- Top Level Settings ---
            new Setting(reminderDiv)
                .setName('Property')
                .setDesc('Frontmatter field (e.g. "scheduled")')
                .addText(text => text
                    .setValue(reminder.property)
                    .setPlaceholder('scheduled')
                    .onChange(async (value) => {
                        if (value.trim()) {
                            reminder.property = value.trim();
                            await this.plugin.saveSettings();
                        }
                    }));

            new Setting(reminderDiv)
                .setName('All-Day Filter')
                .setDesc('Filter "allDay: true" items')
                .addDropdown(dropdown => dropdown
                    .addOption('any', 'Any')
                    .addOption('true', 'All-Day Only')
                    .addOption('false', 'Timed Only')
                    .setValue(reminder.allDayFilter || 'any')
                    .onChange(async (value: any) => {
                        reminder.allDayFilter = value;
                        await this.plugin.saveSettings();
                        this.display(); // Refresh to show/hide Base Time
                    }));

            if (reminder.allDayFilter === 'true' || reminder.allDayFilter === 'any' || !reminder.allDayFilter) {
                new Setting(reminderDiv)
                    .setName('All-Day Base Time')
                    .setDesc('Trigger time for all-day events (HH:mm, 24h)')
                    .addText(text => text
                        .setPlaceholder('09:00')
                        .setValue(reminder.allDayBaseTime || '')
                        .onChange(async (value) => {
                            reminder.allDayBaseTime = value;
                            await this.plugin.saveSettings();
                        }));
            }

            // Smart Offset
            new Setting(reminderDiv)
                .setName('Use Smart Offset')
                .setDesc('Calculate offset dynamically (e.g. Due - Estimate)')
                .addToggle(toggle => toggle
                    .setValue(reminder.useSmartOffset || false)
                    .onChange(async (value) => {
                        reminder.useSmartOffset = value;
                        if (!reminder.smartOffsetOperator) reminder.smartOffsetOperator = 'subtract';
                        await this.plugin.saveSettings();
                        this.display(); // Refresh to switch between Basic vs Smart inputs
                    }));

            if (reminder.useSmartOffset) {
                new Setting(reminderDiv)
                    .setName('Smart Offset Property')
                    .setDesc('Duration property (e.g. "timeEstimate")')
                    .addText(text => text
                        .setValue(reminder.smartOffsetProperty || '')
                        .setPlaceholder('timeEstimate')
                        .onChange(async (value) => {
                            reminder.smartOffsetProperty = value.trim();
                            await this.plugin.saveSettings();
                        }));

                new Setting(reminderDiv)
                    .setName('Operator')
                    .addDropdown(dropdown => dropdown
                        .addOption('subtract', 'Subtract (Before)')
                        .addOption('add', 'Add (After)')
                        .setValue(reminder.smartOffsetOperator || 'subtract')
                        .onChange(async (value: any) => {
                            reminder.smartOffsetOperator = value;
                            await this.plugin.saveSettings();
                        }));
            } else {
                new Setting(reminderDiv)
                    .setName('Offset (minutes)')
                    .setDesc('e.g., -15 = 15 min before')
                    .addText(text => text
                        .setValue(String(reminder.offsetMinutes))
                        .onChange(async (value) => {
                            const num = parseInt(value);
                            if (!isNaN(num)) {
                                reminder.offsetMinutes = num;
                                await this.plugin.saveSettings();
                            }
                        }));
            }

            // --- Advanced Details ---
            const advancedDetails = reminderDiv.createEl('details');
            advancedDetails.style.marginTop = '10px';
            advancedDetails.style.backgroundColor = 'var(--background-primary-alt)';
            advancedDetails.style.padding = '8px';
            advancedDetails.style.borderRadius = '4px';

            const advSummary = advancedDetails.createEl('summary', { text: 'Advanced Configuration' });
            advSummary.style.cursor = 'pointer';
            advSummary.style.fontWeight = '500';
            advSummary.style.marginBottom = '8px';

            const advContent = advancedDetails.createDiv();


            // Mode & Repeats
            new Setting(advContent)
                .setName('Reminder Mode')
                .addDropdown(dropdown => dropdown
                    .addOption('task', 'Task (Repeatable)')
                    .addOption('timeblock', 'Timeblock (One-shot)')
                    .setValue(reminder.mode || 'task')
                    .onChange(async (value: any) => {
                        reminder.mode = value;
                        if (value === 'timeblock') reminder.repeatUntilComplete = false;
                        await this.plugin.saveSettings();
                        this.display();
                    }));

            if (!reminder.mode || reminder.mode === 'task') {
                new Setting(advContent)
                    .setName('Repeat Interval (min)')
                    .addText(text => text
                        .setValue(String(reminder.repeatIntervalMinutes))
                        .onChange(async (value) => {
                            const num = parseInt(value);
                            if (!isNaN(num) && num > 0) {
                                reminder.repeatIntervalMinutes = num;
                                await this.plugin.saveSettings();
                            }
                        }));

                new Setting(advContent)
                    .setName('Repeat Until Complete')
                    .addToggle(toggle => toggle
                        .setValue(reminder.repeatUntilComplete)
                        .onChange(async (value) => {
                            reminder.repeatUntilComplete = value;
                            await this.plugin.saveSettings();
                        }));
            }

            // Filters
            new Setting(advContent)
                .setName('Required Statuses')
                .setDesc('Only warn if status is one of these (comma-sep)')
                .addTextArea(text => {
                    text
                        .setValue((reminder.requiredStatuses || []).join(', '))
                        .onChange(async (value) => {
                            reminder.requiredStatuses = value.split(',').map(s => s.trim()).filter(s => s);
                            await this.plugin.saveSettings();
                        });
                    text.inputEl.rows = 2;
                });

            new Setting(advContent)
                .setName('Ignore Rules')
                .setDesc('Paths, Tags, and Statuses to ignore')
                .addTextArea(text => {
                    text.setPlaceholder('Paths (comma-sep)')
                        .setValue((reminder.ignorePaths || []).join(', '))
                        .onChange(async (value) => {
                            reminder.ignorePaths = value.split(',').map(s => s.trim()).filter(s => s);
                            await this.plugin.saveSettings();
                        });
                })
                .addTextArea(text => {
                    text.setPlaceholder('Tags (comma-sep)')
                        .setValue((reminder.ignoreTags || []).join(', '))
                        .onChange(async (value) => {
                            reminder.ignoreTags = value.split(',').map(s => s.trim()).filter(s => s);
                            await this.plugin.saveSettings();
                        });
                })
                .addTextArea(text => {
                    text.setPlaceholder('Statuses (comma-sep)')
                        .setValue((reminder.ignoreStatuses || []).join(', '))
                        .onChange(async (value) => {
                            reminder.ignoreStatuses = value.split(',').map(s => s.trim()).filter(s => s);
                            await this.plugin.saveSettings();
                        });
                });
        }

        // Add Reminder button
        new Setting(reminders)
            .setName('Add Reminder')
            .addButton(button => button
                .setButtonText('+ Add')
                .onClick(async () => {
                    const newReminder: PropertyReminder = {
                        id: `reminder-${Date.now()}`,
                        property: 'scheduled',
                        enabled: true,
                        offsetMinutes: -15,
                        repeatUntilComplete: true,
                        repeatIntervalMinutes: 5,
                        maxRepeats: -1,
                        stopConditions: ['status: complete', 'status: wont-do'],
                        title: 'Reminder: {filename}',
                        body: 'At {time} ({remaining})',
                        ignorePaths: [...(this.plugin.settings.ignorePaths || [])],
                        ignoreTags: [...(this.plugin.settings.ignoreTags || [])],
                        ignoreStatuses: [...(this.plugin.settings.ignoreStatuses || [])],
                    };
                    this.plugin.settings.reminders.push(newReminder);
                    await this.plugin.saveSettings();
                    this.display();
                }));

        // --- Debug ---
        const debug = createSection('Debug', false);

        new Setting(debug)
            .setName('Enable Logging')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableLogging)
                .onChange(async (value) => {
                    this.plugin.settings.enableLogging = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(debug)
            .setName('Clear Alert History')
            .setDesc('Reset all reminder states')
            .addButton(button => button
                .setButtonText('Clear')
                .setWarning()
                .onClick(async () => {
                    this.plugin.settings.alertState = {};
                    await this.plugin.saveSettings();
                    new Notice('Alert history cleared');
                }));
    }
}
