import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { colors, radii, spacing } from "../theme";

type Props = {
  initError: string | null;
  onConnect: () => void;
};

export function ConnectScreen({ initError, onConnect }: Props) {
  return (
    <View style={styles.centered}>
      <Image source={require("../../assets/android-icon-foreground.png")} style={styles.logo} accessibilityLabel="Corisco" />
      {initError ? (
        <Text style={styles.errorBody}>{initError}</Text>
      ) : (
        <Text style={styles.instructionText}>Connect to your device to get started.</Text>
      )}
      <TouchableOpacity style={styles.connectButton} onPress={onConnect}>
        <Text style={styles.connectButtonText}>{initError ? "Try again" : "Connect Wallet"}</Text>
      </TouchableOpacity>
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  errorBody: {
    color: colors.error,
    fontSize: 13,
    textAlign: "center",
  },
  logo: {
    width: 160,
    height: 160,
    marginBottom: spacing.lg,
  },
  instructionText: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  connectButton: {
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  connectButtonText: {
    color: colors.accentText,
    fontSize: 15,
    fontWeight: "700",
  },
});
