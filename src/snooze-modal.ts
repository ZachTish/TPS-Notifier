import { App, Modal, Setting } from "obsidian";

export class SnoozeModal extends Modal {
    onSubmit: (minutes: number) => void;

    constructor(app: App, onSubmit: (minutes: number) => void) {
        super(app);
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl("h2", { text: "Snooze Reminder" });

        const buttonsDiv = contentEl.createDiv({ cls: "tps-snooze-buttons" });
        buttonsDiv.style.display = "flex";
        buttonsDiv.style.flexDirection = "column";
        buttonsDiv.style.gap = "10px";

        const snoozeOptions = [
            { label: "15 Minutes", value: 15 },
            { label: "1 Hour", value: 60 },
            { label: "4 Hours", value: 240 },
            { label: "Tomorrow Morning (9 AM)", value: "tomorrow-9am" }, // Special handling
            { label: "1 Week", value: 10080 }
        ];

        snoozeOptions.forEach(opt => {
            new Setting(buttonsDiv)
                .setName(opt.label)
                .addButton(btn => btn
                    .setButtonText("Select")
                    .onClick(() => {
                        this.handleSelection(opt.value);
                    }));
        });
    }

    handleSelection(value: number | string) {
        let minutes = 0;
        if (typeof value === 'number') {
            minutes = value;
        } else if (value === 'tomorrow-9am') {
            const now = new Date();
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(9, 0, 0, 0);
            const diffMs = tomorrow.getTime() - now.getTime();
            minutes = Math.max(1, Math.floor(diffMs / 60000));
        }

        this.onSubmit(minutes);
        this.close();
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
