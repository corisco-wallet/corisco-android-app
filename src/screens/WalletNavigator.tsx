import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import type { SparkWallet as SparkWalletType } from "@buildonspark/spark-sdk";
import type { WalletTransfer } from "@buildonspark/spark-sdk/types";
import type { BleHardwareSigner } from "../ble-hardware-signer";
import type { Settings } from "../settings-store";
import { colors } from "../theme";
import { HomeScreen } from "./HomeScreen";
import { ReceiveScreen } from "./ReceiveScreen";
import { SendScreen } from "./SendScreen";
import { SettingsScreen } from "./SettingsScreen";
import { TransactionDetailScreen } from "./TransactionDetailScreen";

type Screen = "home" | "receive" | "send" | "settings" | "transaction";

type Props = {
  wallet: SparkWalletType;
  signer: BleHardwareSigner;
  identityPubkey: string | null;
  availableSats: bigint | null;
  incomingSats: bigint | null;
  claiming: boolean;
  loading: boolean;
  refreshing: boolean;
  transfers: WalletTransfer[];
  transfersLoading: boolean;
  settings: Settings;
  btcPrice: number | null;
  onRefresh: () => Promise<void>;
  onSettingsChange: (patch: Partial<Settings>) => void;
  onDisconnect: () => void;
};

export function WalletNavigator(props: Props) {
  const { wallet, signer, settings, btcPrice, availableSats } = props;
  const [screen, setScreen] = useState<Screen>("home");
  const [selectedTransfer, setSelectedTransfer] = useState<WalletTransfer | null>(null);
  const goHome = () => setScreen("home");

  return (
    <View style={styles.root}>
      {screen === "home" && (
        <HomeScreen
          identityPubkey={props.identityPubkey}
          availableSats={availableSats}
          incomingSats={props.incomingSats}
          claiming={props.claiming}
          loading={props.loading}
          refreshing={props.refreshing}
          onRefresh={props.onRefresh}
          onReceive={() => setScreen("receive")}
          onSend={() => setScreen("send")}
          onSettings={() => setScreen("settings")}
          onSelectTransfer={(transfer) => {
            setSelectedTransfer(transfer);
            setScreen("transaction");
          }}
          transfers={props.transfers}
          transfersLoading={props.transfersLoading}
          settings={settings}
          btcPrice={btcPrice}
        />
      )}
      {screen === "receive" && <ReceiveScreen wallet={wallet} onBack={goHome} />}
      {screen === "send" && (
        <SendScreen
          wallet={wallet}
          signer={signer}
          settings={settings}
          availableSats={availableSats}
          onBack={goHome}
          onPaid={() => {
            void props.onRefresh();
          }}
        />
      )}
      {screen === "settings" && (
        <SettingsScreen
          settings={settings}
          onChange={props.onSettingsChange}
          onDisconnect={props.onDisconnect}
          onBack={goHome}
        />
      )}
      {screen === "transaction" && selectedTransfer && (
        <TransactionDetailScreen transfer={selectedTransfer} settings={settings} btcPrice={btcPrice} onBack={goHome} />
      )}
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
