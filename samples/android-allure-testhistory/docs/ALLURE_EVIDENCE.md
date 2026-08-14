# Allure evidence contract

Each instrumentation test creates files in:

```text
/sdcard/Android/data/com.testhistory.sample/files/allure-results
```

Generated files:

| File | Purpose |
| --- | --- |
| `*-result.json` | Allure test result imported by TestHistory. |
| `*-container.json` | Allure container with result children. |
| `environment.properties` | Android device and adapter metadata. |
| `executor.json` | Created by uploader from GitLab CI metadata. |
| `*-final.png` | Explicit screenshot captured by a passing test step. |
| `*-failed-step.png` | Screenshot captured while a failed assertion is still visible. |
| `*-broken-step.png` | Screenshot captured while a broken runtime error is still visible. |
| `*-logcat.log` | Logcat captured after each test. |
| `full-run-video.mp4` | Screen recording captured by CI around the full instrumentation run. |

The result JSON references screenshots, videos, and logcat as Allure attachments:

```json
{
  "attachments": [
    { "name": "Final screenshot", "source": "case-final.png", "type": "image/png" },
    { "name": "Logcat", "source": "case-logcat.log", "type": "text/plain" },
    { "name": "Full test run video", "source": "full-run-video.mp4", "type": "video/mp4" }
  ]
}
```

Current TestHistory JSON batch upload imports Allure compatibility files as UTF-8 and uploads referenced binary evidence:

- result JSON
- container JSON
- screenshots
- videos
- logcat files
- `environment.properties`
- `executor.json`
- `categories.json`
- history JSON
