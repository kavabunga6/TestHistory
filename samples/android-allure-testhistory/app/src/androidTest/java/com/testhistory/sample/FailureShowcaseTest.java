package com.testhistory.sample;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;

import com.testhistory.sample.evidence.AllureEvidence;
import com.testhistory.sample.evidence.AllureEvidenceRule;

import org.junit.Assert;
import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public final class FailureShowcaseTest {
    @Rule
    public final AllureEvidenceRule evidence = new AllureEvidenceRule("Android failure showcase", "Mobile QA", "negative", "evidence")
            .label("feature", "failure-showcase")
            .label("JIRA_ISSUE", "ANDROID-500")
            .parameter("purpose", "failed and broken statuses");

    @Test
    public void failedAssertionIsReportedWithVisibleScreenshot() throws Exception {
        try (ActivityScenario<MainActivity> ignored = SampleAppSteps.openApplication()) {
            SampleAppSteps.typeUsername("broken.assertion");
            SampleAppSteps.submitLogin();
            SampleAppSteps.checkWelcome("broken.assertion");
            SampleAppSteps.captureEvidence("visible state before assertion failure");
            AllureEvidence.step("Assert intentionally wrong cart counter", () ->
                    Assert.assertEquals("Intentional failed assertion for TestHistory", "Cart: 9", "Cart: 0"));
        }
    }

    @Test
    public void runtimeCrashIsReportedAsBrokenWithVideoAndLogcat() throws Exception {
        try (ActivityScenario<MainActivity> ignored = SampleAppSteps.openApplication()) {
            SampleAppSteps.typeUsername("runtime.crash");
            SampleAppSteps.submitLogin();
            SampleAppSteps.addCheckoutItems(1);
            SampleAppSteps.captureEvidence("visible state before runtime crash");
            AllureEvidence.step("Throw intentional runtime exception", () -> {
                throw new IllegalStateException("Intentional broken test for TestHistory evidence");
            });
        }
    }
}
