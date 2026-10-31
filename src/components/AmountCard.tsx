import { useState } from "react";
import { KeyboardAvoidingView, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { amountTextToSats, satsToAmountText, type AmountUnit } from "../amount-input";
import { formatBtc, formatFiat, satsToFiat } from "../price";
import type { Settings } from "../settings-store";
import { colors, radii, spacing } from "../theme";

type Note = { value: string; onChange: (text: string) => void; maxLength: number };

type Props = {
  /** Always in the bitcoin unit the settings pick (sats or BTC); fiat is only an input aid. */
  amountText: string;
  onAmountChange: (text: string) => void;
  settings: Settings;
  btcPrice: number | null;
  amountLocked?: boolean;
  action?: { label: string; onPress: () => void; disabled?: boolean };
  note?: Note;
  /** How the card reads before anything is chosen: a field-like box, or a bare link. */
  emptyStyle?: "field" | "link";
};

function SwapIcon({ color, size = 20 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="m21 16-4 4-4-4" />
      <Path d="M17 20V4" />
      <Path d="m3 8 4-4 4 4" />
      <Path d="M7 4v16" />
    </Svg>
  );
}

function useUnits(settings: Settings) {
  const btc = settings.balanceUnit === "btc";
  const bitcoinLabel = btc ? "BTC" : "sats";
  const fiatLabel = settings.currency.toUpperCase();
  const formatBitcoin = (sats: number) => `${btc ? formatBtc(BigInt(sats)) : sats} ${bitcoinLabel}`;
  return { btc, bitcoinLabel, fiatLabel, formatBitcoin };
}

/** Tappable summary of the chosen amount (and note); opens a full-screen editor with a sats/BTC <-> fiat swap. */
export function AmountCard({ amountText, onAmountChange, settings, btcPrice, amountLocked, action, note, emptyStyle = "field" }: Props) {
  const [editing, setEditing] = useState(false);
  const { btc, bitcoinLabel } = useUnits(settings);
  const amountSats = amountTextToSats(amountText, "bitcoin", btc, null);
  const noteText = note?.value.trim() ?? "";
  const empty = amountText.trim() === "" && noteText === "";
  const asLink = empty && emptyStyle === "link";

  return (
    <View style={!asLink && styles.card}>
      <View style={styles.row}>
        <TouchableOpacity style={[styles.summary, asLink && styles.linkSummary]} disabled={amountLocked} onPress={() => setEditing(true)} activeOpacity={0.7}>
          {empty ? (
            <Text style={asLink ? styles.link : styles.placeholder}>{note ? "Choose amount/note" : "Choose amount"}</Text>
          ) : (
            <>
              <Text style={[styles.amount, amountLocked && styles.amountLocked]} numberOfLines={1}>
                {amountText.trim() === "" ? "Any amount" : <>{amountText} <Text style={styles.unit}>{bitcoinLabel}</Text></>}
              </Text>
              {btcPrice !== null && amountSats !== null && amountSats > 0 && (
                <Text style={styles.secondary}>≈ {formatFiat(satsToFiat(BigInt(amountSats), btcPrice), settings.currency)}</Text>
              )}
              {noteText !== "" && (
                <Text style={styles.noteSummary} numberOfLines={1}>
                  {noteText}
                </Text>
              )}
            </>
          )}
        </TouchableOpacity>
        {action && (
          <TouchableOpacity onPress={action.onPress} disabled={action.disabled}>
            <Text style={styles.action}>{action.label}</Text>
          </TouchableOpacity>
        )}
      </View>
      {editing && (
        <AmountSheet
          amountText={amountText}
          note={note}
          settings={settings}
          btcPrice={btcPrice}
          onCancel={() => setEditing(false)}
          onDone={(text, memo) => {
            setEditing(false);
            onAmountChange(text);
            note?.onChange(memo);
          }}
        />
      )}
    </View>
  );
}

function AmountSheet({
  amountText,
  note,
  settings,
  btcPrice,
  onCancel,
  onDone,
}: {
  amountText: string;
  note?: Note;
  settings: Settings;
  btcPrice: number | null;
  onCancel: () => void;
  onDone: (amountText: string, memo: string) => void;
}) {
  const { btc, bitcoinLabel, fiatLabel, formatBitcoin } = useUnits(settings);
  const [unit, setUnit] = useState<AmountUnit>("bitcoin");
  const [text, setText] = useState(amountText);
  // The source of truth across swaps, so flipping units back and forth never drifts the amount through rounding.
  const [sats, setSats] = useState(() => amountTextToSats(amountText, "bitcoin", btc, btcPrice));
  const [memo, setMemo] = useState(note?.value ?? "");
  const canSwap = btcPrice !== null && sats !== null;

  const changeText = (next: string) => {
    setText(next);
    setSats(amountTextToSats(next, unit, btc, btcPrice));
  };

  const swap = () => {
    if (!canSwap) return;
    const next = unit === "bitcoin" ? "fiat" : "bitcoin";
    setUnit(next);
    setText(satsToAmountText(sats, next, btc, btcPrice));
  };

  const converted =
    btcPrice === null
      ? "Fiat price unavailable"
      : sats === null || sats === 0
        ? null
        : unit === "bitcoin"
          ? `≈ ${formatFiat(satsToFiat(BigInt(sats), btcPrice), settings.currency)}`
          : `≈ ${formatBitcoin(sats)}`;

  return (
    <Modal visible animationType="slide" onRequestClose={onCancel}>
      <KeyboardAvoidingView style={styles.sheet} behavior="padding">
        <View style={styles.header}>
          <TouchableOpacity onPress={onCancel}>
            <Text style={styles.cancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.sheetTitle}>{note ? "Amount & note" : "Amount"}</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.amountArea}>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.bigInput}
              value={text}
              onChangeText={changeText}
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              keyboardType={unit === "fiat" || btc ? "decimal-pad" : "number-pad"}
              autoFocus
            />
            <Text style={styles.bigUnit}>{unit === "fiat" ? fiatLabel : bitcoinLabel}</Text>
          </View>
          <View style={styles.convertRow}>
            {converted && <Text style={styles.secondary}>{converted}</Text>}
            <TouchableOpacity style={[styles.swapButton, !canSwap && styles.disabled]} onPress={swap} disabled={!canSwap}>
              <SwapIcon color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
          {sats === null && text.trim() !== "" && <Text style={styles.error}>Enter a valid amount</Text>}
        </View>

        {note && (
          <TextInput
            style={styles.noteInput}
            placeholder="Add a note"
            placeholderTextColor={colors.textMuted}
            value={memo}
            onChangeText={setMemo}
            maxLength={note.maxLength}
          />
        )}

        <TouchableOpacity
          style={[styles.doneButton, sats === null && styles.disabled]}
          disabled={sats === null}
          onPress={() => sats !== null && onDone(satsToAmountText(sats, "bitcoin", btc, btcPrice), memo)}
        >
          <Text style={styles.doneText}>Done</Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
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
  summary: {
    flex: 1,
    minHeight: 40,
    justifyContent: "center",
    paddingVertical: spacing.xs,
  },
  placeholder: {
    color: colors.textMuted,
    fontSize: 17,
  },
  linkSummary: {
    alignItems: "center",
  },
  link: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: "600",
  },
  amount: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: "700",
  },
  amountLocked: {
    color: colors.textSecondary,
  },
  unit: {
    color: colors.textSecondary,
    fontWeight: "400",
  },
  secondary: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  noteSummary: {
    color: colors.textPrimary,
    fontSize: 15,
    marginTop: spacing.xs,
  },
  action: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: "700",
  },
  sheet: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
    paddingTop: spacing.xl,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cancel: {
    color: colors.textSecondary,
    fontSize: 16,
    minWidth: 60,
  },
  sheetTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
  },
  headerSpacer: {
    minWidth: 60,
  },
  amountArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
    gap: spacing.sm,
  },
  bigInput: {
    color: colors.textPrimary,
    fontSize: 44,
    fontWeight: "700",
    minWidth: 60,
    maxWidth: "75%",
    textAlign: "center",
  },
  bigUnit: {
    color: colors.textSecondary,
    fontSize: 20,
  },
  convertRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.md,
  },
  swapButton: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  error: {
    color: colors.error,
    marginTop: spacing.md,
  },
  noteInput: {
    color: colors.textPrimary,
    fontSize: 15,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  doneButton: {
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  doneText: {
    color: colors.accentText,
    fontSize: 16,
    fontWeight: "700",
  },
  disabled: {
    opacity: 0.4,
  },
});
