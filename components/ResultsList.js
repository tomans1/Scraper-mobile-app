import { View, Text, ScrollView, StyleSheet, Linking, TouchableOpacity } from 'react-native';
import { External } from 'lucide-react-native';

export function ResultsList({ items, count, onDownload }) {
  if (!items || items.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>Žiadne výsledky neboli nájdené.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Výsledky</Text>
        <Text style={styles.count}>Počet: {count}</Text>
        <TouchableOpacity style={styles.downloadBtn} onPress={onDownload}>
          <Text style={styles.downloadText}>⬇️ Stiahnuť</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        {items.map((item, idx) => {
          const url = item.url || item;
          const extras = [];
          if (item.subcat) extras.push(item.subcat);
          if (item.date) extras.push(item.date);
          const label = extras.length ? `${extras.join(' | ')}` : '';

          return (
            <TouchableOpacity
              key={idx}
              style={styles.item}
              onPress={() => Linking.openURL(url)}
            >
              <View style={styles.itemContent}>
                <Text style={styles.url} numberOfLines={2}>
                  {url}
                </Text>
                {label && <Text style={styles.meta}>{label}</Text>}
              </View>
              <External size={16} color="#3b82f6" />
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  count: {
    fontSize: 13,
    color: '#6b7280',
  },
  downloadBtn: {
    backgroundColor: '#eab308',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  downloadText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1f2937',
  },
  list: {
    maxHeight: 300,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  itemContent: {
    flex: 1,
  },
  url: {
    fontSize: 13,
    color: '#3b82f6',
    marginRight: 8,
  },
  meta: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 2,
  },
  emptyText: {
    fontSize: 14,
    color: '#ef4444',
    textAlign: 'center',
    paddingVertical: 16,
  },
});
