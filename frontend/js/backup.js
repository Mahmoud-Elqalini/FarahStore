document.addEventListener("DOMContentLoaded", () => {
    const btnBackup = document.getElementById("btn-backup");
    const btnRestore = document.getElementById("btn-restore");

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
                
                if (result.cancelled) {
                    // User closed the dialog, do nothing
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
                
                if (result.cancelled) {
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
});
