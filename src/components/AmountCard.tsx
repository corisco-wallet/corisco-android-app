import { useEffect, useRef, useState } from "react";
import { Keyboard, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { colors, radii, spacing } from "../theme";

type Props = {
  unitLabel: string;
  amountText: string;
  onAmountChange: (text: string) => void;
  decimal: boolean;
  amountPlaceholder?: string;
  amountLocked?: boolean;
  action?: { label: string; onPress: () => void; disabled?: boolean };
  note?: { value: string; onChange: (text: string) => void; maxLength: number };
};

export function AmountCard({ unitLabel, amountText, onAmountChange, decimal, amountPlaceholder = "Any amount", amountLocked, action, note }: Props) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<TextInput>(null);

  // Android keeps the field focused after the keyboard is dismissed, so end editing when it hides.
  useEffect(() => {
    const sub = Keyboard.addListener("keyboardDidHide", () => inputRef.current?.blur());
    return () => sub.remove();
  }, []);

  const showText = amountText !== "" && (amountLocked || !editing);

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        {showText ? (
          <TouchableOpacity style={styles.amountBox} disabled={amountLocked} onPress={() => setEditing(true)} activeOpacity={0.7}>
            <Text style={[styles.amount, amountLocked && styles.amountLocked]} numberOfLines={1}>
              {amountText} <Text style={styles.unit}>{unitLabel}</Text>
            </Text>
          </TouchableOpacity>
        ) : (
          <TextInput
            ref={inputRef}
            style={[styles.amountBox, styles.amount]}
            placeholder={`${amountPlaceholder} (${unitLabel})`}
            placeholderTextColor={colors.textMuted}
            value={amountText}
            onChangeText={onAmountChange}
            keyboardType={decimal ? "decimal-pad" : "number-pad"}
            editable={!amountLocked}
            autoFocus={editing}
            onFocus={() => setEditing(true)}
            onBlur={() => setEditing(false)}
          />
        )}
        {action && (
          <TouchableOpacity onPress={action.onPress} disabled={action.disabled}>
            <Text style={styles.action}>{action.label}</Text>
          </TouchableOpacity>
        )}
      </View>
      {note && (
        <>
          <View style={styles.divider} />
          <TextInput
            style={styles.note}
            placeholder="Add a note"
            placeholderTextColor={colors.textMuted}
            value={note.value}
            onChangeText={note.onChange}
            maxLength={note.maxLength}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  amountBox: {
    flex: 1,
    minHeight: 40,
    justifyContent: "center",
  },
  amount: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: "700",
    paddingVertical: spacing.xs,
    textAlignVertical: "center",
  },
  amountLocked: {
    color: colors.textSecondary,
  },
  unit: {
    color: colors.textSecondary,
    fontWeight: "400",
  },
  action: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: "700",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
  note: {
    color: colors.textPrimary,
    fontSize: 15,
    paddingVertical: spacing.xs,
  },
});
