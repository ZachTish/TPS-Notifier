import { TFile } from "obsidian";

export interface PropertyReminder {
    id: string;
    property: string;
    enabled: boolean;
    offsetMinutes: number;
    mode?: 'task' | 'timeblock';
    repeatUntilComplete: boolean;
    repeatIntervalMinutes: number;
    maxRepeats: number;
    stopConditions: string[];
    title: string;
    body: string;
    ignorePaths?: string[];
    ignoreTags?: string[];
    ignoreStatuses?: string[];
    useSmartOffset?: boolean;
    smartOffsetProperty?: string;
    smartOffsetOperator?: 'add' | 'subtract';
    requiredStatuses?: string[];
    allDayFilter?: 'any' | 'true' | 'false'; // 'true' = must be allDay, 'false' = must NOT be allDay
    allDayBaseTime?: string; // e.g. "09:00"
}

export interface TPSNotifierSettings {
    ntfyServer: string;
    ntfyTopic: string;
    ntfyPriority: number;
    deviceRole: 'controller' | 'receiver';
    pollMinutes: number;
    reminders: PropertyReminder[];

    alertState: Record<string, {
        [reminderId: string]: {
            triggered: boolean;
            repeatCount: number;
            lastSent?: number;
            dismissed?: boolean;
        };
    }>;
    ignorePaths: string[];
    ignoreTags: string[];
    ignoreStatuses: string[];
    enableLogging: boolean;
    snoozeProperty: string; // Configurable frontmatter key for snooze
}

export interface OverdueItem {
    file: TFile;
    reminder: PropertyReminder;
    propertyTime: number;
    diff: string;
    id: string;
    title?: string;
}
