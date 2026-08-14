package com.testhistory.sample.evidence;

public final class AllureEvidence {
    private AllureEvidence() {
    }

    public interface StepBody {
        void run() throws Exception;
    }

    public static void step(String name, StepBody body) throws Exception {
        AllureEvidenceRule current = AllureEvidenceRule.current();
        if (current == null) {
            body.run();
            return;
        }
        current.step(name, body);
    }

    public static void screenshot(String name) {
        AllureEvidenceRule current = AllureEvidenceRule.current();
        if (current != null) {
            current.attachScreenshot(name, "checkpoint");
        }
    }
}
