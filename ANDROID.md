# App Android NXS Plus (GPS em segundo plano)

Requisitos: computador com Node/Bun, Git e Android Studio.

1. Exporte o projeto para o GitHub e clone: `git clone ... && cd ... && npm install`
2. `npx cap add android`
3. Em `android/app/src/main/AndroidManifest.xml`, dentro de `<manifest>`:
```xml
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-feature android:name="android.hardware.location.gps" />
```
4. Em `android/app/src/main/res/values/strings.xml` adicione:
```xml
<string name="capacitor_background_geolocation_notification_channel_name">Rastreamento</string>
```
5. `npx cap sync android` e `npx cap open android`
6. No Android Studio: Build > Build APK(s). Instale o APK nos celulares.

No celular: permitir localização "o tempo todo", permitir notificações e
desativar economia de bateria para o app. Enquanto o rastreio estiver ligado,
fica fixa a notificação "Rastreamento ativo".

O app abre o sistema publicado (cyber.nxsplus.xyz); atualizações do sistema
chegam sem reinstalar. Repita o passo 5 após `git pull` se mudar plugins.
