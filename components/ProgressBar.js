import { View, Text, StyleSheet } from 'react-native';

export function ProgressBar({ progress = 0, label, stageLabel }) {
  const clampedProgress = Math.max(0, Math.min(100, progress || 0));
  const showBar = clampedProgress > 0;
  const showContainer = showBar || !!label || !!stageLabel;

  if (!showContainer) {
    return null;
  }

  return (
    <View style={styles.container}>
      {stageLabel ? <Text style={styles.stageLabel}>{stageLabel}</Text> : null}
      {showBar ? (
        <View style={styles.progressOuter}>
          <View style={[styles.progressFill, { width: `${clampedProgress}%` }]} />
        </View>
      ) : null}
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 16,
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
    color: '#4b5563',
    marginBottom: 6,
    fontWeight: '600',
  },
  label: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 6,
  },
});
