import { ItemView, WorkspaceLeaf, TFile, IconName, Notice, Menu } from 'obsidian';
import { OverdueItem, TPSNotifierSettings } from './types';
import { SnoozeModal } from './snooze-modal';

export const NOTIFICATION_VIEW_TYPE = 'tps-notification-view';

// Minimal interface to decouple from main plugin class
export interface TPSNotifierInterface {
    settings: TPSNotifierSettings;
    getOverdueItems(): Promise<OverdueItem[]>;
    dismissNotification(file: TFile, reminderId: string): Promise<void>;
    snoozeFile(file: TFile, minutes: number): Promise<void>;
    openFile(file: TFile): void;
}

export class NotificationView extends ItemView {
    plugin: TPSNotifierInterface;
    items: OverdueItem[] = [];

    constructor(leaf: WorkspaceLeaf, plugin: TPSNotifierInterface) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() {
        return NOTIFICATION_VIEW_TYPE;
    }

    getDisplayText() {
        return "Notifications";
    }

    getIcon(): IconName {
        return "bell"; // or 'alarm-clock'
    }

    async onOpen() {
        await this.refresh();
        // Auto-refresh every 60s
        this.registerInterval(window.setInterval(() => this.refresh(), 60000));
    }

    async refresh() {
        this.items = await this.plugin.getOverdueItems();
        this.draw();
    }

    draw() {
        const container = this.contentEl;
        container.empty();
        container.addClass('tps-notification-view');

        // Header
        const header = container.createDiv({ cls: 'nav-header' });
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        header.style.padding = '10px';
        header.style.borderBottom = '1px solid var(--background-modifier-border)';

        header.createEl('h4', { text: 'Notifications', cls: 'nav-header-title' });

        const actionsDiv = header.createDiv();
        const refreshBtn = actionsDiv.createEl('button', { cls: 'clickable-icon' });
        refreshBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon lucide-refresh-cw"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>';
        refreshBtn.onclick = () => this.refresh();

        const list = container.createDiv({ cls: 'tps-notification-list' });
        list.style.padding = '10px';
        list.style.overflowY = 'auto';
        list.style.height = 'calc(100% - 50px)';

        if (this.items.length === 0) {
            const emptyState = list.createDiv({ cls: 'tps-empty-state' });
            emptyState.style.textAlign = 'center';
            emptyState.style.color = 'var(--text-muted)';
            emptyState.style.padding = '20px';
            emptyState.setText('No pending notifications');
            return;
        }

        for (const item of this.items) {
            const card = list.createDiv({ cls: 'tps-notification-card' });
            card.style.backgroundColor = 'var(--background-secondary)';
            card.style.borderRadius = '8px';
            card.style.padding = '12px';
            card.style.marginBottom = '10px';
            card.style.border = '1px solid var(--background-modifier-border)';
            card.style.position = 'relative';

            // Click entire card to open file
            card.addEventListener('click', () => {
                this.plugin.openFile(item.file);
            });
            card.style.cursor = 'pointer';

            const headerRow = card.createDiv({ cls: 'notification-card-header' });
            headerRow.style.display = 'flex';
            headerRow.style.justifyContent = 'space-between';
            headerRow.style.marginBottom = '4px';

            const titleText = item.title || item.file.basename;
            const title = headerRow.createEl('span', { text: titleText });
            title.style.fontWeight = 'bold';
            title.style.color = 'var(--text-normal)';

            const time = headerRow.createEl('span', { text: item.diff });
            time.style.fontSize = '0.8em';
            time.style.color = 'var(--text-muted)';

            const bodyRow = card.createDiv({ cls: 'notification-card-body' });
            bodyRow.style.fontSize = '0.9em';
            bodyRow.style.color = 'var(--text-muted)';
            bodyRow.style.marginBottom = '8px';
            bodyRow.setText(`${item.reminder.property}`); // Or description

            // Actions
            const actionsRow = card.createDiv({ cls: 'notification-card-actions' });
            actionsRow.style.display = 'flex';
            actionsRow.style.gap = '8px';
            actionsRow.style.justifyContent = 'flex-end';

            const snoozeBtn = actionsRow.createEl('button', { text: 'Snooze' });
            snoozeBtn.style.fontSize = '0.8em';
            snoozeBtn.style.padding = '4px 8px';
            snoozeBtn.onclick = (e) => {
                e.stopPropagation();
                new SnoozeModal(this.app, async (minutes) => {
                    await this.plugin.snoozeFile(item.file, minutes);
                    this.refresh();
                }).open();
            };
        }
    }
}
