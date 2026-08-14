package com.testhistory.sample.evidence;

import android.app.Instrumentation;
import android.os.ParcelFileDescriptor;
import android.util.Log;

import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.UiDevice;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.rules.TestWatcher;
import org.junit.runner.Description;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayDeque;
import java.util.Locale;
import java.util.UUID;

public final class AllureEvidenceRule extends TestWatcher {
    private static final ThreadLocal<AllureEvidenceRule> ACTIVE = new ThreadLocal<>();

    private final JSONArray labels;
    private final JSONArray parameters = new JSONArray();
    private final JSONArray attachments = new JSONArray();
    private final ArrayDeque<JSONObject> stepStack = new ArrayDeque<>();

    private Instrumentation instrumentation;
    private UiDevice device;
    private File resultsDir;
    private String uuid;
    private String testName;
    private String fullName;
    private long startedAt;
    private long stoppedAt;
    private JSONArray steps;
    private Throwable failure;

    public AllureEvidenceRule(String suite, String owner, String... tags) {
        labels = new JSONArray()
                .put(labelJson("suite", suite))
                .put(labelJson("owner", owner))
                .put(labelJson("framework", "JUnit4"))
                .put(labelJson("language", "Java"))
                .put(labelJson("host", "Android emulator"));
        for (String tag : tags) {
            labels.put(labelJson("tag", tag));
        }
    }

    static AllureEvidenceRule current() {
        return ACTIVE.get();
    }

    public AllureEvidenceRule label(String name, String value) {
        labels.put(labelJson(name, value));
        return this;
    }

    public AllureEvidenceRule parameter(String name, String value) {
        parameters.put(jsonObject("name", name, "value", value));
        return this;
    }

    @Override
    protected void starting(Description description) {
        ACTIVE.set(this);
        instrumentation = InstrumentationRegistry.getInstrumentation();
        device = UiDevice.getInstance(instrumentation);
        resultsDir = new File(instrumentation.getTargetContext().getExternalFilesDir(null), "allure-results");
        if (!resultsDir.exists() && !resultsDir.mkdirs()) {
            throw new IllegalStateException("Cannot create " + resultsDir);
        }

        uuid = UUID.randomUUID().toString();
        testName = description.getMethodName();
        fullName = description.getClassName() + "." + description.getMethodName();
        startedAt = System.currentTimeMillis();
        steps = new JSONArray();
        failure = null;

        clearLogcat();
        writeEnvironment();
        Log.i("TH_SAMPLE", "Started test " + fullName);
    }

    @Override
    protected void succeeded(Description description) {
        // Screenshots are captured from explicit test steps while the Activity is still visible.
    }

    @Override
    protected void failed(Throwable e, Description description) {
        failure = e;
        // Step-level catch blocks capture the visible failure state before ActivityScenario closes.
    }

    @Override
    protected void finished(Description description) {
        stoppedAt = System.currentTimeMillis();
        attachLogcat();
        writeResult();
        writeContainer();
        Log.i("TH_SAMPLE", "Finished test " + fullName);
        ACTIVE.remove();
    }

    public void step(String name, AllureEvidence.StepBody body) throws Exception {
        JSONObject step = new JSONObject()
                .put("name", name)
                .put("stage", "running")
                .put("start", System.currentTimeMillis())
                .put("steps", new JSONArray());

        JSONArray target = stepStack.isEmpty() ? steps : stepStack.peek().getJSONArray("steps");
        target.put(step);
        stepStack.push(step);
        try {
            body.run();
            step.put("status", "passed");
        } catch (Exception error) {
            step.put("status", "broken");
            step.put("statusDetails", statusDetails(error));
            attachScreenshot("Broken step screenshot", "broken-step");
            throw error;
        } catch (AssertionError error) {
            step.put("status", "failed");
            step.put("statusDetails", statusDetails(error));
            attachScreenshot("Failed step screenshot", "failed-step");
            throw error;
        } finally {
            step.put("stage", "finished");
            step.put("stop", System.currentTimeMillis());
            stepStack.pop();
        }
    }

    public void attachScreenshot(String title, String suffix) {
        waitForStableUi();
        String source = safeName(testName) + "-" + uuid + "-" + suffix + ".png";
        File file = new File(resultsDir, source);
        if (device.takeScreenshot(file)) {
            attachments.put(attachment(title, source, "image/png"));
        }
    }

    private void attachLogcat() {
        String source = safeName(testName) + "-" + uuid + "-logcat.log";
        File file = new File(resultsDir, source);
        String content = readShellCommand("logcat -d -v time");
        writeText(file, content);
        attachments.put(attachment("Logcat", source, "text/plain"));
    }

