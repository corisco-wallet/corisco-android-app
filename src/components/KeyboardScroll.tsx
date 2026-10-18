import { KeyboardAvoidingView, ScrollView, StyleSheet, type ScrollViewProps } from "react-native";

/** A ScrollView that shrinks above the on-screen keyboard so focused inputs stay visible. */
export function KeyboardScroll(props: ScrollViewProps) {
  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <ScrollView keyboardShouldPersistTaps="handled" {...props} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
});
