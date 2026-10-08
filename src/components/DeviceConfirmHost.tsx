import { useEffect, useState, useSyncExternalStore } from "react";
import { Modal, StyleSheet, Text, View } from "react-native";
import { deviceConfirm } from "../device-confirm";
import { colors, radii, spacing } from "../theme";

// With confirmation turned off on the device the answer comes back at once; don't flash the prompt for that.
const SHOW_DELAY_MS = 400;

export function DeviceConfirmHost() {
  const pending = useSyncExternalStore(deviceConfirm.subscribe, deviceConfirm.isPending);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!pending) {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [pending]);

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={() => {}}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Confirm on your device</Text>
          <Text style={styles.message}>Tap Accept on the signer to confirm the login.</Text>
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
  title: { color: colors.textPrimary, fontSize: 18, fontWeight: "700", marginBottom: spacing.sm },
  message: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
});
