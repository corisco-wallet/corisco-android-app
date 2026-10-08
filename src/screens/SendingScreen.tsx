// Full-screen status shown while a payment is in flight -- same visual
// language as SyncingScreen's ring (brand text, dark background, accent
// color), but indeterminate rather than percentage-driven: unlike
// connectAndInit's several discrete, awaited stages, `payLightningInvoice`
// is one opaque call with no real sub-progress to report (it may also be
// waiting on a physical tap on the hardware signer's confirm screen, an
// unknown/human-paced duration) -- a fake percentage here would violate
// the same "real progress only" principle SyncingScreen itself documents.
// A continuously-spinning partial ring is the honest equivalent: "working,
// no known ETA," not "72% done."

import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { colors, spacing } from "../theme";

const SIZE = 96;
const STROKE_WIDTH = 8;
const RADIUS = (SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
// A fixed ~30% arc, continuously rotated -- reads as "spinning," not "30%
// complete" (there's no percent label at all, unlike SyncingScreen).
const ARC_FRACTION = 0.3;

/** `progress` (0 to 1) shows a determinate ring with the percentage in the middle; without it the ring just spins. */
export function SendingScreen({ label, progress }: { label: string; progress?: number | null }) {
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 1100,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [rotation]);

  const spin = rotation.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  if (progress != null) {
    const fraction = Math.min(1, Math.max(0, progress));
    return (
      <View style={styles.container}>
        <View style={styles.ring}>
          <Svg width={SIZE} height={SIZE} style={styles.determinate}>
            <Circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} stroke={colors.border} strokeWidth={STROKE_WIDTH} fill="none" />
            <Circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              stroke={colors.accent}
              strokeWidth={STROKE_WIDTH}
              fill="none"
              strokeDasharray={`${CIRCUMFERENCE * fraction}, ${CIRCUMFERENCE}`}
              strokeLinecap="round"
            />
          </Svg>
          <View style={styles.percentWrap}>
            <Text style={styles.percent}>{Math.round(fraction * 100)}%</Text>
          </View>
        </View>
        <Text style={styles.label}>{label}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.ring, { transform: [{ rotate: spin }] }]}>
        <Svg width={SIZE} height={SIZE}>
          <Circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} stroke={colors.border} strokeWidth={STROKE_WIDTH} fill="none" />
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke={colors.accent}
            strokeWidth={STROKE_WIDTH}
            fill="none"
            strokeDasharray={`${CIRCUMFERENCE * ARC_FRACTION}, ${CIRCUMFERENCE}`}
            strokeLinecap="round"
          />
        </Svg>
      </Animated.View>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  brandText: {
    color: colors.accent,
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: spacing.xl,
  },
  ring: {
    width: SIZE,
    height: SIZE,
  },
  determinate: {
    transform: [{ rotate: "-90deg" }],
  },
  percentWrap: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  percent: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: "700",
  },
  label: {
    marginTop: spacing.lg,
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: "center",
  },
});
