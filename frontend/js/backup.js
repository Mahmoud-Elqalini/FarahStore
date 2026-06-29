document.addEventListener("DOMContentLoaded", () => {
    const btnBackup = document.getElementById("btn-backup");
    const btnRestore = document.getElementById("btn-restore");

    // Reusable Toast
    const Toast = Swal.mixin({
        toast: true,
        position: 'bottom-end',
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true,
        didOpen: (toast) => {
            toast.addEventListener('mouseenter', Swal.stopTimer)
            toast.addEventListener('mouseleave', Swal.resumeTimer)
        }
    });

    if (btnBackup) {
        btnBackup.addEventListener("click", async () => {
            if (!window.electronAPI) {
                Swal.fire("خطأ", "هذه الميزة متاحة فقط في تطبيق سطح المكتب.", "error");
                return;
            }

            const originalText = btnBackup.innerText;
            btnBackup.innerText = "جاري إنشاء النسخة الاحتياطية...";
            btnBackup.disabled = true;

            try {
                const result = await window.electronAPI.backupDatabase();
                
                if (!result || result.cancelled) {
                    return;
                }

                if (result.success) {
                    Swal.fire({
                        title: "نجاح!",
                        text: "تم إنشاء النسخة الاحتياطية بنجاح في:\n" + result.path,
                        icon: "success",
                        confirmButtonText: "حسناً"
                    });
                } else {
                    Swal.fire("خطأ", "فشل إنشاء النسخة الاحتياطية: " + result.error, "error");
                }
            } catch (err) {
                Swal.fire("خطأ", "حدث خطأ غير متوقع: " + err.message, "error");
            } finally {
                btnBackup.innerText = originalText;
                btnBackup.disabled = false;
            }
        });
    }

    if (btnRestore) {
        btnRestore.addEventListener("click", async () => {
            if (!window.electronAPI) {
                Swal.fire("خطأ", "هذه الميزة متاحة فقط في تطبيق سطح المكتب.", "error");
                return;
            }

            const confirmResult = await Swal.fire({
                title: 'هل أنت متأكد؟',
                html: '⚠️ <b>سيتم استبدال قاعدة البيانات الحالية!</b><br><br>إذا تابعت، سيتم مسح بياناتك الحالية بالكامل واستبدالها بالنسخة المختارة. كما <b>سيتم إعادة تشغيل البرنامج</b> لتطبيق التغييرات.',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#dc3545',
                cancelButtonColor: '#6c757d',
                confirmButtonText: 'نعم، قم بالاستعادة',
                cancelButtonText: 'إلغاء'
            });

            if (!confirmResult.isConfirmed) return;

            const originalText = btnRestore.innerText;
            btnRestore.innerText = "جاري التحقق والاستعادة...";
            btnRestore.disabled = true;

            try {
                const result = await window.electronAPI.restoreDatabase();
                
                if (!result || result.cancelled) {
                    return;
                }

                if (!result.success) {
                    Swal.fire({
                        title: "فشل الاستعادة",
                        text: result.error,
                        icon: "error",
                        confirmButtonText: "حسناً"
                    });
                }
                // Note: If success=true, the app will relaunch, so we don't need a success alert here.
            } catch (err) {
                Swal.fire("خطأ", "حدث خطأ غير متوقع: " + err.message, "error");
            } finally {
                btnRestore.innerText = originalText;
                btnRestore.disabled = false;
            }
        });
    }

    // --- Auto Backup Settings Logic ---
    const toggleAutoBackup = document.getElementById("auto-backup-toggle");
    const selectFrequency = document.getElementById("auto-backup-frequency");
    const selectRetention = document.getElementById("auto-backup-retention");
    const statusDiv = document.getElementById("auto-backup-status");
    const btnOpenFolder = document.getElementById("btn-open-backup-folder");
    const settingsDiv = document.getElementById("auto-backup-settings");

    const updateStatusUI = (lastBackup) => {
        if (!lastBackup || !lastBackup.date) {
            statusDiv.innerHTML = "لم يتم إنشاء أي نسخة تلقائية بعد.";
            return;
        }

        const date = new Date(lastBackup.date);
        if (isNaN(date.getTime())) {
            statusDiv.innerHTML = "غير معروف";
            return;
        }

        const dateStr = date.toLocaleString('ar-EG');
        
        if (lastBackup.status === 'success') {
            statusDiv.innerHTML = `<span style="color: #4ade80;">${dateStr} ✓ ناجحة</span>`;
        } else {
            statusDiv.innerHTML = `<span style="color: #f87171;">${dateStr} ✗ فشلت</span><br><small style="color: var(--text-muted);">${lastBackup.error}</small>`;
        }
    };

    const loadSettings = async () => {
        if (!window.electronAPI) return;
        try {
            const settings = await window.electronAPI.getSettings();
            
            toggleAutoBackup.checked = settings.auto_backup_enabled;
            selectFrequency.value = settings.auto_backup_frequency;
            selectRetention.value = settings.auto_backup_retention;
            
            settingsDiv.style.opacity = settings.auto_backup_enabled ? "1" : "0.5";
            selectFrequency.disabled = !settings.auto_backup_enabled;
            selectRetention.disabled = !settings.auto_backup_enabled;

            updateStatusUI(settings.last_auto_backup);
        } catch (err) {
            console.error("Failed to load settings:", err);
            Swal.fire("خطأ", "فشل تحميل إعدادات النسخ التلقائي.", "error");
        }
    };

    const saveSettings = async () => {
        if (!window.electronAPI) return;
        
        const isEnabled = toggleAutoBackup.checked;
        settingsDiv.style.opacity = isEnabled ? "1" : "0.5";
        selectFrequency.disabled = !isEnabled;
        selectRetention.disabled = !isEnabled;

        try {
            await window.electronAPI.updateSettings({
                auto_backup_enabled: isEnabled,
                auto_backup_frequency: selectFrequency.value,
                auto_backup_retention: selectRetention.value
            });
            Toast.fire({
                icon: 'success',
                title: 'تم حفظ الإعدادات'
            });
        } catch (err) {
            console.error("Failed to save settings:", err);
            Swal.fire("خطأ", "فشل حفظ الإعدادات.", "error");
        }
    };

    if (toggleAutoBackup) toggleAutoBackup.addEventListener("change", saveSettings);
    if (selectFrequency) selectFrequency.addEventListener("change", saveSettings);
    if (selectRetention) selectRetention.addEventListener("change", saveSettings);
    
    if (btnOpenFolder) {
        btnOpenFolder.addEventListener("click", () => {
            if (window.electronAPI) window.electronAPI.openBackupFolder();
        });
    }

    if (window.electronAPI) {
        const unsubscribe = window.electronAPI.onAutoBackupStatus((event, lastBackup) => {
            updateStatusUI(lastBackup);
        });

        window.addEventListener("beforeunload", () => {
            if (typeof unsubscribe === 'function') {
                unsubscribe();
            }
        });

        loadSettings();
    }
});
