# GitHub APK Build

This app builds on GitHub Actions with:

```text
.github/workflows/build-ceo-android-apk.yml
```

## How to build

1. Push this project to GitHub.
2. Open the GitHub repository.
3. Go to **Actions**.
4. Open **Build CEO Android APK**.
5. Click **Run workflow**.
6. Download artifact **al-siraj-ceo-debug-apk**.

The APK inside the artifact is:

```text
app-debug.apk
```

## Package

The Android package is:

```text
com.mahad.alsiraj.ceo
```

`android/app/google-services.json` must belong to the same package.
