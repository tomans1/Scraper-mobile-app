import { View, Text, ScrollView, StyleSheet, Switch, Pressable } from 'react-native';
import { SecondaryButton } from './PrimaryButton';

export function FiltersDrawer({
  visible,
  categories,
  selectedCategories,
  onToggleCategory,
  dateStart,
  dateEnd,
  onNewOnly,
  newOnly,
  onClose,
}) {
  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.drawer}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Filtre</Text>
          <Pressable onPress={onClose}>
            <Text style={styles.closeButton}>✕</Text>
          </Pressable>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.section}>
            <Text style={styles.label}>Podkategórie:</Text>
            <View style={styles.categoriesGrid}>
              {categories.map((cat) => (
                <Pressable
                  key={cat}
                  style={[
                    styles.categoryItem,
                    selectedCategories.includes(cat) && styles.categoryItemSelected,
                  ]}
                  onPress={() => onToggleCategory(cat)}
                >
                  <Text
                    style={[
                      styles.categoryText,
                      selectedCategories.includes(cat) && styles.categoryTextSelected,
                    ]}
                  >
                    {cat}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.newOnlyRow}>
              <Text style={styles.label}>Iba nové inzeráty</Text>
              <Switch value={newOnly} onValueChange={onNewOnly} />
            </View>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <SecondaryButton title="Zavrieť" onPress={onClose} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 100,
  },
  backdrop: {
    flex: 1,
  },
  drawer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    flexDirection: 'column',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  closeButton: {
    fontSize: 24,
    color: '#6b7280',
  },
  content: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  section: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    color: '#1f2937',
  },
  categoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryItem: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    flex: 1,
    minWidth: '45%',
  },
  categoryItemSelected: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  categoryText: {
    fontSize: 13,
    color: '#1f2937',
    textAlign: 'center',
  },
  categoryTextSelected: {
    color: '#fff',
  },
  newOnlyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
});
