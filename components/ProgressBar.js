import { View, Text, StyleSheet } from 'react-native';

export function ProgressBar({ progress, label, stageLabel }) {
  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.progressOuter}>
        <View style={[styles.progressFill, { width: `${progress}%` }]} />
      </View>
      {stageLabel && <Text style={styles.stageLabel}>{stageLabel}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#1f2937',
  },
  progressOuter: {
    height: 16,
    backgroundColor: '#e5e7eb',
    borderRadius: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#6366f1',
    borderRadius: 8,
  },
  stageLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 8,
  },
});
