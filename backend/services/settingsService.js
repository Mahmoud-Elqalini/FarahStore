const fs = require('fs');
const path = require('path');

const DEFAULT_SETTINGS = Object.freeze({
    settings_version: 1,
    auto_backup_enabled: true,
    auto_backup_frequency: 'daily', // 'close', 'daily', 'weekly'
    auto_backup_retention: 20,
    last_auto_backup: Object.freeze({
        date: null,
        status: null,
        error: null
    })
});

const VALID_FREQUENCIES = ['close', 'daily', 'weekly'];
const VALID_RETENTIONS = [5, 10, 20, 50];

class SettingsService {
    constructor() {
        this.settingsPath = null;
        this.currentSettings = null;
    }

    init(userDataPath) {
        this.settingsPath = path.join(userDataPath, 'settings.json');
        this.loadSettings();
    }

    // Helper for deep merging
    _mergeSettings(base, overrides) {
        if (!overrides) return { ...base };
        return {
            ...base,
            ...overrides,
            last_auto_backup: {
                ...base.last_auto_backup,
                ...(overrides.last_auto_backup || {})
            }
        };
    }

    // Helper for validation
    _validateSettings(settings) {
        // Enforce boolean type
        if (typeof settings.auto_backup_enabled !== "boolean") {
            settings.auto_backup_enabled = DEFAULT_SETTINGS.auto_backup_enabled;
        }

        // Enforce types and valid enums
        if (!VALID_FREQUENCIES.includes(settings.auto_backup_frequency)) {
            settings.auto_backup_frequency = DEFAULT_SETTINGS.auto_backup_frequency;
        }
        
        let retention = parseInt(settings.auto_backup_retention, 10);
        if (isNaN(retention) || !VALID_RETENTIONS.includes(retention)) {
            retention = DEFAULT_SETTINGS.auto_backup_retention;
        }
        settings.auto_backup_retention = retention;

        // Force settings_version to always equal the latest definition
        settings.settings_version = DEFAULT_SETTINGS.settings_version;
        return settings;
    }

    loadSettings() {
        if (!this.settingsPath) return { ...DEFAULT_SETTINGS };

        try {
            if (fs.existsSync(this.settingsPath)) {
                const data = fs.readFileSync(this.settingsPath, 'utf8');
                const parsed = JSON.parse(data);
                
                this.currentSettings = this._validateSettings(
                    this._mergeSettings(DEFAULT_SETTINGS, parsed)
                );
            } else {
                this.currentSettings = { ...DEFAULT_SETTINGS };
                this.saveSettings({}); // Save initial defaults atomically
            }
        } catch (error) {
            console.error('Error loading settings:', error);
            this.currentSettings = { ...DEFAULT_SETTINGS };
            try {
                this.saveSettings({}); // Attempt to repair corrupted file
            } catch (repairError) {
                console.error('Failed to repair settings file:', repairError);
            }
        }

        return this.currentSettings;
    }

    getSettings() {
        if (!this.currentSettings) {
            return this.loadSettings();
        }
        return this.currentSettings;
    }

    saveSettings(newSettings) {
        if (!this.settingsPath) {
            throw new Error('Settings path not initialized');
        }

        try {
            // Deep merge with current settings or defaults
            const baseSettings = this.currentSettings || DEFAULT_SETTINGS;
            const mergedSettings = this._mergeSettings(baseSettings, newSettings);
            
            // Validate the final merged settings
            this.currentSettings = this._validateSettings(mergedSettings);

            // Atomic write: Write to .tmp file then rename
            const tmpPath = `${this.settingsPath}.tmp`;
            fs.writeFileSync(tmpPath, JSON.stringify(this.currentSettings, null, 2), 'utf8');
            fs.renameSync(tmpPath, this.settingsPath);
            
            return this.currentSettings;
        } catch (error) {
            console.error('Error saving settings:', error);
            throw error;
        }
    }
}

module.exports = new SettingsService();
