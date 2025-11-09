import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';

export function ServerStatus({ status, onWake }) {
  const getStatusConfig = () => {
    switch (status) {
      case 'online':
        return {
          color: '#10b981',
          label: 'Online',
          showWake: false,
        };
      case 'offline':
        return {
          color: '#ef4444',
          label: 'Offline',
          showWake: true,
        };
      case 'waking':
        return {
          color: '#3b82f6',
          label: 'Prebúdzam…',
          showWake: false,
        };
      case 'checking':
      default:
        return {
          color: '#eab308',
          label: 'Kontrolujem…',
          showWake: false,
        };
    }
  };

  const config = getStatusConfig();

  return (
    <View style={styles.container}>
      <View style={styles.statusRow}>
        <View style={[styles.dot, { backgroundColor: config.color }]} />
        <Text
          style={[styles.label, { color: config.color }]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {config.label}
        </Text>
      </View>
      {config.showWake && (
        <TouchableOpacity onPress={onWake} style={styles.wakeButton}>
          <Text style={styles.wakeButtonText}>Prebudiť server</Text>
        </TouchableOpacity>
      )}
      {status === 'waking' && (
        <ActivityIndicator size="small" color="#3b82f6" style={styles.spinner} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 128,
    justifyContent: 'flex-start',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    minWidth: 112,
    textAlign: 'left',
    flexShrink: 0,
  },
  wakeButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#3b82f6',
    borderRadius: 4,
  },
  wakeButtonText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  spinner: {
    marginLeft: 4,
  },
});
