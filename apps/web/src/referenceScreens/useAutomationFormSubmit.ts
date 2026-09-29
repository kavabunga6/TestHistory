import { useRef, useState } from "react";

export function useAutomationFormSubmit() {
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async (action: () => Promise<void>) => {
    if (pending.current) {
      return;
    }
    pending.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Не удалось сохранить изменения. Повторите попытку."
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  return { busy, error, submit };
}
