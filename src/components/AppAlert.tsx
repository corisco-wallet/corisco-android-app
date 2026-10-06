import { useEffect, useRef, useState } from "react";
import { Alert, Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, radii, spacing } from "../theme";

export type AlertButton = {
  text: string;
  style?: "default" | "cancel" | "destructive";
  onPress?: () => void;
};

type AlertRequest = { title: string; message?: string; buttons: AlertButton[] };

let present: ((request: AlertRequest) => void) | null = null;

export function showAlert(title: string, message?: string, buttons: AlertButton[] = [{ text: "OK" }]) {
  if (present) present({ title, message, buttons });
  else Alert.alert(title, message, buttons);
}

export function AlertHost() {
  const [queue, setQueue] = useState<AlertRequest[]>([]);
  const request = queue[0] ?? null;
  const lastRequest = useRef(request);
  if (request) lastRequest.current = request;
  const shown = request ?? lastRequest.current;

  useEffect(() => {
    present = (next) => setQueue((q) => [...q, next]);
    return () => {
      present = null;
    };
  }, []);

  const dismiss = (button?: AlertButton) => {
    setQueue((q) => q.slice(1));
    button?.onPress?.();
  };

  const cancelButton = request?.buttons.find((b) => b.style === "cancel");

  return (
    <Modal transparent visible={request !== null} animationType="fade" onRequestClose={() => dismiss(cancelButton)}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{shown?.title}</Text>
          {shown?.message ? <Text style={styles.message}>{shown.message}</Text> : null}
          <View style={styles.buttons}>
            {shown?.buttons.map((button, index) => (
              <TouchableOpacity
                key={`${index}-${button.text}`}
                style={[styles.button, button.style === "destructive" && styles.buttonDestructive]}
                onPress={() => dismiss(button)}
              >
                <Text
                  style={[
                    styles.buttonText,
                    button.style === "cancel" && styles.buttonTextCancel,
                    button.style === "destructive" && styles.buttonTextDestructive,
                  ]}
                >
                  {button.text}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: spacing.sm,
  },
  message: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  buttons: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  buttonDestructive: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.error,
  },
  buttonText: {
    color: colors.accentText,
    fontSize: 15,
    fontWeight: "700",
  },
  buttonTextCancel: {
    color: colors.textSecondary,
  },
  buttonTextDestructive: {
    color: colors.error,
  },
});