    private void clearLogcat() {
        drainShellCommand("logcat -c");
    }

    private void writeEnvironment() {
        File file = new File(resultsDir, "environment.properties");
        String content = "platform=android\n"
                + "device=" + device.getProductName() + "\n"
                + "package=com.testhistory.sample\n"
                + "allure.adapter=custom-junit4-android\n";
        writeText(file, content);
    }

    private void writeResult() {
        String status = failure == null ? "passed" : failure instanceof AssertionError ? "failed" : "broken";
        JSONObject result = jsonObject(
                "uuid", uuid,
                "historyId", sha1(fullName),
                "testCaseId", testName,
                "fullName", fullName,
                "name", readableName(testName),
                "status", status,
                "stage", "finished",
                "start", startedAt,
                "stop", stoppedAt,
                "labels", labels,
                "parameters", parameters,
                "steps", steps,
                "attachments", attachments);
        if (failure != null) {
            jsonPut(result, "statusDetails", statusDetails(failure));
        }
        writeText(new File(resultsDir, uuid + "-result.json"), jsonToString(result));
    }

    private void writeContainer() {
        JSONObject container = jsonObject(
                "uuid", UUID.randomUUID().toString(),
                "name", fullName,
                "children", new JSONArray().put(uuid),
                "befores", new JSONArray(),
                "afters", new JSONArray(),
                "start", startedAt,
                "stop", stoppedAt);
        writeText(new File(resultsDir, uuid + "-container.json"), jsonToString(container));
    }

    private void drainShellCommand(String command) {
        try (ParcelFileDescriptor fd = instrumentation.getUiAutomation().executeShellCommand(command);
             BufferedReader reader = new BufferedReader(new InputStreamReader(
                     new ParcelFileDescriptor.AutoCloseInputStream(fd), StandardCharsets.UTF_8))) {
            while (reader.readLine() != null) {
                // Drain command output so the shell process can finish.
            }
        } catch (Exception e) {
            Log.w("TH_SAMPLE", "Shell command failed: " + command, e);
        }
    }

    private String readShellCommand(String command) {
        StringBuilder output = new StringBuilder();
        try (ParcelFileDescriptor fd = instrumentation.getUiAutomation().executeShellCommand(command);
             BufferedReader reader = new BufferedReader(new InputStreamReader(
                     new ParcelFileDescriptor.AutoCloseInputStream(fd), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                output.append(line).append('\n');
            }
        } catch (Exception e) {
            output.append("Failed to collect shell output: ").append(e.getMessage()).append('\n');
        }
        return output.toString();
    }

    private static JSONObject labelJson(String name, String value) {
        return jsonObject("name", name, "value", value);
    }

    private static JSONObject attachment(String name, String source, String type) {
        return jsonObject("name", name, "source", source, "type", type);
    }

    private static JSONObject statusDetails(Throwable error) {
        return jsonObject(
                "message", error.getMessage() == null ? error.getClass().getName() : error.getMessage(),
                "trace", Log.getStackTraceString(error));
    }

    private static JSONObject jsonObject(Object... pairs) {
        JSONObject object = new JSONObject();
        for (int index = 0; index < pairs.length; index += 2) {
            jsonPut(object, String.valueOf(pairs[index]), pairs[index + 1]);
        }
        return object;
    }

    private static JSONObject jsonPut(JSONObject object, String name, Object value) {
        try {
            return object.put(name, value);
        } catch (Exception e) {
            throw new IllegalStateException("Cannot write JSON property " + name, e);
        }
    }

    private static String jsonToString(JSONObject object) {
        try {
            return object.toString(2);
        } catch (Exception e) {
            throw new IllegalStateException("Cannot serialize JSON", e);
        }
    }

    private static void writeText(File file, String content) {
        try (FileOutputStream out = new FileOutputStream(file)) {
            out.write(content.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new IllegalStateException("Cannot write " + file, e);
        }
    }

    private static String readableName(String method) {
        return method.replaceAll("([a-z])([A-Z])", "$1 $2").toLowerCase(Locale.ROOT);
    }

    private static String safeName(String value) {
        return value.replaceAll("[^A-Za-z0-9_.-]", "_");
    }

    private static String shellQuote(String value) {
        return "'" + value.replace("'", "'\\''") + "'";
    }

    private void waitForStableUi() {
        try {
            device.waitForIdle(1500);
        } catch (Exception ignored) {
            // Best effort evidence stabilization.
        }
        sleep(300);
    }

    private static void sleep(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private static String sha1(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-1");
            byte[] bytes = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder();
            for (byte item : bytes) {
                hex.append(String.format(Locale.ROOT, "%02x", item));
            }
            return hex.toString();
        } catch (Exception e) {
            return value;
        }
    }
}
