# كود تطبيق الأندرويد الأصلي (Android Native Kotlin)

هذا المجلد يحتوي على كود الخدمة الخلفية الدائمة (`Foreground Service`) لسائق الونش في حال رغبت ببناء ملف APK وتثبيته مباشرة عبر Android Studio بدلاً من الـ Web PWA.

### مميزات هذا الكود:
1. **Foreground Service مع إشعار دائم:**
   - يمنع نظام أندرويد (خصوصاً في شاومي، سامسونج، وهواوي) من قتل التطبيق في الخلفية لتوفير البطارية.
2. **Google Play Services Location Provider:**
   - استهلاك ذكي للبطارية واستخدام الـ Fused Location لدمج الـ GPS وشبكات المحمول والـ Wi-Fi بدقة عالية.
3. **التشغيل التلقائي `START_STICKY`:**
   - في حال تم إغلاق التطبيق قسراً أو نفدت الذاكرة، يقوم نظام أندرويد بإعادة تشغيل الخدمة بمجرد توفر الذاكرة.

### خطوات تجميع الـ APK عبر Android Studio:
1. افتح Android Studio واختر "New Project" (Empty Views Activity).
2. قم بإضافة مكتبة الموقع في `build.gradle`:
   ```groovy
   implementation 'com.google.android.gms:play-services-location:21.0.1'
   ```
3. انقل كود [WinchTrackingService.kt](file:///C:/Users/abdom/.gemini/antigravity/scratch/winch-tracker-platform/android-starter/WinchTrackingService.kt) إلى مسار المشروع لديك وعدّل عنوان السيرفر.
4. اضغط `Build > Build Bundle(s) / APK(s) > Build APK(s)`.
